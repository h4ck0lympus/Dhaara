"""Explicit one-time installation of local lifecycle hooks; no pairing tokens."""
import json
import os
from pathlib import Path
import shlex
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4

from .agent_hook import EVENTS, SCHEMA
from .store import Problem

PROVIDERS = {'claude': 'Claude Code', 'codex': 'Codex'}
CONFIG_LOCK = threading.RLock()


def config_path(provider, home=None):
    home = Path(home or Path.home())
    return (home / '.claude' / 'settings.json' if provider == 'claude'
            else Path(os.environ.get('CODEX_HOME', str(home / '.codex'))) / 'hooks.json')


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(prefix='.dhaara-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f, indent=2)
            f.write('\n')
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_config(path):
    try:
        value = json.loads(path.read_text()) if path.exists() else {}
        if not isinstance(value, dict) or not isinstance(value.get('hooks', {}), dict):
            raise ValueError()
        for groups in value.get('hooks', {}).values():
            if not isinstance(groups, list) or any(not isinstance(g, dict) or not isinstance(g.get('hooks'), list)
                or any(not isinstance(h, dict) for h in g['hooks']) for g in groups):
                raise ValueError()
        return value
    except (ValueError, OSError):
        raise Problem(409, f'Cannot safely update {path.name}. Existing configuration was preserved.') from None


def connection_status(store):
    installed = store.meta('agent_connections') or {}
    with store.db() as db:
        sessions = [dict(r) for r in db.execute('SELECT provider, max(observed) AS last_seen FROM hook_sessions GROUP BY provider')]
    seen = {r['provider']: r['last_seen'] for r in sessions}
    return {'connections': [{'provider': p, 'name': name, 'installed': p in installed,
                             'mode': installed.get(p, {}).get('mode', 'hooks'),
                             'last_seen': seen.get(p)} for p, name in PROVIDERS.items()]}


def configure(store, provider, enabled, home=None, mode='hooks'):
    with CONFIG_LOCK:
        return _configure(store, provider, enabled, home, mode)


def _configure(store, provider, enabled, home=None, mode='hooks'):
    if provider not in PROVIDERS:
        raise Problem(404, 'Unknown agent')
    installed = store.meta('agent_connections') or {}
    previous = installed.get(provider, {})
    path = Path(previous['path']) if previous.get('path') else config_path(provider, home)
    config = read_config(path)
    hooks = config.setdefault('hooks', {})
    # Remove only exact commands recorded by our installer; preserve every
    # other hook and setting, including mixed groups and custom matchers.
    owned = set(previous.get('commands', []))
    for event, groups in list(hooks.items()):
        cleaned = []
        for group in groups:
            handlers = [h for h in group['hooks'] if h.get('command') not in owned]
            if handlers:
                cleaned.append({**group, 'hooks': handlers})
        if cleaned:
            hooks[event] = cleaned
        else:
            del hooks[event]
    if enabled:
        folder = store.root / 'agent-hooks'
        folder.mkdir(exist_ok=True, mode=0o700)
        receiver = folder / 'receiver.py'
        shutil.copyfile(Path(__file__).with_name('agent_hook.py'), receiver)
        receiver.chmod(0o600)
        inbox = folder / 'inbox.sqlite3'
        with sqlite3.connect(inbox) as db:
            db.executescript(SCHEMA)
        inbox.chmod(0o600)
        python = sys.executable
        if getattr(sys, 'frozen', False):
            python = shutil.which('python3') or shutil.which('python')
            if not python:
                raise Problem(409, 'A Python runtime is needed for agent hooks in this packaged build.')
        from .agent_plugin import build_plugin
        build_plugin(folder / 'plugins' / provider, provider, inbox.resolve(), python)
        import subprocess
        parts = [python, str(receiver.resolve()), '--inbox', str(inbox.resolve()), '--provider', provider]
        command = subprocess.list2cmdline(parts) if os.name == 'nt' else shlex.join(parts)
        events = [e for e in EVENTS if not (provider == 'claude' and e == 'Interrupt')
                  and not (provider == 'codex' and e == 'StopFailure')]
        for event in events if mode == 'hooks' else []:
            # Short synchronous local writes preserve ordering across permission,
            # tool and Stop events; there are no network waits.
            hooks.setdefault(event, []).append({'hooks': [{'type': 'command', 'command': command, 'timeout': 2}]})
        installed[provider] = {'commands': [command] if mode == 'hooks' else [], 'path': str(path),
                               'mode': mode, 'since': previous.get('since', time.time())}
    else:
        installed.pop(provider, None)
    if path.exists() and (owned or (enabled and mode == 'hooks')):
        backup = path.with_name(path.name + '.before-dhaara')
        if not backup.exists():
            shutil.copyfile(path, backup)
            backup.chmod(0o600)
    if owned or (enabled and mode == 'hooks'):
        atomic_json(path, config)
    store.set_meta('agent_connections', installed)
    return connection_status(store)


def drain(store):
    inbox = store.root / 'agent-hooks' / 'inbox.sqlite3'
    if not inbox.exists():
        return
    installed = store.meta('agent_connections') or {}
    with sqlite3.connect(inbox, timeout=.2) as queue:
        queue.row_factory = sqlite3.Row
        rows = queue.execute('SELECT * FROM queue ORDER BY id LIMIT 500').fetchall()
    for row in rows:
        if row['provider'] in installed and row['observed'] >= installed[row['provider']].get('since', 0):
            accept(store, dict(row))
    if rows:
        with sqlite3.connect(inbox, timeout=.2) as queue:
            queue.execute('DELETE FROM queue WHERE id<=?', (rows[-1]['id'],))


def accept(store, event):
    """One task per session. The queue sequence makes crash replay idempotent."""
    provider, session, state = event['provider'], event['session'], event['state']
    if provider not in PROVIDERS or state not in set(EVENTS.values()):
        return
    stamp = datetime.fromtimestamp(event['observed'], timezone.utc).isoformat()
    with store.db() as db:
        old = db.execute('SELECT * FROM hook_sessions WHERE provider=? AND session=?', (provider, session)).fetchone()
        if old and event['id'] <= old['seq']:
            return
        if not old and state == 'ended':
            return
        if not old:
            task, run = uuid4().hex, uuid4().hex
            project = event['project'][:80]
            db.execute('''INSERT INTO tasks(id,title,project,detail,next_action,status,priority,dependencies,session_url,created_at,updated_at)
                VALUES(?,?,?,?,?,'active','auto','[]','',?,?)''',
                (task, f'{PROVIDERS[provider]} · {project} · {session[:6]}', project,
                 'Automatically connected agent session. Rename this task at any time.',
                 'Return to the agent session to continue.', stamp, stamp))
        else:
            task, run = old['task_id'], old['run_id']
        current = db.execute('SELECT * FROM runs WHERE id=?', (run,)).fetchone()
        if state == 'ended':
            # Ending a session must not erase a result awaiting review.
            state = current['status'] if current and current['status'] in ('review', 'failed', 'cancelled') else 'cancelled'
        if current and current['status'] in ('review', 'failed', 'cancelled') and state == 'working':
            # Archive the previous turn's report so it stops asking for review.
            db.execute("UPDATE runs SET status='cancelled' WHERE id=?", (run,))
            run = uuid4().hex
        messages = {'working': 'Agent activity reported by a lifecycle hook.',
                    'needs_input': 'The agent requested input or permission.',
                    'review': 'The agent finished a turn. Review its result; success is not verified.',
                    'failed': 'The agent reported a failed turn.',
                    'cancelled': 'The agent session ended or was interrupted.'}
        db.execute('''INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status,message=excluded.message,
            seq=excluded.seq,updated_at=excluded.updated_at''',
            (run, task, PROVIDERS[provider], '', state, messages[state], event['id'], stamp, stamp))
        db.execute('''INSERT INTO hook_sessions VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(provider,session) DO UPDATE SET run_id=excluded.run_id,seq=excluded.seq,observed=excluded.observed''',
            (provider, session, task, run, event['id'], stamp, stamp))
