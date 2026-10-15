import json
from pathlib import Path
import shlex
import sqlite3
import subprocess

import pytest

from dhara.agent_connections import configure, config_path, connection_status, drain, accept
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
    drain(store)
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


def test_legacy_plugin_mode_reconnects_with_hooks(connected):
    store, home, inbox = connected
    configure(store, 'codex', False, home)
    store.set_meta('agent_connections', {**store.meta('agent_connections'), 'codex': {'commands': [], 'mode': 'plugin', 'since': 0}})
    assert connection_status(store)['connections'][1]['installed'] is False
    report(inbox, 'UserPromptSubmit', 'plugin', 'codex')
    assert not store.snapshot()['tasks']
    assert configure(store, 'codex', True, home)['connections'][1]['installed'] is True
    assert json.loads(config_path('codex', home).read_text())['hooks']['Stop']


def test_receiver_is_quiet_when_disconnected(connected):
    store, home, inbox = connected
    receiver = store.root / 'agent-hooks' / 'receiver.py'
    import sys
    result = subprocess.run([sys.executable, str(receiver), '--provider', 'claude', '--inbox', '/missing/inbox'],
                            input='{}', text=True, capture_output=True)
    assert result.returncode == 0 and not result.stdout and not result.stderr


def test_api_requires_admin_local_client(tmp_path, monkeypatch):
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
    token = client.post('/api/tokens', json={'name': 'Observer', 'scope': 'observer'}).json()['token']
    assert client.post(url, json={'enabled': False}, headers={'Authorization': 'Bearer ' + token}).status_code == 403
    remote = TestClient(app, client=('192.0.2.1', 1234))
    assert remote.post(url, json={'enabled': True}, headers=dict(client.headers)).status_code == 403


def ago(seconds):
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


def age(store, seconds):
    with store.db() as db:
        db.execute('UPDATE runs SET updated_at=?', (ago(seconds),))


def queued(inbox):
    with sqlite3.connect(inbox) as db:
        db.row_factory = sqlite3.Row
        return [dict(r) for r in db.execute('SELECT * FROM queue ORDER BY id')]


def session_tasks(store, inbox, *sessions):
    import hashlib
    for s in sessions:
        report(inbox, 'UserPromptSubmit', s)
    tasks = {t['title'][-6:]: t for t in store.snapshot()['tasks']}
    return [tasks[hashlib.sha256(s.encode()).hexdigest()[:6]] for s in sessions]


BLANK = {'project': 'p', 'detail': '', 'next_action': '', 'status': 'active', 'priority': 'auto', 'due_at': None,
         'not_before': None, 'estimate_minutes': None, 'dependencies': [], 'session_url': ''}


def end_tracking(store):
    for run in store.snapshot()['runs']:
        if run['status'] in ('working', 'review'):
            store.cancel_run(run['id'])


def test_attention_uses_only_latest_run(connected):
    store, home, inbox = connected
    ids = {t: store.put_task({**BLANK, 'title': t})['id'] for t in 'ABCDFGH'}
    with store.db() as db:
        for run, status, created, updated in [('a1', 'review', 3600, 3600), ('a2', 'working', 0, 0),
                                              ('b1', 'failed', 3600, 3600), ('b2', 'review', 60, 60),
                                              ('c1', 'needs_input', 3600, 3600), ('c2', 'cancelled', 0, 0),
                                              ('d1', 'cancelled', 3600, 3600),
                                              ('f1', 'review', 60, 60), ('f2', 'working', 60, 0),
                                              ('g1', 'needs_input', 600, 10), ('g2', 'working', 0, 0),
                                              ('h1', 'failed', 3600, 3600), ('h2', 'cancelled', 0, 0)]:
            db.execute("INSERT INTO runs VALUES(?,?,'x','',?,'',0,?,?)",
                       (run, ids[run[0].upper()], status, ago(created), ago(updated)))
        db.execute("UPDATE runs SET created_at=(SELECT created_at FROM runs WHERE id='f1') WHERE id='f2'")
    snapshot = store.snapshot()
    reasons = {t['title']: t['attention_reason'] for t in snapshot['attention']}
    assert reasons == {'B': 'A result is ready for your review.', 'G': 'An agent needs your input.'}
    assert {t['title'] for t in snapshot['available']} == {'B', 'C', 'D', 'H'}
    store.cancel_run('b1')
    with store.db() as db:
        db.execute("UPDATE runs SET status='cancelled' WHERE id='a2'")
    assert {t['title'] for t in store.snapshot()['attention']} == {'B', 'G'}


def test_clean_session_end_closes_auto_task_and_replay_is_harmless(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, 'Stop')
    end_tracking(store)
    report(inbox, 'UserPromptSubmit', 'codex-one', 'codex')
    report(inbox, 'Interrupt', 'codex-one', 'codex')
    report(inbox, 'SessionEnd')
    report(inbox, 'SessionEnd', 'codex-one', 'codex')
    rows = queued(inbox)
    snapshot = store.snapshot()
    assert [t['status'] for t in snapshot['tasks']] == ['done', 'done']
    assert all(r['status'] == 'cancelled' for r in snapshot['runs'])
    assert not snapshot['available'] and not snapshot['attention']
    for event in rows:
        accept(store, event)
    accept(store, {**rows[-1], 'id': rows[-1]['id'] + 1000})
    assert [t['status'] for t in store.snapshot()['tasks']] == ['done', 'done']


