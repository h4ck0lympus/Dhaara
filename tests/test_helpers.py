from pathlib import Path
import sys
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from sway_context import focused_context,Observer
from client import Client

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

def test_helper_rejects_plaintext_remote_token():
 with pytest.raises(ValueError):Client('http://remote.example','token')
