#!/usr/bin/env python3
"""Read-only, sanitized session evidence. No screenshots, input or observation."""
import argparse
from collections import Counter
import ctypes
import json
import os
from pathlib import Path
import platform
import subprocess


def ipc(kind):
    if not os.getenv('SWAYSOCK'):
        raise RuntimeError('No configured Sway socket')
    result = subprocess.run(['swaymsg', '-r', '-t', kind], capture_output=True,
                            text=True, timeout=5, check=True)
    return json.loads(result.stdout)


def sanitized_outputs(outputs):
    return [{k: o.get(k) for k in ('name', 'active', 'scale', 'rect')}
            | {'virtual_hint': str(o.get('name', '')).startswith(('HEADLESS', 'WL-', 'X11-'))}
            for o in outputs]


def client_protocol(tree, pid):
    # Never serialize titles, app IDs, URLs or unrelated process metadata.
    stack = [tree]
    protocols = set()
    while stack:
        node = stack.pop()
        if node.get('pid') == pid:
            protocols.add(node.get('shell', 'unknown'))
        stack.extend(node.get('nodes', []) + node.get('floating_nodes', []))
    return sorted(protocols)


def collect(shell_pid=None):
    report = {'platform': platform.system(), 'session_type': os.getenv('XDG_SESSION_TYPE', 'unset'),
              'sway_socket_configured': bool(os.getenv('SWAYSOCK')),
              'wayland_display_configured': bool(os.getenv('WAYLAND_DISPLAY')),
              'x_display_configured': bool(os.getenv('DISPLAY')),
              'physical_checks': 'NOT RUN; reported devices/IPC are not physical interaction evidence'}
    for label, library, prefix in (('gtk', 'libgtk-3.so.0', 'gtk'),
                                   ('webkit', 'libwebkit2gtk-4.1.so.0', 'webkit'),
                                   ('gtk_layer_shell', 'libgtk-layer-shell.so.0', 'gtk_layer')):
        try:
            handle = ctypes.CDLL(library)
            report[label] = '.'.join(str(getattr(handle, prefix + '_get_' + p + '_version')())
                                     for p in ('major', 'minor', 'micro'))
        except (OSError, AttributeError):
            report[label] = 'unavailable'
    for label, args in (('python', ['python3', '--version']), ('rust', ['rustc', '--version'])):
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=5, check=True)
            report[label] = result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            report[label] = 'unavailable'
    try:
        report['sway'] = ipc('get_version').get('human_readable', 'unknown')
        report['outputs'] = sanitized_outputs(ipc('get_outputs'))
        report['input_counts'] = dict(Counter(i.get('type', 'unknown') for i in ipc('get_inputs')))
        if shell_pid is not None:
            report['fixture_shell_protocols'] = client_protocol(ipc('get_tree'), shell_pid)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        report['ipc_status'] = 'unavailable; private error details omitted'
    try:
        report['cpu_model'] = next(line.split(':', 1)[1].strip()
                                   for line in Path('/proc/cpuinfo').read_text().splitlines()
                                   if line.startswith('model name'))
        report['memory_total_gib'] = round(next(int(line.split()[1])
            for line in Path('/proc/meminfo').read_text().splitlines()
            if line.startswith('MemTotal:')) / 1024**2, 2)
        report['drm_card_count'] = len(list(Path('/sys/class/drm').glob('card[0-9]')))
    except (OSError, StopIteration):
        report['hardware'] = 'unavailable'
    report['privacy'] = 'Only versions, output geometry/scale, input counts and optional fixture PID protocol. No titles, tokens, serials, clipboard, screen/audio or input injection.'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shell-pid', type=int, help='Optional fixture Rust PID: record only its xdg_shell/xwayland protocol')
    parser.add_argument('--output', type=Path, help='New private JSON file; existing evidence is never overwritten')
    args = parser.parse_args()
    if args.shell_pid is not None and args.shell_pid <= 1:
        parser.error('Use the live fixture shell PID > 1')
    report = collect(args.shell_pid)
    if args.output:
        try:
            fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump(report, stream, indent=2)
                stream.write('\n')
        except OSError:
            parser.exit(2, 'Cannot create a new report; existing evidence is not overwritten.\n')
    else:
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
