import base64
import hashlib
import io
import json
import sqlite3
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from dhara.server import create_app
from dhara.env import PREFIXES
from dhara.store import Problem,now
from dhara.models import TokenInput,ContextInput,RuleInput,RunEvent
from dhara.worker import validate_organized,basic_filing

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=')
ADMIN='a'*40
@pytest.fixture
def env(tmp_path,monkeypatch):
    for key in (prefix+name for prefix in PREFIXES for name in ('MODEL','SPEECH_MODEL')): monkeypatch.delenv(key,raising=False)
    app=create_app(tmp_path,start_worker=False,admin_token=ADMIN)
    with TestClient(app) as c:
        c.headers.update({'Authorization':'Bearer '+ADMIN,'X-Dhara-Request':'1'})
        yield c,app.state.store,app.state.worker

def task(c,**kw):
    r=c.post('/api/tasks',json={'title':'Understand cleanup',**kw});assert r.status_code==201,r.text;return r.json()
def capture(c,text='heap pointer may be stale; not confirmed',cid=None,files=None,**kw):
    p={'capture_id':cid or uuid4().hex,'raw':text,**kw}
    r=c.post('/api/captures',data={'payload':json.dumps(p)},files=files or {})
    assert r.status_code==201,r.text;return r.json()
def edit_task(c,t,**kw):
    p={k:t[k] for k in ('title','project','detail','next_action','status','priority','due_at','not_before','estimate_minutes','dependencies','session_url')}
    return c.put('/api/tasks/'+t['id'],json={**p,**kw,'expected_version':t['version']})
def run(c,t,**kw):
    r=c.post('/api/runs',json={'task_id':t['id'],'agent':'test-agent',**kw});assert r.status_code==201,r.text;return r.json()
def event(c,r,seq,kind,**kw):
    return c.post('/api/runs/'+r['id']+'/events',json={'event_id':uuid4().hex,'seq':seq,'kind':kind,**kw})

SHELL_ASSET='index-AbCd1234.js'

