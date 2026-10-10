"""UI interaction harness for environments that prohibit browser URL navigation.

Loads the REAL HTML/CSS/JS into an isolated page. Requests are bridged to a REAL
local HTTP server. IndexedDB/localStorage are in-memory test doubles because an
opaque about:blank origin cannot use native persistent storage. This is NOT a
native PWA/offline/microphone permission test. Do not hide that boundary.
"""
import base64
import json
import os
from pathlib import Path
import re
import sys
import time
import httpx
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.getenv('NOEMA_QA_OUTPUT', str(ROOT/'qa/continuation/browser-adapter')))
OUTPUT.mkdir(parents=True,exist_ok=True)
import atexit
import secrets
import socket
import subprocess
import tempfile
# Own disposable real server. Never reset or seed a user's existing database.
_temporary=tempfile.TemporaryDirectory(prefix='noema-browser-')
_sock=socket.socket();_sock.bind(('127.0.0.1',0));_port=_sock.getsockname()[1];_sock.close()
BASE=f'http://127.0.0.1:{_port}'
TOKEN=secrets.token_urlsafe(32)
_env=os.environ.copy();_env['NOEMA_ACCESS_TOKEN']=TOKEN;_env.pop('NOEMA_MODEL',None);_env.pop('NOEMA_SPEECH_MODEL',None)
_process=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--port',str(_port),'--data-dir',_temporary.name],cwd=ROOT,env=_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def _cleanup():
    _process.terminate()
    try:_process.wait(timeout=5)
    except subprocess.TimeoutExpired:_process.kill();_process.wait()
    _temporary.cleanup()
atexit.register(_cleanup)
client=httpx.Client(base_url=BASE,headers={'Authorization':'Bearer '+TOKEN,'X-Noema-Request':'1'},timeout=15)
for _ in range(50):
    try:
        if client.get('/api/health').status_code==200:break
    except httpx.ConnectError:time.sleep(.1)
else:raise RuntimeError('Disposable test server did not start')
offline=False

def bridge(data):
    if offline:raise RuntimeError('Test network disconnected')
    path=data['url']
    if not path.startswith('/api/'):return {'status':404,'body':'{}','type':'application/json'}
    kwargs={}
    if data.get('form'):
        kwargs['data']=data['form']['fields'];kwargs['files']=[('attachments',(f['name'],base64.b64decode(f['bytes']),f['type'])) for f in data['form']['files']]
    elif data.get('body') is not None:kwargs['content']=data['body'];kwargs['headers']={'Content-Type':'application/json'}
    r=client.request(data.get('method','GET'),path,**kwargs)
    return {'status':r.status_code,'body':r.text,'type':r.headers.get('content-type','application/json')}

HARNESS='''
// Explicit storage and transport test doubles, not shipped with the app.
const stores=new Map();
function objectStore(name,tx){
 if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);
 function op(action,key,value){const req={};setTimeout(()=>{try{req.result=action(key,value);req.onsuccess?.();tx.oncomplete?.();}catch(e){req.error=e;tx.error=e;req.onerror?.();tx.onerror?.();}},0);return req;}
 return {get:key=>op(k=>data.get(k),key),getAll:()=>op(()=>Array.from(data.values())),add:value=>op((k,v)=>{if(data.has(v.id))throw new Error('Duplicate capture');data.set(v.id,structuredClone(v));return v.id;},undefined,value),put:(value,key)=>op((k,v)=>{data.set(k===undefined?v.id:k,structuredClone(v));return k;},key,value),delete:key=>op(k=>data.delete(k),key)};
}
const fakeDB={createObjectStore(name){stores.set(name,new Map());},transaction(name){const tx={};tx.objectStore=store=>objectStore(store,tx);return tx;}};
Object.defineProperty(window,'indexedDB',{value:{open(){const req={result:fakeDB};setTimeout(()=>{req.onupgradeneeded?.();req.onsuccess?.();},0);return req;}}});
const ls=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)}});
Object.defineProperty(navigator,'serviceWorker',{value:undefined,configurable:true});
window.fetch=async(input,options={})=>{
 const data={url:String(input),method:options.method||'GET',body:options.body||null};
 if(options.body instanceof FormData){data.body=null;data.form={fields:{},files:[]};for(const [key,value]of options.body.entries()){if(value instanceof Blob){const arr=new Uint8Array(await value.arrayBuffer());let bin='';for(let i=0;i<arr.length;i++)bin+=String.fromCharCode(arr[i]);data.form.files.push({name:value.name,type:value.type,bytes:btoa(bin)});}else data.form.fields[key]=value;}}
 const response=await window.http_bridge(data);return new Response(response.body,{status:response.status,headers:{'content-type':response.type}});
};
'''

