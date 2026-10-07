"""Fetch public organizer question files; verify frozen SHA-256 before writing."""
import hashlib
import json
from pathlib import Path
import urllib.request


def main():
    root = Path(__file__).resolve().parent
    for item in json.loads((root / 'dataset-manifest.json').read_text()):
        with urllib.request.urlopen(item['url'], timeout=30) as response:
            data = response.read(1_000_001)
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise SystemExit('Dataset changed. Review the organizer release before updating the manifest.')
        target = root / 'data' / item['name']
        target.parent.mkdir(exist_ok=True)
        if target.exists() and target.read_bytes() != data:
            raise SystemExit('Existing local dataset differs; refusing to overwrite it.')
        target.write_bytes(data)
        print(item['name'] + ': verified')


if __name__ == '__main__':
    main()