def make_dist(root):
    (root/'assets').mkdir(parents=True)
    (root/'index.html').write_text('<!doctype html><title>Dhara</title><div id="root"></div>')
    (root/'assets'/SHELL_ASSET).write_text('export {};')
    (root/'sw.js').write_text('const CACHE="dhara-shell-000000000000";const PRECACHE=["/"];\n')
    (root/'manifest.webmanifest').write_text('{"id":"/","start_url":"/","scope":"/"}')
    (root/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    return root

def test_frontend_not_built_returns_503(tmp_path):
    app=create_app(tmp_path/'data',start_worker=False,admin_token=ADMIN,dist_dir=tmp_path/'missing')
    with TestClient(app) as c:
        r=c.get('/')
        assert r.status_code==503
        assert r.text=='Frontend not built: run `npm --prefix web run build`'
        assert r.headers['content-type'].startswith('text/plain')
        assert r.headers['cache-control']=='no-cache'
        assert "default-src 'self'" in r.headers['content-security-policy']
        assert c.get('/api/health').json()['ok']
        for path in ('/assets/'+SHELL_ASSET,'/sw.js','/manifest.webmanifest','/icon.svg'):
            assert c.get(path).status_code==404,path

def test_frontend_routes_and_headers(tmp_path):
    dist=make_dist(tmp_path/'dist')
    app=create_app(tmp_path/'data',start_worker=False,admin_token=ADMIN,dist_dir=dist)
    with TestClient(app) as c:
        index=c.get('/')
        assert index.status_code==200 and '<div id="root">' in index.text
        assert index.headers['content-type'].startswith('text/html')
        assert index.headers['cache-control']=='no-cache'
        assert index.headers['x-frame-options']=='DENY'
        asset=c.get('/assets/'+SHELL_ASSET)
        assert asset.status_code==200 and asset.text=='export {};'
        assert asset.headers['cache-control']=='public, max-age=31536000, immutable'
        assert c.get('/assets/missing-AbCd1234.js').status_code==404
        sw=c.get('/sw.js')
        assert sw.status_code==200 and sw.text.startswith('const CACHE=')
        assert sw.headers['content-type'].startswith('application/javascript')
        assert sw.headers['service-worker-allowed']=='/'
        assert sw.headers['cache-control']=='no-cache'
        manifest=c.get('/manifest.webmanifest')
        assert manifest.json()=={'id':'/','start_url':'/','scope':'/'}
        assert manifest.headers['content-type'].startswith('application/manifest+json')
        assert manifest.headers['cache-control']=='no-cache'
        icon=c.get('/icon.svg')
        assert icon.headers['content-type'].startswith('image/svg+xml') and icon.headers['cache-control']=='no-cache'
        for path in ('/static/app.js','/static/sw.js','/companion','/index.html'):
            assert c.get(path).status_code==404,path
        assert c.get('/api/state').status_code==401
        (dist/'manifest.webmanifest').unlink()
        assert c.get('/manifest.webmanifest').status_code==404

def test_display_name_setting(env):
    c,s,w=env
    assert c.get('/api/state').json()['settings']['display_name']==''
    r=c.patch('/api/settings',json={'display_name':'  Vishal  '})
    assert r.status_code==200,r.text
    assert r.json()['display_name']=='Vishal'
    assert c.get('/api/state').json()['settings']['display_name']=='Vishal'
    assert c.patch('/api/settings',json={'display_name':'x'*61}).status_code==422
    padded=c.patch('/api/settings',json={'display_name':' '*10+'y'*60})
    assert padded.status_code==200,padded.text
    assert padded.json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':5}).status_code==422
    assert c.patch('/api/settings',json={'motion':True}).json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':''}).json()['display_name']==''
    s.set_meta('settings',{'observation_enabled':False,'motion':False,'companion':'cat','companion_size':40})
    old=c.get('/api/state').json()['settings']
    assert old['display_name']==''
    assert old['observation_enabled'] is False and old['motion'] is False

def test_theme_setting(env):
    c,s,w=env
    assert c.get('/api/state').json()['settings']['theme']=='dark'
    for theme in ('light','system','dark'):
        assert c.patch('/api/settings',json={'theme':theme}).json()['theme']==theme
    assert c.patch('/api/settings',json={'theme':'sepia'}).status_code==422
    assert c.patch('/api/settings',json={'theme':'light'}).status_code==200
    assert c.patch('/api/settings',json={'motion':False}).json()['theme']=='light'
    s.set_meta('settings',{'observation_enabled':False,'motion':False,'companion':'cat','companion_size':40})
    assert c.get('/api/state').json()['settings']['theme']=='dark'

def test_companion_saved_actions_preserve_available_order_and_pin(env):
 c,s,w=env
 pinned=task(c,title='Pinned synthetic task',priority='low',next_action='Keep this focus.')
 other=task(c,title='Available synthetic task',priority='high',next_action='Inspect the saved example.')
 task(c,title='Blocked synthetic task',dependencies=[other['id']],next_action='Not available.')
 c.post('/api/focus',json={'task_id':pinned['id'],'pinned':True})
 before=s.snapshot()
 summary=c.get('/api/companion').json()
 assert [t['id'] for t in summary['next']]==[t['id'] for t in before['available'][:3]]
 assert summary['next'][0]=={'id':other['id'],'title':other['title'],'priority':'high',
                            'next_action':'Inspect the saved example.'}
 assert summary['focus']==before['focus'] and summary['focus']['pinned']
 assert s.task(pinned['id'])['priority']=='low' and not summary['settings']['observation_enabled']
 assert s.meta('context') is None

@pytest.mark.parametrize('status', ['waiting','blocked','parked','done'])
def test_companion_does_not_invent_available_work(env,status):
 c,s,w=env
 task(c,status=status,next_action='This is not available.')
 assert c.get('/api/companion').json()['next']==[]

def test_companion_missing_action_stays_empty(env):
 c,s,w=env;task(c)
 assert c.get('/api/companion').json()['next'][0]['next_action']==''

def test_observer_summary_action_does_not_expand_access(env):
 c,s,w=env;t=task(c,next_action='User-saved next action.',detail='Private task detail.')
 note=capture(c,'Private original learning note.')
 token=c.post('/api/tokens',json={'name':'Companion test','scope':'observer'}).json()['token']
 c.headers['Authorization']='Bearer '+token
 summary=c.get('/api/companion').json()
 assert set(summary['next'][0])=={'id','title','priority','next_action'}
 assert summary['next'][0]['next_action']=='User-saved next action.'
 assert 'Private' not in json.dumps(summary)
 for path in ('/api/state','/api/tasks/'+t['id'],'/api/notes/'+note['id']):
  assert c.get(path).status_code==403
 assert c.patch('/api/settings',json={'observation_enabled':True}).status_code==403
 assert c.post('/api/context',json={'title':'Must not observe'}).status_code==409
 assert not s.settings()['observation_enabled'] and s.meta('context') is None

def test_private_api_requires_auth(env):
 c,s,w=env;c.headers.pop('Authorization');assert c.get('/api/state').status_code==401

def test_local_login_cookie(env):
 c,s,w=env;c.headers.pop('Authorization');r=c.post('/api/session',json={});assert r.status_code==200;assert 'HttpOnly' in r.headers['set-cookie'];assert c.get('/api/state').status_code==200

def test_no_automatic_reverse_proxy_login(env):
 c,s,w=env;c.headers.pop('Authorization');assert c.post('/api/session',json={},headers={'X-Forwarded-For':'192.0.2.1'}).status_code==401

def test_cross_origin_rejected(env):
 c,s,w=env;assert c.post('/api/tasks',json={'title':'Injected'},headers={'Origin':'https://evil.test'}).status_code==403

def test_dns_rebinding_host_rejected(env):
 c,s,w=env;assert c.get('/api/state',headers={'Host':'attacker.test'}).status_code==400

def test_cookie_write_needs_marker(env):
 c,s,w=env;c.headers.pop('Authorization');c.post('/api/session',json={});c.headers.pop('X-Dhara-Request');assert c.post('/api/tasks',json={'title':'Injected'}).status_code==403

def test_basic_task_persistence(env):
 c,s,w=env;t=task(c);assert s.task(t['id'])['title']==t['title'];assert len(s.snapshot()['available'])==1

def test_priority_override_survives_deadline(env):
 c,s,w=env;t=task(c,priority='low',due_at=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat());item=s.snapshot()['tasks'][0];assert item['effective_priority']=='low';assert item['priority_source']=='you'

def test_automatic_deadline_priority(env):
 c,s,w=env;task(c,due_at=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat());assert s.snapshot()['tasks'][0]['effective_priority']=='high'

def test_priority_for_dependency_and_unblock(env):
 c,s,w=env;a=task(c);b=task(c,title='Verify',dependencies=[a['id']]);snap=s.snapshot();assert next(t for t in snap['tasks'] if t['id']==a['id'])['effective_priority']=='high';assert b['id'] not in [t['id'] for t in snap['available']];assert edit_task(c,a,status='done').status_code==200;assert b['id'] in [t['id'] for t in s.snapshot()['available']]

def test_cycle_rejected(env):
 c,s,w=env;a=task(c);b=task(c,dependencies=[a['id']]);assert edit_task(c,a,dependencies=[b['id']]).status_code==400

def test_nonexistent_dependency(env):
 c,s,w=env;assert c.post('/api/tasks',json={'title':'bad','dependencies':['absent']}).status_code==400

def test_task_revision_conflict(env):
 c,s,w=env;t=task(c);assert edit_task(c,t,title='New').status_code==200;assert edit_task(c,t,title='Old').status_code==409

def test_naive_datetime_rejected(env):
 c,s,w=env;assert c.post('/api/tasks',json={'title':'bad','due_at':'2026-10-10T10:00:00'}).status_code==422

def test_session_javascript_rejected(env):
 c,s,w=env;assert c.post('/api/tasks',json={'title':'bad','session_url':'javascript:alert(1)'}).status_code==422

def test_blank_title_rejected(env):
 c,s,w=env;assert c.post('/api/tasks',json={'title':'    '}).status_code==422

def test_waiting_parked_future_not_available(env):
 c,s,w=env;task(c,status='waiting');task(c,status='parked');task(c,not_before=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat());assert not s.snapshot()['available']

def test_time_filter_excludes_unknown_estimates(env):
 c,s,w=env;task(c);t=task(c,estimate_minutes=10);task(c,estimate_minutes=45);assert [x['id'] for x in s.snapshot(15)['available']]==[t['id']]

def test_focus_not_suggested_again(env):
 c,s,w=env;t=task(c);s.focus(t['id']);assert not s.snapshot()['available'];assert s.snapshot()['focus']['pinned']

def test_note_not_task_and_original_preserved(env):
 c,s,w=env;raw='heap... maybe wrong\nfree_slot(0x1234);';n=capture(c,raw);assert n['raw']==raw;assert n['body']==raw;assert n['folder']=='Security / CTFs';assert not s.snapshot()['tasks']

def test_ambiguous_note_inbox(env):
 c,s,w=env;n=capture(c,'ctf heap notes and leetcode algorithm idea');assert n['folder']=='Inbox'

def test_empty_capture_rejected(env):
 c,s,w=env;r=c.post('/api/captures',data={'payload':json.dumps({'capture_id':uuid4().hex,'raw':' '})});assert r.status_code==400

def test_capture_idempotency(env):
 c,s,w=env;cid=uuid4().hex;a=capture(c,cid=cid);b=capture(c,cid=cid);assert a['id']==b['id'];assert len(s.snapshot()['notes'])==1

def test_capture_id_conflict(env):
 c,s,w=env;cid=uuid4().hex;capture(c,cid=cid);r=c.post('/api/captures',data={'payload':json.dumps({'capture_id':cid,'raw':'different'})});assert r.status_code==409

def test_attachment_persistence_and_duplicate_cleanup(env):
 c,s,w=env;cid=uuid4().hex;f=[('attachments',('heap.png',PNG,'image/png'))];n=capture(c,cid=cid,files=f);assert c.get('/api/attachments/'+n['attachments'][0]['id']).content==PNG;capture(c,cid=cid,files=f);assert len(list(s.blobs.iterdir()))==1

def test_bad_attachment_cleans_staged_files(env):
 c,s,w=env;r=c.post('/api/captures',data={'payload':json.dumps({'capture_id':uuid4().hex,'raw':'x'})},files=[('attachments',('x.svg',b'<svg onload="evil"/>','image/svg+xml'))]);assert r.status_code==400;assert not list(s.blobs.iterdir());assert not s.snapshot()['notes']

def test_missing_task_cleans_blobs(env):
 c,s,w=env;r=c.post('/api/captures',data={'payload':json.dumps({'capture_id':uuid4().hex,'raw':'x','task_id':'missing'})},files=[('attachments',('x.png',PNG,'image/png'))]);assert r.status_code==404;assert not list(s.blobs.iterdir())

def test_note_edits_are_recoverable(env):
 c,s,w=env;n=capture(c);r=c.put('/api/notes/'+n['id'],json={'expected_version':1,'title':'My title','folder':'Security / Findings','body':'edited'});assert r.status_code==200;assert r.json()['raw']==n['raw'];assert len(s.history(n['id']))==2
 r=c.post(f"/api/notes/{n['id']}/restore/1",json={'expected_version':2});assert r.status_code==200;assert r.json()['body']==n['raw'];assert r.json()['version']==3

def test_stale_note_edit_does_not_overwrite(env):
 c,s,w=env;n=capture(c);p={'expected_version':1,'title':'A','folder':'Inbox','body':'new'};c.put('/api/notes/'+n['id'],json=p);p['body']='stale';assert c.put('/api/notes/'+n['id'],json=p).status_code==409;assert s.note(n['id'])['body']=='new'

def test_search_matches_raw_after_cleanup(env):
 c,s,w=env;n=capture(c,'rare_identifier_9 maybe wrong');s.edit_note(n['id'],{'title':'Clean','folder':'Inbox','body':'Other','expected_version':1});assert c.get('/api/search?q=rare_identifier_9').json()[0]['id']==n['id']

def test_reminder_due_snooze_dismiss(env):
 c,s,w=env;t=task(c);r=c.post('/api/reminders',json={'task_id':t['id'],'at':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}).json();assert s.snapshot()['attention'][0]['id']==t['id'];assert c.post('/api/reminders/'+r['id']+'/snooze',json={'minutes':20}).status_code==200;assert not s.snapshot()['attention'];c.delete('/api/reminders/'+r['id']);assert not s.snapshot()['reminders']

def test_completed_task_dismisses_reminders(env):
 c,s,w=env;t=task(c);s.reminder(t['id'],now());edit_task(c,t,status='done');assert not s.snapshot()['reminders']

def test_run_completion_is_review_not_task_done(env):
 c,s,w=env;t=task(c);r=run(c,t);assert event(c,r,1,'completed').status_code==200;assert s.task(t['id'])['status']=='todo';assert s.snapshot()['attention'][0]['id']==t['id']

def test_running_task_not_recommended(env):
 c,s,w=env;t=task(c);run(c,t);assert not s.snapshot()['available'];assert edit_task(c,t,status='done').status_code==409

def test_event_retry_idempotent_and_conflict(env):
 c,s,w=env;t=task(c);r=run(c,t);eid=uuid4().hex;a=event(c,r,1,'progress',event_id=eid,message='check');b=event(c,r,1,'progress',event_id=eid,message='check');assert b.json()['duplicate'];assert event(c,r,1,'progress',event_id=eid,message='different').status_code==409

def test_out_of_order_event_does_not_regress(env):
 c,s,w=env;t=task(c);r=run(c,t);event(c,r,5,'needs_input');res=event(c,r,3,'progress');assert not res.json()['accepted'];assert s.run(r['id'])['status']=='needs_input'

def test_late_heartbeat_cannot_reopen_terminal(env):
 c,s,w=env;t=task(c);r=run(c,t);event(c,r,3,'completed');res=event(c,r,10,'heartbeat');assert not res.json()['accepted'];assert s.run(r['id'])['status']=='review'

def test_stale_agent_unknown(env):
 c,s,w=env;t=task(c);r=run(c,t)
 with s.db() as db:db.execute('UPDATE runs SET updated_at=? WHERE id=?',((datetime.now(timezone.utc)-timedelta(minutes=3)).isoformat(),r['id']))
 snap=s.snapshot();assert snap['runs'][0]['effective_status']=='unknown';assert not snap['available'];assert 'unknown' in snap['attention'][0]['attention_reason']

def test_task_scoped_agent_cannot_read_other_data(env):
 c,s,w=env;a=task(c);b=task(c);tok=c.post('/api/tokens',json={'name':'agent','scope':'agent','task_ids':[a['id']]}).json()['token'];c.headers['Authorization']='Bearer '+tok
 assert c.get('/api/state').status_code==403;assert c.get('/api/agent/tasks/'+a['id']).status_code==200;assert c.get('/api/agent/tasks/'+b['id']).status_code==403;assert c.post('/api/runs',json={'task_id':b['id'],'agent':'bad'}).status_code==403

def test_scope_agent_can_report_own_run(env):
 c,s,w=env;t=task(c);tok=s.token(TokenInput(name='a',task_ids=[t['id']]))['token'];c.headers['Authorization']='Bearer '+tok;r=run(c,t);assert event(c,r,1,'completed').status_code==200

def test_revoked_token_fails(env):
 c,s,w=env;t=task(c);tok=s.token(TokenInput(name='a',task_ids=[t['id']]));c.delete('/api/tokens/'+tok['id']);c.headers['Authorization']='Bearer '+tok['token'];assert c.get('/api/agent/tasks/'+t['id']).status_code==401

def test_observation_off_by_default(env):
 c,s,w=env;assert not s.settings()['observation_enabled'];assert c.post('/api/context',json={'app':'firefox','title':'secret'}).status_code==409;assert s.meta('context') is None

def test_context_mapping_and_pin(env):
 c,s,w=env;a=task(c);b=task(c);s.settings({'observation_enabled':True});s.add_rule(RuleInput(app='firefox',contains='LeetCode',task_id=a['id']));s.observe(ContextInput(app='firefox',title='LeetCode Two Sum',monitor='DP-1',workspace='3'));assert s.meta('focus')['task_id']==a['id'];s.focus(b['id'],True);s.observe(ContextInput(app='firefox',title='LeetCode'));assert s.meta('focus')['task_id']==b['id']

def test_unmatched_window_clears_only_inferred_focus(env):
 c,s,w=env;t=task(c);s.settings({'observation_enabled':True});s.add_rule(RuleInput(app='firefox',task_id=t['id']));s.observe(ContextInput(app='firefox'));s.observe(ContextInput(app='terminal'));assert s.meta('focus') is None

def test_pause_clears_retained_context(env):
 c,s,w=env;s.settings({'observation_enabled':True});s.observe(ContextInput(title='private title'));s.settings({'observation_enabled':False});assert s.meta('context') is None

def test_model_off_has_no_fake_cleanup(env):
 c,s,w=env;n=capture(c);assert c.post('/api/notes/'+n['id']+'/organize',json={}).status_code==409;assert s.note(n['id'])['body']==n['raw']

def test_worker_applies_valid_result(env,monkeypatch):
 c,s,w=env;n=capture(c);monkeypatch.setattr(w,'organize',lambda text:{'title':'A hypothesis','folder':'Security / CTFs','body':'Possible stale reference; unconfirmed.'});s.enqueue(n['id'],'organize');assert w.process_one();result=s.note(n['id']);assert result['mode']=='AI-organized';assert result['raw']==n['raw'];assert result['version']==2

def test_worker_concurrent_edit_saved_as_suggestion(env,monkeypatch):
 c,s,w=env;n=capture(c);s.enqueue(n['id'],'organize');s.edit_note(n['id'],{'title':'Human','folder':'Inbox','body':'My new interpretation','expected_version':1});monkeypatch.setattr(w,'organize',lambda text:{'title':'Model','folder':'Inbox','body':'Suggestion'});w.process_one();result=s.note(n['id']);assert result['body']=='My new interpretation';assert result['suggestions'][0]['body']=='Suggestion'

def test_worker_failure_preserves_original(env,monkeypatch):
 c,s,w=env;n=capture(c);s.enqueue(n['id'],'organize');monkeypatch.setattr(w,'organize',lambda text:(_ for _ in ()).throw(ValueError('offline')));w.process_one();result=s.note(n['id']);assert result['error']=='offline';assert result['body']==n['raw']

def test_job_deduplication(env):
 c,s,w=env;n=capture(c);s.enqueue(n['id'],'organize');s.enqueue(n['id'],'organize')
 with s.db() as db:assert db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]==1

