import copy
import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone
from scan import summarize, write_result

NOW = datetime(2026, 9, 12, tzinfo=timezone.utc)
ROW = {'id': 'a', 'slug': 'eligible', 'status': 'OPEN', 'agentAccess': 'AGENT_ALLOWED',
       'isWinnersAnnounced': False, 'deadline': '2026-09-20T21:59:59.000Z'}


class DiscoveryTests(unittest.TestCase):
    def result(self, feeds, errors=None):
        return summarize(feeds, errors or {}, NOW)

    def test_public_only_candidate_survives_empty_agent_feed(self):
        result = self.result({'agent': [], 'public': [ROW]})
        self.assertEqual(result['liveCount'], 1)
        self.assertEqual(result['listings'][0]['sources'], ['public'])
        self.assertTrue(result['listings'][0]['qualificationRequired'])

    def test_duplicate_sources_count_once(self):
        result = self.result({'agent': [ROW], 'public': [ROW]})
        self.assertEqual(result['liveCount'], 1)
        self.assertEqual(result['listings'][0]['sources'], ['agent', 'public'])

    def test_agent_only_stays_discoverable(self):
        row = dict(ROW, agentAccess='AGENT_ONLY')
        self.assertEqual(self.result({'agent': [row], 'public': []})['liveCount'], 1)

    def test_ineligible_or_uncertain_rows_are_excluded(self):
        for patch in [{'agentAccess': 'HUMAN_ONLY'}, {'status': 'CLOSED'},
                      {'status': None}, {'isWinnersAnnounced': True},
                      {'isWinnersAnnounced': None}, {'deadline': 'bad'},
                      {'deadline': '2026-09-12T00:00:00Z'},
                      {'deadline': '2026-09-20'}, {'id': None}]:
            with self.subTest(patch=patch):
                self.assertEqual(self.result({'public': [dict(ROW, **patch)]})['liveCount'], 0)

    def test_conflicting_eligibility_is_held(self):
        result = self.result({'agent': [ROW], 'public': [dict(ROW, agentAccess='HUMAN_ONLY')]})
        self.assertEqual(result['liveCount'], 0)
        self.assertEqual(result['conflictingIds'], ['a'])

    def test_partial_failure_is_not_a_healthy_zero(self):
        result = self.result({'public': [ROW]}, {'agent': 'TimeoutError'})
        self.assertEqual(result['status'], 'degraded')
        self.assertFalse(result['authenticated'])
        self.assertEqual(result['liveCount'], 1)

    def test_all_failures_remain_explicit(self):
        result = self.result({}, {'agent': 'HTTPError', 'public': 'HTTPError'})
        self.assertEqual(result['status'], 'degraded')
        self.assertEqual(len(result['sourceErrors']), 2)

    def test_write_replaces_result_with_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'result.json'
            path.write_text('old')
            result = self.result({'public': [copy.deepcopy(ROW)]})
            write_result(path, result)
            self.assertEqual(json.loads(path.read_text()), result)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == '__main__':
    unittest.main()
