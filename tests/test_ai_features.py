"""AI features end to end through the API, with OpenRouter replaced by a mock transport."""
import json
import struct
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from dhara import ai
from dhara.env import PREFIXES
from dhara.server import create_app

ADMIN = 'ai-admin-token-0123456789abcdef'
KEY = 'sk-or-v1-test0123456789abcdef'


@pytest.fixture
def env(tmp_path, monkeypatch):
    for key in (p + n for p in PREFIXES for n in ('MODEL', 'SPEECH_MODEL', 'OPENROUTER_API_KEY')):
        monkeypatch.delenv(key, raising=False)
    app = create_app(tmp_path, start_worker=False, admin_token=ADMIN)
    with TestClient(app) as c:
        c.headers.update({'Authorization': 'Bearer ' + ADMIN, 'X-Dhara-Request': '1'})
        yield c, app.state.store, app.state.worker


class Model:
    """Answers OpenRouter calls by the schema name the caller asked for."""
    def __init__(self):
        self.replies, self.requests, self.status = {}, [], 200

    def __call__(self, request):
        body = json.loads(request.content)
        self.requests.append(body)
        if self.status != 200:
            return httpx.Response(self.status, json={})
        name = body.get('response_format', {}).get('json_schema', {}).get('name', 'audio')
        content = self.replies[name]
        return httpx.Response(200, json={'choices': [{'message': {'content': content if isinstance(content, str) else json.dumps(content)}}]})


def turn_on(c, w):
    model = Model()
    w.transport = httpx.MockTransport(model)
    assert c.put('/api/ai/key', json={'key': KEY}).status_code == 200
    assert c.patch('/api/settings', json={'ai_enabled': True}).status_code == 200
    return model


def jobs(s, kind=None):
    with s.db() as db:
        rows = [dict(r) for r in db.execute('SELECT * FROM ai_jobs ORDER BY created_at')]
    return [r for r in rows if kind in (None, r['kind'])]


def capture_task(c, raw, **details):
    body = {'capture_id': uuid4().hex, 'raw': raw, 'local_day': '2026-10-15'}
    if details: body['details'] = details
    r = c.post('/api/task-captures', json=body)
    assert r.status_code == 201, r.text
    return r.json()


def capture_note(c, raw, organize=False):
    r = c.post('/api/captures', data={'payload': json.dumps({'capture_id': uuid4().hex, 'raw': raw, 'organize': organize})})
    assert r.status_code == 201, r.text
    return r.json()


def wav(seconds=0.1):
    frames = int(16000 * seconds)
    data = b'\x00\x00' * frames
    return b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 16000, 32000, 2, 16) + b'data' + struct.pack('<I', len(data)) + data


def test_key_is_write_only_and_ai_needs_a_key(env):
    c, s, w = env
    assert c.get('/api/ai').json() == {'configured': False, 'key_hint': '', 'from_env': False, 'enabled': False,
                                       'model': ai.DEFAULT_TEXT_MODEL, 'audio_model': ai.DEFAULT_AUDIO_MODEL}
    assert c.patch('/api/settings', json={'ai_enabled': True}).status_code == 409
    assert c.put('/api/ai/key', json={'key': 'nope'}).status_code == 400
    status = c.put('/api/ai/key', json={'key': KEY}).json()
    assert status['configured'] and status['key_hint'] == '…cdef' and not status['enabled']
    assert c.patch('/api/settings', json={'ai_enabled': True}).json()['ai_enabled'] is True
    state = c.get('/api/state').text
    assert KEY not in state and KEY not in c.get('/api/ai').text
    assert c.get('/api/state').json()['capabilities']['ai'] is True
    assert c.patch('/api/settings', json={'ai_model': 'bad model!'}).status_code == 422
    assert c.patch('/api/settings', json={'ai_model': 'google/gemma:free'}).json()['ai_model'] == 'google/gemma:free'
    off = c.delete('/api/ai/key').json()
    assert off['configured'] is False and off['enabled'] is False
    assert c.get('/api/state').json()['settings']['ai_enabled'] is False