def test_invalid_model_output_rejected():
 with pytest.raises(ValueError):validate_organized({'title':'x','folder':'../secret','body':'x'})
 with pytest.raises(ValueError):validate_organized({'title':'x','folder':'Inbox','body':'x','task':'invented'})

def test_export_includes_originals_not_tokens(env):
 import zipfile
 c,s,w=env;n=capture(c);r=c.get('/api/export');assert r.status_code==200
 with zipfile.ZipFile(io.BytesIO(r.content)) as z:
  payload=json.loads(z.read('dhara.json'));assert payload['notes'][0]['raw']==n['raw'];assert 'tokens' not in payload;assert ADMIN.encode() not in z.read('dhara.json');assert 'notes/'+n['id']+'.md' in z.namelist()

def test_restart_persistence(tmp_path):
 app=create_app(tmp_path,start_worker=False,admin_token=ADMIN)
 with TestClient(app) as c:
  c.headers['Authorization']='Bearer '+ADMIN;t=task(c);n=capture(c)
 restarted=create_app(tmp_path,start_worker=False,admin_token=ADMIN)
 assert restarted.state.store.task(t['id']);assert restarted.state.store.note(n['id'])['raw']==n['raw']

def test_old_session_cookie_signs_in_until_login_rewrites_it(env):
 c,s,w=env;c.headers.pop('Authorization')
 assert c.get('/api/state').status_code==401
 old={'Cookie':'noema_session='+ADMIN}   # rename-shim: a cookie written before the rename, sent as the browser still sends it
 assert c.get('/api/state',headers=old).status_code==200
 r=c.post('/api/session',json={},headers=old);assert r.status_code==200
 cookies=r.headers.get_list('set-cookie')
 assert any(h.startswith('dhara_session='+ADMIN) and 'HttpOnly' in h for h in cookies)
 assert any(h.startswith('noema_session=') and 'Max-Age=0' in h for h in cookies)   # rename-shim: login clears the old cookie
 assert c.cookies.get('dhara_session')==ADMIN
 assert c.get('/api/state').status_code==200
 r=c.delete('/api/session');cleared=r.headers.get_list('set-cookie')
 assert all(any(h.startswith(name+'=') and 'Max-Age=0' in h for h in cleared) for name in ('dhara_session','noema_session'))   # rename-shim: logout clears both cookie names
 assert c.get('/api/state').status_code==401

def test_request_marker_dual_read(env):
 c,s,w=env;c.headers.pop('Authorization');c.headers.pop('X-Dhara-Request')
 assert c.post('/api/session',json={}).status_code==403
 assert c.post('/api/session',json={},headers={'X-Dhara-Request':'1'}).status_code==200
 assert c.post('/api/tasks',json={'title':'No marker'}).status_code==403
 assert c.post('/api/tasks',json={'title':'Old marker'},headers={'X-Noema-Request':'1'}).status_code==201   # rename-shim: old header accepted for one release
 assert c.post('/api/tasks',json={'title':'New marker'},headers={'X-Dhara-Request':'1'}).status_code==201

def test_transcribe_off_names_the_setup_commands(env):
    c,s,w=env;n=capture(c);r=c.post(f"/api/notes/{n['id']}/transcribe");assert r.status_code==409
    detail=r.json()['detail']
    for needle in ('pip install -e ".[speech]"','tools/download_speech_model.py base.en','DHARA_SPEECH_MODEL','CPU','the packaged build does not include speech','Your recording is saved'):assert needle in detail,detail
