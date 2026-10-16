#!/usr/bin/env python3
"""Run Dhara without a frontend build. Does not enable screen observation."""
import argparse
from dhara.env import env
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from threading import Thread, Timer

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--data-dir')
    parser.add_argument('--open',action='store_true',help='Open the local interface')
    parser.add_argument('--desktop',action='store_true',help='Also open the Electron shell against this service; closing it or Ctrl+C stops both')
    parser.add_argument('--no-build',action='store_true',help='Serve web/dist as is, even when web/src is newer')
    parser.add_argument('--shell',help=argparse.SUPPRESS)
    parser.add_argument('--desktop-managed',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--owner-pid',type=int,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.desktop_managed:
        from dhara.desktop_service import managed
        raise SystemExit(managed(args))
    if args.host not in ('127.0.0.1','::1','localhost') and (not env('ACCESS_TOKEN') or not env('ALLOWED_HOSTS')):
        parser.error('Remote binding requires DHARA_ACCESS_TOKEN and DHARA_ALLOWED_HOSTS. Use HTTPS before microphone capture or exposing private notes.')
    from pathlib import Path
    here=Path(__file__).resolve().parent
    shell=Path(args.shell or here/'electron/node_modules/electron/dist/electron')
    if args.desktop and not os.access(shell,os.X_OK):
        parser.error(f'Electron shell not found at {shell}. Run `npm --prefix electron ci && npm --prefix electron run build` first.')
    if not args.no_build:
        from dhara.frontend import ensure_built
        try: built=ensure_built(here/'web')
        except subprocess.CalledProcessError: parser.error('Interface build failed. Run `npm --prefix web ci`, then try again (or pass --no-build).')
        if built=='built': print('Dhara: rebuilt the interface from web/src.')
        if built=='no-npm': print('Dhara: web/dist is older than web/src and npm is not installed; serving the old interface.',file=sys.stderr)
    from dhara.desktop_service import workspace_lock
    from dhara.server import create_app
    import uvicorn
    root=Path(args.data_dir or env('DATA_DIR',str(here/'.data')))
    try: service_lock=workspace_lock(root)
    except ValueError as error: parser.error(str(error))
    app=create_app(root)
    print(f'Dhara 0.1.0 — http://127.0.0.1:{args.port}')
    print('Notes stay in your selected data directory. No AI models or screen capture start automatically.')
    if args.open: Timer(1.2,lambda:webbrowser.open(f'http://127.0.0.1:{args.port}')).start()
    shells=[]
    if args.desktop:
        signal.signal(signal.SIGTERM,signal.default_int_handler)
        def run_shell():
            for _ in range(300):
                try: socket.create_connection(('127.0.0.1',args.port),timeout=0.5).close(); break
                except OSError: time.sleep(0.1)
            else:
                print('Dhara: the service did not start listening; not opening the shell',file=sys.stderr); os.kill(os.getpid(),signal.SIGINT); return
            child=subprocess.Popen([str(shell),str(here/'electron'),'--server',f'http://127.0.0.1:{args.port}'])
            shells.append(child); child.wait()
            os.kill(os.getpid(),signal.SIGINT)
        Thread(target=run_shell,daemon=True).start()
    try: uvicorn.run(app,host=args.host,port=args.port,proxy_headers=False,access_log=False)
    except KeyboardInterrupt: pass
    signal.signal(signal.SIGINT,signal.SIG_IGN)
    for child in shells:
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill()
