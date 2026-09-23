"""Run an offline, self-checking walkthrough of the real Notice Ledger CLI."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

CLI = Path(__file__).with_name('ledger.py')


def walkthrough(pause=0):
    def show(text):
        print(text, flush=True)
        if pause:
            time.sleep(pause)

    print('NOTICE LEDGER | reproducible local demo', flush=True)
    print('Synthetic SerpApi responses. No network calls or search credits.\n', flush=True)
    with tempfile.TemporaryDirectory(prefix='notice-ledger-demo-') as directory:
        root = Path(directory)
        baseline = root / 'baseline.json'
        fixture = root / 'response.json'
        command = [sys.executable, str(CLI), '--domain', 'publisher.example',
                   '--query', 'research grants', '--baseline', str(baseline),
                   '--fixture', str(fixture)]

        def observe(search_id, rows=None, error=None):
            payload = {'search_metadata': {'status': 'Success', 'id': search_id},
                       'organic_results': rows}
            if error:
                payload = {'error': error}
            fixture.write_text(json.dumps(payload))
            result = subprocess.run(command, capture_output=True, text=True, timeout=10)
            return result, json.loads(result.stdout) if result.returncode == 0 else None

        def row(path, snippet):
            return {'link': 'https://publisher.example/' + path,
                    'title': 'Synthetic research notice', 'snippet': snippet}

        show('1 / SAVE A FIRST OBSERVATION\n$ python3 ledger.py --domain publisher.example --query "research grants" --baseline <temporary> --fixture response.json')
        result, output = observe('synthetic-first', [row('alpha', 'First excerpt'), row('beta', 'Second excerpt')])
        assert result.returncode == 0, result.stderr
        assert output['source_count'] == 2
        print('PASS: two publisher links saved. Search ID: synthetic-first.\n', flush=True)

        show('2 / COMPARE THE NEXT OBSERVATION\nRun the same CLI with a second synthetic response.')
        result, output = observe('synthetic-second', [row('alpha', 'Updated excerpt'), row('gamma', 'New excerpt')])
        assert result.returncode == 0, result.stderr
        assert output['delta'] == {
            'new': ['https://publisher.example/gamma'],
            'changed_excerpt': ['https://publisher.example/alpha'],
            'not_returned': ['https://publisher.example/beta']}
        print('NEW: gamma\nCHANGED EXCERPT: alpha\nNOT RETURNED: beta\nNot returned does NOT mean removed.\n', flush=True)
        envelope = json.loads(baseline.read_text())
        assert envelope['previous_search_id'] == 'synthetic-first'
        assert len(envelope['previous_items']) == 2
        print('PASS: previous evidence and both search IDs remain in the ledger.\n', flush=True)

        show('3 / SIMULATE A PROVIDER FAILURE\nRun the same CLI with a synthetic error response.')
        before = baseline.read_bytes()
        result, output = observe('synthetic-error', error='Synthetic provider failure')
        assert result.returncode != 0
        assert baseline.read_bytes() == before
        print('PASS: command fails. Saved baseline stays byte-for-byte unchanged.\n', flush=True)

        show('4 / REJECT AN OFF-PUBLISHER RESULT\nRun the same CLI with a lookalike hostname.')
        result, output = observe('synthetic-lookalike', [{'link': 'https://publisher.example.evil.test/alpha'}])
        assert result.returncode != 0
        assert baseline.read_bytes() == before
        print('PASS: lookalike rejected. Saved baseline stays unchanged.\n', flush=True)

        show('5 / KEEP DIFFERENT SEARCHES SEPARATE\nChange the query while keeping the same baseline.')
        changed = command.copy()
        changed[changed.index('--query') + 1] = 'different search'
        result = subprocess.run(changed, capture_output=True, text=True, timeout=10)
        assert result.returncode != 0
        assert baseline.read_bytes() == before
        print('PASS: changed scope rejected. Saved baseline stays unchanged.\n', flush=True)

        show('ALL FIVE SCENARIOS PASSED\nSearch excerpts are not publisher facts. Check the official page before acting.\nLive mode uses SerpApi Google Search; this deterministic demo uses fixtures.\nAI assistance: OpenAI Codex. This demo is not a contest receipt.')
    print('Temporary fixtures and baselines removed.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pause', type=float, default=0, help='Seconds between recording sections (0 to 15)')
    args = parser.parse_args()
    if not 0 <= args.pause <= 15:
        parser.error('--pause must be between 0 and 15')
    walkthrough(args.pause)
