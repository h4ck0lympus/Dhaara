"""Linux desktop lease protocol, not a daemon or an admin-token transport."""
import json
import os
from pathlib import Path
import signal
import socket
import sys
import threading


def workspace_lock(root):
    """Manual Linux launch shares the same workspace exclusion as managed launch."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if sys.platform != 'linux':
        return None
    import fcntl
    fd = os.open(root / '.noema-service.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ValueError('This workspace already has a service; stop it deliberately or use external mode.') from None
    return os.fdopen(fd, 'r+')


def managed(args):
    """FD3 = prebound loopback listener, FD4 = locked workspace, stdin = lease.

    stdout is a bounded private readiness pipe to Rust, never a console log.
    Its public random instance ID grants no API authority. No admin token is
    transported. The actual HTTP identity must match this private acknowledgement.
    """
    if sys.platform != 'linux' or not args.data_dir or args.open:
        raise ValueError('Managed service requires Linux, a data directory and no --open.')
    root = Path(args.data_dir).resolve(strict=True)
    line = sys.stdin.buffer.readline(2049)
    config = json.loads(line)
    instance = config.get('instance', '')
    if (len(line) > 2048 or len(instance) != 64
            or any(c not in '0123456789abcdef' for c in instance)):
        raise ValueError('Invalid desktop lease')
    lock_stat = os.fstat(4)
    path_stat = (root / '.noema-service.lock').stat()
    if (lock_stat.st_dev, lock_stat.st_ino) != (path_stat.st_dev, path_stat.st_ino):
        raise ValueError('Invalid workspace lock')
    import fcntl
    fcntl.flock(4, fcntl.LOCK_EX | fcntl.LOCK_NB)
    for fd in (0, 3, 4):
        os.set_inheritable(fd, False)
    listener = socket.socket(fileno=3)
    bound = listener.getsockname()
    if bound[0] != args.host or bound[1] != args.port:
        raise ValueError('Invalid desktop listener')
    # Managed development mode intentionally never enables optional models.
    for key in ('NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_ALLOW_REMOTE_MODEL',
                'NOEMA_ACCESS_TOKEN', 'NOEMA_TOKEN', 'NOEMA_ALLOWED_HOSTS'):
        os.environ.pop(key, None)
    from .server import create_app
    import uvicorn
    identity = {'protocol': 1, 'instance': instance, 'pid': os.getpid()}
    app = create_app(root, desktop_identity=identity)
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, log_level='critical',
                                          proxy_headers=False, access_log=False))
    finished = threading.Event()

    def lease():
        # Parent crash/SIGKILL closes the pipe, independently of Rust destructors.
        sys.stdin.buffer.read()
        server.should_exit = True
        # Signal only this dedicated group. Separately wrapped agents are not in it.
        os.killpg(os.getpgrp(), signal.SIGTERM)
        if not finished.wait(8):
            os.killpg(os.getpgrp(), signal.SIGKILL)

    def acknowledge():
        while not server.started and not finished.wait(.02):
            pass
        if server.started and not finished.is_set():
            print(json.dumps(identity | {'workspace': str(root)}), flush=True)

    threading.Thread(target=lease, name='desktop-lease', daemon=True).start()
    threading.Thread(target=acknowledge, name='desktop-ready', daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        finished.set()
        listener.close()
