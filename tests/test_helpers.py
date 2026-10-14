import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import httpx
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from sway_context import focused_context,Observer
from agent import Outbox
from client import Client
from dhara.env import strip

def tree(floating=False):
    window={'type':'con','app_id':'firefox','name':'LeetCode','focused':True,'pid':100}
    workspace={'type':'workspace','name':'3','nodes':[],'floating_nodes':[]}
    workspace['floating_nodes' if floating else 'nodes'].append(window)
    return {'type':'root','nodes':[{'type':'output','name':'DP-1','nodes':[workspace]}]}

def test_sway_monitor_workspace():
 r=focused_context(tree());assert r['monitor']=='DP-1';assert r['workspace']=='3';assert r['app']=='firefox'
def test_sway_floating_window():assert focused_context(tree(True))['title']=='LeetCode'
def test_no_focused_window():assert focused_context({'type':'root','nodes':[]}) is None

def test_observer_disabled_never_reads_tree(monkeypatch):
 import sway_context
 monkeypatch.setattr(sway_context,'sway_json',lambda _:(_ for _ in ()).throw(AssertionError('read while disabled')))
 Observer(None).step({'settings':{'observation_enabled':False}})

def test_observer_debounces_and_sends_once(monkeypatch):
 import sway_context
 class Fake:
  calls=[]
  def request(self,path,payload=None):self.calls.append((path,payload));return {}
 f=Fake();o=Observer(f);monkeypatch.setattr(sway_context,'sway_json',lambda _:tree())
 summary={'settings':{'observation_enabled':True}};o.step(summary);assert not f.calls;o.step(summary);assert len(f.calls)==1;o.step(summary);assert len(f.calls)==1

def test_outbox_keeps_failed_delivery(tmp_path):
 class Offline:
  def request(self,*_):raise RuntimeError('offline')
 box=Outbox(tmp_path/'events.sqlite3');box.add('/runs/a/events',{'seq':1});assert not box.flush(Offline())
 class Online:
  calls=[]
  def request(self,*args):self.calls.append(args)
 good=Online();assert box.flush(good);assert len(good.calls)==1;assert box.flush(good);assert len(good.calls)==1

def test_helper_rejects_plaintext_remote_token():
 with pytest.raises(ValueError):Client('http://remote.example','token')

def test_real_agent_wrapper_success_failure_and_token_isolation(tmp_path):
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 secret=secrets.token_urlsafe(32);env=strip(os.environ.copy(),('MODEL','SPEECH_MODEL'));env['DHARA_ACCESS_TOKEN']=secret
 proc=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--port',str(port),'--data-dir',str(tmp_path/'server')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  url=f'http://127.0.0.1:{port}';c=httpx.Client(base_url=url,headers={'Authorization':'Bearer '+secret},timeout=5)
  for _ in range(60):
   try:
    if c.get('/api/health').status_code==200:break
   except httpx.ConnectError:time.sleep(.1)
  else:raise AssertionError('Server failed to start')
  for exit_code,expected in [(0,'review'),(7,'failed')]:
   t=c.post('/api/tasks',json={'title':'Test command'}).json();tok=c.post('/api/tokens',json={'name':'wrapper','scope':'agent','task_ids':[t['id']]}).json()['token']
   child_env=env|{'DHARA_TOKEN':tok,'NOEMA_TOKEN':tok}   # rename-shim: both names must be stripped from the wrapped command
   command=[sys.executable,str(ROOT/'tools/agent.py'),'--url',url,'--task',t['id'],'--outbox',str(tmp_path/f'outbox-{exit_code}.sqlite3'),'--',sys.executable,'-c',f'import os,sys; assert not {{"DHARA_TOKEN","DHARA_ACCESS_TOKEN","NOEMA_TOKEN","NOEMA_ACCESS_TOKEN"}} & set(os.environ); print("real process"); sys.exit({exit_code})']   # rename-shim: legacy names stripped too
   r=subprocess.run(command,env=child_env,capture_output=True,text=True,timeout=15,cwd=ROOT)
   assert r.returncode==exit_code,r.stderr
   run=next(r for r in c.get('/api/state').json()['runs'] if r['task_id']==t['id']);assert run['status']==expected
   assert c.get('/api/tasks/'+t['id']).json()['status']=='todo'
 finally:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