def test_resumed_session_reopens_and_can_close_again(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, 'Stop')
    end_tracking(store)
    report(inbox, 'SessionEnd')
    assert store.snapshot()['tasks'][0]['status'] == 'done'
    report(inbox, 'UserPromptSubmit')
    snapshot = store.snapshot()
    assert snapshot['tasks'][0]['status'] == 'active'
    assert [r['status'] for r in snapshot['runs']] == ['working', 'cancelled']
    report(inbox, 'Stop')
    assert len(store.snapshot()['attention']) == 1
    end_tracking(store)
    report(inbox, 'SessionEnd')
    snapshot = store.snapshot()
    assert snapshot['tasks'][0]['status'] == 'done' and snapshot['tasks'][0]['version'] == 4


def test_auto_close_bumps_version_so_stale_form_conflicts(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    form = store.snapshot()['tasks'][0]
    end_tracking(store)
    report(inbox, 'SessionEnd')
    assert store.snapshot()['tasks'][0]['status'] == 'done'
    with pytest.raises(Problem) as error:
        store.put_task({**form, 'title': 'Renamed'}, form['id'], form['version'])
    assert error.value.status == 409


def test_session_end_while_working_keeps_task(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, 'SessionEnd')
    snapshot = store.snapshot()
    assert snapshot['tasks'][0]['status'] == 'active' and snapshot['runs'][0]['status'] == 'cancelled'
    assert len(snapshot['available']) == 1


@pytest.mark.parametrize('event,status', [('Stop', 'review'), ('StopFailure', 'failed'), ('PermissionRequest', 'cancelled')])
def test_session_end_keeps_task_needing_the_user(connected, event, status):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, event)
    report(inbox, 'SessionEnd')
    snapshot = store.snapshot()
    assert snapshot['tasks'][0]['status'] == 'active' and snapshot['runs'][0]['status'] == status
    assert len(snapshot['attention']) == (status != 'cancelled')


def test_session_end_never_closes_user_touched_task(connected):
    store, home, inbox = connected
    one, two, three, four = session_tasks(store, inbox, 'one', 'two', 'three', 'four')
    end_tracking(store)
    store.put_task({**one, 'title': 'Renamed'}, one['id'], one['version'])
    store.focus(two['id'])
    store.reminder(three['id'], '2099-01-01T00:00:00+00:00')
    store.put_task({**BLANK, 'title': 'Deploy', 'dependencies': [four['id']]})
    for session in ('one', 'two', 'three', 'four'):
        report(inbox, 'SessionEnd', session)
    snapshot = store.snapshot()
    assert all(t['status'] == 'active' for t in snapshot['tasks'])
    assert all(r['status'] == 'cancelled' for r in snapshot['runs'])


def test_session_end_keeps_task_with_another_live_run(connected):
    store, home, inbox = connected
    task, = session_tasks(store, inbox, 'one')
    end_tracking(store)
    with store.db() as db:
        db.execute("INSERT INTO runs VALUES('api',?,'x','','needs_input','',0,?,?)", (task['id'], ago(0), ago(0)))
    report(inbox, 'SessionEnd', 'one')
    snapshot = store.snapshot()
    assert snapshot['tasks'][0]['status'] == 'active'
    assert snapshot['attention'][0]['attention_reason'] == 'An agent needs your input.'


def test_long_tool_call_uses_longer_stale_threshold(connected):
    store, home, inbox = connected
    report(inbox, 'PreToolUse', tool_name='Bash')
    for seconds, stale in [(300, False), (31 * 60, True)]:
        store.snapshot()
        age(store, seconds)
        snapshot = store.snapshot()
        assert snapshot['runs'][0]['status'] == 'working' and snapshot['runs'][0]['stale'] is stale
        assert len(snapshot['attention']) == stale
    report(inbox, 'PostToolUse')
    for seconds, stale in [(119, False), (121, True)]:
        store.snapshot()
        age(store, seconds)
        assert store.snapshot()['runs'][0]['stale'] is stale
    report(inbox, 'PreToolUse', tool_name='Bash')
    report(inbox, 'PostToolUseFailure')
    store.snapshot()
    age(store, 121)
    assert store.snapshot()['runs'][0]['stale'] is True
    report(inbox, 'PreToolUse', tool_name='AskUserQuestion')
    assert store.snapshot()['runs'][0]['status'] == 'needs_input'
    assert 'PostToolUseFailure' in json.loads(config_path('claude', home).read_text())['hooks']
    assert 'PostToolUseFailure' not in json.loads(config_path('codex', home).read_text())['hooks']


def test_tool_start_after_finished_turn_starts_new_run(connected):
    store, home, inbox = connected
    report(inbox, 'UserPromptSubmit')
    report(inbox, 'Stop')
    report(inbox, 'PreToolUse', tool_name='Bash')
    snapshot = store.snapshot()
    assert [r['status'] for r in snapshot['runs']] == ['working', 'cancelled']
    assert not snapshot['attention']
