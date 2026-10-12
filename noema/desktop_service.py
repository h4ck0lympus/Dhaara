"""Linux desktop lease protocol 2, not a daemon or an admin-token transport."""
import ctypes
import json
import os
from pathlib import Path
import signal
import socket
import sys
import threading

EXIT_LOCKED = 10
EXIT_PORT = 11
EXIT_LEASE = 12
PR_SET_PDEATHSIG = 1
# Managed development mode never enables optional models, remote access or another data dir.
STRIPPED_ENV = ('NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN',
                'NOEMA_ALLOWED_HOSTS', 'NOEMA_ALLOW_REMOTE_MODEL', 'NOEMA_DATA_DIR')


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


def set_parent_death_signal():
    """SIGTERM this process when the thread that spawned it (Electron's main thread) dies."""
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_PDEATHSIG, int(signal.SIGTERM), 0, 0, 0) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def read_lease(stream):
    """One line of at most 2048 bytes: {"instance": "<64 lowercase hex>"}."""
    line = stream.readline(2049)
    if len(line) > 2048:
        raise ValueError('Invalid desktop lease')
    try:
        config = json.loads(line)
    except ValueError:  # includes UnicodeDecodeError
        raise ValueError('Invalid desktop lease') from None
    instance = config.get('instance') if isinstance(config, dict) else None
    if (not isinstance(instance, str) or len(instance) != 64
            or any(c not in '0123456789abcdef' for c in instance)):
        raise ValueError('Invalid desktop lease')
    return instance


def bind_listener(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # Rebind at once after a crash (TIME_WAIT); never SO_REUSEPORT, which would share a live port.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(2048)
    except OSError:
        sock.close()
        raise
    return sock


def managed(args):
    """Protocol 2. stdin = lifetime lease; stdout = one private readiness line. Returns the exit code.

    The public instance ID grants no API authority and no admin token is transported. Nothing in
    the workspace is created or modified before the lease is valid.
    """
    if sys.platform != 'linux':
        return EXIT_LEASE
    set_parent_death_signal()
    if os.getppid() != args.owner_pid:
        return EXIT_LEASE  # the owner died before prctl took effect
    if not args.data_dir or args.open or args.host != '127.0.0.1':
        return EXIT_LEASE
    root = Path(args.data_dir)
    try:
        if root != root.resolve(strict=True) or not root.is_dir():
            return EXIT_LEASE
    except OSError:
        return EXIT_LEASE
    try:
        instance = read_lease(sys.stdin.buffer)
    except ValueError:
        return EXIT_LEASE
    try:
        lock = workspace_lock(root)
    except ValueError:
        return EXIT_LOCKED
    try:
        listener = bind_listener(args.host, args.port)
    except OSError:
        return EXIT_PORT
    os.set_inheritable(0, False)
    running = {'server': None}
    finished = threading.Event()

    def lease():
        # Owner crash/SIGKILL or a deliberate stop closes the pipe.
        sys.stdin.buffer.read()
        if running['server'] is not None:
            running['server'].should_exit = True
        # Signal only this dedicated group. Separately wrapped agents are not in it.
        os.killpg(os.getpgrp(), signal.SIGTERM)
        if not finished.wait(8):
            os.killpg(os.getpgrp(), signal.SIGKILL)

    threading.Thread(target=lease, name='desktop-lease', daemon=True).start()
    for key in STRIPPED_ENV:
        os.environ.pop(key, None)
    from .server import create_app
    import uvicorn
    identity = {'protocol': 2, 'instance': instance, 'pid': os.getpid()}
    app = create_app(root, desktop_identity=identity)
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, log_level='critical',
                                          proxy_headers=False, access_log=False))
    running['server'] = server

    def acknowledge():
        while not server.started and not finished.wait(.02):
            pass
        if server.started and not finished.is_set():
            print(json.dumps(identity | {'workspace': str(root), 'port': args.port}), flush=True)

    threading.Thread(target=acknowledge, name='desktop-ready', daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        finished.set()
        listener.close()
        lock.close()
    return 0
