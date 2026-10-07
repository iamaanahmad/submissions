"""Export phase-specific entry files after isolated local verification. Never uploads."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import venv
import zipfile

from benchmark import SHA256, URL
from verification import require_complete, require_strategy_decisions



def scenario_inputs(values):
    result = []
    for value in values:
        name, sep, directory = value.partition('=')
        if not sep or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name):
            raise ValueError('Scenario must be a safe slug=directory pair')
        if name in [item[0] for item in result]:
            raise ValueError('Duplicate scenario slug')
        path = Path(directory).resolve()
        for filename in ('weather.csv', 'weather_forecasts.csv', 'weather_events.csv'):
            if not (path / 'outputs/reference' / filename).is_file():
                raise ValueError('Scenario weather is incomplete; wait for official publication')
        result.append((name, path))
    return result


def prepare(output, kit_zip=None, scenarios=None):
    output = output.resolve()
    if output.exists():
        raise ValueError('Choose a new output directory; existing evidence will not be overwritten')
    strategy = Path(__file__).with_name('my_strategy.py').read_bytes()
    with tempfile.TemporaryDirectory(prefix='sky-entry-') as temporary:
        root = Path(temporary)
        archive = root / 'kit.zip'
        if kit_zip:
            shutil.copyfile(kit_zip, archive)
        else:
            with urllib.request.urlopen(URL, timeout=60) as response, archive.open('wb') as target:
                shutil.copyfileobj(response, target)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
            raise ValueError('Official kit changed; review its protocol before updating the pinned hash')
        with zipfile.ZipFile(archive) as package:
            for member in package.infolist():
                path = Path(member.filename)
                if path.is_absolute() or '..' in path.parts or (member.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Unsafe archive member')
            package.extractall(root)
        kit = root / 'agent-observer-starter-kit'
        (kit / 'agent/my_strategy.py').write_bytes(strategy)
        runtime = root / 'runtime'
        venv.EnvBuilder(with_pip=False).create(runtime)
        python = runtime / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        env = {'PATH': str(python.parent), 'PYTHONNOUSERSITE': '1', 'MODEL_PROVIDER': 'deterministic'}
        if os.name == 'nt':
            env['SYSTEMROOT'] = os.environ['SYSTEMROOT']
        subprocess.run([str(python), str(kit / 'pack_agent.py'), '--agent', str(kit / 'agent'),
                        '--out', str(root / 'packed.zip'), '--no-env'], check=True,
                       env=env, cwd=root, capture_output=True, text=True, timeout=60)
        isolated = root / 'isolated-agent'
        with zipfile.ZipFile(root / 'packed.zip') as package:
            if '.env' in package.namelist():
                raise ValueError('Package must not contain credentials')
            package.extractall(isolated)
        if (isolated / 'my_strategy.py').read_bytes() != strategy:
            raise ValueError('Packaged strategy differs from upload file')
        rows = []
        selected = scenarios or [(name, kit / 'scenarios' / name)
                                 for name in ('dev-reference', 'finals-preview')]
        for scenario, scenario_path in selected:
            result_dir = root / 'results' / scenario
            result = subprocess.run(
                [str(python), str(kit / 'local_runner.py'), '--scenario', str(scenario_path),
                 '--agent', str(isolated / 'minimal_agent.py'), '--python', str(python), '--wallclock', '600',
                 '--out', str(result_dir), '--quiet'], check=True, env=env, cwd=isolated,
                capture_output=True, text=True, timeout=660)
            summary = json.loads(result.stdout)
            require_complete(summary, (result_dir / 'agent.log').read_text())
            observations = require_strategy_decisions(result_dir / 'decisions.csv')
            decisions = result_dir / 'decisions.csv'
            if decisions.stat().st_size > 20_000_000:
                raise ValueError('Results exceed the platform 20 MB limit')
            rows.append({'scenario': scenario, 'total': summary['total'],
                         'decisions_sha256': hashlib.sha256(decisions.read_bytes()).hexdigest(),
                         'scenario_files_sha256': {
                             str(p.relative_to(scenario_path)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in sorted(scenario_path.rglob('*')) if p.is_file()},
                         'verified_observations': observations,
                         'termination_reason': summary['termination_reason']})
        report = {'kit_sha256': SHA256, 'strategy_sha256': hashlib.sha256(strategy).hexdigest(),
                  'python_version': sys.version.split()[0], 'third_party_packages_installed': 0,
                  'credential_environment_inherited': False, 'platform_uploaded': False,
                  'verification': rows,
                  'files': {'my_strategy.py': 'Reproduction source only; never upload as a results file',
                            **{name + '-decisions.csv': 'Results for ' + name + ' only; verify phase before upload'
                               for name, _ in selected}},
                  'submission_kind': 'results',
                  'local_score_caveat': 'Official competition anomaly answers are hidden; platform totals may differ'}
        output.mkdir(parents=True)
        (output / 'my_strategy.py').write_bytes(strategy)
        for name, _ in selected:
            shutil.copyfile(root / 'results' / name / 'decisions.csv', output / (name + '-decisions.csv'))
        (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New directory for verified entry files')
    parser.add_argument('--kit-zip', type=Path, help='Previously downloaded kit; hash must match')
    parser.add_argument('--scenario', action='append', default=[], metavar='SLUG=DIRECTORY',
                        help='Run a downloaded scenario; repeat once per scenario. Defaults to local rehearsal.')
    args = parser.parse_args()
    print(json.dumps(prepare(args.output, args.kit_zip, scenario_inputs(args.scenario)), indent=2))


if __name__ == '__main__':
    main()
