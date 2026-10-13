"""Cutover documentation checks (spec §9): current instructions name the new stack only."""
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Each rewritten document must state these current facts verbatim.
REQUIRED = {
    'README.md': [
        'npm --prefix web ci && npm --prefix web run build',
        'Node 22',
        'npm --prefix electron start -- --server http://127.0.0.1:8765',
        'physical Sway acceptance (handbook §24 Stage A) is still pending',
        'AI-assigned automatic priority',
    ],
    'docs/DESKTOP.md': [
        '# Electron desktop shell',
        'npm --prefix electron start -- --server http://127.0.0.1:8765',
        'lifecycle protocol 2',
        '~/.local/share/noema/electron',
        'chrome-sandbox',
        'Decisions last for the app session only',
        'Treat it as credential storage',
    ],
    'docs/PHYSICAL_SWAY_ACCEPTANCE.md': [
        '**Stage A (handbook §24): PENDING',
        'electron/node_modules/electron/dist/electron electron/',
        'qa/device_fixture.py --port 8765',
        'sha256sum -c --quiet SHA256SUMS',
    ],
    'docs/SECURITY.md': [
        '## Opt-in Linux managed service boundary (protocol 2)',
        '## Electron desktop shell boundary',
        '`sandbox: true`, `contextIsolation: true`',
        'it is\ntreated as credential storage',
        'Decisions are remembered for the app session\nonly',
    ],
    'docs/API.md': [
        '`{protocol: 2, instance: PUBLIC_RANDOM_ID, pid: PROCESS_ID}`',
        'zero or more `attachments` file parts',
        '`#/task/<id>`',
    ],
    'docs/ARCHITECTURE.md': [
        '## React + Electron (current)',
        '`noema-local-v1` version 1',
        'lifecycle protocol 2',
    ],
    'docs/ASSETS.md': [
        '`tools/assets/cat.png`',
        '`tools/sway_companion.py:271`',
        '`tests/test_companion.py:15`',
        '`Inter-Regular.otf`',
        'GUST Font License',
    ],
    'docs/BUILD_STATUS.md': [
        '## Latest: React + Electron cutover',
        '`web/src/copy.ts`',
    ],
    'docs/CONTINUATION.md': [
        '`web/src/local/drafts.ts`',
    ],
    'docs/PROGRESS.md': [
        'Next validation gate: physical Sway acceptance (handbook §24 Stage A)',
        '"Current static UI + SQLite" decision (handbook §27) is superseded',
        '`web/src/copy.ts`',
        'AI-assigned automatic priority (spec §11.1)',
        'Daily motivating slogan (spec §11.2)',
        'git revert -m 1 --no-edit react-electron-cutover',
        'git checkout cutover-docs-baseline --',
    ],
}

# Current-instruction documents must not tell anyone to run the deleted shell or UI.
STALE_INSTRUCTIONS = ['cargo run', 'cargo build', 'desktop/target', 'public/app.js', 'companion.html',
                      'protocol: 1', 'zero or more `files`']
CURRENT_INSTRUCTION_DOCS = ['README.md', 'docs/DESKTOP.md', 'docs/PHYSICAL_SWAY_ACCEPTANCE.md', 'docs/API.md']


def text(name):
    return (ROOT / name).read_text(encoding='utf-8')


@pytest.mark.parametrize('name,snippet', [(n, s) for n, items in REQUIRED.items() for s in items])
def test_document_states_current_fact(name, snippet):
    assert snippet in text(name)


@pytest.mark.parametrize('name', CURRENT_INSTRUCTION_DOCS)
def test_document_has_no_stale_instruction(name):
    content = text(name)
    assert [stale for stale in STALE_INSTRUCTIONS if stale in content] == []


def test_progress_has_dated_cutover_milestone():
    assert re.search(r'^\d{4}-\d{2}-\d{2}: React \+ Electron cutover', text('docs/PROGRESS.md'), re.M)


def test_test_report_records_terrain_budget():
    """Spec §7: measured once by the terrain phase (04-terrain.md Task 9); never re-measured here."""
    content = text('docs/TEST_REPORT.md')
    assert re.search(r'^## Terrain budget · \d{4}-\d{2}-\d{2}$', content, re.M)
    for state in ('Animated', 'Paused', 'Hidden'):
        assert re.search(rf'^\| {state}: [^|]+ \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \(< [0-9.]+\) \| [0-9.]+ \| '
                         r'(?:PASS|FAIL) \|$', content, re.M), state
    assert re.search(r'^\*\*Overall: (?:PASS|FAIL)\*\*$', content, re.M)


def test_test_report_records_main_app_memory():
    content = text('docs/TEST_REPORT.md')
    assert re.search(r'^### Handbook §21 main-app memory · measured .+\n[\s\S]*?^Result: (?:PASS|FAIL)$',
                     content, re.M)


# The cutover gate as one command, in order (controller ruling for Phase 5 Task 10).
GATE_COMMANDS = ['npm --prefix web ci', 'npm --prefix web run build', 'npm --prefix web test',
                 'npm --prefix web run e2e', 'npm --prefix electron ci', 'node electron/scripts/link-sandbox.mjs',
                 'npm --prefix electron test', '.venv/bin/python -m pytest']
GATE = ' && '.join(GATE_COMMANDS)


