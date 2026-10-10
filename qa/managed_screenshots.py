"""Save two synthetic screenshots of the normal managed desktop, not acceptance tests.

Only a private Xvfb display is captured. No live desktop/notebook/profile is read.
"""
import argparse
import ctypes
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time

import httpx

from device_fixture import prepare, NOTE, png

ROOT = Path(__file__).resolve().parents[1]


def close_window(display, window):
    """WM_DELETE_WINDOW on this private display exercises normal native close."""
    class Message(ctypes.Structure):
        _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong),
                    ('send_event', ctypes.c_int), ('display', ctypes.c_void_p),
                    ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong),
                    ('format', ctypes.c_int), ('data', ctypes.c_long * 5)]
    class Event(ctypes.Union):
        _fields_ = [('message', Message), ('padding', ctypes.c_long * 24)]
    x = ctypes.CDLL('libX11.so.6')
    x.XOpenDisplay.argtypes, x.XOpenDisplay.restype = [ctypes.c_char_p], ctypes.c_void_p
    x.XInternAtom.argtypes, x.XInternAtom.restype = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int], ctypes.c_ulong
    x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.POINTER(Event)]
    x.XFlush.argtypes = x.XCloseDisplay.argtypes = [ctypes.c_void_p]
    connection = x.XOpenDisplay(display.encode())
    if not connection:
        raise RuntimeError('Private X display unavailable')
    try:
        event = Event()
        event.message.type, event.message.send_event = 33, 1
        event.message.display, event.message.window = connection, window
        event.message.message_type = x.XInternAtom(connection, b'WM_PROTOCOLS', 0)
        event.message.format = 32
        event.message.data[0] = x.XInternAtom(connection, b'WM_DELETE_WINDOW', 0)
        if not x.XSendEvent(connection, window, 0, 0, ctypes.byref(event)):
            raise RuntimeError('Private window close request failed')
        x.XFlush(connection)
    finally:
        x.XCloseDisplay(connection)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory; never overwrite evidence')
    parser.add_argument('--xvfb', default=shutil.which('Xvfb'))
    args = parser.parse_args()
    if not args.xvfb:
        parser.error('Provide --xvfb; no automatic installation')
    args.output.mkdir(parents=True, mode=0o700, exist_ok=False)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    fixture = prepare(port)
    native = display_process = None
    try:
        display_process = subprocess.Popen([args.xvfb, '-displayfd', '1', '-screen', '0',
                                            '1280x900x24', '-nolisten', 'tcp', '-noreset'],
                                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        number = display_process.stdout.readline().strip()
        if not number.isdigit():
            raise RuntimeError('Private Xvfb failed')
        display = ':' + number
        env = os.environ.copy()
        env.update(DISPLAY=display, GDK_BACKEND='x11', WEBKIT_DISABLE_DMABUF_RENDERER='1',
                   LIBGL_ALWAYS_SOFTWARE='1')
        env.pop('WAYLAND_DISPLAY', None)
        origin = f'http://127.0.0.1:{port}'
        native = subprocess.Popen(['dbus-run-session', '--', str(ROOT/'desktop/target/debug/noema-desktop'),
                                   '--manage-service', '--python', str(ROOT/'.venv/bin/python'),
                                   '--data-dir', str(fixture/'data'), '--profile', str(fixture/'profile'),
                                   '--server', origin], env=env, stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True)
        with httpx.Client(trust_env=False, timeout=2) as web:
            for _ in range(200):
                if native.poll() is not None:
                    raise RuntimeError('Normal desktop exited before readiness')
                try:
                    identity = web.get(origin+'/api/desktop-instance')
                    if identity.is_success:
                        service_pid = identity.json()['pid']
                        break
                except httpx.TransportError:
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError('Managed fixture did not become ready')
            web.headers['Authorization'] = 'Bearer ' + (fixture/'data/admin.token').read_text().strip()
            time.sleep(5)  # Native webview boot/render; not a performance measurement.
            tree = subprocess.check_output(['xwininfo', '-display', display, '-root', '-tree'], text=True)
            match = re.search(r'(0x[0-9a-fA-F]+) "Noema"', tree)
            if not match:
                raise RuntimeError('Noema window missing on private display')
            window = int(match[1], 16)
            empty = web.get(origin+'/api/state').json()
            assert not empty['notes'] and not empty['tasks']
            subprocess.run(['import', '-display', display, '-window', hex(window),
                            str(args.output/'now-empty.png')], check=True, timeout=10)
            response = web.post(origin+'/api/captures', data={'payload':json.dumps({
                'capture_id':'screenshot_learning_note', 'raw':NOTE, 'organize':False})},
                files={'attachments':('synthetic-image.png', png(), 'image/png')})
            response.raise_for_status()
            tasks = []
            for payload in ({'title':'Inspect the allocator example', 'priority':'low',
                              'next_action':'Run the synthetic example and record whether the hypothesis holds.'},
                             {'title':'Summarize the result', 'dependencies':[],
                              'next_action':'Add a short explanation after checking the example.'}):
                if tasks:
                    payload['dependencies'] = [tasks[0]['id']]
                response = web.post(origin+'/api/tasks', json=payload)
                response.raise_for_status()
                tasks.append(response.json())
            web.post(origin+'/api/focus', json={'task_id':tasks[0]['id'], 'pinned':True}).raise_for_status()
            time.sleep(17)  # Existing normal 15-second UI refresh, no injected DOM.
            state = web.get(origin+'/api/state').json()
            assert len(state['notes']) == 1 and len(state['tasks']) == 2 and state['focus']['pinned']
            assert not state['settings']['observation_enabled']
            subprocess.run(['import', '-display', display, '-window', hex(window),
                            str(args.output/'now-populated.png')], check=True, timeout=10)
            close_window(display, window)
            exit_code = native.wait(timeout=15)
            assert exit_code == 0 and not Path(f'/proc/{service_pid}').exists()
        report = {'screenshots':['now-empty.png', 'now-populated.png'],
                  'build':'Normal development executable; no QA scenario/IPC activation',
                  'display':'Private Xvfb/X11 1280x900 at scale 1; software rendering requested',
                  'fixture':'Disposable data/profile/attachments/tokens; original synthetic learning note, two explicit tasks, dependency, manual Low and pinned focus',
                  'close':'Programmatic private X11 WM_DELETE_WINDOW: shell exit 0, owned backend PID absent',
                  'boundary':'Screenshot evidence only, no acceptance suite or physical input/Wayland/microphone/monitor/performance validation; native companion not launched'}
        with (args.output/'capture.json').open('x') as output:
            json.dump(report, output, indent=2)
            output.write('\n')
        print(json.dumps(report, indent=2))
    finally:
        if native is not None and native.poll() is None:
            os.killpg(native.pid, signal.SIGTERM)  # Only this private fixture launch group.
            native.wait(timeout=15)
        if display_process is not None:
            display_process.terminate()
            display_process.wait(timeout=5)
        # Only the unique fixture created by prepare(); no notebook/evidence cleanup.
        shutil.rmtree(fixture)


if __name__ == '__main__':
    main()
