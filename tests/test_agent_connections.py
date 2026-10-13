import json
from pathlib import Path
import shlex
import sqlite3
import subprocess

import pytest

from dhara.agent_connections import configure, config_path, drain, accept
from dhara.agent_hook import enqueue
from dhara.store import Store, Problem


@pytest.fixture
def connected(tmp_path, monkeypatch):
    monkeypatch.delenv('CODEX_HOME', raising=False)
    store = Store(tmp_path / 'data')
    home = tmp_path / 'home'
    configure(store, 'claude', True, home)
    configure(store, 'codex', True, home)
    return store, home, store.root / 'agent-hooks' / 'inbox.sqlite3'


def report(inbox, event, session='session-one', provider='claude', **extra):
    enqueue(inbox, provider, {'session_id': session, 'cwd': '/private/projects/test-project',
                             'hook_event_name': event, **extra})


def test_real_installed_command_and_lifecycle(connected):
    store, home, inbox = connected
    config = json.loads(config_path('codex', home).read_text())
    command = config['hooks']['UserPromptSubmit'][0]['hooks'][0]['command']
    payload = {'session_id': 'real', 'cwd': '/projects/compiler', 'hook_event_name': 'UserPromptSubmit',
               'prompt': 'secret prompt', 'transcript_path': '/private/transcript.jsonl'}
    result = subprocess.run(shlex.split(command), input=json.dumps(payload), text=True, capture_output=True)
    assert result.returncode == 0 and result.stdout == result.stderr == ''
    snapshot = store.snapshot()
    assert len(snapshot['tasks']) == 1
    assert snapshot['runs'][0]['status'] == 'working'
    assert 'secret prompt' not in json.dumps(snapshot)
    assert '/private' not in json.dumps(snapshot)
    report(inbox, 'PermissionRequest', 'real', 'codex')
    assert store.snapshot()['runs'][0]['status'] == 'needs_input'
    report(inbox, 'PostToolUse', 'real', 'codex')
    assert store.snapshot()['runs'][0]['status'] == 'working'
    report(inbox, 'Stop', 'real', 'codex')
    snapshot = store.snapshot()
    assert snapshot['runs'][0]['status'] == 'review'
    assert snapshot['tasks'][0]['status'] != 'done'
    report(inbox, 'SessionEnd', 'real', 'codex')
    assert store.snapshot()['runs'][0]['status'] == 'review'
    report(inbox, 'UserPromptSubmit', 'real', 'codex')
    snapshot = store.snapshot()
    assert len(snapshot['tasks']) == 1
    assert snapshot['runs'][0]['status'] == 'working'
    assert not snapshot['attention']


def test_replay_is_idempotent_and_offline_updates_keep_order(connected):
    store, home, inbox = connected
    for event in ['UserPromptSubmit', 'PermissionRequest', 'PostToolUse', 'Stop']:
        report(inbox, event)
    with sqlite3.connect(inbox) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(r) for r in db.execute('SELECT * FROM queue ORDER BY id')]
    for event in rows:
        accept(store, event)
    drain(store)  # replay after an imagined crash before queue acknowledgement
    snapshot = store.snapshot()
    assert len(snapshot['tasks']) == len(snapshot['runs']) == 1
    assert snapshot['runs'][0]['status'] == 'review'


def test_parallel_sessions_children_and_provider_isolation(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, 'UserPromptSubmit', provider='codex')
    report(inbox, 'Stop', agent_id='child')
    report(inbox, 'SessionStart', 'unused')
    report(inbox, 'SessionEnd', 'unused')
    snapshot = store.snapshot()
    assert len(snapshot['tasks']) == 2
    assert all(r['status'] == 'working' for r in snapshot['runs'])


