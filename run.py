#!/usr/bin/env python3
"""Run Noema without a frontend build. Does not enable screen observation."""
import argparse
import os
import webbrowser
from threading import Timer

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--data-dir')
    parser.add_argument('--open',action='store_true',help='Open the local interface')
    parser.add_argument('--desktop-managed',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--owner-pid',type=int,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.desktop_managed:
        from noema.desktop_service import managed
        raise SystemExit(managed(args))
    if args.host not in ('127.0.0.1','::1','localhost') and (not os.getenv('NOEMA_ACCESS_TOKEN') or not os.getenv('NOEMA_ALLOWED_HOSTS')):
        parser.error('Remote binding requires NOEMA_ACCESS_TOKEN and NOEMA_ALLOWED_HOSTS. Use HTTPS before microphone capture or exposing private notes.')
    from pathlib import Path
    from noema.desktop_service import workspace_lock
    from noema.server import create_app
    import uvicorn
    root=Path(args.data_dir or os.getenv('NOEMA_DATA_DIR',str(Path(__file__).resolve().parent/'.data')))
    try: service_lock=workspace_lock(root)
    except ValueError as error: parser.error(str(error))
    app=create_app(root)
    print(f'Noema 0.1.0 — http://127.0.0.1:{args.port}')
    print('Notes stay in your selected data directory. No AI models or screen capture start automatically.')
    if args.open: Timer(1.2,lambda:webbrowser.open(f'http://127.0.0.1:{args.port}')).start()
    uvicorn.run(app,host=args.host,port=args.port,proxy_headers=False,access_log=False)
