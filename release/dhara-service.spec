# -*- mode: python ; coding: utf-8 -*-
"""Frozen Dhara service for the AppImage (packaging spec §6): entry run.py, one directory, console.

One directory on purpose: the bootloader runs Python in this same process, so the pid in the protocol-2
acknowledgement is the pid Electron spawned; a one-file build would fork a child and break the lease.
"""
import os

ROOT = os.path.dirname(SPECPATH)   # SPECPATH is release/; every input path is spelled from the repository root

a = Analysis(
    [os.path.join(ROOT, 'run.py')],
    pathex=[ROOT],
    binaries=[],
    # dhara/server.py resolves ROOT/'web'/'dist' from its own __file__, which is <_internal>/dhara/server.py once frozen.
    datas=[(os.path.join(ROOT, 'web', 'dist'), os.path.join('web', 'dist'))],
    # uvicorn loads these by name at run time (Config(loop='auto', http='auto', ws='auto', lifespan='auto')); hooks-contrib's
    # hook-uvicorn collects every submodule too, this list is the floor. FastAPI imports python_multipart only when a
    # Form/File route is registered. pydantic is covered by hooks-contrib.
    hiddenimports=['uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on', 'python_multipart'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['faster_whisper'],   # the speech extra is not bundled (spec §1)
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='dhara-service', console=True, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='dhara-service')
