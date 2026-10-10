"""Source identity, excluding notebooks, tokens, browser profiles and tool caches."""
import argparse
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--production',action='store_true');parser.add_argument('--output',required=True);args=parser.parse_args()
if args.production:
    paths=[PROJECT/name for name in ['README.md','run.py','pyproject.toml','requirements.txt','desktop/Cargo.toml','desktop/Cargo.lock']]
    for name in ['public','noema','desktop/src','tools','tests','docs','images']:
        paths += [p for p in (PROJECT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    base=PROJECT
else:
    paths=[p for p in ROOT.rglob('*') if p.is_file() and not any(n in p.relative_to(ROOT).parts for n in ['node_modules','.demo','target','dist','dist-host','evidence','__pycache__'])]
    base=ROOT
output=ROOT/args.output;output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(base)}\n' for p in sorted(paths)))
print(f'{len(paths)} source files -> {output.relative_to(ROOT)}')
