"""Python side of desktop launch protocol 2 (spec §6.4.3).

Owner-side cases (lock, port, crash/Retry, owner death, agents, environment and identity) run
against this same run.py from electron/test/service-*.test.ts. No real notebook, profile or
production port is used.
"""
import io
import json
import os
import re
from pathlib import Path
import select
import shlex
import signal
import socket
import subprocess
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

from dhara.desktop_service import (EXIT_LEASE, EXIT_LOCKED, EXIT_PORT, STRIPPED_ENV, STRIPPED_NAMES, bind_listener,
                                   read_lease, workspace_lock)
from dhara.env import PREFIXES
from dhara.server import create_app

ROOT = Path(__file__).resolve().parents[1]
INSTANCE = 'a' * 64
LEASE = json.dumps({'instance': INSTANCE}).encode() + b'\n'
linux = pytest.mark.skipif(sys.platform != 'linux', reason='Managed mode is Linux-only')


def test_stripped_env_matches_the_electron_owner_list():
    # electron/src/env.ts strips the same names under both prefixes before spawning (spec §6.4.2, rename spec §4.1).
    ts = (ROOT / 'electron/src/env.ts').read_text()
    names = re.search(r'export const STRIPPED_NAMES = \[(.*?)\] as const', ts, re.S).group(1)
    assert set(re.findall(r"'(\w+)'", names)) == set(STRIPPED_NAMES)
    assert re.search(r"export const PREFIX = '(\w+)'", ts).group(1) == PREFIXES[0]
    assert re.search(r"export const LEGACY_PREFIX = '(\w+)'", ts).group(1) == PREFIXES[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def managed_env():
    env = os.environ.copy()
    for key in STRIPPED_ENV:
        env.pop(key, None)
    return env


# The service as the venv runs it and as the AppImage ships it (packaging spec §6); DHARA_SERVICE_CMD overrides the frozen command.
FROZEN_DEFAULT = ROOT / 'release/out/service/dhara-service/dhara-service'
SERVICE_CMDS = {'venv': [sys.executable, str(ROOT / 'run.py')],
                'packaged': shlex.split(os.environ.get('DHARA_SERVICE_CMD', '')) or [str(FROZEN_DEFAULT)]}


@pytest.fixture(params=['venv', 'packaged'])
def service_cmd(request):
    cmd = SERVICE_CMDS[request.param]
    if request.param == 'packaged' and not Path(cmd[0]).exists():
        pytest.skip(f'{cmd[0]} is absent: run release/build.sh (or set DHARA_SERVICE_CMD) to test the frozen service')
    return cmd


def launch(cmd, data, port, owner=None, host='127.0.0.1', cwd=None):
    # Own session: on lease EOF Python signals its own process group, never pytest's.
    return subprocess.Popen(
        [*cmd, '--desktop-managed', '--host', host, '--port', str(port),
         '--data-dir', str(data), '--owner-pid', str(os.getpid() if owner is None else owner)],
        cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env=managed_env(), start_new_session=True)


def test_public_handshake_does_not_authorize_api(tmp_path, monkeypatch):
    for key in STRIPPED_ENV:
        monkeypatch.delenv(key, raising=False)
    identity = {'protocol': 2, 'instance': 'b' * 64, 'pid': 123}
    app = create_app(tmp_path, start_worker=False, desktop_identity=identity)
    with TestClient(app) as web:
        assert web.get('/api/desktop-instance').json() == identity
        assert web.get('/api/state').status_code == 401
        assert web.get('/api/state', headers={'Authorization': 'Bearer ' + identity['instance']}).status_code == 401
        assert web.get('/api/desktop-instance', headers={'Host': 'evil.test'}).status_code == 400
        assert web.get('/api/desktop-instance', headers={'Origin': 'https://evil.test'}).status_code == 403


def test_read_lease_accepts_up_to_2048_bytes_and_leaves_the_rest():
    prefix = b'{"instance":"' + INSTANCE.encode() + b'","pad":"'
    line = prefix + b'x' * (2048 - len(prefix) - 3) + b'"}\n'
    assert len(line) == 2048
    stream = io.BytesIO(line + b'rest')
    assert read_lease(stream) == INSTANCE
    assert stream.read() == b'rest'


@pytest.mark.parametrize('line', [
    b'',
    b'not json\n',
    b'[]\n',
    b'{}\n',
    b'{"instance":5}\n',
    b'{"instance":"' + b'A' * 64 + b'"}\n',
    b'{"instance":"' + b'a' * 63 + b'"}\n',
    b'{"instance":"' + b'a' * 65 + b'"}\n',
    b'{"instance":"' + b'g' * 64 + b'"}\n',
    b'\xff\xfe\n',
    b'{"instance":"' + b'a' * 64 + b'","pad":"' + b'x' * 2048 + b'"}\n',
])
def test_read_lease_rejects(line):
    with pytest.raises(ValueError, match='Invalid desktop lease'):
        read_lease(io.BytesIO(line))


@linux
def test_bind_listener_sets_reuseaddr_never_reuseport():
    sock = bind_listener('127.0.0.1', 0)
    try:
        assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR) == 1
        assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT) == 0
        with socket.create_connection(sock.getsockname(), timeout=2):
            pass  # listen() already ran
    finally:
        sock.close()


