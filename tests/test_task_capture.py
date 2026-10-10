"""Real disposable API/SQLite tests; no language-model or microphone claim."""
from concurrent.futures import ThreadPoolExecutor
import sqlite3
from uuid import uuid4

import pytest

from noema.models import TaskCapture
from noema.store import Store, SCHEMA
from test_core import env, edit_task, capture


def add(client, raw='Review the cleanup path', **fields):
    return client.post('/api/task-captures', json={
        'capture_id': uuid4().hex, 'raw': raw, 'local_day': '2026-10-09', **fields})


def test_one_sentence_no_model_and_no_extra_fields(env):
    c, s, w = env
    result = add(c)
    assert result.status_code == 201, result.text
    t = result.json()
    assert t['title'] == t['original_input'] == 'Review the cleanup path'
    assert t['project'] == 'Unassigned' and t['priority'] == 'auto'
    assert t['status'] == 'todo' and t['dependencies'] == []
    for key in ('due_at', 'not_before', 'planned_on', 'estimate_minutes'):
        assert t[key] is None
    assert not t['session_url'] and not t['next_action']
    snapshot = s.snapshot()
    assert len(snapshot['tasks']) == 1 and len(snapshot['available']) == 1
    assert snapshot['tasks'][0]['effective_priority'] == 'medium'
    assert not snapshot['reminders'] and not snapshot['focus']
    assert not w.model and not w.speech_model
    with s.db() as db:
        assert db.execute('SELECT count(*) FROM jobs').fetchone()[0] == 0


@pytest.mark.parametrize(('raw', 'planned'), [
    ('Review the cleanup path tomorrow', '2026-10-10'),
    ('Review the cleanup path today', '2026-10-09'),
    ('Review the cleanup path on 2026-11-02', '2026-11-02'),
])
def test_planned_day_is_not_a_deadline_reminder_or_availability(env, raw, planned):
    c, s, _ = env
    t = add(c, raw).json()
    assert t['planned_on'] == planned
    assert t['due_at'] is None and t['not_before'] is None
    assert s.snapshot()['reminders'] == []
    assert t['original_input'] == raw


@pytest.mark.parametrize('raw', [
    'Maybe review for Atlas next Friday?',
    'Perhaps review tomorrow for an unconfirmed project',
    'Review on 2026-99-40',
    'Read the code with version 2026-10-09',
    'Review today or tomorrow',
    'Review by tomorrow',
    'Remind me tomorrow to review',
    'Do not start until tomorrow',
    "Review tomorrow's parser design",
    'Review notes from today',
    'Could we review tomorrow?',
])
def test_ambiguous_or_different_schedule_is_preserved_not_invented(env, raw):
    c, s, _ = env
    response = add(c, raw)
    assert response.status_code == 201
    t = response.json()
    assert t['original_input'] == raw and t['planned_on'] is None
    assert t['project'] == 'Unassigned'
    assert t['due_at'] is None and t['not_before'] is None
    assert not s.snapshot()['reminders']


def test_explicit_labels_and_details_are_not_window_inference(env):
    c, s, _ = env
    s.set_meta('context', {'app': 'unrelated-editor', 'title': 'Private project'})
    raw = 'Maybe review the cleanup path\nWorkflow: Noema\nNext action: Read the release order\nContext: Hypothesis not confirmed'
    t = add(c, raw).json()
    assert t['title'].startswith('Maybe') and t['project'] == 'Noema'
    assert t['next_action'] == 'Read the release order'
    assert t['detail'] == 'Hypothesis not confirmed' and t['original_input'] == raw
    t = add(c, 'Review tomorrow', details={'project': 'Explicit workspace', 'priority': 'low', 'planned_on': None}).json()
    assert t['project'] == 'Explicit workspace' and t['priority'] == 'low'
    assert t['planned_on'] is None


