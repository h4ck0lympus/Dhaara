"""SQLite persistence and deterministic attention policy.

One connection per transaction, WAL, optimistic note/task versions, immutable
captures and recoverable note revisions. No model calls in the attention path.
"""
from __future__ import annotations
import hashlib
import json
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4


def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def ident() -> str: return uuid4().hex

def jd(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def elapsed(stamp):
    return (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds()

class Problem(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message
        super().__init__(message)

SCHEMA = '''
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(
 id TEXT PRIMARY KEY, title TEXT NOT NULL, project TEXT NOT NULL,
 detail TEXT NOT NULL, next_action TEXT NOT NULL, status TEXT NOT NULL,
 priority TEXT NOT NULL, due_at TEXT, not_before TEXT, estimate_minutes INTEGER,
 dependencies TEXT NOT NULL, session_url TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS task_captures(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
 raw TEXT NOT NULL, fingerprint TEXT NOT NULL, interpretation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes(
 id TEXT PRIMARY KEY, raw TEXT NOT NULL, transcript TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL, body TEXT NOT NULL, folder TEXT NOT NULL, project TEXT NOT NULL,
 task_id TEXT REFERENCES tasks(id), mode TEXT NOT NULL, processing TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, fingerprint TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments(
 id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), name TEXT NOT NULL,
 mime TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL, offset_seconds REAL
);
CREATE TABLE IF NOT EXISTS revisions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL REFERENCES notes(id),
 version INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, folder TEXT NOT NULL,
 source TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suggestions(
 id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), title TEXT NOT NULL,
 body TEXT NOT NULL, folder TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), agent TEXT NOT NULL,
 session_url TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
 seq INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), seq INTEGER NOT NULL,
 kind TEXT NOT NULL, message TEXT NOT NULL, digest TEXT NOT NULL,
 accepted INTEGER NOT NULL, received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs(
 id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), kind TEXT NOT NULL,
 status TEXT NOT NULL, expected_version INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_job ON jobs(note_id, kind)
 WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS tokens(
 id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, scope TEXT NOT NULL,
 task_ids TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS context_rules(
 id TEXT PRIMARY KEY, app TEXT NOT NULL, contains_text TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS note_time ON notes(updated_at);
CREATE INDEX IF NOT EXISTS events_by_run ON events(run_id, seq);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(state, at);
'''

DEFAULT_SETTINGS = {'observation_enabled': False, 'motion': False, 'companion': 'cat', 'companion_size': 40, 'display_name': ''}

class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.blobs = self.root / 'attachments'
        self.blobs.mkdir(exist_ok=True, mode=0o700)
        self.path = self.root / 'noema.sqlite3'
        with self.db() as c:
            c.executescript(SCHEMA)
            if 'planned_on' not in {r['name'] for r in c.execute('PRAGMA table_info(tasks)')}:
                c.execute('ALTER TABLE tasks ADD COLUMN planned_on TEXT')
            for key, value in {'settings': DEFAULT_SETTINGS, 'focus': None, 'context': None}.items():
                c.execute('INSERT OR IGNORE INTO meta VALUES(?,?)', (key, jd(value)))
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('PRAGMA foreign_keys=ON')
        c.execute('PRAGMA busy_timeout=15000')
        try:
            c.execute('BEGIN IMMEDIATE')
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally: c.close()

    def meta(self, key, default=None):
        with self.db() as c:
            row = c.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
            return json.loads(row[0]) if row else default

    def set_meta(self, key, value):
        with self.db() as c:
            c.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', (key, jd(value)))

    @staticmethod
    def task_row(row):
        if not row: raise Problem(404, 'Task not found')
        item = dict(row); item['dependencies'] = json.loads(item['dependencies'])
        item.setdefault('original_input', '')
        item['interpretation'] = json.loads(item.get('interpretation') or '{}')
        return item

    def task(self, task_id):
        with self.db() as c:
            return self.task_row(c.execute('''SELECT tasks.*, task_captures.raw AS original_input,
                task_captures.interpretation FROM tasks LEFT JOIN task_captures ON tasks.id=task_captures.task_id
                WHERE tasks.id=?''', (task_id,)).fetchone())

    def put_task(self, data, task_id=None, expected=None, capture=None):
        data = dict(data)
        task_id = task_id or ident()
        stamp = now()
        deps = list(dict.fromkeys(data['dependencies']))
        if task_id in deps: raise Problem(400, 'A task cannot depend on itself')
        with self.db() as c:
            if capture:
                previous = c.execute('SELECT * FROM task_captures WHERE id=?', (capture['id'],)).fetchone()
                if previous:
                    if previous['fingerprint'] != capture['fingerprint']:
                        raise Problem(409, 'Task capture ID already exists with different input')
                    # A retry reads current state; it must never repeat interpretation over edits.
                    row = c.execute('SELECT * FROM tasks WHERE id=?', (previous['task_id'],)).fetchone()
                    return self.task_row({**dict(row), 'original_input': previous['raw'], 'interpretation': previous['interpretation']})
            all_tasks = {r['id']: json.loads(r['dependencies']) for r in c.execute('SELECT id,dependencies FROM tasks')}
            if any(d not in all_tasks for d in deps): raise Problem(400, 'A dependency does not exist')
            all_tasks[task_id] = deps
            def reaches(node, target, seen):
                if node in seen: return False
                if node == target: return True
                seen.add(node)
                return any(reaches(ch, target, seen) for ch in all_tasks.get(node, []))
            if any(reaches(d, task_id, set()) for d in deps): raise Problem(400, 'Dependencies would form a cycle')
            if expected is not None:
                old = c.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
                if not old: raise Problem(404, 'Task not found')
                if old['version'] != expected: raise Problem(409, 'This task changed. Reopen it before saving.')
                active = c.execute("SELECT id FROM runs WHERE task_id=? AND status IN ('working','needs_input')", (task_id,)).fetchone()
                if data['status'] == 'done' and active: raise Problem(409, 'An agent is still active or waiting for input. End that run before completing the task.')
                values = [data[k] for k in ('title','project','detail','next_action','status','priority','due_at','not_before','estimate_minutes')]
                c.execute('''UPDATE tasks SET title=?,project=?,detail=?,next_action=?,status=?,priority=?,due_at=?,
                    not_before=?,estimate_minutes=?,dependencies=?,session_url=?,planned_on=?,updated_at=?,version=version+1 WHERE id=?''',
                    (*values, jd(deps), data['session_url'], data.get('planned_on', old['planned_on']), stamp, task_id))
                if data['status'] in ('done', 'parked'):
                    focus = json.loads(c.execute("SELECT value FROM meta WHERE key='focus'").fetchone()[0])
                    if focus and focus.get('task_id') == task_id:
                        c.execute("UPDATE meta SET value='null' WHERE key='focus'")
                if data['status'] == 'done':
                    c.execute("UPDATE reminders SET state='dismissed' WHERE task_id=?", (task_id,))
            else:
                values = [data[k] for k in ('title','project','detail','next_action','status','priority','due_at','not_before','estimate_minutes')]
                c.execute('''INSERT INTO tasks(id,title,project,detail,next_action,status,priority,due_at,
                    not_before,estimate_minutes,dependencies,session_url,created_at,updated_at,version,planned_on)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)''',
                          (task_id, *values, jd(deps), data['session_url'], stamp, stamp, data.get('planned_on')))
                if capture:
                    c.execute('INSERT INTO task_captures VALUES(?,?,?,?,?)',
                              (capture['id'], task_id, capture['raw'], capture['fingerprint'], jd(capture['interpretation'])))
        return self.task(task_id)

    def capture_task(self, capture):
        from .task_capture import interpret
        fields, explanation = interpret(capture.raw, capture.local_day)
        if capture.details:
            fields.update(capture.details.model_dump(mode='json', exclude_unset=True))
            explanation['manual_fields'] = sorted(capture.details.model_fields_set)
        fingerprint = hashlib.sha256(jd(capture.model_dump(mode='json')).encode()).hexdigest()
        return self.put_task(fields, capture={'id': capture.capture_id, 'raw': capture.raw,
            'fingerprint': fingerprint, 'interpretation': explanation})

    def focus(self, task_id, pinned=True, source='manual'):
        if task_id:
            task = self.task(task_id)
            if task['status'] in ('done', 'parked'): raise Problem(400, 'Choose an unfinished, unparked task')
        value = {'task_id': task_id, 'pinned': pinned, 'source': source, 'updated_at': now()} if task_id else None
        self.set_meta('focus', value)
        return value

    def create_capture(self, capture, files, fingerprint, ai_enabled=False):
        """Caller has staged validated blobs. All database records commit together."""
        from .worker import basic_filing
        raw = capture.raw
        title, folder = basic_filing(raw, capture.project)
        if not raw.strip(): title = 'Voice note' if any(f['mime'].startswith('audio/') for f in files) else 'Visual note'
        stamp = now()
        with self.db() as c:
            previous = c.execute('SELECT * FROM notes WHERE id=?', (capture.capture_id,)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint: raise Problem(409, 'Capture ID already exists with different content')
                return dict(previous), False
            if capture.task_id and not c.execute('SELECT id FROM tasks WHERE id=?', (capture.task_id,)).fetchone():
                raise Problem(404, 'Linked task not found')
            c.execute('''INSERT INTO notes(id,raw,title,body,folder,project,task_id,mode,created_at,updated_at,fingerprint)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (capture.capture_id, raw, title, raw, folder, capture.project,
                capture.task_id, 'original', stamp, stamp, fingerprint))
            for f in files:
                c.execute('INSERT INTO attachments VALUES(?,?,?,?,?,?,?)',
                          (f['id'], capture.capture_id, f['name'], f['mime'], f['size'], f['path'], f.get('offset_seconds')))
            c.execute('INSERT INTO revisions(note_id,version,title,body,folder,source,created_at) VALUES(?,1,?,?,?,?,?)',
                      (capture.capture_id, title, raw, folder, 'capture', stamp))
            has_audio = any(f['mime'].startswith('audio/') for f in files)
            if has_audio:
                c.execute("UPDATE notes SET processing='transcription available' WHERE id=?", (capture.capture_id,))
            elif ai_enabled and capture.organize and raw.strip():
                self.enqueue_in(c, capture.capture_id, 'organize', 1)
        return self.note(capture.capture_id), True

    def note(self, note_id):
        with self.db() as c:
            row = c.execute('SELECT * FROM notes WHERE id=?', (note_id,)).fetchone()
            if not row: raise Problem(404, 'Note not found')
            item = dict(row)
            item.pop('fingerprint', None)
            item['attachments'] = [dict(x) for x in c.execute('SELECT id,name,mime,size,offset_seconds FROM attachments WHERE note_id=?', (note_id,))]
            item['suggestions'] = [dict(x) for x in c.execute('SELECT * FROM suggestions WHERE note_id=?', (note_id,))]
            return item

    def edit_note(self, note_id, data, source='manual'):
        with self.db() as c:
            row = c.execute('SELECT * FROM notes WHERE id=?', (note_id,)).fetchone()
            if not row: raise Problem(404, 'Note not found')
            if row['version'] != data['expected_version']: raise Problem(409, 'This note changed on another screen. Your draft has not been overwritten. Reopen to compare.')
            version = row['version'] + 1
            stamp = now()
            c.execute('UPDATE notes SET title=?,body=?,folder=?,version=?,mode=?,updated_at=? WHERE id=?',
                      (data['title'], data['body'], data['folder'], version, source, stamp, note_id))
            c.execute('INSERT INTO revisions(note_id,version,title,body,folder,source,created_at) VALUES(?,?,?,?,?,?,?)',
                      (note_id, version, data['title'], data['body'], data['folder'], source, stamp))
        return self.note(note_id)

    def history(self, note_id):
        self.note(note_id)
        with self.db() as c:
            return [dict(r) for r in c.execute('SELECT * FROM revisions WHERE note_id=? ORDER BY version DESC', (note_id,))]

    @staticmethod
    def enqueue_in(c, note_id, kind, version):
        stamp = now()
        try:
            c.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)', (ident(),note_id,kind,'queued',version,'',stamp,stamp))
        except sqlite3.IntegrityError: return False
        c.execute('UPDATE notes SET processing=?,error=? WHERE id=?', ('queued: '+kind, '', note_id))
        return True

    def enqueue(self, note_id, kind):
        with self.db() as c:
            note = c.execute('SELECT * FROM notes WHERE id=?', (note_id,)).fetchone()
            if not note: raise Problem(404, 'Note not found')
            self.enqueue_in(c, note_id, kind, note['version'])
        return self.note(note_id)

    def run(self, run_id):
        with self.db() as c:
            row = c.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
            if not row: raise Problem(404, 'Run not found')
            return dict(row)

    def create_run(self, data):
        task = self.task(data.task_id)
        if task['status'] in ('done','parked'): raise Problem(409, 'Reopen the task before starting a run')
        run_id = data.run_id or ident()
        stamp = now()
        with self.db() as c:
            existing = c.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
            if existing:
                if existing['task_id'] != data.task_id or existing['agent'] != data.agent or existing['session_url'] != data.session_url:
                    raise Problem(409, 'Run ID already belongs to another request')
                return dict(existing)
            c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,0,?,?)',
                      (run_id,data.task_id,data.agent,data.session_url,'working','Started',stamp,stamp))
        return self.run(run_id)

    def run_event(self, run_id, event):
        digest = hashlib.sha256((run_id + jd(event.model_dump())).encode()).hexdigest()
        with self.db() as c:
            run = c.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
            if not run: raise Problem(404, 'Run not found')
            duplicate = c.execute('SELECT * FROM events WHERE id=?', (event.event_id,)).fetchone()
            if duplicate:
                if duplicate['digest'] != digest: raise Problem(409, 'Event ID reused with different content')
                return {'accepted': bool(duplicate['accepted']), 'duplicate': True}
            terminal = run['status'] in ('review','failed','cancelled')
            accept = event.seq > run['seq'] and not terminal
            c.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)',
                      (event.event_id,run_id,event.seq,event.kind,event.message,digest,int(accept),now()))
            if accept:
                state = {'started':'working','needs_input':'needs_input','completed':'review','failed':'failed','cancelled':'cancelled'}.get(event.kind, run['status'])
                message = event.message if event.message else run['message']
                c.execute('UPDATE runs SET status=?,message=?,seq=?,updated_at=? WHERE id=?',
                          (state,message,event.seq,now(),run_id))
            return {'accepted':accept,'duplicate':False}

    def cancel_run(self, run_id):
        run = self.run(run_id)
        with self.db() as c:
            c.execute("UPDATE runs SET status='cancelled',message='Tracking ended manually; the external process was not killed.',updated_at=? WHERE id=?", (now(),run_id))
        return self.run(run_id)

    def reminder(self, task_id, at):
        task = self.task(task_id)
        if task['status'] == 'done': raise Problem(400, 'Task is already complete')
        rid = ident()
        with self.db() as c:
            c.execute('INSERT INTO reminders VALUES(?,?,?,\'scheduled\',?)', (rid,task_id,at,now()))
        return {'id':rid,'task_id':task_id,'at':at,'state':'scheduled'}

    def snooze(self, reminder_id, minutes=None):
        with self.db() as c:
            r = c.execute('SELECT * FROM reminders WHERE id=?', (reminder_id,)).fetchone()
            if not r: raise Problem(404, 'Reminder not found')
            if minutes:
                at = (datetime.now(timezone.utc)+timedelta(minutes=minutes)).isoformat()
                c.execute("UPDATE reminders SET state='scheduled',at=? WHERE id=?", (at,reminder_id))
            else: c.execute("UPDATE reminders SET state='dismissed' WHERE id=?", (reminder_id,))
        return {'ok':True}

    def tick(self):
        with self.db() as c:
            c.execute("UPDATE reminders SET state='due' WHERE state='scheduled' AND at<=? AND task_id IN (SELECT id FROM tasks WHERE status!='done')", (now(),))

    def token(self, data):
        for task_id in data.task_ids: self.task(task_id)
        if data.scope == 'agent' and not data.task_ids: raise Problem(400, 'Choose at least one task for an agent token')
        token = secrets.token_urlsafe(32)
        tid = ident()
        with self.db() as c:
            c.execute('INSERT INTO tokens VALUES(?,?,?,?,?,?)', (tid,hashlib.sha256(token.encode()).hexdigest(),data.name,data.scope,jd(data.task_ids),now()))
        return {'id':tid,'token':token,'scope':data.scope,'task_ids':data.task_ids}

    def auth_token(self, token):
        with self.db() as c:
            row = c.execute('SELECT * FROM tokens WHERE hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            if not row: return None
            item = dict(row); item['task_ids'] = json.loads(item['task_ids']); return item

    def settings(self, updates=None):
        result = {**DEFAULT_SETTINGS, **self.meta('settings')}  # rows written before a setting existed get its default
        if updates:
            result.update({k:v for k,v in updates.items() if v is not None})
            self.set_meta('settings', result)
            if not result['observation_enabled']:
                self.set_meta('context', None)
                focus = self.meta('focus')
                if focus and focus['source']=='context': self.set_meta('focus',None)
        return result

    def add_rule(self, data):
        self.task(data.task_id)
        if not data.app.strip() and not data.contains.strip(): raise Problem(400, 'Specify an application or title match')
        item = {'id':ident(),'app':data.app.strip(),'contains_text':data.contains.strip(),'task_id':data.task_id}
        with self.db() as c: c.execute('INSERT INTO context_rules VALUES(?,?,?,?)', tuple(item.values()))
        return item

    def observe(self, data):
        if not self.settings()['observation_enabled']: raise Problem(409, 'Screen context is paused. Enable it explicitly in Settings.')
        value = data.model_dump()
        value.update({'updated_at':now(), 'source':'window metadata', 'suggested_task_id':None})
        with self.db() as c:
            rules = [dict(r) for r in c.execute('SELECT * FROM context_rules')]
        matched = set()
        for r in rules:
            if (not r['app'] or r['app'].lower() == data.app.lower()) and (not r['contains_text'] or r['contains_text'].lower() in data.title.lower()):
                task = self.task(r['task_id'])
                if task['status'] not in ('done','parked'): matched.add(r['task_id'])
        if len(matched)==1: value['suggested_task_id'] = matched.pop()
        self.set_meta('context', value)
        focus = self.meta('focus')
        if not focus or not focus.get('pinned'):
            if value['suggested_task_id']: self.focus(value['suggested_task_id'],False,'context')
            elif focus and focus.get('source')=='context': self.set_meta('focus',None)
        return value

    def snapshot(self, minutes=None):
        self.tick()
        with self.db() as c:
            tasks = [self.task_row(r) for r in c.execute('''SELECT tasks.*, task_captures.raw AS original_input,
                task_captures.interpretation FROM tasks LEFT JOIN task_captures ON tasks.id=task_captures.task_id
                ORDER BY tasks.created_at DESC''')]
            runs = [dict(r) for r in c.execute('SELECT * FROM runs ORDER BY updated_at DESC')]
            reminders = [dict(r) for r in c.execute("SELECT * FROM reminders WHERE state!='dismissed' ORDER BY at")]
            notes = [dict(r) for r in c.execute('SELECT id,title,folder,project,task_id,mode,processing,error,version,created_at,updated_at FROM notes ORDER BY updated_at DESC')]
            rules = [dict(r) for r in c.execute('SELECT * FROM context_rules')]
        by_id = {t['id']:t for t in tasks}
        by_task = {}
        for run in runs:
            run['stale'] = run['status'] in ('working','needs_input') and elapsed(run['updated_at']) > 120
            run['effective_status'] = 'unknown' if run['stale'] else run['status']
            by_task.setdefault(run['task_id'],[]).append(run)
        focus = self.meta('focus')
        context = self.meta('context')
        if context:
            context['stale'] = elapsed(context['updated_at']) > 120
            if context['stale'] and focus and focus['source']=='context': focus = None
        available, attention = [], []
        stamp = now()
        for task in tasks:
            task['runs'] = by_task.get(task['id'], [])
            task['blocked_by'] = [d for d in task['dependencies'] if by_id[d]['status']!='done']
            task['reminders'] = [r for r in reminders if r['task_id']==task['id']]
            task['effective_priority'],task['priority_reason'] = priority(task, tasks, stamp)
            task['priority_source'] = 'automatic' if task['priority']=='auto' else 'you'
            unfinished = task['status'] not in ('done','parked')
            task['attention_reason'] = ''
            if unfinished:
                if any(r['state']=='due' for r in task['reminders']): task['attention_reason']='You asked to revisit this.'
                elif any(r['effective_status']=='needs_input' for r in task['runs']): task['attention_reason']='An agent needs your input.'
                elif task['status']=='review' or any(r['status']=='review' for r in task['runs']): task['attention_reason']='A result is ready for your review.'
                elif any(r['status']=='failed' for r in task['runs']): task['attention_reason']='An agent reported a failure.'
                elif any(r['stale'] for r in task['runs']): task['attention_reason']='An agent has stopped reporting. Status unknown.'
                elif task['due_at'] and task['due_at']<=stamp: task['attention_reason']='Your deadline has arrived.'
                if task['attention_reason']: attention.append(task)
            ready = unfinished and task['status'] in ('todo','active','review') and not task['blocked_by'] and (not task['not_before'] or task['not_before']<=stamp)
            if any(r['status'] in ('working','needs_input') for r in task['runs']): ready=False
            if any(r['status']=='failed' for r in task['runs']): ready=False
            if focus and focus['task_id']==task['id']: ready=False
            if minutes is not None and (task['estimate_minutes'] is None or task['estimate_minutes']>minutes): ready=False
            task['available']=ready
            if ready:
                task['recommendation_reason']='No unfinished dependencies. '+task['priority_reason']
                available.append(task)
        def rank(t): return ({'high':0,'medium':1,'low':2}[t['effective_priority']],t['due_at'] or '9999',t['created_at'])
        available.sort(key=rank); attention.sort(key=rank)
        future = sorted([t for t in tasks if t['status']!='done'],key=rank)
        return {'tasks':tasks,'notes':notes,'runs':runs,'reminders':reminders,'focus':focus,
                'context':context,'context_rules':rules,'settings':self.settings(),
                'available':available,'attention':attention,'up_next':future,'server_time':stamp}

    def export_data(self):
        with self.db() as c:
            # Deliberately exclude credentials, observed window titles and local blob paths.
            return {table:[dict(r) for r in c.execute(f'SELECT {columns} FROM {table}')]
                    for table,columns in {'tasks':'*','notes':'id,raw,transcript,title,body,folder,project,task_id,mode,version,created_at,updated_at',
                    'task_captures':'*','attachments':'id,note_id,name,mime,size,offset_seconds','revisions':'*','reminders':'*','runs':'*','events':'*','suggestions':'*'}.items()}


def priority(task, all_tasks, stamp):
    if task['priority']!='auto': return task['priority'],'Priority set by you.'
    if task['due_at']:
        hours = (datetime.fromisoformat(task['due_at'])-datetime.fromisoformat(stamp)).total_seconds()/3600
        if hours<=48: return 'high','Your explicit deadline is within 48 hours or overdue.'
    if any(task['id'] in t['dependencies'] and t['status'] not in ('done','parked') for t in all_tasks):
        return 'high','This task is blocking another commitment.'
    if task['status']=='parked' or re.search(r'\b(optional|someday|nice to have)\b',task['title'],re.I):
        return 'low','Optional or intentionally parked work.'
    return 'medium','No explicit urgency; neutral default.'
