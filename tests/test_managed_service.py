"""Real Linux owner/HTTP/process checks. Build the Rust probe before this suite.

No real notebook/profile, fixed production port, or sensitive screen is used.
Probe events are the exact service actor used by the desktop, not a mock owner.
"""
import json
import os
from pathlib import Path
import queue
import signal
import socket
import subprocess
import threading
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from noema.server import create_app

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'desktop/target/debug/examples/service_probe'
PYTHON = ROOT / '.venv/bin/python'
pytestmark = pytest.mark.skipif(not PROBE.exists() or os.name != 'posix',
                               reason='Build Linux service_probe example first')


def until(predicate, seconds=12):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.04)
    raise AssertionError('Condition did not become true')


def live(pid):
    try:
        return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[0] != 'Z'
    except (FileNotFoundError, ProcessLookupError):
        return False


class Probe:
    def __init__(self, root, origin, python=PYTHON, entry=ROOT / 'run.py', timeout=10):
        self.process = subprocess.Popen([str(PROBE), str(python), str(entry), str(root),
                                         origin, str(timeout)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        text=True)
        self.events = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in self.process.stdout:
            self.events.put(json.loads(line))

    def event(self, kind, seconds=18):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = self.events.get(timeout=max(.01, deadline-time.monotonic()))
            if value['event'] == kind:
                return value
            assert value['event'] != 'error', value
        raise AssertionError(f'No {kind} event')

    def send(self, command):
        self.process.stdin.write(command + '\n')
        self.process.stdin.flush()

    def close(self):
        if self.process.poll() is None:
            self.send('quit')
            self.event('stopped')
        self.process.wait(timeout=12)
        self.process.stdin.close()
        self.process.stdout.close()


@pytest.fixture
def endpoint():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    return f'http://127.0.0.1:{port}'


@pytest.fixture
def probes():
    instances = []
    def start(*args, **kwargs):
        instance = Probe(*args, **kwargs)
        instances.append(instance)
        return instance
    yield start
    for instance in reversed(instances):
        instance.close()


def client(root):
    token = (root / 'admin.token').read_text().strip()
    return httpx.Client(trust_env=False, headers={'Authorization': 'Bearer ' + token}, timeout=3)


def test_cold_reopen_browser_and_retry_preserve_state(tmp_path, endpoint, probes):
    root = tmp_path / 'data'
    owner = probes(root, endpoint)
    pid = owner.event('ready')['pid']
    with client(root) as web:
        identity = web.get(endpoint + '/api/desktop-instance').json()
        assert identity['pid'] == pid and set(identity) == {'pid', 'instance', 'protocol'}
        assert 'Noema' in web.get(endpoint).text  # Existing browser workflow.
        task = web.post(endpoint + '/api/tasks', json={'title': 'Synthetic task', 'priority': 'low'}).json()
        dependent = web.post(endpoint + '/api/tasks', json={'title': 'Synthetic dependent', 'dependencies':[task['id']]}).json()
        assert web.post(endpoint + '/api/focus', json={'task_id': task['id'], 'pinned': True}).is_success
        for _ in range(8):
            owner.send('retry')
        time.sleep(.4)
        assert web.get(endpoint + '/api/desktop-instance').json()['pid'] == pid
        competitor = probes(root, endpoint)
        assert 'workspace' in competitor.event('error')['message']
        assert web.get(endpoint + '/api/health').is_success
    owner.close()
    assert not Path(f'/proc/{pid}').exists()
    reopened = probes(root, endpoint)
    new_pid = reopened.event('ready')['pid']
    assert new_pid != pid
    with client(root) as web:
        state = web.get(endpoint + '/api/state').json()
        tasks = {item['id']: item for item in state['tasks']}
        assert len(tasks) == 2 and tasks[task['id']]['priority'] == 'low'
        assert tasks[dependent['id']]['dependencies'] == [task['id']]
        assert state['focus']['pinned'] and state['focus']['task_id'] == task['id']


def test_wrong_endpoint_is_not_contacted_or_killed(tmp_path, probes):
    with socket.socket() as occupant:
        occupant.bind(('127.0.0.1', 0))
        occupant.listen()
        occupant.settimeout(.2)
        origin = f'http://127.0.0.1:{occupant.getsockname()[1]}'
        owner = probes(tmp_path / 'data', origin)
        assert 'occupied' in owner.event('error')['message']
        with pytest.raises(TimeoutError):
            occupant.accept()  # Not even a credential-free handshake to an occupant.
        assert occupant.fileno() >= 0


@pytest.mark.parametrize('failure', ['runtime', 'entry', 'dependency', 'permissions'])
def test_startup_errors_are_bounded(tmp_path, endpoint, probes, failure):
    python, entry, root = PYTHON, ROOT / 'run.py', tmp_path / 'data'
    if failure == 'runtime':
        python = tmp_path / 'missing-python'
    elif failure == 'entry':
        entry = tmp_path / 'missing-entry.py'
    elif failure == 'dependency':
        entry = tmp_path / 'missing-dependency.py'
        entry.write_text('raise ModuleNotFoundError("synthetic dependency")\n')
    else:
        root.write_text('not a directory')
    owner = probes(root, endpoint, python=python, entry=entry)
    assert owner.event('error')['message']


@pytest.mark.parametrize('cancel', [False, True])
def test_timeout_cancel_cleanup_owned_descendant(tmp_path, endpoint, probes, cancel):
    entry = tmp_path / 'slow.py'
    pidfile = tmp_path / 'children.json'
    entry.write_text('import os, subprocess, time, json\n'
                     'from pathlib import Path\n'
                     'child=subprocess.Popen(["/bin/sleep", "60"])\n'
                     f'Path({str(pidfile)!r}).write_text(json.dumps([os.getpid(),child.pid]))\n'
                     'time.sleep(60)\n')
    owner = probes(tmp_path / 'data', endpoint, entry=entry, timeout=.4)
    until(pidfile.exists)
    pids = json.loads(pidfile.read_text())
    if cancel:
        owner.close()
    else:
        assert 'timed out' in owner.event('error')['message']
    until(lambda: all(not Path(f'/proc/{pid}').exists() for pid in pids))


def test_backend_crash_requires_explicit_retry(tmp_path, endpoint, probes):
    owner = probes(tmp_path / 'data', endpoint)
    pid = owner.event('ready')['pid']
    os.kill(pid, signal.SIGKILL)  # Exact fixture child, never process-name cleanup.
    assert 'unexpectedly' in owner.event('error')['message']
    time.sleep(.3)
    assert owner.events.empty()  # No automatic restart loop.
    owner.send('retry')
    assert owner.event('ready')['pid'] != pid


@pytest.mark.parametrize('termination', [signal.SIGTERM, signal.SIGKILL])
def test_unexpected_owner_death_closes_lease(tmp_path, endpoint, probes, termination):
    owner = probes(tmp_path / 'data', endpoint)
    pid = owner.event('ready')['pid']
    os.kill(owner.process.pid, termination)
    owner.process.wait(timeout=5)
    until(lambda: not Path(f'/proc/{pid}').exists())
    # Child-held workspace lock and port are both released after parent death.
    reopened = probes(tmp_path / 'data', endpoint)
    reopened.event('ready')


def test_external_backend_not_owned(tmp_path, endpoint, probes):
    root = tmp_path / 'data'
    external = subprocess.Popen([str(PYTHON), str(ROOT / 'run.py'), '--data-dir', str(root),
                                 '--port', endpoint.rsplit(':', 1)[1]],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        until(lambda: (root / 'admin.token').exists())
        with client(root) as web:
            def ready():
                try:
                    return web.get(endpoint + '/api/health').is_success
                except httpx.TransportError:
                    return False
            until(ready)
            assert web.get(endpoint + '/api/desktop-instance').status_code == 404
            owner = probes(root, endpoint)
            assert 'workspace' in owner.event('error')['message']
            owner.close()
            assert external.poll() is None and web.get(endpoint + '/api/state').is_success
    finally:
        external.terminate()
        external.wait(timeout=8)


def test_public_handshake_does_not_authorize_api(tmp_path, monkeypatch):
    monkeypatch.delenv('NOEMA_ACCESS_TOKEN', raising=False)
    monkeypatch.delenv('NOEMA_MODEL', raising=False)
    monkeypatch.delenv('NOEMA_SPEECH_MODEL', raising=False)
    identity = {'protocol': 1, 'instance': 'b'*64, 'pid': 123}
    app = create_app(tmp_path, start_worker=False, desktop_identity=identity)
    with TestClient(app) as web:
        assert web.get('/api/desktop-instance').json() == identity
        assert web.get('/api/state').status_code == 401
        assert web.get('/api/state', headers={'Authorization':'Bearer ' + identity['instance']}).status_code == 401
        assert web.get('/api/desktop-instance', headers={'Host':'evil.test'}).status_code == 400
        assert web.get('/api/desktop-instance', headers={'Origin':'https://evil.test'}).status_code == 403


def test_separately_wrapped_agent_survives_owned_quit(tmp_path, endpoint, probes):
    root = tmp_path / 'data'
    owner = probes(root, endpoint)
    owner.event('ready')
    with client(root) as web:
        task = web.post(endpoint + '/api/tasks', json={'title':'Synthetic agent task'}).json()
        token = web.post(endpoint + '/api/tokens', json={'name':'Fixture agent', 'scope':'agent', 'task_ids':[task['id']]}).json()['token']
    env = os.environ.copy()
    env['NOEMA_TOKEN'] = token
    release = tmp_path / 'release'
    outbox = tmp_path / 'agent-outbox.sqlite3'
    # The independent wrapper's command is alive until the fixture releases it.
    code = f'from pathlib import Path; import time\np=Path({str(release)!r})\nwhile not p.exists(): time.sleep(.05)'
    agent = subprocess.Popen([str(PYTHON), str(ROOT/'tools/agent.py'), '--url', endpoint,
                              '--task', task['id'], '--outbox', str(outbox), '--',
                              str(PYTHON), '-c', code], env=env, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
    try:
        with client(root) as web:
            until(lambda: len(web.get(endpoint+'/api/state').json()['runs']) == 1)
        owner.close()
        assert agent.poll() is None
        reopened = probes(root, endpoint)
        reopened.event('ready')
        release.touch()
        assert agent.wait(timeout=12) == 0
        with client(root) as web:
            state = web.get(endpoint+'/api/state').json()
            assert state['tasks'][0]['status'] == 'todo'
            assert state['runs'][0]['effective_status'] == 'review'
    finally:
        release.touch()
        if agent.poll() is None:
            agent.terminate()
            agent.wait(timeout=8)


def test_invalid_identity_never_loads_workspace(tmp_path, endpoint, probes):
    entry = tmp_path / 'wrong-identity.py'
    entry.write_text('import json, sys, time\n'
                     'config=json.loads(sys.stdin.readline())\n'
                     'print(json.dumps({"protocol":1,"instance":config["instance"],"pid":0,"workspace":"wrong"}),flush=True)\n'
                     'time.sleep(60)\n')
    owner = probes(tmp_path / 'data', endpoint, entry=entry)
    assert 'identity verification failed' in owner.event('error')['message']
    assert not (tmp_path / 'data/admin.token').exists()


def test_managed_disables_inherited_optional_features(tmp_path, endpoint, probes, monkeypatch):
    monkeypatch.setenv('NOEMA_MODEL', 'must-not-start')
    monkeypatch.setenv('NOEMA_SPEECH_MODEL', 'must-not-download')
    monkeypatch.setenv('NOEMA_ACCESS_TOKEN', 'inherited-secret-not-used-'*2)
    monkeypatch.setenv('NOEMA_DATA_DIR', str(tmp_path / 'not-selected'))
    root = tmp_path / 'selected'
    owner = probes(root, endpoint)
    owner.event('ready')
    with client(root) as web:
        state = web.get(endpoint+'/api/state').json()
        assert not state['capabilities']['organizer'] and not state['capabilities']['speech']
        assert not state['settings']['observation_enabled']
    assert not (tmp_path / 'not-selected').exists()


def test_owner_death_before_python_lease_watcher(tmp_path, endpoint, probes):
    entry = tmp_path / 'before-import.py'
    entry.write_text('import time\ntime.sleep(60)\n')
    owner = probes(tmp_path / 'data', endpoint, entry=entry, timeout=30)
    def children():
        # Only this fixture owner's task children; never read process args/env.
        paths = Path(f'/proc/{owner.process.pid}/task').glob('*/children')
        return [int(pid) for path in paths for pid in path.read_text().split()]
    until(lambda: bool(children()))
    pids = children()
    os.kill(owner.process.pid, signal.SIGKILL)
    owner.process.wait(timeout=5)
    until(lambda: all(not Path(f'/proc/{pid}').exists() for pid in pids))
    reopened = probes(tmp_path / 'data', endpoint)
    reopened.event('ready')
