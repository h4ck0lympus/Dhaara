#!/usr/bin/env python3
"""Prepare synthetic manual acceptance files; never starts a service or UI."""
import argparse
from pathlib import Path
import socket
import struct
import tempfile
import zlib

NOTE = '''Synthetic allocator hypothesis — unconfirmed

I think the third element changes, but this is only a hypothesis.
```python
buf = [0] * 8
buf[3] = 7
assert buf[2] == 0
```
Need to inspect the example; do not call this a confirmed bug or a task.
'''


def png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + b''.join(bytes((228, 236, 212) if (x // 8 + y // 8) % 2 else
                                          (45, 54, 39)) for x in range(64)) for y in range(48))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 64, 48, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


def prepare(port=18765):
    # Free now is only a preflight, never identity/readiness proof.
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))
    directory = Path(tempfile.mkdtemp(prefix='noema-device-'))
    (directory / 'reports').mkdir(mode=0o700)
    (directory / 'synthetic-note.txt').write_text(NOTE)
    (directory / 'synthetic-image.png').write_bytes(png())
    (directory / 'fixture-port.txt').write_text(str(port) + '\n')
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose an unprivileged fixture port, 1024–65535')
    try:
        print(prepare(args.port))
    except OSError:
        parser.exit(2, 'Fixture port unavailable; do not connect to or stop its occupant. Choose another fixed port for this fixture.\n')


if __name__ == '__main__':
    main()