def seed():
    def add(title,**kwargs):
        r=client.post('/api/tasks',json={'title':title,'project':'Example workspace',**kwargs});r.raise_for_status();return r.json()
    learning=add('Neural Networks: Zero to Hero',next_action='Resume the backpropagation exercise from your last note.')
    nexttask=add('Continue your two-pointer solution',estimate_minutes=25,next_action='Start from the sorted-input assumption you saved.')
    review=add('Review the cleanup path',priority='high',status='review',next_action='The result is ready. Check what happens to the stored reference.')
    running=add('Investigate a failing test',status='waiting')
    r=client.post('/api/runs',json={'task_id':running['id'],'agent':'Example agent'});r.raise_for_status()
    client.post('/api/focus',json={'task_id':learning['id'],'pinned':True}).raise_for_status()
    return nexttask

def run():
    global offline
    results=[];errors=[]
    def check(name,test):
        assert test,name;results.append(name)
    seed()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(12000)
        page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR:',str(e),flush=True)))
        page.expose_function('http_bridge',bridge)
        html=(ROOT/'public/index.html').read_text()
        html=re.sub(r'<script[^>]*src="/static/app.js"[^>]*></script>','',html)
        html=re.sub(r'<link[^>]+>','',html)
        cat='data:image/png;base64,'+base64.b64encode((ROOT/'public/cat.png').read_bytes()).decode()
        html=html.replace('/static/cat.png',cat)
        page.set_content(html);page.add_style_tag(content=(ROOT/'public/styles.css').read_text());page.add_script_tag(content=HARNESS)
        # Do not attempt service worker registration under an opaque harness origin.
        script=(ROOT/'public/app.js').read_text().replace("if(navigator.serviceWorker)navigator.serviceWorker.register('/sw.js').catch(()=>{});",'/* native service worker intentionally not exercised by harness */')
        script=script.replace('/static/cat.png',cat)
        page.add_script_tag(content=script)
        page.wait_for_function("document.querySelector('h1')?.textContent==='What can I do now?'")
        check('Real API-backed overview renders',page.locator('.recommendation h2').inner_text()==client.get('/api/state').json()['available'][0]['title'])
        page.screenshot(path=str(OUTPUT/'desktop.png'),full_page=True)
        page.locator('.add-later').click();page.locator('#task-form [name=raw]').fill('Browser-created task');page.locator('#task-details summary').click();page.locator('#task-form input[name=project]').fill('UI test');page.locator('#task-form button[type=submit]').click()
        page.wait_for_function("!document.querySelector('#modal').open")
        task=next(t for t in client.get('/api/state').json()['tasks'] if t['title']=='Browser-created task')
        check('Create task form persists to real SQLite',bool(task))
        page.locator('#nav [data-page=plan]').click();page.wait_for_function("document.querySelector('h1')?.textContent==='A little further ahead.'")
        page.locator(f'[data-action=priority][data-id="{task["id"]}"]').click();page.locator('[data-action=set-priority][data-priority=low]').click();page.wait_for_function("!document.querySelector('#modal').open")
        check('Manual priority control persists',client.get('/api/tasks/'+task['id']).json()['priority']=='low')
        page.locator('#nav [data-page=capture]').click();page.locator('#brain-dump').fill('LeetCode trick: sorted input. two pointers, move left if the sum is small. not sure about duplicates yet.')
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=')
        page.locator('#file-picker').set_input_files({'name':'example.png','mimeType':'image/png','buffer':png})
        page.wait_for_function("document.querySelectorAll('.visual-item').length===1")
        page.evaluate("document.querySelector('#toast').classList.remove('visible')");page.wait_for_timeout(400);page.screenshot(path=str(OUTPUT/'capture-desktop.png'),full_page=True)
        page.locator('#save-capture').click()
        page.wait_for_function("state.notes.some(n=>n.title.startsWith('LeetCode trick'))")
        note=next(n for n in client.get('/api/state').json()['notes'] if n['title'].startswith('LeetCode trick'))
        full=client.get('/api/notes/'+note['id']).json()
        check('Text and uploaded image commit together',len(full['attachments'])==1 and 'not sure' in full['raw'])
        page.locator('#nav [data-page=notes]').click();page.locator('[data-action=note][data-id="'+note['id']+'"]').click()
        page.wait_for_function("document.querySelector('[data-action=edit-note]')!==null")
        page.locator('[data-action=edit-note]').click();page.locator('#note-form [name=title]').fill('Two pointers — personal insight');page.locator('#note-form [name=body]').fill('My edited note. Still unsure about duplicates.');page.locator('#note-form [type=submit]').click()
        page.wait_for_function("document.querySelector('h1')?.textContent==='Two pointers — personal insight'")
        full=client.get('/api/notes/'+note['id']).json();check('Note edits create revision and retain raw text',full['version']==2 and full['raw'].startswith('LeetCode trick'))
        page.locator('[data-action=note-tab][data-tab=original]').click();check('Original tab shows untouched capture','not sure about duplicates' in page.locator('.original-block').inner_text())
        page.locator('[data-action=history]').click();page.locator('[data-action=restore-note][data-version="1"]').click();page.wait_for_function("!document.querySelector('#modal').open")
        full=client.get('/api/notes/'+note['id']).json();check('History restore adds another revision',full['version']==3 and full['body']==full['raw'])
        page.locator('#nav [data-page=capture]').click();page.locator('#brain-dump').fill('Offline learning note. Keep my original.')
        offline=True;page.evaluate('online=false;connection()');page.locator('#save-capture').click();page.wait_for_function("document.querySelector('#brain-dump').value===''")
        page.wait_for_timeout(150);count=page.evaluate("(async()=> (await localOp('outbox','getAll')).length)()")
        check('Offline capture remains queued in storage adapter',count==1)
        offline=False;page.evaluate('(async()=>{await refresh(false);await flushOutbox();})()')
        check('Reconnect flushes queued capture to real server',any('Offline learning' in n['title'] for n in client.get('/api/state').json()['notes']))
        # Deliberate untrusted markup must remain text in the note renderer.
        page.evaluate("noteTab='organized';noteEditing=false;document.querySelector('#view').innerHTML=notePage({...noteCache,body:'<img src=x onerror=window.pwned=1>\\n<script>window.pwned=2</script>'});")
        check('Note renderer does not execute untrusted HTML',page.evaluate('window.pwned===undefined') and page.locator('.note-body img').count()==0)
        page.locator('#nav [data-page=overview]').click();page.wait_for_function("document.querySelector('h1')?.textContent==='What can I do now?'")
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
        check('Phone layout has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.evaluate("document.querySelector('#toast').classList.remove('visible')");page.wait_for_timeout(400);page.screenshot(path=str(OUTPUT/'mobile.png'),full_page=False)
        page.locator('#nav [data-page=capture]').click();page.locator('#brain-dump').fill('A quick thought from my phone…');page.screenshot(path=str(OUTPUT/'capture-mobile.png'),full_page=False)
        check('Phone capture has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.set_viewport_size({'width':1024,'height':768});page.locator('#nav [data-page=overview]').click();page.wait_for_timeout(200)
        check('Tablet layout has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        browser.close()
    check('No uncaught UI JavaScript errors',not errors)
    report={'passed':len(results),'checks':results,'errors':errors,'boundary':'Isolated page with real assets + real API. This harness deliberately uses transport and storage doubles and excludes service workers. Native storage is checked separately by native_storage_check.py; this isolated suite does not validate PWA installation, notification delivery or microphone permissions.'}
    (OUTPUT/'browser-results.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
if __name__=='__main__':run()
