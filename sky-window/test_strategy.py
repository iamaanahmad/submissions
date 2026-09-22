import copy
import unittest
from my_strategy import choose_action


def candidate(tile, gain=100, seconds=900, region='R0'):
    return dict(tile_id=tile, program='DARK', request_id='', region_id=region,
                estimated_total_gain=gain, estimated_science_score=gain,
                nominal_exptime_seconds=seconds)


def snapshot():
    return {'cursor': {'timestamp_utc': '2026-10-05T00:00:00Z'},
            'candidate_tiles': [
                {'tile_id': 'soon', 'region_id': 'R0', 'window_end_utc': '2026-10-05T00:15:00Z'},
                {'tile_id': 'later', 'region_id': 'R1', 'window_end_utc': '2026-10-05T02:00:00Z'}],
            'progress': {'completed_tile_ids': []}, 'score_config': {}}


class StrategyTests(unittest.TestCase):
    def test_no_candidates_waits(self):
        self.assertIsNone(choose_action([], {}, {}))

    def test_closing_window_breaks_equal_gain_tie(self):
        rows = [candidate('later', region='R1'), candidate('soon')]
        self.assertEqual(choose_action(rows, snapshot(), {})['tile_id'], 'soon')

    def test_urgency_cannot_override_large_value_difference(self):
        rows = [candidate('later', 300, region='R1'), candidate('soon')]
        self.assertEqual(choose_action(rows, snapshot(), {})['tile_id'], 'later')

    def test_does_not_mutate_input_or_invent_candidate(self):
        rows = [candidate('soon'), candidate('later', region='R1')]
        snap = snapshot()
        original = copy.deepcopy((rows, snap))
        chosen = choose_action(rows, snap, {})
        self.assertIn(chosen['tile_id'], [row['tile_id'] for row in rows])
        self.assertEqual((rows, snap), original)

    def test_duplicate_feedback_does_not_inflate_science(self):
        snap = snapshot()
        snap['tile_last_finished'] = {'tile_id': 'soon', 'score': 120}
        memory = {}
        for _ in range(3): choose_action([candidate('later')], snap, memory)
        self.assertEqual(memory['realized_bests'], {'soon': 120})
        snap['tile_last_finished']['score'] = 80
        choose_action([candidate('later')], snap, memory)
        self.assertEqual(memory['realized_bests']['soon'], 120)

    def test_attempt_is_not_counted_as_completion(self):
        memory = {}
        choose_action([candidate('soon')], snapshot(), memory)
        self.assertEqual(memory['realized_bests'], {})

    def test_missing_dates_use_public_gain(self):
        self.assertEqual(choose_action([candidate('a'), candidate('b',200)], {}, {})['tile_id'], 'b')


if __name__ == '__main__':
    unittest.main()
