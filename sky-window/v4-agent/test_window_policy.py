import unittest

from agent_core.window_policy import coverage_weights, target_coverage_weight


class CoveragePolicyTests(unittest.TestCase):
    def test_no_history_does_not_bias_the_sky(self):
        weights = coverage_weights([5, 90], [0, 0], [True, True], 0.8)
        self.assertEqual(weights, (1.0,) * 8)

    def test_confirmed_progress_favors_less_complete_sector(self):
        weights = coverage_weights([5, 6, 90, 91], [1, 1, 0, 0],
                                   [True] * 4, 0.8)
        self.assertGreater(target_coverage_weight(90, weights),
                           target_coverage_weight(5, weights))
        self.assertLessEqual(max(weights), 1.12)

    def test_partial_progress_is_not_counted_as_completion(self):
        weights = coverage_weights([5, 90], [0.79, 1.0], [True, True], 0.8)
        self.assertGreater(target_coverage_weight(5, weights), 1.0)


if __name__ == "__main__":
    unittest.main()
