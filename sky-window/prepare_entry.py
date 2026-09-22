"""Export phase-specific entry files after isolated local verification. Never uploads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import venv
import zipfile

from benchmark import SHA256, URL


def require_complete(summary, log):
    if summary.get('termination_reason') != 'survey_complete':
        raise ValueError('Entry did not finish the survey')
    if 'using the default ranking' in log:
        raise ValueError('Strategy fallback is not entry verification')
    if 'provider=deterministic\n' not in log:
        raise ValueError('Expected deterministic execution without a model provider')


def prepare(output, kit_zip=None):
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
        for scenario in ('dev-reference', 'finals-preview'):
            result_dir = root / scenario
            result = subprocess.run(
                [str(python), str(kit / 'local_runner.py'), '--scenario', str(kit / 'scenarios' / scenario),
                 '--agent', str(isolated / 'minimal_agent.py'), '--python', str(python), '--wallclock', '600',
                 '--out', str(result_dir), '--quiet'], check=True, env=env, cwd=isolated,
                capture_output=True, text=True, timeout=660)
            summary = json.loads(result.stdout)
            require_complete(summary, (result_dir / 'agent.log').read_text())
            rows.append({'scenario': scenario, 'total': summary['total'],
                         'termination_reason': summary['termination_reason']})
        report = {'kit_sha256': SHA256, 'strategy_sha256': hashlib.sha256(strategy).hexdigest(),
                  'python_version': sys.version.split()[0], 'third_party_packages_installed': 0,
                  'credential_environment_inherited': False, 'platform_uploaded': False,
                  'verification': rows,
                  'files': {'my_strategy.py': 'Online competition agent upload; requires open judged phase',
                            'dev-reference-decisions.csv': 'Practice results only; not a judged entry'}}
        output.mkdir(parents=True)
        (output / 'my_strategy.py').write_bytes(strategy)
        shutil.copyfile(root / 'dev-reference/decisions.csv', output / 'dev-reference-decisions.csv')
        (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New directory for verified entry files')
    parser.add_argument('--kit-zip', type=Path, help='Previously downloaded kit; hash must match')
    args = parser.parse_args()
    print(json.dumps(prepare(args.output, args.kit_zip), indent=2))


if __name__ == '__main__':
    main()
