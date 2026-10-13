#!/usr/bin/env python3
"""Build a source-only archive. Never includes a user's .data directory or tokens."""
from pathlib import Path
import argparse
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.data', '.venv', '__pycache__', '.pytest_cache', '.git', 'node_modules'}

def included(path):
    relative = path.relative_to(ROOT)
    return (
        path.is_file()
        and not any(part in EXCLUDED for part in relative.parts)
        and not path.name.endswith(('.pyc', '.token', '.sqlite', '.sqlite3', '.sqlite3-wal', '.sqlite3-shm'))
        and path.name not in ('.env', 'SHA256SUMS')
        and path.suffix not in ('.zip', '.whl')
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT.parent / 'Dhara-v0.1.0.zip'))
    args = parser.parse_args()
    paths = sorted(path for path in ROOT.rglob('*') if included(path))
    manifest = ROOT / 'SHA256SUMS'
    manifest.write_text(''.join(
        hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.relative_to(ROOT).as_posix() + '\n'
        for path in paths
    ))
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in paths + [manifest]:
            archive.write(path, 'dhara/' + path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(output) as archive:
        failed = archive.testzip()
        if failed:
            raise RuntimeError('Archive integrity failed for ' + failed)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(digest + '  ' + output.name + '\n')
    print(f'{output} · {output.stat().st_size:,} bytes · {len(paths)+1} files')
    print('SHA256 ' + digest)

if __name__ == '__main__':
    main()
