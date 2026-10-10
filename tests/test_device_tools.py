"""QA tooling tests, not physical Sway/microphone or app resource acceptance."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import pytest

from qa.device_fixture import NOTE, png, prepare
from qa.device_session import sanitized_outputs, client_protocol
from qa.process_sample import Process, measure, membership, parse_stat

ROOT = Path(__file__).resolve().parents[1]


def test_stat_discards_comm_and_parses_identity():
    fields = ['S', '7'] + ['0'] * 22
    fields[11], fields[12], fields[19], fields[21] = '20', '30', '456', '10'
    record = parse_stat('123 (private ) content) ' + ' '.join(fields), 100, 4096)
    assert record == Process(123, 7, 456, .5, 40960)
    assert 'private' not in repr(record)


def test_membership_retains_reparented_child_not_reused_root():
    root = Process(10, 1, 100, 0, 0)
    child = Process(11, 10, 101, 0, 0)
    unrelated = Process(12, 1, 102, 0, 0)
    known = {}
    selected, missing = membership({p.pid: p for p in (root, child, unrelated)},
                                   {'shell': root.identity}, known)
    assert set(selected) == {10, 11} and not missing
    reused = Process(10, 1, 200, 0, 0)
    reparented = Process(11, 1, 101, 0, 0)
    selected, missing = membership({p.pid: p for p in (reused, reparented, unrelated)},
                                   {'shell': root.identity}, known)
    assert set(selected) == {11} and missing == ['shell']


def test_fixture_prepares_only_synthetic_files(tmp_path, monkeypatch):
    monkeypatch.setattr('tempfile.tempdir', str(tmp_path))
    fixture = prepare(0)
    assert fixture.parent == tmp_path
    assert fixture.stat().st_mode & 0o777 == 0o700
    assert (fixture / 'synthetic-note.txt').read_text() == NOTE
    assert 'hypothesis' in NOTE and 'unconfirmed' in NOTE and '```python' in NOTE
    assert (fixture / 'synthetic-image.png').read_bytes() == png()
    assert len(png()) > 64 and png().startswith(b'\x89PNG\r\n\x1a\n')
    assert not (fixture / 'data').exists() and not (fixture / 'profile').exists()


def test_fixture_refuses_occupied_port(tmp_path, monkeypatch):
    monkeypatch.setattr('tempfile.tempdir', str(tmp_path))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        with pytest.raises(OSError):
            prepare(sock.getsockname()[1])
    assert not list(tmp_path.iterdir())


def test_session_report_filters_private_fields():
    outputs = sanitized_outputs([{'name': 'eDP-1', 'active': True, 'scale': 1.5,
                                  'serial': 'PRIVATE', 'make': 'PRIVATE'}])
    tree = {'name': 'PRIVATE TITLE', 'nodes': [
        {'pid': 100, 'shell': 'xdg_shell', 'name': 'PRIVATE URL'},
        {'pid': 200, 'shell': 'xwayland', 'name': 'PRIVATE NOTE'}]}
    report = json.dumps({'outputs': outputs, 'protocols': client_protocol(tree, 100)})
    assert 'PRIVATE' not in report and 'xdg_shell' in report and 'xwayland' not in report


@pytest.fixture
def process_tree():
    # Real descendants plus a distinct, unrelated sentinel. No application starts.
    code = '''import subprocess, sys
child = subprocess.Popen([sys.executable, '-c', 'import sys; data=bytearray(4000000); sys.stdin.read()'], stdin=subprocess.PIPE)
print(child.pid, flush=True)
sys.stdin.readline()
child.stdin.close()
child.wait(timeout=5)
'''
    parent = subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, text=True)
    unrelated = subprocess.Popen([sys.executable, '-c', 'import sys; sys.stdin.read()'],
                                 stdin=subprocess.PIPE, text=True)
    try:
        child_pid = int(parent.stdout.readline())
        yield parent, child_pid, unrelated
    finally:
        for process in (parent, unrelated):
            if process.poll() is None:
                process.stdin.write('\n')
                process.stdin.close()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def test_sampler_real_tree_excludes_unrelated_and_preserves_processes(process_tree):
    parent, child, unrelated = process_tree
    result = measure({'service': parent.pid}, warmup=.03, duration=.12,
                     interval=.04, phase='tooling-test')
    assert result['status'] == 'sampled'
    assert result['process_count_min'] == result['process_count_max'] == 2
    assert {p['pid'] for p in result['observed_processes']} == {parent.pid, child}
    assert unrelated.pid not in {p['pid'] for p in result['observed_processes']}
    assert result['sample_seconds'] >= .12
    assert all(s['summed_rss_bytes'] > 0 for s in result['samples'])
    assert parent.poll() is None and unrelated.poll() is None
    assert set(result['roots']['service']) == {'pid', 'start_ticks'}
    assert 'command' not in json.dumps(result['observed_processes'])


def test_sampler_missing_private_memory_is_unknown(process_tree, monkeypatch):
    parent, _, _ = process_tree
    monkeypatch.setattr('qa.process_sample.memory_private', lambda *_: None)
    result = measure({'service': parent.pid}, warmup=0, duration=.02, interval=.01,
                     phase='tooling-test')
    assert not result['private_memory_complete']
    assert all(s['summed_pss_bytes'] is None and s['summed_private_bytes'] is None
               for s in result['samples'])


def test_sampler_cli_does_not_overwrite_evidence(tmp_path):
    output = tmp_path / 'keep.json'
    output.write_text('retained evidence')
    result = subprocess.run([sys.executable, str(ROOT / 'qa/process_sample.py'),
        '--root', f'service={os.getpid()}', '--phase', 'tooling-test',
        '--warmup', '0', '--duration', '.02', '--interval', '.01', '--output', str(output)],
        capture_output=True, text=True, timeout=10)
    assert result.returncode == 2
    assert output.read_text() == 'retained evidence'


def test_sampler_refuses_nonfinite_periods():
    with pytest.raises(ValueError):
        measure({'service': os.getpid()}, warmup=float('nan'), duration=1, interval=1)


def test_sampler_actual_cli_report_is_private_and_content_free(process_tree, tmp_path):
    parent, child, unrelated = process_tree
    output = tmp_path / 'sample.json'
    result = subprocess.run([sys.executable, str(ROOT / 'qa/process_sample.py'),
        '--root', f'service={parent.pid}', '--phase', 'tooling-test',
        '--warmup', '0', '--duration', '.08', '--interval', '.02', '--output', str(output)],
        capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert report['phase'] == 'tooling-test' and report['process_count_max'] == 2
    assert {p['pid'] for p in report['observed_processes']} == {parent.pid, child}
    assert unrelated.poll() is None and parent.poll() is None
    assert output.stat().st_mode & 0o777 == 0o600
    assert all('cmdline' not in p and 'environ' not in p for p in report['observed_processes'])


def test_sampler_actual_root_exit_marks_incomplete():
    process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(.08)'])
    try:
        report = measure({'service': process.pid}, warmup=0, duration=.2,
                         interval=.03, phase='tooling-test')
        assert report['status'] == 'incomplete' and report['missing_roots'] == ['service']
    finally:
        process.wait(timeout=5)