def test_readme_verification_lists_the_gate_in_order():
    block = text('README.md').split('## Verification', 1)[1].split('```bash\n', 1)[1].split('```', 1)[0]
    assert block.splitlines() == GATE_COMMANDS


@pytest.mark.parametrize('name', ['docs/CONTINUATION.md', 'docs/TEST_REPORT.md'])
def test_document_states_the_exact_gate(name):
    assert f'`{GATE}`' in text(name)


def test_test_report_records_a_green_final_gate():
    content = text('docs/TEST_REPORT.md')
    assert '### Final gate run' in content
    section = content.split('### Final gate run', 1)[1].split('\n## ', 1)[0].split('\n### ', 1)[0]
    assert f'`{GATE}`' in section
    assert 'workers=4' in section and 'retries=0' in section
    assert re.search(r'[Ss]ource revision `[0-9a-f]{40}`', section)
    for command in GATE_COMMANDS:   # three consecutive runs, each cell the tool's own summary and wall time
        assert re.search(rf'^\| `{re.escape(command)}` \| [^|]+ \| [^|]+ \| [^|]+ \| PASS \|$', section, re.M), command

PARITY = 'docs/superpowers/specs/parity-map.md'
TRACE = 'docs/superpowers/specs/handbook-trace.md'
TEST_PATH = re.compile(r'\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')
CELL_SPLIT = re.compile(r'(?<!\\)\|')  # a `\|` inside a cell is content, not a column break

# handbook-trace.md has exactly one row per spec §4.7 bullet (01-foundation.md Task 1 Step 8).
SPEC_4_7_TRACE_IDS = ([f'R{n}' for n in range(1, 10)] + [f'U{n}' for n in range(1, 26)]
                      + ['C1', 'C2', 'C3', 'T1'])


def is_separator(line):
    return re.match(r'^\|\s*:?-{3,}', line.strip()) is not None


def cells_of(line):
    return [cell.strip() for cell in CELL_SPLIT.split(line.strip().strip('|'))]


def status_rows(name):
    """(status, row) for every row of every table that has a Status column."""
    lines = text(name).splitlines()
    rows, status_at = [], None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith('|'):
            status_at = None
        elif index + 1 < len(lines) and is_separator(lines[index + 1]):
            columns = [cell.lower() for cell in cells_of(stripped)]
            status_at = columns.index('status') if 'status' in columns else None
        elif status_at is not None and not is_separator(stripped):
            cells = cells_of(stripped)
            rows.append((cells[status_at].lower() if status_at < len(cells) else '', stripped))
    return rows


def test_parity_rows_are_green_or_approved_drops():
    rows = status_rows(PARITY)
    assert rows, 'parity-map.md has no table with a Status column'
    assert [row for status, row in rows if status != 'green' and not status.startswith('drop (approved)')] == []


def test_handbook_trace_rows_are_green():
    rows = status_rows(TRACE)
    assert rows, 'handbook-trace.md has no table with a Status column'
    assert [row for status, row in rows if status != 'green'] == []


@pytest.mark.parametrize('name', [PARITY, TRACE])
def test_green_rows_name_an_existing_test(name):
    def names_only_existing_tests(row):
        paths = TEST_PATH.findall(row)
        return bool(paths) and all((ROOT / path).is_file() for path in paths)
    assert [row for status, row in status_rows(name) if status == 'green' and not names_only_existing_tests(row)] == []


TITLE_TOKEN = re.compile(r'"([^"]+)"|`(test_\w+)`|\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')


def cited_titles(cell):
    """(path, title) pairs: each quoted title or `test_*` name belongs to the nearest path before it."""
    pairs, current = [], None
    for match in TITLE_TOKEN.finditer(cell):
        quoted, name, path = match.groups()
        if path:
            current = path
        else:
            pairs.append((current, quoted or name))
    return pairs


def defines_test(path, title):
    if path is None or not (ROOT / path).is_file():
        return False
    source = (ROOT / path).read_text(encoding='utf-8')
    variants = {title, title.replace("'", "\\'")}
    return f'def {title}(' in source or any(q + v + q in source for v in variants for q in ("'", '"', '`'))


@pytest.mark.parametrize('name', [PARITY, TRACE])
def test_green_rows_cite_existing_test_titles(name):
    """Spec §8 rule: a green row's test exists under its title, not just its file."""
    missing = []
    for status, row in status_rows(name):
        if status != 'green':
            continue
        cells = cells_of(row)
        test_cell = cells[4]   # parity: Target test file; trace: Test (file › title)
        pairs = cited_titles(test_cell)
        # A parity row that cites no title uses its label as the title. Computed labels (code spans) are rendered by a
        # parametrized test and the pageErrors rows by an auto fixture, so neither has a literal title to find.
        if not pairs and name == PARITY and not cells[2].startswith('`') and 'auto fixture' not in test_cell:
            pairs = [(path, cells[2].replace('\\|', '|')) for path in TEST_PATH.findall(test_cell)]
        missing += [f'{cells[0]}: {path} › {title}' for path, title in pairs if not defines_test(path, title)]
    assert missing == []


def test_every_spec_4_7_bullet_has_a_green_trace_row():
    green_ids = {cells_of(row)[0] for status, row in status_rows(TRACE) if status == 'green'}
    assert [row_id for row_id in SPEC_4_7_TRACE_IDS if row_id not in green_ids] == []
