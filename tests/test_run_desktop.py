"""run.py --desktop: one command starts the service and the Electron shell, and they stop together.
The shell is a fake executable here; the real one is electron/node_modules/electron/dist/electron."""
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def fake_shell(tmp_path, body):
    shell = tmp_path / 'shell'
    shell.write_text('#!/bin/sh\n' + body)
    shell.chmod(0o755)
    return shell


def run_py(*args):
    return [sys.executable, str(ROOT / 'run.py'), *args]


def test_desktop_opens_the_shell_against_the_service_and_stops_when_it_exits(tmp_path):
    log = tmp_path / 'argv'
    shell = fake_shell(tmp_path, f'printf "%s\\n" "$@" > "{log}"\nexit 0\n')
    port = free_port()
    proc = subprocess.run(run_py('--desktop', '--shell', str(shell), '--port', str(port), '--data-dir', str(tmp_path / 'ws')),
                          capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    assert log.read_text().splitlines() == [str(ROOT / 'electron'), '--server', f'http://127.0.0.1:{port}']


def test_desktop_refuses_a_missing_shell_before_starting_the_service(tmp_path):
    proc = subprocess.run(run_py('--desktop', '--shell', str(tmp_path / 'nope'), '--data-dir', str(tmp_path / 'ws')),
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 2
    assert 'Electron shell not found' in proc.stderr
    assert not (tmp_path / 'ws').exists()


def test_interrupting_the_service_closes_the_shell(tmp_path):
    pidfile = tmp_path / 'pid'
    shell = fake_shell(tmp_path, f'echo $$ > "{pidfile}"\nexec sleep 60\n')
    port = free_port()
    proc = subprocess.Popen(run_py('--desktop', '--shell', str(shell), '--port', str(port), '--data-dir', str(tmp_path / 'ws')),
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(300):
            if pidfile.exists() and pidfile.read_text().strip():
                break
            time.sleep(0.1)
        else:
            raise AssertionError('the shell was never launched')
        pid = int(pidfile.read_text())
        proc.send_signal(signal.SIGINT)
        assert proc.wait(timeout=20) == 0
        for _ in range(50):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.1)
        else:
            os.kill(pid, signal.SIGKILL)
            raise AssertionError('the shell outlived the service')
    finally:
        if proc.poll() is None:
            proc.kill()
