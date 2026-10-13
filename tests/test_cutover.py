"""Cutover checks (spec §3): superseded code is gone and nothing still points at it."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

DELETED = ['public', 'desktop', 'experiments/ui-ab/hosts/wry',
           'experiments/ui-ab/hosts/companion', 'tests/now_state.test.cjs']

# Quoted path literals only: a comment citing an old source ("port of desktop/src/main.rs:79")
# is history, but a quoted path is something code would open at runtime.
STALE = re.compile(r"""['"](?:\.{1,2}/)*(?:public/|public['"]|desktop/)"""
                   r"""|['"][^'"\n]*(?:hosts/wry|hosts/companion|now_state\.test\.cjs)""")

SCANNED = ['run.py', 'noema', 'tools', 'tests', 'electron/src', 'electron/test', 'electron/e2e',
           'web/src', 'web/e2e', 'web/scripts']
TEXT_SUFFIXES = {'.py', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.json'}
# These two files name the deleted paths on purpose, as the things they forbid.
SELF_CHECKS = {'tests/test_cutover.py', 'tests/test_cutover_docs.py'}


def scanned_files():
    for name in SCANNED:
        path = ROOT / name
        candidates = [path] if path.is_file() else sorted(path.rglob('*'))
        for file in candidates:
            if (file.is_file() and file.suffix in TEXT_SUFFIXES
                    and '__pycache__' not in file.parts and 'node_modules' not in file.parts
                    and file.relative_to(ROOT).as_posix() not in SELF_CHECKS):
                yield file


def test_superseded_trees_are_deleted():
    assert [name for name in DELETED if (ROOT / name).exists()] == []


def test_nothing_points_at_deleted_trees():
    hits = [f'{file.relative_to(ROOT)}:{number}: {line.strip()}'
            for file in scanned_files()
            for number, line in enumerate(file.read_text(encoding='utf-8').splitlines(), 1)
            if STALE.search(line)]
    assert hits == []
