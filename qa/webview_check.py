"""Real Rust/WebKit restart checks; disposable service, profile and virtual display."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

import httpx
import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from noema.server import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--xvfb', default=shutil.which('Xvfb'))
    parser.add_argument('--skip-build', action='store_true')
    parser.add_argument('--managed', action='store_true', help='Opt-in real Rust-owned backend')
    parser.add_argument('--no-screenshots', action='store_true')
    parser.add_argument('--task-capture', action='store_true', help='Also exercise one-input capture and task-draft close/reopen')
    parser.add_argument('--sample', action='store_true', help='Managed virtual open-idle 20s warm-up / 60s process sample')
    parser.add_argument('--output', type=Path, help='Separate evidence directory; preserve previous results')
    args = parser.parse_args()
    if args.sample and not args.managed:
        parser.error('--sample requires --managed')
    if not args.xvfb:
        parser.error('Provide --xvfb or install Xvfb for a private virtual display')
    output = args.output or ROOT / 'qa' / ('managed-service' if args.managed else 'webview')
    output.mkdir(exist_ok=True, parents=True)
    if not args.skip_build:
        with (output / 'build.txt').open('w') as log:
            subprocess.run(['cargo', 'build', '--locked', '--manifest-path',
                            str(ROOT / 'desktop/Cargo.toml'), '--features', 'qa', '-j', '2'],
                           stdout=log, stderr=subprocess.STDOUT, check=True, timeout=300)
    os.environ.pop('NOEMA_MODEL', None)
    os.environ.pop('NOEMA_SPEECH_MODEL', None)
    os.environ.pop('NOEMA_ACCESS_TOKEN', None)
    checks = []
    with tempfile.TemporaryDirectory(prefix='noema-webview-tests-') as temporary:
        data = Path(temporary)
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        origin = f'http://127.0.0.1:{sock.getsockname()[1]}'
        server = thread = None
        if args.managed:
            sock.close()  # Rust binds this same fixture origin on every launch.
        else:
            app = create_app(data / 'service', start_worker=False)
            sock.listen(128)
            server = uvicorn.Server(uvicorn.Config(app, log_level='warning'))
            thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]})
            thread.start()
        display_process = native = None
        try:
            with httpx.Client(trust_env=False) as client:
                for _ in range(0 if args.managed else 100):
                    try:
                        if client.get(origin + '/api/health').is_success:
                            break
                    except httpx.ConnectError:
                        pass
                    time.sleep(.05)
                else:
                    if not args.managed:
                        raise AssertionError('Disposable service did not start')
            with (output / 'xvfb.txt').open('w') as log:
                display_process = subprocess.Popen(
                    [args.xvfb, '-displayfd', '1', '-screen', '0', '1280x900x24',
                     '-nolisten', 'tcp', '-noreset'], stdout=subprocess.PIPE,
                    stderr=log, text=True)
            display = display_process.stdout.readline().strip()
            if not display.isdigit():
                raise AssertionError('Private Xvfb display failed to start')
            env = os.environ.copy()
            env.update(DISPLAY=':' + display, GDK_BACKEND='x11',
                       WEBKIT_DISABLE_DMABUF_RENDERER='1', LIBGL_ALWAYS_SOFTWARE='1')
            env.pop('WAYLAND_DISPLAY', None)
            state = None
            stages = ('draft', 'recover', 'verify', 'checkpoint-failure', 'checkpoint-recover', 'crash', 'kill') if args.managed else ('draft', 'recover', 'verify')
            if args.sample:
                stages += ('idle',)
            if args.task_capture:
                stages += ('task-capture', 'task-checkpoint-failure', 'task-recover')
            for stage in stages:
                logfile = output / f'{stage}.txt'
                with logfile.open('w') as log:
                    native = subprocess.Popen(
                        ['dbus-run-session', '--', str(ROOT / 'desktop/target/debug/noema-desktop'),
                         '--server', origin, '--profile', str(data / 'profile'), '--qa-stage', 'idle' if stage == 'kill' else stage]
                        + (['--manage-service', '--data-dir', str(data / 'service'),
                            '--python', sys.executable] if args.managed else []),
                        env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                report = None
                crashed = False
                for _ in range(1800):
                    for line in logfile.read_text().splitlines():
                        if line.startswith('NOEMA_WEBVIEW_QA '):
                            candidate = json.loads(line[len('NOEMA_WEBVIEW_QA '):])
                            if candidate.get('hold') and stage == 'crash':
                                if not crashed:
                                    import signal
                                    with httpx.Client(trust_env=False) as client:
                                        fixture_pid = client.get(origin + '/api/desktop-instance').json()['pid']
                                    os.kill(fixture_pid, signal.SIGKILL)
                                    crashed = True
                                continue
                            report = candidate
                    if report is not None or native.poll() is not None:
                        break
                    time.sleep(.05)
                if report is None:
                    raise AssertionError(f'{stage} did not report; inspect {logfile}')
                if stage in ('idle', 'kill'):
                    from process_sample import measure, read_processes
                    with httpx.Client(trust_env=False) as client:
                        service_pid = client.get(origin + '/api/desktop-instance').json()['pid']
                    shell_pid = read_processes()[service_pid].parent
                    if stage == 'idle':
                        sample = measure({'shell':shell_pid, 'service':service_pid}, phase='open-idle')
                        sample['display'] = 'Private Xvfb/X11, 1280x900, software rendering requested; not native Wayland or physical Sway'
                        sample['enabled'] = 'Rust shell + WebKit helpers + managed Python service; no companion, observer, microphone, model or external browser'
                        sample['exclusions'].append('Xvfb, dbus-run-session/session broker and sampler excluded; physical editing/hidden/companion workloads NOT RUN')
                        destination = output / 'open-idle.json'
                        with destination.open('x') as resultfile:
                            json.dump(sample, resultfile, indent=2)
                            resultfile.write('\n')
                    import signal
                    os.kill(shell_pid, signal.SIGTERM if stage == 'idle' else signal.SIGKILL)
                    native.wait(timeout=15)
                    native = None
                    for _ in range(200):
                        if service_pid not in read_processes(): break
                        time.sleep(.05)
                    assert service_pid not in read_processes()
                    checks.append('Actual virtual open-idle process sample and native shell SIGTERM lease cleanup' if stage == 'idle' else 'Actual native shell SIGKILL closes lease and stops owned service')
                    continue
                if not args.no_screenshots:
                    subprocess.run(['import', '-display', ':' + display, '-window', 'root',
                                    str(output / f'{stage}.png')], env=env, check=True, timeout=10)
                token = (data / 'service/admin.token').read_text().strip()
                with httpx.Client(trust_env=False) as client:
                    state_response = client.get(origin + '/api/state', headers={'Authorization': f'Bearer {token}'})
                    state_response.raise_for_status()
                    state = state_response.json()
                    service_pid = client.get(origin + '/api/desktop-instance').json().get('pid') if args.managed else None
                if stage == 'draft':
                    duplicate = subprocess.run([str(ROOT / 'desktop/target/debug/noema-desktop'),
                                                '--server', origin, '--profile', str(data / 'profile')]
                                               + (['--manage-service', '--data-dir', str(data / 'service')] if args.managed else []),
                                               env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                               text=True, timeout=5)
                    assert duplicate.returncode == 1 and 'already open' in duplicate.stdout
                    checks.append('Actual second desktop launch refused by persistent-profile lock')
                result = native.wait(timeout=15)
                native = None
                if result or report.get('error'):
                    raise AssertionError(f'{stage}: exit={result}, report={report}')
                checks.extend(report['checks'])
                if args.managed:
                    from process_sample import read_processes
                    assert service_pid not in read_processes(), 'Owned service survived normal webview close'
                    checks.append(f'{stage}: actual owned backend stopped after checkpoint-approved close')
            expected_notes = 2 if args.managed else 1
            assert len(state['notes']) == expected_notes
            assert state['focus']['pinned']
            assert state['tasks'][0]['priority'] == 'low'
            checks.append(f'Independent backend read confirms {expected_notes} explicitly saved note(s), pinned focus and manual low priority')
        finally:
            if native is not None and native.poll() is None:
                # Only the process group started by this harness, never the user's desktop.
                import signal
                os.killpg(native.pid, signal.SIGTERM)
                try:
                    native.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(native.pid, signal.SIGKILL)
                    native.wait(timeout=5)
            if display_process is not None:
                display_process.terminate()
                display_process.wait(timeout=5)
            if server:
                server.should_exit = True
                thread.join(timeout=10)
            sock.close()
            if thread and thread.is_alive():
                raise AssertionError('Disposable server failed to stop')
    report = {'passed': len(checks), 'checks': checks, 'managed_service': args.managed,
              'boundary': 'Real Rust/Wry/WebKit, IndexedDB Blob storage, process restarts, HTTP and SQLite; '
                          'private virtual X11 with programmatic UI actions. No hardware/model, microphone, '
                          'file-picker, notification, Sway, Windows, installation, sync or performance guarantee. '
                          'Requested resource samples are separate Linux accounting evidence.'}
    (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