def test_installer_preserves_existing_settings_and_uninstalls_own_hooks(tmp_path, monkeypatch):
    monkeypatch.delenv('CODEX_HOME', raising=False)
    store, home = Store(tmp_path / 'data'), tmp_path / 'home'
    path = config_path('claude', home)
    path.parent.mkdir(parents=True)
    original = {'permissions': {'allow': ['Read']}, 'hooks': {
        'Stop': [{'matcher': '', 'hooks': [{'type': 'command', 'command': 'other-hook'}]}]}}
    path.write_text(json.dumps(original))
    for _ in range(2):
        configure(store, 'claude', True, home)
    installed = json.loads(path.read_text())
    assert len(installed['hooks']['Stop']) == 2
    assert installed['permissions'] == original['permissions']
    configure(store, 'claude', False, home)
    assert json.loads(path.read_text()) == original
    assert json.loads(path.with_name('settings.json.before-dhaara').read_text()) == original


def test_invalid_config_preserved_and_disabled_queue_ignored(connected):
    store, home, inbox = connected
    report(inbox, 'Stop')
    configure(store, 'claude', False, home)
    assert not store.snapshot()['tasks']
    path = config_path('claude', home)
    path.write_text('not json')
    with pytest.raises(Problem):
        configure(store, 'claude', True, home)
    assert path.read_text() == 'not json'


def test_switch_to_plugin_removes_direct_hooks_without_disabling_ingestion(connected):
    store, home, inbox = connected
    result = configure(store, 'codex', True, home, mode='plugin')
    assert result['connections'][1]['mode'] == 'plugin'
    assert json.loads(config_path('codex', home).read_text())['hooks'] == {}
    report(inbox, 'Stop', provider='codex')
    assert store.snapshot()['runs'][0]['status'] == 'review'


def test_receiver_is_quiet_when_disconnected(connected):
    store, home, inbox = connected
    receiver = store.root / 'agent-hooks' / 'receiver.py'
    import sys
    result = subprocess.run([sys.executable, str(receiver), '--provider', 'claude', '--inbox', '/missing/inbox'],
                            input='{}', text=True, capture_output=True)
    assert result.returncode == 0 and not result.stdout and not result.stderr


@pytest.mark.parametrize('provider,variable,manifest', [
    ('claude', 'CLAUDE_PLUGIN_ROOT', '.claude-plugin'),
    ('codex', 'PLUGIN_ROOT', '.codex-plugin'),
])
def test_plugin_package_executes_without_source_imports(connected, provider, variable, manifest):
    import os
    store, home, inbox = connected
    plugin = store.root / 'agent-hooks' / 'plugins' / provider
    assert json.loads((plugin / manifest / 'plugin.json').read_text())['name'] == 'dhaara'
    assert (plugin / 'skills' / 'dhaara' / 'SKILL.md').exists()
    config = json.loads((plugin / 'hooks' / 'hooks.json').read_text())
    command = config['hooks']['Stop'][0]['hooks'][0]['command']
    result = subprocess.run(command, shell=True, env={**os.environ, variable: str(plugin)},
                            input=json.dumps({'hook_event_name': 'Stop', 'session_id': 'plugin', 'cwd': '/project'}),
                            text=True, capture_output=True)
    assert result.returncode == 0 and not result.stdout and not result.stderr
    assert store.snapshot()['runs'][0]['status'] == 'review'


def test_api_requires_admin_local_client_and_exports_plugin(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from dhara.server import create_app
    monkeypatch.delenv('CODEX_HOME', raising=False)
    monkeypatch.setattr(Path, 'home', lambda: tmp_path / 'home')
    app = create_app(tmp_path / 'api', start_worker=False, admin_token='test-admin-token-for-agent-hooks')
    client = TestClient(app)
    url = '/api/agent-connections/claude'
    assert client.post(url, json={'enabled': True}).status_code == 401
    client.headers['Authorization'] = 'Bearer test-admin-token-for-agent-hooks'
    assert client.post(url, json={'enabled': True}).status_code == 200
    result = client.get(url + '/plugin')
    assert result.status_code == 200 and result.headers['content-type'] == 'application/zip'
    token = client.post('/api/tokens', json={'name': 'Observer', 'scope': 'observer'}).json()['token']
    assert client.post(url, json={'enabled': False}, headers={'Authorization': 'Bearer ' + token}).status_code == 403
    remote = TestClient(app, client=('192.0.2.1', 1234))
    assert remote.post(url, json={'enabled': True}, headers=dict(client.headers)).status_code == 403
