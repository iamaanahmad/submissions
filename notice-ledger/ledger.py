"""Bounded, evidence-preserving official notice search. Python 3.11+."""
import argparse
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlsplit, urlunsplit, urlencode, parse_qsl
from urllib.request import urlopen


def canonical(url, domain):
    try:
        p = urlsplit(url)
        host = (p.hostname or '').lower()
        if p.scheme not in ('http', 'https') or p.username or p.password:
            return None
        if host != domain and not host.endswith('.' + domain):
            return None
        port = p.port
        if port not in (None, 80, 443):
            return None
        query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                 if not k.lower().startswith('utm_') and k.lower() not in ('gclid', 'fbclid')]
        return urlunsplit((p.scheme, host, p.path or '/', urlencode(sorted(query)), ''))
    except (ValueError, TypeError):
        return None


def snapshot(data, query, domain):
    meta = data.get('search_metadata', {})
    if data.get('error') or meta.get('status') != 'Success' or not meta.get('id'):
        raise ValueError('Search did not succeed; baseline preserved.')
    results = data.get('organic_results')
    if not isinstance(results, list) or not results:
        raise ValueError('No organic evidence; baseline preserved.')
    items = {}
    for row in results:
        if not isinstance(row, dict):
            raise ValueError('Malformed evidence; baseline preserved.')
        url = canonical(row.get('link', ''), domain)
        if url:
            items[url] = {'title': str(row.get('title', '')), 'snippet': str(row.get('snippet', ''))}
    if not items:
        raise ValueError('No allowed publisher results; baseline preserved.')
    return {'version': 1, 'scope': {'query': query, 'domain': domain, 'gl': 'in', 'hl': 'en',
                                 'device': 'desktop'},
            'search_id': meta['id'], 'created_at': meta.get('created_at'), 'items': items}


def compare(old, new):
    if old and old['scope'] != new['scope']:
        raise ValueError('Search scope changed; use a separate baseline.')
    previous = old['items'] if old else {}
    current = new['items']
    return {'new': sorted(current.keys() - previous.keys()),
            'changed_excerpt': sorted(k for k in current.keys() & previous.keys()
                                      if current[k] != previous[k]),
            'not_returned': sorted(previous.keys() - current.keys())}


def save(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False) as f:
            name = f.name
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def run(args):
    domain = args.domain.lower().strip('.')
    if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in domain):
        raise ValueError('Use a publisher hostname, without a URL or path.')
    path = Path(args.baseline)
    old = json.loads(path.read_text()) if path.exists() else None
    scope = {'query': args.query, 'domain': domain, 'gl': 'in', 'hl': 'en', 'device': 'desktop'}
    if old and old['scope'] != scope:
        raise ValueError('Search scope changed; use a separate baseline.')
    if args.fixture:
        data = json.loads(Path(args.fixture).read_text())
    else:
        key = os.environ.get('SERPAPI_API_KEY')
        if not key:
            raise ValueError('Set SERPAPI_API_KEY privately before live search.')
        params = dict(engine='google', q=f'site:{domain} {args.query}', gl='in', hl='en',
                      device='desktop', api_key=key)
        try:
            with urlopen('https://serpapi.com/search.json?' + urlencode(params), timeout=45) as response:
                data = json.load(response)
        except Exception:
            raise ValueError('Search request failed; baseline preserved. No automatic retry.') from None
    new = snapshot(data, args.query, domain)
    delta = compare(old, new)
    # One atomic envelope preserves both observations and the resulting comparison.
    new['previous_search_id'] = old.get('search_id') if old else None
    new['previous_items'] = old.get('items', {}) if old else {}
    new['delta'] = delta
    save(path, new)
    print(json.dumps({'search_id': new['search_id'], 'source_count': len(new['items']),
                      'delta': delta,
                      'note': 'Search excerpts only. Not returned does not mean removed. Verify the publisher before acting.'}, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--domain', required=True)
    p.add_argument('--query', required=True)
    p.add_argument('--baseline', required=True)
    p.add_argument('--fixture', help='Offline SerpApi response; makes no API call')
    try:
        run(p.parse_args())
    except (ValueError, OSError, KeyError, TypeError):
        p.exit(1, 'Unable to complete a valid observation. Baseline was not replaced. Check scope, credentials, response and filesystem.\n')
