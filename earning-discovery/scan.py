"""Read-only Superteam discovery. Never submits, trades, or signs transactions."""
import argparse
import json
import os
from pathlib import Path
import tempfile
from datetime import datetime, timezone
from urllib.request import Request, build_opener, HTTPRedirectHandler

ENDPOINTS = {
    'agent': 'https://superteam.fun/api/agents/listings/live?take=50',
    'public': 'https://superteam.fun/api/listings?take=100',
}


class NoRedirect(HTTPRedirectHandler):
    # Do not forward an authenticated request to another host.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(source, key):
    headers = {'Accept': 'application/json'}
    if source == 'agent':
        headers['Authorization'] = 'Bearer ' + key
    with build_opener(NoRedirect).open(Request(ENDPOINTS[source], headers=headers), timeout=30) as response:
        rows = json.load(response)
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError('Unexpected response shape')
    return rows


def is_live(row, now):
    try:
        deadline = datetime.fromisoformat(row['deadline'].replace('Z', '+00:00'))
        return bool(row.get('id') and row.get('slug') and
                    row.get('status') == 'OPEN' and
                    row.get('agentAccess') in ('AGENT_ALLOWED', 'AGENT_ONLY') and
                    row.get('isWinnersAnnounced') is False and
                    deadline > now)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def summarize(feeds, errors, now):
    # A disagreement is held for manual qualification, never silently resolved.
    grouped = {}
    for source, rows in feeds.items():
        for row in rows:
            if row.get('id'):
                grouped.setdefault(row['id'], []).append((source, row))
    listings, conflicts = [], []
    for listing_id, copies in grouped.items():
        decisions = [is_live(row, now) for _, row in copies]
        if any(decisions) and not all(decisions):
            conflicts.append(listing_id)
            continue
        if not all(decisions):
            continue
        row = copies[0][1]
        item = {field: row.get(field) for field in (
            'id', 'slug', 'title', 'type', 'agentAccess', 'deadline',
            'rewardAmount', 'token', 'compensationType', 'sponsor')}
        item['submissionCount'] = row.get('_count', {}).get('Submission', 0)
        item['sources'] = sorted({source for source, _ in copies})
        item['qualificationRequired'] = True
        listings.append(item)
    return {
        'status': 'degraded' if errors else 'ok',
        'authenticated': 'agent' in feeds,
        'scannedAt': now.isoformat().replace('+00:00', 'Z'),
        'returnedCount': sum(len(rows) for rows in feeds.values()),
        'sourceCounts': {source: len(rows) for source, rows in feeds.items()},
        'sourceErrors': errors,
        'coverage': 'Bounded feed samples; not an exhaustive marketplace count.',
        'conflictingIds': conflicts,
        'liveCount': len(listings),
        'listings': sorted(listings, key=lambda row: row['deadline']),
    }


def write_result(path, result):
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as out:
            name = out.name
            os.chmod(name, 0o600)
            json.dump(result, out, indent=2)
            out.write('\n')
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    feeds, errors = {}, {}
    try:
        key = json.loads(args.credentials.read_text())['apiKey']
        if not isinstance(key, str) or not key:
            raise ValueError('Missing key')
    except (OSError, ValueError, KeyError, TypeError):
        key = None
        errors['agent'] = 'credentials_unreadable'
    for source in ENDPOINTS:
        if source == 'agent' and key is None:
            continue
        try:
            feeds[source] = fetch(source, key)
        except Exception as exc:
            # Never print HTTP bodies, headers, credentials, or raw exceptions.
            errors[source] = type(exc).__name__
    result = summarize(feeds, errors, datetime.now(timezone.utc))
    write_result(args.output, result)
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
