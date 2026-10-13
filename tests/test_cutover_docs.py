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