def test_nothing_is_queued_or_sent_while_ai_is_off(env):
    c, s, w = env
    model = Model(); w.transport = httpx.MockTransport(model)
    capture_task(c, 'Send lease scan by Friday')
    capture_note(c, 'short jot')
    c.post('/api/tasks', json={'title': 'Plain task'})
    assert jobs(s) == [] and w.process_ai_one() is False and model.requests == []


def test_task_understanding_fills_only_untouched_fields_then_queues_priority(env):
    c, s, w = env
    model = turn_on(c, w)
    t = capture_task(c, 'send landlord the lease scan by friday, project: flat move', next_action='Find the scan')
    assert [j['kind'] for j in jobs(s)] == ['task_interpret']
    model.replies['task_fields'] = {'title': 'Send landlord the lease scan', 'project': 'Flat move', 'next_action': 'Email it',
                                    'due_at': '2026-10-16T17:00', 'planned_on': '', 'explanation': 'Deadline Friday 5pm.'}
    assert w.process_ai_one()
    after = c.get('/api/tasks/' + t['id']).json()
    assert after['title'] == 'Send landlord the lease scan' and after['project'] == 'Flat move'
    assert after['next_action'] == 'Find the scan'
    assert datetime.fromisoformat(after['due_at']).astimezone().strftime('%Y-%m-%d %H:%M') == '2026-10-16 17:00'
    assert after['version'] == 2 and after['interpretation']['method'] == 'ai'
    assert after['interpretation']['ai_fields'] == ['due_at', 'project', 'title']
    assert 'You are' not in json.dumps(model.requests[0]['messages'][1]) and 'send landlord' in model.requests[0]['messages'][1]['content']
    assert [(j['kind'], j['expected_version']) for j in jobs(s, 'task_priority')] == [('task_priority', 2)]


