"""A single-user server, loopback by default. Not a multi-tenant cloud service."""
from __future__ import annotations
import hashlib
import io
import json
import os
import secrets
import socket
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from fastapi import FastAPI, Request, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse, Response
from pydantic import ValidationError
from starlette.staticfiles import StaticFiles
from . import __version__
from .models import *
from .env import env
from .store import Store, Problem, ident, jd, now
from .worker import Worker

ROOT=Path(__file__).resolve().parents[1]
MAX_UPLOAD=32*1024*1024
MAX_BODY=64*1024*1024
SESSION_COOKIE='dhara_session'
LEGACY_SESSION_COOKIE='noema_session'   # rename-shim: read and cleared for one release (cookies live 14 days)
def has_request_marker(request):
    """Same-origin marker: the new header, or the pre-rename header for one release."""
    return request.headers.get('x-dhara-request')=='1' or request.headers.get('x-noema-request')=='1'   # rename-shim: old header

class HashedAssets(StaticFiles):
    """Vite output under dist/assets is content-hashed, so a URL never changes content."""
    async def check_config(self): pass  # dist may be built after start; a missing directory is a plain 404, not a 500
    async def get_response(self,path,scope):
        response=await super().get_response(path,scope)
        response.headers['Cache-Control']='public, max-age=31536000, immutable'
        return response

class BodyLimit:
    def __init__(self,app): self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http': return await self.app(scope,receive,send)
        size=0
        async def bounded():
            nonlocal size
            message=await receive()
            size+=len(message.get('body',b''))
            if size>MAX_BODY: raise HTTPException(413,'Request exceeds 64 MB')
            return message
        await self.app(scope,bounded,send)

def detect_mime(data: bytes, declared: str):
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if data.startswith(b'\xff\xd8\xff'): return 'image/jpeg'
    if data.startswith(b'RIFF') and data[8:12]==b'WEBP': return 'image/webp'
    if data.startswith(b'RIFF') and data[8:12]==b'WAVE': return 'audio/wav'
    if data.startswith(b'OggS'): return 'audio/ogg'
    if data.startswith(b'\x1aE\xdf\xa3') and declared.split(';')[0] in ('audio/webm','video/webm'): return 'audio/webm'
    if len(data)>12 and data[4:8]==b'ftyp' and declared.split(';')[0] in ('audio/mp4','video/mp4'): return 'audio/mp4'
    if data.startswith(b'ID3') or (len(data)>2 and data[0]==255 and data[1]&224==224): return 'audio/mpeg'
    raise Problem(400,'Supported attachments: PNG, JPEG, WebP images and WebM, WAV, Ogg, MP3 or M4A audio. The content must match its format.')


