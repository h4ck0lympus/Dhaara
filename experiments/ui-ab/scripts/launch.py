"""Run only isolated profiles/endpoints. No production service is started."""
import os
from pathlib import Path
import subprocess
import sys
import stat
import queue
import threading
import secrets
ROOT=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2 or sys.argv[1] not in ('a','b'): raise SystemExit('Usage: python3 scripts/launch.py a|b')
if not (ROOT/'dist/index.html').is_file(): raise SystemExit('Run npm run build first')
runtime=None
if sys.argv[1]=='b' or os.environ.get('NOEMA_COMPANION','1')!='0':
    electron=ROOT/'node_modules/electron'
    manifest=electron/'path.txt'
    if not manifest.is_file():raise SystemExit('Install Electron explicitly first; see README.md')
    runtime=electron/'dist'/manifest.read_text().strip()
    if not runtime.is_file():raise SystemExit('Electron runtime is missing; reinstall Electron')
    if sys.platform.startswith('linux'):
        helper=electron/'dist/chrome-sandbox'
        info=helper.stat()
        if info.st_uid != 0 or (info.st_mode & 0o4777) != 0o4755:
            system_helper=Path('/opt/google/chrome/chrome-sandbox')
            configured=system_helper.stat() if system_helper.exists() else None
            if configured and configured.st_uid == 0 and (configured.st_mode & 0o4777) == 0o4755 and stat.S_ISREG(configured.st_mode):
                backup=helper.with_name('chrome-sandbox.bundled')
                if not backup.exists():helper.rename(backup)
                else:helper.unlink()
                helper.symlink_to(system_helper)
                print('Using installed root-owned Chromium sandbox helper; bundled helper preserved.',flush=True)
            else:raise SystemExit('Electron needs its configured root-owned 4755 sandbox helper. See README; sandboxing stays enabled.')
backend=os.environ.get('NOEMA_DISPLAY_BACKEND')
flags=[]
if backend and sys.platform.startswith('linux'):
    if backend not in ('x11','wayland'):raise SystemExit('Choose x11 or wayland')
    flags.append('--ozone-platform='+backend)
companion=None
environment=os.environ.copy()
if os.environ.get('NOEMA_COMPANION','1')!='0':
    environment['NOEMA_COMPANION_SECRET']=secrets.token_urlsafe(32)
    environment['NOEMA_COMPANION_HOST']=sys.argv[1]
    companion=subprocess.Popen([str(runtime),str(ROOT/'dist-host/hosts/companion/main.mjs'),*flags],cwd=ROOT,env=environment)
if sys.argv[1]=='b':
    try:
        raise SystemExit(subprocess.call([str(runtime),str(ROOT/'dist-host/hosts/electron/main.mjs'),*flags],cwd=ROOT,env=environment))
    finally:
        if companion:companion.terminate();companion.wait(timeout=8)
server=subprocess.Popen([sys.executable,str(ROOT/'scripts/serve.py'),'--port','8791'],cwd=ROOT,stdout=subprocess.PIPE,env=environment)
try:
    readiness=queue.Queue()
    threading.Thread(target=lambda:readiness.put(server.stdout.readline()),daemon=True).start()
    try:line=readiness.get(timeout=6)
    except queue.Empty:line=b''
    if not line.startswith(b'Isolated Noema demo:'):
        raise SystemExit('Demo server did not bind; existing endpoint was not reused')
    build=os.environ.get('NOEMA_WRY_BUILD','debug')
    if build not in ('debug','release'):raise SystemExit('Choose debug or release')
    binary=ROOT/'hosts/wry/target'/build/('noema-ui-ab-wry.exe' if sys.platform=='win32' else 'noema-ui-ab-wry')
    if not binary.is_file(): raise SystemExit('Build hosts/wry first; see README.md')
    raise SystemExit(subprocess.call([str(binary)],cwd=ROOT))
finally:
    server.terminate();server.wait(timeout=5)
    if companion:companion.terminate();companion.wait(timeout=8)
