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
