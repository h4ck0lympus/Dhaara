#!/usr/bin/env python3
"""Wrap a local command, keep its output in the terminal, report lifecycle events.

No prompt parsing and no claim of task correctness. A zero exit status means
ready for review. Events are durably queued before sending and retried in order.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import time
from uuid import uuid4
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # tools/ scripts run from anywhere; dhara/ is beside them
from dhara.env import strip
from client import Client

class Outbox:
    def __init__(self,path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with sqlite3.connect(self.path) as c:c.execute('CREATE TABLE IF NOT EXISTS pending(id INTEGER PRIMARY KEY, path TEXT NOT NULL, payload TEXT NOT NULL)')
        self.path.chmod(0o600)
    def add(self,path,payload):
        with sqlite3.connect(self.path) as c:c.execute('INSERT INTO pending(path,payload) VALUES(?,?)',(path,json.dumps(payload)))
    def flush(self,client):
        with sqlite3.connect(self.path) as c:
            rows=c.execute('SELECT id,path,payload FROM pending ORDER BY id').fetchall()
        for rid,path,payload in rows:
            try:client.request(path,json.loads(payload))
            except RuntimeError:return False
            with sqlite3.connect(self.path) as c:c.execute('DELETE FROM pending WHERE id=?',(rid,))
        return True

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url',default='http://127.0.0.1:8765')
    p.add_argument('--task');p.add_argument('--name',default='Local agent')
    p.add_argument('--session-url',default='');p.add_argument('--outbox',default='.data/agent-events.sqlite3')
    p.add_argument('--flush',action='store_true');p.add_argument('command',nargs=argparse.REMAINDER)
    args=p.parse_args()
    try:client=Client(args.url)
    except ValueError as e:p.error(str(e))
    outbox=Outbox(args.outbox)
    if args.flush:
        ok=outbox.flush(client);print('All queued events delivered.' if ok else 'Some events remain queued; check the server and token scope.');return 0 if ok else 1
    command=args.command[1:] if args.command and args.command[0]=='--' else args.command
    if not args.task or not command:p.error('--task and a command after -- are required')
    run_id=uuid4().hex
    try:client.request('/runs',{'run_id':run_id,'task_id':args.task,'agent':args.name,'session_url':args.session_url})
    except RuntimeError as e:print(str(e),file=sys.stderr);return 1
    seq=0
    def send(kind,message):
        nonlocal seq
        seq+=1;outbox.add('/runs/'+run_id+'/events',{'event_id':uuid4().hex,'seq':seq,'kind':kind,'message':message});outbox.flush(client)
    send('started','Command started. Output stays in your terminal.')
    child_env=os.environ.copy()
    # Do not hand this integration credential or an admin token to the wrapped command.
    strip(child_env,('TOKEN','ACCESS_TOKEN'))
    process=None
    try:
        process=subprocess.Popen(command,env=child_env,start_new_session=os.name=='posix')
        def interrupted(signum,frame):raise KeyboardInterrupt
        signal.signal(signal.SIGTERM,interrupted)
        while True:
            try:code=process.wait(timeout=30);break
            except subprocess.TimeoutExpired:send('heartbeat','Process is still running; no completion claim.')
        send('completed' if code==0 else 'failed',f'Process exited with status {code}. '+('Review the result before completing the task.' if code==0 else 'Check the terminal output.'))
        print(f'\nNoema run {run_id}: '+('ready for review' if code==0 else 'failed'))
        return code if 0<=code<=255 else 1
    except KeyboardInterrupt:
        if process and process.poll() is None:
            if os.name=='posix':os.killpg(process.pid,signal.SIGTERM)
            else:process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if os.name=='posix':os.killpg(process.pid,signal.SIGKILL)
                else:process.kill()
                process.wait()
        send('cancelled','Command interrupted by the user.');return 130
    except OSError as e:
        send('failed',f'Could not start the command: {e.strerror or type(e).__name__}');return 1
    finally:
        if not outbox.flush(client):print('Some events remain in the local outbox. Run this helper with --flush when connected.',file=sys.stderr)

if __name__=='__main__':raise SystemExit(main())
