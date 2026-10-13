"""Dependency-free, token-authenticated local API client for optional helpers."""
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # tools/ scripts run from anywhere; dhara/ is beside them
from dhara.env import env
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

class Client:
    def __init__(self,url='http://127.0.0.1:8765',token=None):
        self.url=url.rstrip('/');self.token=token or env('TOKEN','')
        if not self.token: raise ValueError('Set NOEMA_TOKEN to a task-scoped agent token or observer token from Settings.')
        parsed=urlsplit(self.url)
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Use a plain http(s) server origin, without embedded credentials.')
        if parsed.scheme!='https' and parsed.hostname not in ('localhost','127.0.0.1','::1'):
            raise ValueError('Remote helper connections require HTTPS.')
        self.opener=build_opener(ProxyHandler({}))
    def request(self,path,payload=None,method=None):
        headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json','X-Noema-Request':'1'}
        req=Request(self.url+'/api'+path,data=json.dumps(payload).encode() if payload is not None else None,
                    headers=headers,method=method or ('POST' if payload is not None else 'GET'))
        try:
            with self.opener.open(req,timeout=8) as response:return json.load(response)
        except HTTPError as error:
            try: detail=json.load(error).get('detail','Request rejected')
            except Exception:detail='Request rejected'
            raise RuntimeError(f'Noema HTTP {error.code}: {detail}') from None
        except URLError: raise RuntimeError('Noema server is unreachable') from None
