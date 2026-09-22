import tempfile
import unittest
from pathlib import Path

from prepare_entry import prepare, require_complete


class EntryChecks(unittest.TestCase):
    def test_rejects_wrapper_fallback_even_when_survey_completes(self):
        with self.assertRaisesRegex(ValueError, 'fallback'):
            require_complete({'termination_reason': 'survey_complete'},
                             'minimal-agent provider=deterministic\nusing the default ranking')

    def test_rejects_incomplete_execution(self):
        with self.assertRaisesRegex(ValueError, 'finish'):
            require_complete({'termination_reason': 'global_wallclock_expired'},
                             'minimal-agent provider=deterministic\n')

    def test_rejects_model_provider_or_configuration_fallback(self):
        for provider in ('openai', 'deterministic fallback (ModelConfigurationError)'):
            with self.subTest(provider=provider), self.assertRaisesRegex(ValueError, 'provider'):
                require_complete({'termination_reason': 'survey_complete'},
                                 f'minimal-agent provider={provider}\n')

    def test_preserves_existing_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'my_strategy.py'
            marker.write_text('preserve')
            with self.assertRaisesRegex(ValueError, 'overwritten'):
                prepare(Path(directory))
            self.assertEqual(marker.read_text(), 'preserve')

    def test_rejects_changed_kit_before_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            kit = Path(directory) / 'changed.zip'
            kit.write_bytes(b'not the official kit')
            output = Path(directory) / 'output'
            with self.assertRaisesRegex(ValueError, 'kit changed'):
                prepare(output, kit)
            self.assertFalse(output.exists())
