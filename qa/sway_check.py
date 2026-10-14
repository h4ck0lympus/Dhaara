"""Isolated real Sway/Wayland acceptance, never the user's desktop or data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import select
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
from dhara.server import create_app
from dhara.env import strip


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before-source', type=Path)
    parser.add_argument('--output', type=Path, help='Write evidence to a new directory')
    suite = parser.add_mutually_exclusive_group()
    suite.add_argument('--visibility', action='store_true', help='Kitten visibility/scaling acceptance')
    suite.add_argument('--pointer', action='store_true', help='Native compositor pointer delivery acceptance')
    parser.add_argument('--gi-python', default='/usr/bin/python3')
    args = parser.parse_args()
    if args.pointer and args.before_source:
        parser.error('--pointer tests current native interaction, not archived source')
    phase = 'before' if args.before_source else 'after'
    output = args.output or ROOT / ('qa/companion-input' if args.pointer else
                     'qa/kitten-visibility' if args.visibility else 'qa/sway') / phase
    output.mkdir(parents=True, exist_ok=True)
    if args.pointer:
        (output / 'results.json').write_text(json.dumps({'status': 'incomplete', 'passed': 0,
                                                       'checks': []}) + '\n')
    with tempfile.TemporaryDirectory(prefix='dhara-sway-qa-') as temporary:
        directory = Path(temporary)
        runtime = directory / 'runtime'
        runtime.mkdir(mode=0o700)
        admin = secrets.token_urlsafe(32)
        app = create_app(directory / 'service', start_worker=False, admin_token=admin)
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        sock.listen(128)
        origin = f'http://127.0.0.1:{sock.getsockname()[1]}'
        server = uvicorn.Server(uvicorn.Config(app, log_level='warning'))
        thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]})
        thread.start()
        processes = []
        try:
            with httpx.Client(base_url=origin, trust_env=False,
                              headers={'Authorization': 'Bearer ' + admin}) as api:
                for _ in range(100):
                    try:
                        if api.get('/api/health').is_success:
                            break
                    except httpx.ConnectError:
                        pass
                    time.sleep(.05)
                else:
                    raise AssertionError('Disposable service did not start')
                task = api.post('/api/tasks', json={'title': 'Synthetic allocator notes',
                                'priority': 'low', 'next_action': 'Read the original example.'})
                task.raise_for_status()
                other = api.post('/api/tasks', json={'title': 'Synthetic parser notes',
                                 'priority': 'medium', 'next_action': 'Inspect the synthetic example.'})
                other.raise_for_status()
                api.post('/api/context/rules', json={'contains': 'Synthetic parser window',
                         'task_id': other.json()['id']}).raise_for_status()
                focus = api.post('/api/focus', json={'task_id': task.json()['id'], 'pinned': True})
                focus.raise_for_status()
                observe_fixture = not (args.visibility or args.pointer)
                api.patch('/api/settings', json={'observation_enabled': observe_fixture}).raise_for_status()
                token = api.post('/api/tokens', json={'name': 'Disposable companion', 'scope': 'observer'})
                token.raise_for_status()
                observer_token = token.json()['token']
            env = os.environ.copy()
            for key in ('SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY'):
                env.pop(key, None)
            strip(env, ('TOKEN', 'ACCESS_TOKEN', 'MODEL', 'SPEECH_MODEL'))
            env.update(XDG_RUNTIME_DIR=str(runtime), WLR_BACKENDS='headless',
                       WLR_HEADLESS_OUTPUTS='2', WLR_LIBINPUT_NO_DEVICES='1',
                       WLR_RENDERER='pixman', GDK_BACKEND='wayland',
                       WEBKIT_DISABLE_DMABUF_RENDERER='1', LIBGL_ALWAYS_SOFTWARE='1')
            with (output / 'compositor.txt').open('w') as log:
                compositor = subprocess.Popen(['sway', '-c', str(ROOT / 'qa/sway.config')],
                                              env=env, stdout=log, stderr=subprocess.STDOUT)
            processes.append(compositor)
            for _ in range(100):
                sockets = list(runtime.glob('sway-ipc.*.sock'))
                wayland = [p for p in runtime.glob('wayland-*') if not p.name.endswith('.lock')]
                if sockets and wayland:
                    break
                if compositor.poll() is not None:
                    raise AssertionError('Private Sway failed; inspect compositor.txt')
                time.sleep(.05)
            else:
                raise AssertionError('Private compositor sockets did not appear')
            env.update(SWAYSOCK=str(sockets[0]), WAYLAND_DISPLAY=wayland[0].name)
            env.update(DHARA_TOKEN=observer_token, DHARA_QA_URL=origin,
                       DHARA_QA_OUTPUT=str(output), DHARA_QA_PHASE=phase,
                       DHARA_QA_PRIVATE_RUNTIME=str(runtime),
                       DHARA_QA_COMPOSITOR_PID=str(compositor.pid))
            if args.pointer:
                flags = subprocess.check_output(['pkg-config', '--cflags', '--libs',
                                                 'wayland-client'], text=True).split()
                pointer_binary = directory / 'virtual-pointer'
                subprocess.run(['cc', '-Wall', '-Wextra', '-Werror',
                                str(ROOT / 'qa/virtual_pointer.c'), '-o', str(pointer_binary),
                                *flags], check=True, timeout=15)
                for key, value in (('DHARA_QA_PRIVATE_RUNTIME', ''),
                                   ('WAYLAND_DISPLAY', '/not-a-fixture/socket')):
                    invalid_env = dict(env, **{key: value})
                    refused = subprocess.run([str(pointer_binary)], env=invalid_env,
                                             capture_output=True, timeout=5)
                    assert refused.returncode == 2, 'Virtual pointer must refuse unsafe environment'
                pointer = subprocess.Popen([str(pointer_binary)], env=env,
                                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                processes.append(pointer)
                ready, _, _ = select.select([pointer.stdout], [], [], 10)
                if not ready or pointer.stdout.readline().strip() != 'ready':
                    raise AssertionError('Private virtual pointer did not register')
            if args.before_source:
                env['DHARA_QA_SOURCE'] = str(args.before_source.resolve())
            with (output / 'companion.txt').open('w') as log:
                probe_file = ('companion_input_probe.py' if args.pointer else
                              'kitten_visibility_probe.py' if args.visibility else 'sway_probe.py')
                probe = subprocess.Popen([args.gi_python, str(ROOT / 'qa' / probe_file)],
                                         env=env, stdout=log, stderr=subprocess.STDOUT)
            processes.append(probe)
            result = probe.wait(timeout=55)
            if result:
                raise AssertionError('Companion probe failed; inspect companion.txt')
            with httpx.Client(base_url=origin, trust_env=False,
                              headers={'Authorization': 'Bearer ' + admin}) as api:
                state = api.get('/api/state').json()
                pinned = next(t for t in state['tasks'] if t['id'] == task.json()['id'])
                assert state['focus']['pinned'] and state['focus']['task_id'] == pinned['id']
                assert pinned['priority'] == 'low'
                assert not state['notes'] and state['settings']['observation_enabled'] == observe_fixture
                if args.visibility or args.pointer:
                    assert state['context'] is None, 'Appearing/clicking must not start observation'
            report = json.loads((output / 'results.json').read_text())
            if args.pointer:
                report['checks'].append('Virtual pointer refuses missing private runtime and absolute Wayland socket')
                report['status'] = 'passed'
            report['checks'].append('Independent service read: pin/manual priority/no implicit notes unchanged')
            report['passed'] = len(report['checks'])
            source = args.before_source or ROOT / 'tools/sway_companion.py'
            report['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
            report['boundary'] = ('Real private headless Sway 1.9, two synthetic outputs, GTK3/layer-shell '
                'companion, real HTTP and SQLite. Programmatic GTK/compositor input; '
                'not physical keyboard/clipboard/microphone, target GPU, device performance or installation.')
            if args.pointer:
                report['boundary'] += ' Pointer presses travel through private Sway IPC/Wayland, not GTK clicked signals.'
            (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report, indent=2))
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            server.should_exit = True
            thread.join(timeout=10)
            sock.close()
            if thread.is_alive():
                raise AssertionError('Disposable service did not stop')


if __name__ == '__main__':
    main()
