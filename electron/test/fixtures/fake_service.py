"""Managed-service double for electron/test (protocol 2). NOEMA_FAKE_MODE selects the behaviour."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

MODES = {'ok', 'locked', 'port', 'lease', 'hang', 'early-exit', 'bad-ack', 'extra-key', 'long-ack',
         'bad-http', 'grandchild', 'env-dump', 'pdeathsig', 'die-after-ack'}
mode = os.environ.get('NOEMA_FAKE_MODE', '')
if mode not in MODES:
    sys.exit(99)
args = sys.argv[1:]
port = int(args[args.index('--port') + 1])
workspace = args[args.index('--data-dir') + 1]
pidfile = os.environ.get('NOEMA_FAKE_PIDFILE')


def write_pids(*pids):
    if pidfile:
        Path(pidfile).write_text(json.dumps(list(pids)))


if mode == 'pdeathsig':
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from dhara.desktop_service import set_parent_death_signal
    set_parent_death_signal()
    write_pids(os.getpid())  # only after prctl, so a test never kills the owner too early
    time.sleep(60)
    sys.exit(0)
write_pids(os.getpid())
if mode == 'early-exit':
    sys.exit(3)
line = sys.stdin.buffer.readline(2049)
if mode in ('locked', 'port', 'lease'):
    sys.exit({'locked': 10, 'port': 11, 'lease': 12}[mode])
if mode == 'hang':
    time.sleep(60)  # ignores the lease entirely: the owner must escalate to signals
    sys.exit(0)
instance = json.loads(line)['instance']


def watch_lease():
    sys.stdin.buffer.read()
    os._exit(0)  # like the real service, stop on lease EOF; descendants are the owner's to clean


threading.Thread(target=watch_lease, daemon=True).start()
if mode == 'grandchild':
    child = subprocess.Popen(['/bin/sleep', '60'])
    write_pids(os.getpid(), child.pid)
    if os.environ.get('NOEMA_FAKE_ACK') != '1':
        time.sleep(60)
        sys.exit(0)
if mode == 'env-dump':
    Path(os.environ['NOEMA_FAKE_ENVFILE']).write_text(json.dumps({
        'env': sorted(os.environ), 'argv': args, 'lease': line.decode(), 'pid': os.getpid(),
        'pgid': os.getpgrp(), 'sid': os.getsid(0), 'ppid': os.getppid()}))
identity = {'protocol': 2, 'instance': instance, 'pid': os.getpid()}
ack = dict(identity, workspace=workspace, port=port)
if mode == 'bad-ack':
    ack['instance'] = '0' * 64
if mode == 'extra-key':
    ack['extra'] = True
served = dict(identity, instance='f' * 64) if mode == 'bad-http' else identity


class Identity(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(served).encode()
        self.send_response(200 if self.path == '/api/desktop-instance' else 404)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


server = http.server.HTTPServer(('127.0.0.1', port), Identity)
if mode == 'die-after-ack':
    print(json.dumps(ack), flush=True)
    time.sleep(0.3)  # the listener accepts into its backlog but never answers: the identity read ends only when this process dies
    os._exit(3)
if mode == 'long-ack':
    sys.stdout.write('x' * 5000)
    sys.stdout.flush()
else:
    print(json.dumps(ack), flush=True)
server.serve_forever()
