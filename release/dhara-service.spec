"""Frozen Dhara service for the AppImage (packaging spec §6): entry run.py, one directory, console.

One directory on purpose: the bootloader runs Python in this same process, so the pid in the protocol-2
acknowledgement is the pid Electron spawned; a one-file build would fork a child and break the lease.
"""
import os

ROOT = os.path.dirname(SPECPATH)

a = Analysis(
    [os.path.join(ROOT, 'run.py')],
    pathex=[ROOT],
    binaries=[],
    datas=[(os.path.join(ROOT, 'web', 'dist'), os.path.join('web', 'dist'))],
    hiddenimports=['uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on', 'python_multipart'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['faster_whisper'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='dhara-service', console=True, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='dhara-service')
