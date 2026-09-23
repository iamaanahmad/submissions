import argparse
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from ledger import canonical, snapshot, compare, run, save


def response(rows=None):
    return {'search_metadata': {'status': 'Success', 'id': 'fixture-search'},
            'organic_results': rows if rows is not None else [{'link': 'https://gov.in/a', 'title': 'Grant'}]}


class LedgerTests(unittest.TestCase):
    def test_domain_boundary(self):
        for url in ['https://gov.in.evil.com/a', 'https://evilgov.in/a', 'https://gov.in@evil.com/a',
                    'file://gov.in/a', 'https://gov.in:999/a']:
            self.assertIsNone(canonical(url, 'gov.in'))
        self.assertEqual(canonical('https://dept.gov.in/a', 'gov.in'), 'https://dept.gov.in/a')

    def test_tracking_removed_semantic_query_kept(self):
        self.assertEqual(canonical('https://gov.in/a?utm_source=x&id=2#top', 'gov.in'), 'https://gov.in/a?id=2')

    def test_failure_rejected(self):
        for data in [{'error': 'secret'}, response([]), response([{'link': 'https://evil.com'}]),
                     {'search_metadata': {'status': 'Processing'}}]:
            with self.assertRaises(ValueError):
                snapshot(data, 'grant', 'gov.in')

    def test_changes_are_excerpts_not_page_claims(self):
        old = snapshot(response(), 'grant', 'gov.in')
        new = snapshot(response([{'link': 'https://gov.in/a', 'title': 'New excerpt'},
                                 {'link': 'https://gov.in/b'}]), 'grant', 'gov.in')
        self.assertEqual(compare(old, new), {'new': ['https://gov.in/b'],
                         'changed_excerpt': ['https://gov.in/a'], 'not_returned': []})
        self.assertEqual(compare(new, old)['not_returned'], ['https://gov.in/b'])

    def test_scope_not_comparable(self):
        old = snapshot(response(), 'grant', 'gov.in')
        new = snapshot(response(), 'tender', 'gov.in')
        with self.assertRaises(ValueError):
            compare(old, new)

    def test_atomic_failure_keeps_old(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'baseline.json'
            save(path, {'old': True})
            with patch('ledger.os.replace', side_effect=OSError('blocked')):
                with self.assertRaises(OSError):
                    save(path, {'new': True})
            self.assertEqual(json.loads(path.read_text()), {'old': True})
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_end_to_end_error_preserves_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = root / 'fixture.json'
            baseline = root / 'baseline.json'
            args = argparse.Namespace(domain='gov.in', query='grant', fixture=str(fixture), baseline=str(baseline))
            fixture.write_text(json.dumps(response()))
            with contextlib.redirect_stdout(io.StringIO()):
                run(args)
            before = baseline.read_bytes()
            fixture.write_text(json.dumps({'error': 'rate limited'}))
            with self.assertRaises(ValueError):
                run(args)
            self.assertEqual(before, baseline.read_bytes())

    def test_no_secret_persisted(self):
        data = response()
        data['search_parameters'] = {'api_key': 'secret'}
        self.assertNotIn('secret', json.dumps(snapshot(data, 'grant', 'gov.in')))

if __name__ == '__main__':
    unittest.main()