@linux
def test_bind_listener_refuses_a_live_listener():
    with socket.socket() as occupant:
        occupant.bind(('127.0.0.1', 0))
        occupant.listen()
        with pytest.raises(OSError):
            bind_listener('127.0.0.1', occupant.getsockname()[1])


@linux
def test_set_parent_death_signal_requests_sigterm():
    code = ('import ctypes; from dhara.desktop_service import set_parent_death_signal; set_parent_death_signal(); '
            'value = ctypes.c_int(); ctypes.CDLL(None).prctl(2, ctypes.byref(value), 0, 0, 0); print(value.value)')
    result = subprocess.run([sys.executable, '-c', code], cwd=ROOT, capture_output=True, text=True, check=True, timeout=30)
    assert int(result.stdout) == signal.SIGTERM  # PR_GET_PDEATHSIG


@linux
@pytest.mark.parametrize('case, expected', [
    ('owner', EXIT_LEASE), ('lease', EXIT_LEASE), ('relative', EXIT_LEASE), ('symlink', EXIT_LEASE),
    ('missing', EXIT_LEASE), ('file', EXIT_LEASE), ('host', EXIT_LEASE),
    ('locked', EXIT_LOCKED), ('port', EXIT_PORT),
])
def test_managed_exit_codes_never_write_the_workspace(tmp_path, service_cmd, case, expected):
    root = tmp_path / 'data'
    root.mkdir(mode=0o700)
    data, owner, host, lease, held, occupant = root.resolve(), None, '127.0.0.1', LEASE, None, None
    port = free_port()
    if case == 'owner':
        owner = 1
    elif case == 'lease':
        lease = b'{"instance":"short"}\n'
    elif case == 'relative':
        data = 'data'
    elif case == 'symlink':
        (tmp_path / 'link').symlink_to(root)
        data = tmp_path / 'link'
    elif case == 'missing':
        data = tmp_path / 'missing'
    elif case == 'file':
        (tmp_path / 'file').write_text('not a directory')
        data = tmp_path / 'file'
    elif case == 'host':
        host = '0.0.0.0'
    elif case == 'locked':
        held = workspace_lock(root)
    else:
        occupant = socket.socket()
        occupant.bind(('127.0.0.1', port))
        occupant.listen()
        occupant.settimeout(.2)
    try:
        process = launch(service_cmd, data, port, owner=owner, host=host, cwd=tmp_path)
        out, _ = process.communicate(lease, timeout=30)
        assert process.returncode == expected
        assert out == b''  # no readiness line
        if case == 'port':
            with pytest.raises(TimeoutError):
                occupant.accept()  # the occupant is never contacted
        if expected == EXIT_LEASE:
            assert list(root.iterdir()) == []  # nothing, not even the lock, before a valid lease
        assert not (root / 'admin.token').exists()
        assert not (tmp_path / 'missing').exists()
    finally:
        if held:
            held.close()
        if occupant:
            occupant.close()


@linux
def test_managed_acknowledges_protocol_2_and_stops_on_lease_eof(tmp_path, service_cmd):
    root = tmp_path / 'data'
    root.mkdir(mode=0o700)
    root = root.resolve()
    port = free_port()
    process = launch(service_cmd, root, port)
    try:
        process.stdin.write(LEASE)
        process.stdin.flush()
        ready, _, _ = select.select([process.stdout], [], [], 30)
        assert ready, 'no readiness line'
        ack = json.loads(process.stdout.readline(4097))
        assert ack == {'protocol': 2, 'instance': INSTANCE, 'pid': process.pid, 'workspace': str(root), 'port': port}
        with httpx.Client(trust_env=False, timeout=3) as web:
            identity = web.get(f'http://127.0.0.1:{port}/api/desktop-instance').json()
        assert identity == {'protocol': 2, 'instance': INSTANCE, 'pid': process.pid}
        assert (root / 'admin.token').exists()
        process.stdin.close()
        # uvicorn re-raises the SIGTERM it captured after a graceful shutdown (uvicorn/server.py:335-339).
        assert process.wait(timeout=15) in (0, -signal.SIGTERM)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