def create_app(data_dir=None, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None):
    root=Path(data_dir or env('DATA_DIR',str(ROOT/'.data')))
    dist=Path(dist_dir) if dist_dir is not None else ROOT/'web'/'dist'
    store=Store(root)
    token_file=root/'admin.token'
    admin=admin_token or env('ACCESS_TOKEN')
    if not admin:
        if token_file.exists(): admin=token_file.read_text().strip()
        else:
            admin=secrets.token_urlsafe(32)
            fd=os.open(token_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f: f.write(admin)
    if len(admin)<24: raise ValueError('DHARA_ACCESS_TOKEN must be at least 24 characters')
    worker=Worker(store,env('MODEL',''),env('OLLAMA_URL','http://127.0.0.1:11434'),env('SPEECH_MODEL',''))
    allowed_hosts={'localhost','127.0.0.1','::1','testserver'}|{x.strip() for x in env('ALLOWED_HOSTS','').split(',') if x.strip()}

    @asynccontextmanager
    async def lifespan(app):
        if start_worker: worker.start()
        yield
        if start_worker: worker.stop()

    app=FastAPI(title='Dhara',version=__version__,lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    app.state.store,app.state.worker=store,worker
    app.add_middleware(BodyLimit)

    @app.exception_handler(Problem)
    async def problem_handler(request,error): return JSONResponse({'detail':error.message},status_code=error.status)

    @app.middleware('http')
    async def protect(request: Request,call_next):
        host=urlsplit('//'+request.headers.get('host','')).hostname
        if host not in allowed_hosts: return JSONResponse({'detail':'Unrecognized Host header'},status_code=400)
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/')!=str(request.base_url).rstrip('/'):
            return JSONResponse({'detail':'Cross-origin requests are disabled'},status_code=403)
        try: content_length=int(request.headers.get('content-length','0') or '0')
        except ValueError: return JSONResponse({'detail':'Invalid Content-Length'},status_code=400)
        if content_length<0: return JSONResponse({'detail':'Invalid Content-Length'},status_code=400)
        if content_length>MAX_BODY:
            return JSONResponse({'detail':'Request exceeds 64 MB'},status_code=413)
        identity=None
        authorization=request.headers.get('authorization','')
        raw_token=authorization[7:] if authorization.startswith('Bearer ') else (request.cookies.get(SESSION_COOKIE) or request.cookies.get(LEGACY_SESSION_COOKIE,''))   # rename-shim: an old cookie signs in until it expires
        if raw_token:
            if secrets.compare_digest(raw_token.encode(),admin.encode()): identity={'scope':'admin','task_ids':[]}
            else: identity=store.auth_token(raw_token)
        request.state.identity=identity
        path=request.url.path
        if path.startswith('/api/') and path not in ('/api/health','/api/session','/api/desktop-instance'):
            if not identity: return JSONResponse({'detail':'Unlock Dhara to continue'},status_code=401)
            if not authorization and request.method not in ('GET','HEAD') and not has_request_marker(request):
                return JSONResponse({'detail':'Missing same-origin request marker'},status_code=403)
            if identity['scope']!='admin':
                allowed=(identity['scope']=='agent' and (path=='/api/runs' or path.startswith('/api/runs/') or path.startswith('/api/agent/tasks/')))
                allowed=allowed or (identity['scope']=='observer' and path in ('/api/context','/api/companion'))
                if not allowed: return JSONResponse({'detail':'This token is not authorized for that resource'},status_code=403)
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='no-referrer'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Permissions-Policy']='camera=(self), microphone=(self), geolocation=()'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if path.startswith('/api/'): response.headers['Cache-Control']='no-store'
        return response

    def task_scope(request,task_id):
        identity=request.state.identity
        if identity['scope']=='admin': return
        if task_id not in identity['task_ids']: raise Problem(403,'Token is not authorized for this task')

    @app.get('/api/agent-connections')
    def agent_connections():
        from .agent_connections import connection_status
        return connection_status(store)

    @app.post('/api/agent-connections/{provider}')
    def configure_agent(provider: str, data: AgentConnectionInput, request: Request):
        # Installation changes this computer's agent configuration. Never let a
        # remote browser mistake it for configuration of its own computer.
        if not request.client or request.client.host not in ('127.0.0.1', '::1', 'testclient'):
            raise Problem(403, 'Connect agents from dhaara on this computer.')
        from .agent_connections import configure
        try:
            return configure(store, provider, data.enabled, mode=data.mode)
        except OSError:
            raise Problem(409, 'Could not write the agent configuration. Check this computer’s file permissions.') from None

    @app.get('/api/agent-connections/{provider}/plugin')
    def agent_plugin(provider: str):
        if provider not in ('claude', 'codex'):
            raise Problem(404, 'Unknown agent')
        folder = store.root / 'agent-hooks' / 'plugins' / provider
        if not folder.exists():
            raise Problem(404, 'Connect this agent once to prepare its local plugin.')
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in folder.rglob('*'):
                if path.is_file():
                    archive.write(path, 'dhaara/' + str(path.relative_to(folder)))
        return Response(stream.getvalue(), media_type='application/zip',
                        headers={'Content-Disposition': f'attachment; filename="dhaara-{provider}-plugin.zip"'})

    @app.get('/api/health')
    def health(): return {'ok':True,'version':__version__}

    @app.get('/api/desktop-instance')
    def desktop_instance():
        if desktop_identity is None: raise HTTPException(404, 'Not a managed desktop service')
        return dict(desktop_identity)

    @app.post('/api/session')
    async def session(request:Request):
        if not has_request_marker(request): raise Problem(403,'Missing request marker')
        try: body=await request.json()
        except ValueError: raise Problem(400,'Expected a JSON object')
        if not isinstance(body,dict): raise Problem(400,'Expected a JSON object')
        supplied=str(body.get('token',''))
        peer=request.client.host if request.client else ''
        host=urlsplit('//'+request.headers.get('host','')).hostname
        # No implicit login through a reverse proxy or forwarded request.
        local=peer in ('127.0.0.1','::1','testclient') and host in ('127.0.0.1','localhost','::1','testserver') and not any(x in request.headers for x in ('forwarded','x-forwarded-for','x-forwarded-host'))
        if not (local and not supplied) and not secrets.compare_digest(supplied.encode(),admin.encode()): raise Problem(401,'Invalid access token')
        response=JSONResponse({'ok':True})
        response.set_cookie(SESSION_COOKIE,admin,httponly=True,samesite='strict',secure=request.url.scheme=='https',max_age=60*60*24*14)
        response.delete_cookie(LEGACY_SESSION_COOKIE)   # rename-shim: the next login clears the old cookie
        return response

    @app.delete('/api/session')
    def logout():
        response=JSONResponse({'ok':True}); response.delete_cookie(SESSION_COOKIE); response.delete_cookie(LEGACY_SESSION_COOKIE); return response   # rename-shim: clear both

    @app.get('/api/state')
    def state(minutes:int|None=None):
        if minutes is not None and not 1<=minutes<=1440: raise Problem(400,'Minutes must be between 1 and 1440')
        value=store.snapshot(minutes)
        value['capabilities']={'organizer':bool(worker.model),'speech':bool(worker.speech_model),'screen_pixels':False,'sync':'single-server','model':worker.model,'speech_model':worker.speech_model}
        return value

    @app.get('/api/tasks/{task_id}')
    def get_task(task_id): return store.task(task_id)

    @app.post('/api/tasks',status_code=201)
    def new_task(data:TaskCreate): return store.put_task(data.model_dump(mode='json'))

    @app.post('/api/task-captures',status_code=201)
    def task_capture(data:TaskCapture): return store.capture_task(data)

    @app.put('/api/tasks/{task_id}')
    def edit_task(task_id,data:TaskUpdate):
        fields=data.model_dump(mode='json'); version=fields.pop('expected_version')
        if 'planned_on' not in data.model_fields_set: fields.pop('planned_on')
        return store.put_task(fields,task_id,version)

    @app.post('/api/focus')
    def set_focus(data:FocusInput): return store.focus(data.task_id,data.pinned)

    @app.post('/api/captures',status_code=201)
    async def capture(payload:str=Form(...),attachments:list[UploadFile]=File(default=[])):
        try: cap=Capture.model_validate_json(payload)
        except ValidationError as error: raise Problem(422,str(error))
        if len(attachments)>12: raise Problem(400,'Limit each capture to 12 attachments')
        if not cap.raw.strip() and not attachments: raise Problem(400,'Write something or attach a recording or visual')
        committed=False
        staged=[]; digest=hashlib.sha256(jd(cap.model_dump()).encode())
        try:
            for upload in attachments:
                file_id=ident(); destination=store.blobs/file_id
                size=0; filehash=hashlib.sha256(); header=b''
                with open(destination,'xb') as output:
                    os.chmod(destination,0o600)
                    while chunk:=await upload.read(256*1024):
                        size+=len(chunk)
                        if size>MAX_UPLOAD: raise Problem(413,'Each attachment must be under 32 MB')
                        if not header: header=chunk[:64]
                        output.write(chunk); filehash.update(chunk)
                staged.append({'id':file_id,'path':file_id,'name':(upload.filename or 'attachment').replace('\\','/').rsplit('/',1)[-1][:160],'size':size,'mime':''})
                staged[-1]['mime']=detect_mime(header,upload.content_type or '')
                digest.update(jd({k:staged[-1][k] for k in ('name','mime','size')}).encode()); digest.update(filehash.digest())
            result,created=store.create_capture(cap,staged,digest.hexdigest(),bool(worker.model))
            committed=created
            if not created:
                for f in staged: (store.blobs/f['path']).unlink(missing_ok=True)
            elif worker.speech_model and any(f['mime'].startswith('audio/') for f in staged):
                store.enqueue(cap.capture_id,'transcribe')
            return store.note(cap.capture_id)
        except Exception:
            if committed: raise
            for f in staged: (store.blobs/f['path']).unlink(missing_ok=True)
            # May have failed mid-stream before appending the file.
            if 'destination' in locals() and destination.exists() and not any(f['path']==destination.name for f in staged): destination.unlink(missing_ok=True)
            raise
        finally:
            for upload in attachments: await upload.close()

    @app.get('/api/search')
    def search(q:str=''):
        if len(q)>500: raise Problem(400,'Search is limited to 500 characters')
        pattern='%'+q+'%'
        with store.db() as c:
            return [dict(r) for r in c.execute("SELECT id,title,folder,project,task_id,mode,processing,error,version,created_at,updated_at FROM notes WHERE title LIKE ? OR body LIKE ? OR raw LIKE ? OR transcript LIKE ? OR folder LIKE ? ORDER BY updated_at DESC LIMIT 100",(pattern,)*5)]

    @app.get('/api/notes/{note_id}')
    def note(note_id): return store.note(note_id)

    @app.put('/api/notes/{note_id}')
    def edit_note(note_id,data:NoteUpdate): return store.edit_note(note_id,data.model_dump())

    @app.get('/api/notes/{note_id}/history')
    def note_history(note_id): return store.history(note_id)

    @app.post('/api/notes/{note_id}/restore/{version}')
    def restore_note(note_id,version:int,data:VersionInput):
        target=next((r for r in store.history(note_id) if r['version']==version),None)
        if not target: raise Problem(404,'Revision not found')
        return store.edit_note(note_id,{k:target[k] for k in ('title','folder','body')}|{'expected_version':data.expected_version},'restored')

    @app.post('/api/notes/{note_id}/suggestions/{sid}/apply')
    def apply_suggestion(note_id,sid,data:VersionInput):
        note=store.note(note_id); sug=next((s for s in note['suggestions'] if s['id']==sid),None)
        if not sug: raise Problem(404,'Suggestion not found')
        result=store.edit_note(note_id,{k:sug[k] for k in ('title','body','folder')}|{'expected_version':data.expected_version},'AI suggestion accepted')
        with store.db() as c: c.execute('DELETE FROM suggestions WHERE id=?',(sid,))
        return result

    @app.post('/api/notes/{note_id}/organize')
    def organize(note_id):
        if not worker.model: raise Problem(409,'AI cleanup is off. Set DHARA_MODEL to a downloaded local model and restart; originals remain usable without it.')
        return store.enqueue(note_id,'organize')

    @app.post('/api/notes/{note_id}/transcribe')
    def transcribe(note_id):
        if not worker.speech_model: raise Problem(409,'Transcription is off. It runs locally on the CPU: run pip install -e ".[speech]" and python tools/download_speech_model.py base.en once, then start the service with DHARA_SPEECH_MODEL set to the printed path. Your recording is saved.')
        return store.enqueue(note_id,'transcribe')

    @app.get('/api/attachments/{file_id}')
    def attachment(file_id):
        with store.db() as c: row=c.execute('SELECT * FROM attachments WHERE id=?',(file_id,)).fetchone()
        if not row: raise Problem(404,'Attachment not found')
        return FileResponse(store.blobs/row['path'],media_type=row['mime'])

    @app.post('/api/reminders',status_code=201)
    def reminder(data:ReminderInput): return store.reminder(data.task_id,data.at)

    @app.post('/api/reminders/{rid}/snooze')
    def snooze(rid,data:Snooze): return store.snooze(rid,data.minutes)

    @app.delete('/api/reminders/{rid}')
    def dismiss(rid): return store.snooze(rid)

    @app.post('/api/runs',status_code=201)
    def run(data:RunCreate,request:Request):
        task_scope(request,data.task_id)
        return store.create_run(data)

    @app.post('/api/runs/{run_id}/events')
    def event(run_id,data:RunEvent,request:Request):
        task_scope(request,store.run(run_id)['task_id'])
        return store.run_event(run_id,data)

    @app.post('/api/runs/{run_id}/end-tracking')
    def end_run(run_id,request:Request):
        if request.state.identity['scope']!='admin': raise Problem(403,'Only you can end tracking manually')
        return store.cancel_run(run_id)

    @app.get('/api/agent/tasks/{task_id}')
    def agent_task(task_id,request:Request):
        task_scope(request,task_id)
        # No unrelated notes, titles, task lists or dependencies' private details.
        task=store.task(task_id)
        return {k:task[k] for k in ('id','title','project','detail','next_action','status','session_url')}

    @app.post('/api/tokens',status_code=201)
    def issue_token(data:TokenInput): return store.token(data)

    @app.get('/api/tokens')
    def tokens():
        with store.db() as c: return [dict(r) for r in c.execute('SELECT id,name,scope,created_at FROM tokens')]

    @app.delete('/api/tokens/{tid}')
    def revoke_token(tid):
        with store.db() as c: c.execute('DELETE FROM tokens WHERE id=?',(tid,))
        return {'ok':True}

    @app.patch('/api/settings')
    def settings(data:SettingsInput): return store.settings(data.model_dump(exclude_unset=True))

    @app.post('/api/context')
    def context(data:ContextInput): return store.observe(data)

    @app.post('/api/context/rules')
    def new_rule(data:RuleInput): return store.add_rule(data)

    @app.delete('/api/context/rules/{rid}')
    def remove_rule(rid):
        with store.db() as c: c.execute('DELETE FROM context_rules WHERE id=?',(rid,))
        return {'ok':True}

    @app.get('/api/companion')
    def companion():
        state=store.snapshot()
        return {'settings':state['settings'],'context':state['context'],'focus':state['focus'],
                'attention':[{'id':t['id'],'title':t['title'],'next_action':t['attention_reason']} for t in state['attention'][:3]],
                'next':[{'id':t['id'],'title':t['title'],'priority':t['effective_priority'],
                         'next_action':t['next_action']} for t in state['available'][:3]],
                'needs_you':len(state['attention'])}

    @app.get('/api/export')
    def export():
        # SQLite backup is separate from portable export. Never include credentials.
        payload=store.export_data(); stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('dhara.json',json.dumps(payload,ensure_ascii=False,indent=2))
            for note in payload['notes']:
                archive.writestr(f"notes/{note['id']}.md",f"# {note['title']}\n\nFolder: {note['folder']}\n\n{note['body']}\n")
            with store.db() as c:
                blobs=[dict(r) for r in c.execute('SELECT id,path FROM attachments')]
            for f in blobs:
                path=store.blobs/f['path']
                if path.exists(): archive.write(path,'attachments/'+f['id'])
        return Response(stream.getvalue(),media_type='application/zip',headers={'Content-Disposition':'attachment; filename="dhara-export.zip"'})

    @app.get('/api/openapi')
    def schema(): return app.openapi()

    no_cache={'Cache-Control':'no-cache'}

    def dist_file(name,media_type,headers=None):
        path=dist/name
        if not path.is_file(): raise Problem(404,'Not found')
        return FileResponse(path,media_type=media_type,headers={**no_cache,**(headers or {})})

    @app.get('/')
    def index():
        if not (dist/'index.html').is_file():
            return PlainTextResponse('Frontend not built: run `npm --prefix web run build`',status_code=503,headers=no_cache)
        return dist_file('index.html','text/html')

    @app.get('/sw.js')
    def sw(): return dist_file('sw.js','application/javascript',{'Service-Worker-Allowed':'/'})

    @app.get('/manifest.webmanifest')
    def manifest(): return dist_file('manifest.webmanifest','application/manifest+json')

    @app.get('/icon.svg')
    def icon(): return dist_file('icon.svg','image/svg+xml')

    app.mount('/assets',HashedAssets(directory=dist/'assets',check_dir=False),name='assets')
    return app
