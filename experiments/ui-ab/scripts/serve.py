"""Isolated static assets only. No notebook service or production data imports."""
import argparse
import json
import os
from urllib.request import Request,build_opener,ProxyHandler
from urllib.error import HTTPError
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
class Assets(SimpleHTTPRequestHandler):
    def companion(self):
        if not self.path.startswith('/api/companion/'):
            return False
        route=self.path.split('?',1)[0][len('/api/companion'):]
        origin=f'http://127.0.0.1:{self.server.server_port}'
        if (self.headers.get('Host')!=f'127.0.0.1:{self.server.server_port}' or
                self.headers.get('X-Noema-UI')!='1' or self.headers.get('Origin',origin)!=origin or
                route not in ('/state','/snapshot','/settings')):
            self.send_error(403);return True
        secret=os.environ.get('NOEMA_COMPANION_SECRET')
        if not secret:
            self.send_error(503,'Desktop companion is not connected');return True
        size=int(self.headers.get('Content-Length','0'))
        if size<0 or size>12_000_000:
            self.send_error(413);return True
        data=self.rfile.read(size) if self.command=='POST' else None
        request=Request('http://127.0.0.1:8794'+route,data=data,method=self.command,
                        headers={'X-Noema-Companion':secret,'Content-Type':'application/json'})
        try:
            with build_opener(ProxyHandler({})).open(request,timeout=3) as response:
                body=response.read();self.send_response(response.status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
        except HTTPError as error:
            self.send_error(error.code,'Companion rejected request')
        except Exception:
            self.send_error(503,'Desktop companion unavailable')
        return True
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self,*args): pass
    def do_GET(self):
        if self.companion():return
        if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
            self.send_error(403);return
        super().do_GET()
    def do_POST(self):
        if not self.companion():self.send_error(405)
    def list_directory(self,path): self.send_error(403)
if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8793)
    args=parser.parse_args()
    if not (ROOT/'dist/index.html').is_file(): parser.error('Run npm run build first')
    with ThreadingHTTPServer(('127.0.0.1',args.port),partial(Assets,directory=str(ROOT/'dist'))) as server:
        print(f'Isolated Noema demo: http://127.0.0.1:{args.port}',flush=True)
        server.serve_forever()