def test_retry_and_late_attempt_cannot_overwrite_manual_correction_or_pin(env):
    c, s, _ = env
    body = {'capture_id': uuid4().hex, 'raw': 'Maybe review tomorrow', 'local_day': '2026-10-09'}
    t = c.post('/api/task-captures', json=body).json()
    corrected = edit_task(c, t, title='Read the actual release order', priority='low', planned_on='2026-10-12').json()
    c.post('/api/focus', json={'task_id': t['id'], 'pinned': True}).raise_for_status()
    pin = s.meta('focus')
    again = c.post('/api/task-captures', json=body)
    assert again.status_code == 201 and again.json() == corrected
    assert len(s.snapshot()['tasks']) == 1 and s.meta('focus') == pin
    assert corrected['original_input'] == body['raw']
    assert edit_task(c, t, title='Stale interpretation').status_code == 409
    assert s.task(t['id']) == corrected


def test_capture_id_cannot_be_reused_for_different_input(env):
    c, s, _ = env
    body = {'capture_id': uuid4().hex, 'raw': 'Review cleanup', 'local_day': '2026-10-09'}
    c.post('/api/task-captures', json=body).raise_for_status()
    assert c.post('/api/task-captures', json={**body, 'raw': 'Different commitment'}).status_code == 409
    assert len(s.snapshot()['tasks']) == 1


def test_concurrent_retries_create_one_row(env):
    _, s, _ = env
    request = TaskCapture(capture_id=uuid4().hex, raw='Review cleanup', local_day='2026-10-09')
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = list(pool.map(lambda _: s.capture_task(request), range(8)))
    assert len({t['id'] for t in tasks}) == 1
    assert len(s.snapshot()['tasks']) == 1


def test_transaction_failure_rolls_back_both_task_and_capture(env):
    c, s, _ = env
    with s.db() as db:
        db.execute("CREATE TRIGGER fail_capture BEFORE INSERT ON task_captures BEGIN SELECT RAISE(ABORT, 'Injected storage failure'); END")
    body = {'capture_id': uuid4().hex, 'raw': 'Review cleanup', 'local_day': '2026-10-09'}
    with pytest.raises(sqlite3.IntegrityError):
        c.post('/api/task-captures', json=body)
    assert s.snapshot()['tasks'] == []
    with s.db() as db:
        assert db.execute('SELECT count(*) FROM task_captures').fetchone()[0] == 0
        db.execute('DROP TRIGGER fail_capture')
    assert c.post('/api/task-captures', json=body).status_code == 201


def test_original_is_immutable_exported_and_survives_reopen(env):
    c, s, _ = env
    raw = 'Rough thought, not a confirmed fact.\nDo one review, not two separate tasks.'
    t = add(c, raw).json()
    changed = edit_task(c, t, detail='Manual context correction').json()
    assert changed['original_input'] == raw
    assert Store(s.root).task(t['id']) == changed
    assert s.export_data()['task_captures'][0]['raw'] == raw
    assert len(s.snapshot()['tasks']) == 1


def test_old_schema_data_survives_additive_migration(tmp_path):
    path = tmp_path / 'noema.sqlite3'
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.execute("INSERT INTO tasks VALUES('old','Original task','Existing workflow','Existing context','Next step','todo','low',NULL,NULL,20,'[]','https://example.test','2026-10-09T00:00:00+00:00','2026-10-09T00:00:00+00:00',1)")
    store = Store(tmp_path)
    t = store.task('old')
    assert t['priority'] == 'low' and t['next_action'] == 'Next step'
    assert t['original_input'] is None and t['planned_on'] is None
    assert t['estimate_minutes'] == 20 and t['session_url'] == 'https://example.test'


def test_learning_note_never_creates_a_task(env):
    c, s, _ = env
    capture(c, 'Review the cleanup path tomorrow; this is an ordinary learning note.')
    assert len(s.snapshot()['notes']) == 1 and s.snapshot()['tasks'] == []


def test_scope_and_origin_guards_apply_to_task_capture(env):
    c, s, _ = env
    assert add(c, capture_id='bad').status_code == 422
    token = c.post('/api/tokens', json={'name': 'Observer', 'scope': 'observer'}).json()['token']
    c.headers['Authorization'] = 'Bearer ' + token
    assert add(c).status_code == 403
    assert s.snapshot()['tasks'] == []


def test_old_editor_update_does_not_clear_new_planned_day(env):
    c, s, _ = env
    t = add(c, 'Review tomorrow').json()
    result = edit_task(c, t, priority='low').json()
    assert result['planned_on'] == '2026-10-10'
    assert result['original_input'] == t['original_input']
