"""Rename gates (rename spec §6): no old name outside the allowed set, no NOEMA_ read outside the env helper, docs case rules."""
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Paths that keep the old name: archives and evidence, this migration's specs and plans, the shims and the migration code
# with their tests, the historical v1 service-worker fixture, and the regenerated manifest (it lists the shim package).
ALLOWED_PATHS = (
    'docs/Noema-Documentation/', 'docs/Noema-Handbook.md', 'docs/superpowers/', 'experiments/',
    'noema/', 'dhara/env.py', 'electron/src/env.ts', 'electron/test/env.test.ts',
    'web/src/local/migrate.ts', 'web/src/local/migrate.test.ts', 'web/e2e/v1/sw.js',
    'tests/test_shims.py', 'tests/test_rename_gate.py', 'SHA256SUMS',
)
# Substrings that are right as they are: archive paths, the README's history line,
# and the repository directory plus the cutover backup beside it: paths on the owner's disk, out of scope (spec §1).
KEEP_TOKENS = ('Noema-Handbook', 'Noema-Documentation', 'formerly Noema', '/code/noema',
               '/tmp/noema-', 'share/noema/webview', 'share/noema-dev',
               'noema-desktop', 'compileall -q noema', 'noema/server.py', 'files -0 noema', 'package `noema`')  # historical scratch paths, real pre-rename directories and recorded pre-rename commands stay as recorded
# A line that keeps an old name on purpose says why: rename-shim (removed by the dated follow-up) or rename-keep (permanent).
MARKERS = ('rename-shim:', 'rename-keep:')
COMPAT_HEADING = re.compile(r'^## .*Compatibility with Noema')
OLD = re.compile('noema', re.IGNORECASE)


def is_allowed_path(name):
    return any(name == allowed or name.startswith(allowed) for allowed in ALLOWED_PATHS)


def tracked_text_files():
    listed = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout.decode()
    for name in listed.split('\0'):
        if not name or is_allowed_path(name) or not (ROOT / name).is_file():
            continue
        try:
            yield name, (ROOT / name).read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue  # fonts, images


def excused(name, line, in_compat):
    if in_compat or any(marker in line for marker in MARKERS):
        return True
    for token in KEEP_TOKENS:
        line = line.replace(token, '')
    return not OLD.search(line)


def old_name_lines(name, text):
    in_compat = False
    for number, line in enumerate(text.split('\n'), 1):
        if name.endswith('.md') and line.startswith('## '):
            in_compat = bool(COMPAT_HEADING.match(line))
        if not excused(name, line, in_compat):
            yield f'{name}:{number}: {line.strip()}'


def test_no_old_name_outside_the_allowed_set():
    hits = [hit for name, text in tracked_text_files() for hit in old_name_lines(name, text)]
    assert hits == []


ENV_READ = re.compile(r"""(getenv|environ|process\.env|\benv)\s*(\.get)?\s*[.\[(]?\s*['"]?NOEMA_""")


def test_no_noema_env_read_outside_the_helper():
    hits = [f'{name}:{number}: {line.strip()}' for name, text in tracked_text_files()
            for number, line in enumerate(text.split('\n'), 1)
            if ENV_READ.search(line) and not any(marker in line for marker in MARKERS)]
    assert hits == []


def test_marker_lines_are_listed_for_the_follow_up():
    # One grep finds every compat line; the dated follow-up removes exactly these and the allowed shim files.
    listing = subprocess.run(['git', 'grep', '-n', 'rename-shim:'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    for expected in ('dhara/server.py', 'dhara/store.py', 'web/public/sw.js', 'electron/src/profile.ts', 'web/src/shell/notifications.ts', 'web/e2e/server.ts'):
        assert expected in listing


PROSE_DOCS = ['README.md'] + sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs').glob('*.md') if not p.name.startswith('Noema-'))
CAPS_IN_PROSE = re.compile(r'(?<![`A-Z_])DHARA(?![_A-Z`])')
LOWER_AT_SENTENCE_START = re.compile(r'(^|[.!?]\s+)dhara(?=[\s,;:)])', re.MULTILINE)


@pytest.mark.parametrize('name', PROSE_DOCS)
def test_docs_case_rules(name):
    text = (ROOT / name).read_text(encoding='utf-8')
    assert [m.group(0) for m in CAPS_IN_PROSE.finditer(text)] == []
    assert [m.group(0) for m in LOWER_AT_SENTENCE_START.finditer(text)] == []
