"""Standalone, stdlib-only hook receiver. Never reads transcripts or calls a model.

Copied to a stable location by the connector installer. A short SQLite write is
the entire hook: the agent never waits for dhaara or a network connection.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time

EVENTS = {
    'UserPromptSubmit': 'working', 'PreToolUse': 'working',
    'PostToolUse': 'working', 'PermissionRequest': 'needs_input',
    'Stop': 'review', 'SessionEnd': 'ended', 'Interrupt': 'cancelled',
    'StopFailure': 'failed',
}
SCHEMA = '''
CREATE TABLE IF NOT EXISTS queue (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL,
 session TEXT NOT NULL, project TEXT NOT NULL, state TEXT NOT NULL,
 observed REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS latest (
 provider TEXT NOT NULL, session TEXT NOT NULL, state TEXT NOT NULL,
 observed REAL NOT NULL, PRIMARY KEY(provider, session)
);
'''


def enqueue(inbox, provider, payload):
    if provider not in ('claude', 'codex') or not isinstance(payload, dict):
        return
    if payload.get('agent_id'):
        return
    event = payload.get('hook_event_name')
    state = EVENTS.get(event)
    session = payload.get('session_id')
    if not state or not isinstance(session, str) or not session or len(session) > 256:
        return
    if event == 'PreToolUse' and payload.get('tool_name') in ('AskUserQuestion', 'request_user_input'):
        state = 'needs_input'
    session = hashlib.sha256(session.encode()).hexdigest()
    cwd = payload.get('cwd', '')
    project = str(cwd).replace('\\', '/').rstrip('/').rsplit('/', 1)[-1][:80] or 'Workspace'
    stamp = time.time()
    inbox = Path(inbox)
    with sqlite3.connect(inbox.as_uri() + '?mode=rw', uri=True, timeout=.15) as db:
        db.execute('BEGIN IMMEDIATE')
        last = db.execute('SELECT state, observed FROM latest WHERE provider=? AND session=?',
                          (provider, session)).fetchone()
        if last and last[0] == state and stamp - last[1] < 15:
            return
        if db.execute('SELECT count(*) FROM queue').fetchone()[0] >= 10000:
            db.execute('DELETE FROM queue WHERE id=(SELECT min(id) FROM queue)')
        db.execute('INSERT INTO queue(provider,session,project,state,observed) VALUES(?,?,?,?,?)',
                   (provider, session, project, state, stamp))
        db.execute('INSERT OR REPLACE INTO latest VALUES(?,?,?,?)', (provider, session, state, stamp))
        db.execute('DELETE FROM latest WHERE observed<?', (stamp - 30 * 86400,))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inbox', required=True)
    parser.add_argument('--provider', choices=('claude', 'codex'), required=True)
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        if len(raw) <= 1024 * 1024:
            enqueue(Path(args.inbox).absolute(), args.provider, json.loads(raw))
    except (OSError, ValueError, TypeError, sqlite3.Error):
        pass
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