def test_task_understanding_rejects_far_dates_and_skips_after_your_edit(env):
    c, s, w = env
    model = turn_on(c, w)
    t = capture_task(c, 'renew passport someday')
    model.replies['task_fields'] = {'title': '', 'project': '', 'next_action': '', 'due_at': '2099-01-01T09:00', 'planned_on': 'not a date', 'explanation': ''}
    w.process_ai_one()
    after = c.get('/api/tasks/' + t['id']).json()
    assert after['due_at'] is None and after['planned_on'] is None and after['version'] == 1
    t2 = capture_task(c, 'call the bank tomorrow')
    edited = c.put('/api/tasks/' + t2['id'], json={**{k: t2[k] for k in ('title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'estimate_minutes', 'dependencies', 'session_url')}, 'title': 'My title', 'expected_version': 1})
    assert edited.status_code == 200
    model.replies['task_fields'] = {'title': 'AI title', 'project': 'Bank', 'next_action': '', 'due_at': '', 'planned_on': '', 'explanation': ''}
    while w.process_ai_one(): pass
    assert c.get('/api/tasks/' + t2['id']).json()['title'] == 'My title'


def test_ai_priority_shows_as_auto_ai_but_deadlines_and_your_choice_win(env):
    c, s, w = env
    model = turn_on(c, w)
    t = c.post('/api/tasks', json={'title': 'Prepare talk slides'}).json()
    model.replies['task_priority'] = {'priority': 'high', 'reason': 'A talk is consequential if missed.'}
    assert w.process_ai_one()
    task = next(x for x in c.get('/api/state').json()['tasks'] if x['id'] == t['id'])
    assert (task['effective_priority'], task['priority_source'], task['priority_reason']) == ('high', 'ai', 'A talk is consequential if missed.')
    base = {k: task[k] for k in ('title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'estimate_minutes', 'dependencies', 'session_url')}
    r = c.put('/api/tasks/' + t['id'], json={**base, 'status': 'active', 'expected_version': task['version']}).json()
    assert jobs(s, 'task_priority')[-1]['status'] == 'done'
    task = next(x for x in c.get('/api/state').json()['tasks'] if x['id'] == t['id'])
    assert task['priority_source'] == 'automatic'
    r = c.put('/api/tasks/' + t['id'], json={**base, 'title': 'Prepare talk slides v2', 'expected_version': r['version']}).json()
    assert [j['status'] for j in jobs(s, 'task_priority')] == ['done', 'queued']
    model.replies['task_priority'] = {'priority': 'low', 'reason': 'Nothing depends on it yet.'}
    w.process_ai_one()
    soon = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(timespec='seconds')
    s.put_task({**base, 'title': 'Prepare talk slides v2', 'due_at': soon}, t['id'], r['version'])
    task = next(x for x in c.get('/api/state').json()['tasks'] if x['id'] == t['id'])
    assert (task['effective_priority'], task['priority_source']) == ('high', 'automatic')
    mine = c.post('/api/tasks', json={'title': 'Mine', 'priority': 'low'}).json()
    model.replies['task_priority'] = {'priority': 'high', 'reason': 'x'}
    while w.process_ai_one(): pass
    task = next(x for x in c.get('/api/state').json()['tasks'] if x['id'] == mine['id'])
    assert (task['effective_priority'], task['priority_source']) == ('low', 'you')


def test_unusable_priority_is_ignored_and_rate_limits_retry_later(env):
    c, s, w = env
    model = turn_on(c, w)
    c.post('/api/tasks', json={'title': 'Task'})
    model.status = 429
    assert w.process_ai_one()
    job = jobs(s, 'task_priority')[0]
    assert job['status'] == 'queued' and job['run_after'] > datetime.now(timezone.utc).isoformat(timespec='seconds')
    assert w.process_ai_one() is False
    with s.db() as db: db.execute("UPDATE ai_jobs SET run_after='2000-01-01T00:00:00+00:00'")
    model.status = 200
    model.replies['task_priority'] = {'priority': 'urgent!!', 'reason': ''}
    assert w.process_ai_one()
    assert jobs(s, 'task_priority')[0]['status'] == 'error'
    assert c.get('/api/state').json()['tasks'][0]['priority_source'] == 'automatic'


def test_note_cleanup_uses_openrouter_when_ai_is_on(env):
    c, s, w = env
    model = turn_on(c, w)
    n = capture_note(c, 'heap slot maybe stale, check free path', organize=True)
    model.replies['organized_note'] = {'title': 'Stale heap slot', 'folder': 'Security / CTFs', 'body': 'The slot may be stale; check the free path.'}
    assert w.process_one()
    note = c.get('/api/notes/' + n['id']).json()
    assert note['mode'] == 'AI-organized' and note['title'] == 'Stale heap slot' and note['raw'] == 'heap slot maybe stale, check free path'
    assert [j['kind'] for j in jobs(s)] == ['note_merge']
    model.replies['organized_note'] = {'title': 'x', 'folder': '../etc', 'body': 'x'}
    n2 = capture_note(c, 'another', organize=True)
    w.process_one()
    assert c.get('/api/notes/' + n2['id']).json()['error']


def test_merge_suggestion_accept_undo_and_dismiss(env):
    c, s, w = env
    target = capture_note(c, 'Garmin firmware unpacking: GCD records are TLV')
    model = turn_on(c, w)
    jot = capture_note(c, 'type 0x0005 holds the main image')
    model.replies['merge_choice'] = {'target_id': target['id'], 'reason': 'Both are about Garmin GCD records.'}
    assert w.process_ai_one()
    open_ = c.get('/api/state').json()['merge_suggestions']
    assert [(m['note_title'], m['target_title'], m['state']) for m in open_] == [(jot['title'], target['title'], 'open')]
    sid = open_[0]['id']
    assert c.post(f'/api/merges/{sid}/accept').json()['state'] == 'merged'
    merged = c.get('/api/notes/' + target['id']).json()
    assert merged['body'].endswith('type 0x0005 holds the main image') and merged['version'] == 2
    assert jot['id'] not in [n['id'] for n in c.get('/api/state').json()['notes']]
    assert c.post(f'/api/merges/{sid}/accept').status_code == 409
    assert c.post(f'/api/merges/{sid}/undo').json()['state'] == 'undone'
    restored = c.get('/api/notes/' + target['id']).json()
    assert restored['body'] == 'Garmin firmware unpacking: GCD records are TLV' and restored['version'] == 3
    assert jot['id'] in [n['id'] for n in c.get('/api/state').json()['notes']]
    assert c.post(f'/api/merges/{sid}/undo').status_code == 409
    other = capture_note(c, 'GCD checksum is a simple sum')
    w.process_ai_one()
    sid2 = next(m['id'] for m in c.get('/api/state').json()['merge_suggestions'] if m['note_id'] == other['id'])
    assert c.post(f'/api/merges/{sid2}/dismiss').json()['state'] == 'dismissed'
    assert c.post('/api/merges/missing/accept').status_code == 404


def test_merge_undo_refuses_after_later_edits_and_bad_targets_are_ignored(env):
    c, s, w = env
    target = capture_note(c, 'Target note')
    model = turn_on(c, w)
    jot = capture_note(c, 'tiny jot')
    model.replies['merge_choice'] = {'target_id': target['id'], 'reason': 'Same topic.'}
    w.process_ai_one()
    sid = c.get('/api/state').json()['merge_suggestions'][0]['id']
    c.post(f'/api/merges/{sid}/accept')
    note = c.get('/api/notes/' + target['id']).json()
    c.put('/api/notes/' + target['id'], json={'title': note['title'], 'folder': note['folder'], 'body': note['body'] + ' more', 'expected_version': note['version']})
    assert c.post(f'/api/merges/{sid}/undo').status_code == 409
    capture_note(c, 'unrelated jot')
    model.replies['merge_choice'] = {'target_id': 'not-a-candidate', 'reason': 'x'}
    w.process_ai_one()
    assert [m['state'] for m in c.get('/api/state').json()['merge_suggestions']] == ['merged']
    assert jot


def test_dictation_routes_to_openrouter_or_local_and_validates_audio(env, monkeypatch):
    c, s, w = env
    send = lambda data: c.post('/api/dictate', files={'audio': ('clip.wav', data, 'audio/wav')})
    assert send(wav()).status_code == 409
    assert send(b'not audio').status_code == 400
    w.speech_model = 'base.en'
    monkeypatch.setattr(w, 'transcribe_bytes', lambda data: 'local words')
    assert send(wav()).json() == {'text': 'local words', 'source': 'local'}
    model = turn_on(c, w)
    model.replies['audio'] = 'Remember to buy milk.'
    assert send(wav()).json() == {'text': 'Remember to buy milk.', 'source': 'openrouter'}
    assert model.requests[-1]['messages'][1]['content'][0]['input_audio']['format'] == 'wav'
    model.status = 401
    assert send(wav()).status_code == 502
    assert c.post('/api/dictate', files={'audio': ('big.wav', b'RIFF' + b'\0' * (10 * 1024 * 1024 + 8), 'audio/wav')}).status_code == 413


def test_free_model_list_comes_from_models_dev(env, monkeypatch):
    c, s, w = env
    monkeypatch.setattr(ai, 'free_models', lambda: [{'id': 'a/free', 'name': 'A', 'context': 1, 'structured': True, 'audio': False}])
    assert c.get('/api/ai/models').json()[0]['id'] == 'a/free'
    def down():
        raise ai.AIError('Could not load the model list from models.dev.')
    monkeypatch.setattr(ai, 'free_models', down)
    assert c.get('/api/ai/models').status_code == 502


def test_voice_notes_are_transcribed_by_openrouter_when_ai_is_on(env):
    c, s, w = env
    model = turn_on(c, w)
    r = c.post('/api/captures', data={'payload': json.dumps({'capture_id': uuid4().hex, 'raw': ''})}, files={'attachments': ('voice.wav', wav(), 'audio/wav')})
    assert r.status_code == 201, r.text
    note = r.json()
    model.replies['audio'] = 'Check the GCD checksum.'
    assert w.process_one()
    after = c.get('/api/notes/' + note['id']).json()
    assert after['transcript'] == 'Check the GCD checksum.' and 'Check the GCD checksum.' in after['body']
