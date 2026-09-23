"""Keep benchmark evidence intact before any download or scenario execution."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class BenchmarkCliTests(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run([sys.executable, str(Path(__file__).with_name('benchmark.py')), *args],
                              capture_output=True, text=True, timeout=10)

    def test_existing_evidence_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'evidence.json'
            output.write_text('prior evidence')
            result = self.invoke('--output', str(output))
            self.assertEqual(result.returncode, 2)
            self.assertIn('output already exists', result.stderr)
            self.assertEqual(output.read_text(), 'prior evidence')

    def test_duplicate_seeds_cannot_inflate_comparisons(self):
        result = self.invoke('--seeds', '41', '41')
        self.assertEqual(result.returncode, 2)
        self.assertIn('--seeds must be unique', result.stderr)

    def test_invalid_duration_fails_before_running(self):
        for days in ('0', '-1', '367'):
            result = self.invoke('--days', days)
            self.assertEqual(result.returncode, 2)
            self.assertIn('--days must be between', result.stderr)


if __name__ == '__main__':
    unittest.main()
