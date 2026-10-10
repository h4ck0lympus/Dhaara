"""Now-state UI checks/screenshots: real Chrome + disposable HTTP/SQLite fixtures.

No transport/storage mocks. Stale timestamps are fixture data; disconnection
and visibility are explicit injections. Not a phone/device/overlay/model test.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import secrets
import socket
import sys
import tempfile
import threading
import time
from uuid import uuid4

import httpx
from playwright.sync_api import expect, sync_playwright
import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from noema.server import create_app

OUTPUT = ROOT / 'qa' / 'now-ui'


@contextmanager
def workspace():
    with tempfile.TemporaryDirectory(prefix='noema-now-ui-') as directory:
        token = secrets.token_urlsafe(32)
        app = create_app(directory, start_worker=False, admin_token=token)
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        sock.listen(128)
        origin = f'http://127.0.0.1:{sock.getsockname()[1]}'
        server = uvicorn.Server(uvicorn.Config(app, log_level='warning'))
        thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]})
        thread.start()
        try:
            with httpx.Client(base_url=origin, trust_env=False, timeout=15,
                              headers={'Authorization': 'Bearer ' + token,
                                       'X-Noema-Request': '1'}) as client:
                for _ in range(100):
                    try:
                        if client.get('/api/health').is_success:
                            break
                    except httpx.ConnectError:
                        pass
                    time.sleep(.05)
                else:
                    raise AssertionError('Disposable service did not start')
                yield origin, client, app.state.store
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            sock.close()
            if thread.is_alive():
                raise AssertionError('Disposable service failed to stop')


def call(client, path, body=None, method='POST'):
    response = client.request(method, '/api' + path, json=body)
    response.raise_for_status()
    return response.json()


def seed(client, store, kind):
    def task(title, **fields):
        return call(client, '/tasks', {'title': title, **fields})
    def run(t, event=None):
        r = call(client, '/runs', {'task_id': t['id'], 'agent': 'Fixture command wrapper'})
        if event:
            call(client, '/runs/' + r['id'] + '/events',
                 {'event_id': uuid4().hex, 'seq': 1, 'kind': event,
                  'message': 'A fixture result or question, not actual user activity.'})
        return r
    if kind in ('available', 'disconnected'):
        chosen = task('Study allocator cleanup', priority='low', next_action='Read your original lifetime notes.')
        task('Continue the two-pointer exercise', priority='high', next_action='Check how duplicate values affect the pointer movement.')
        task('Read the ownership chapter', priority='medium')
        call(client, '/focus', {'task_id': chosen['id'], 'pinned': False})
    elif kind == 'waiting':
        a = task('Trace ownership in the cleanup path', status='waiting')
        run(a)
        task('Test the revised cleanup', status='blocked', dependencies=[a['id']])
    elif kind == 'attention':
        run(task('Review the cleanup result', priority='high'), 'completed')
        run(task('Answer the boundary-condition question', priority='medium'), 'needs_input')
    elif kind == 'complete':
        task('Check duplicate handling', status='done')
        task('Review the allocator result', status='done')
    elif kind == 'unknown':
        r = run(task('Check the missing agent report', status='waiting'))
        # Only this fixture's temporary SQLite database; no production data.
        with store.db() as db:
            db.execute('UPDATE runs SET updated_at=? WHERE id=?',
                       ((datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(), r['id']))


def main(capture_screenshots=True):
    OUTPUT.mkdir(exist_ok=True)
    os.environ.pop('NOEMA_MODEL', None)
    os.environ.pop('NOEMA_SPEECH_MODEL', None)
    checks, errors = [], []
    def check(label, valid=True):
        assert valid, label
        checks.append(label)
    def ready(page, mode):
        expect(page.locator('.now-page')).to_have_attribute('data-now-state', mode)
    def screenshots(page, kind):
        for size, label in [({'width': 1440, 'height': 960}, 'desktop'),
                            ({'width': 390, 'height': 844}, 'mobile')]:
            page.set_viewport_size(size)
            page.locator('h1').scroll_into_view_if_needed()
            check(kind + ' / ' + label + ' has no horizontal overflow',
                  page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            if capture_screenshots:
                page.screenshot(path=str(OUTPUT / f'{kind}-{label}.png'), full_page=False)
        page.set_viewport_size({'width': 1440, 'height': 960})

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/google-chrome'),
                                    headless=True, args=['--no-sandbox'])
        try:
            for kind in ('new', 'available', 'waiting', 'attention', 'complete', 'unknown', 'disconnected'):
                with workspace() as (origin, client, store):
                    seed(client, store, kind)
                    context = browser.new_context(viewport={'width': 1440, 'height': 960})
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(origin)
                    expect(page.locator('#connection-label')).to_have_text('Server connected')
                    ready(page, 'available' if kind == 'disconnected' else kind)
                    check(kind + ' uses real server state')
                    check(kind + ' preserves the four navigation destinations',
                          page.locator('#nav a').all_text_contents() == ['◉Now', '＋Capture', '▤Notes', '≡Plan'])
                    if kind == 'disconnected':
                        context.set_offline(True)
                        ready(page, 'disconnected')
                        expect(page.locator('#integration-status')).to_contain_text('server disconnected')
                        check('Disconnected cache has no currently actionable alternatives',page.locator('.alternatives').count()==0)
                        check('Disconnected cache does not claim available/completed/connected integrations')
                    if kind == 'waiting':
                        page.locator('.waiting-work summary').click()
                        expect(page.locator('.waiting-work')).to_contain_text('Waiting on: Trace ownership')
                        expect(page.locator('.waiting-work')).to_contain_text('Waiting on an agent report')
                        check('Agent and dependency waiting reasons are distinct and real')
                    screenshots(page, kind)
                    if kind == 'new':
                        check('Empty workspace has no agent setup or all-complete claim',
                              page.locator('[data-action=agent-setup]').count() == 0 and
                              'All tracked work' not in page.locator('#view').inner_text())
                        page.locator('#view [data-action=capture]').click()
                        page.locator('#brain-dump').fill('Learning note: I am unsure about ownership. Not a commitment.')
                        page.locator('#save-capture').click()
                        for _ in range(100):
                            if client.get('/api/state').json()['notes']:
                                break
                            time.sleep(.05)
                        check('Capture creates a learning note, never an automatic task',
                              len(client.get('/api/state').json()['notes']) == 1 and
                              not client.get('/api/state').json()['tasks'])
                        page.goto(origin+'/#overview')
                        ready(page, 'notes-only')
                        screenshots(page, 'notes-only')
                        page.locator('#view [data-action=new-task]').click()
                        page.locator('#task-form [name=raw]').fill('Explicitly chosen task')
                        page.locator('#task-form [type=submit]').click()
                        expect(page.locator('#modal')).not_to_be_visible()
                        check('Add a task opens an implemented form and persists explicit intent',
                              len(client.get('/api/state').json()['tasks']) == 1)
                    if kind == 'available':
                        check('Readable body/secondary text meets a 4.5 contrast ratio', page.evaluate(r"""()=>{
                          const colors=[getComputedStyle(document.querySelector('.recommendation p')).color,getComputedStyle(document.querySelector('.focus-name span')).color];
                          const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
                          const bg=lum(getComputedStyle(document.body).backgroundColor);return colors.every(c=>(lum(c)+.05)/(bg+.05)>=4.5);
                        }"""))
                        expect(page.locator('[data-focus-kind=manual]')).to_contain_text('Selected by you')
                        check('Primary suggestion is singular and alternatives start collapsed',
                              page.locator('.recommendation h2').count() == 1 and
                              not page.locator('.alternatives').evaluate('(el)=>el.open'))
                        check('No duration, deadline or progress is fabricated',
                              page.locator('.recommendation .inline-actions .small').count() == 0)
                        page.locator('.agent-status summary').click()
                        expect(page.locator('#integration-status')).to_contain_text('connection status unknown')
                        page.locator('[data-action=agent-setup]').click()
                        expect(page.locator('#agent-setup')).to_have_attribute('open', '')
                        page.locator('#token-form [name=name]').fill('Isolated UI token')
                        t = client.get('/api/state').json()['tasks'][0]
                        page.locator('#token-form [name=task_ids]').select_option([t['id']])
                        page.locator('#token-form button').click()
                        expect(page.locator('#new-token')).to_contain_text('Copy this token now')
                        check('Agent setup creates a real task-scoped token',
                              any(x['name'] == 'Isolated UI token' for x in client.get('/api/tokens').json()))
                        page.locator('[data-action=close-modal]').click()
                        call(client, '/settings', {'observation_enabled': True}, 'PATCH')
                        call(client, '/context/rules', {'app': 'noema-fixture', 'task_id': t['id']})
                        call(client, '/context', {'app': 'noema-fixture', 'title': 'Fixture window metadata'})
                        page.reload()
                        expect(page.locator('[data-focus-kind=inferred]')).to_contain_text('Inferred from window metadata')
                        check('Inferred focus is separately labeled')
                        pinned = client.get('/api/state').json()['tasks'][1]
                        call(client, '/focus', {'task_id': pinned['id'], 'pinned': True})
                        page.reload()
                        expect(page.locator('[data-focus-kind=pinned]')).to_contain_text('Pinned by you')
                        call(client, '/context', {'app': 'noema-fixture'})
                        check('Observer metadata never overrides a pinned focus',
                              client.get('/api/state').json()['focus']['task_id'] == pinned['id'])
                        check('Now suggestion cannot silently replace pinned focus',
                              page.locator('.recommendation [data-action=focus]').count() == 0)
                        page.locator('.recommendation .primary').click()
                        page.once('dialog', lambda dialog: dialog.dismiss())
                        page.locator('#modal [data-action=focus]').click()
                        check('Declining explicit pinned replacement preserves focus',
                              client.get('/api/state').json()['focus']['task_id'] == pinned['id'])
                        page.locator('[data-action=close-modal]').click()
                        page.locator('#companion-launch').click()
                        expect(page.locator('#modal')).to_contain_text('not a native desktop overlay')
                        check('Kitten reveals implemented size, mode and observation controls',
                              page.locator('#pet-size').count() == 1 and page.locator('#pet-observation').count() == 1)
                        page.locator('#pet-mode').select_option('dot')
                        expect(page.locator('#companion-launch .status-dot')).to_be_visible()
                        page.locator('#pet-mode').select_option('hidden')
                        expect(page.locator('#companion-launch')).to_be_hidden()
                        check('Hidden companion is actually hidden, not overridden by CSS')
                        page.locator('#pet-mode').select_option('dot')
                        expect(page.locator('#companion-launch .status-dot')).to_be_visible()
                        page.locator('#pet-observation').uncheck()
                        expect(page.locator('#companion-observation-status')).to_contain_text('Observation paused')
                        page.locator('#pet-observation').check()
                        expect(page.locator('#companion-observation-status')).to_contain_text('no recent observer report')
                        check('Observation permission does not claim an active observer or screenshots')
                        page.locator('#pet-size').fill('72')
                        page.locator('#pet-size').dispatch_event('change')
                        page.locator('#pet-mode').select_option('cat')
                        expect(page.locator('#companion-launch img')).to_be_visible()
                        page.wait_for_function("async()=>{const s=await(await fetch('/api/state')).json();return s.settings.companion==='cat'&&s.settings.companion_size===72}")
                        check('Kitten stays small despite larger native helper setting',
                              page.locator('#companion-launch img').bounding_box()['width'] <= 40)
                        if capture_screenshots:
                            page.screenshot(path=str(OUTPUT / 'companion-controls-desktop.png'))
                        page.locator('[data-action=close-modal]').click()
                        # Real reduced-motion query; hidden state is explicitly injected.
                        call(client, '/settings', {'motion': True}, 'PATCH')
                        page.add_init_script("""window.noemaMotionTicks=0;const schedule=window.setTimeout;
                        window.setTimeout=(cb,ms,...args)=>schedule(ms===100&&cb.name==='drawAmbient'?()=>{window.noemaMotionTicks++;cb();}:cb,ms,...args);""")
                        page.reload()
                        page.wait_for_function('()=>window.noemaMotionTicks>1')
                        check('Dot field never paints over the reading surface',page.evaluate("""()=>{
                          const c=document.querySelector('#ambient'),r=document.querySelector('#view').getBoundingClientRect(),scale=c.width/innerWidth;
                          const x=Math.max(0,Math.ceil(r.left*scale)),y=Math.max(0,Math.ceil(r.top*scale)),w=Math.floor(Math.min(c.width,r.right*scale))-x,h=Math.floor(Math.min(c.height,r.bottom*scale))-y;
                          const bytes=c.getContext('2d').getImageData(x,y,w,h).data;for(let i=3;i<bytes.length;i+=4)if(bytes[i])return false;return true;
                        }"""))
                        page.emulate_media(reduced_motion='reduce')
                        before = page.evaluate('window.noemaMotionTicks')
                        page.wait_for_timeout(250)
                        check('Reduced motion stops the actual animation timer', page.evaluate('window.noemaMotionTicks') == before)
                        page.emulate_media(reduced_motion='no-preference')
                        page.wait_for_function('()=>window.noemaMotionTicks>2')
                        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
                        before = page.evaluate('window.noemaMotionTicks')
                        page.wait_for_timeout(250)
                        check('Injected hidden-document event stops animation', page.evaluate('window.noemaMotionTicks') == before)
                    if kind == 'attention':
                        check('Completed agent result is still a review task, not completed work',
                              any(r['status'] == 'review' for r in client.get('/api/state').json()['runs']) and
                              all(t['status'] != 'done' for t in client.get('/api/state').json()['tasks']))
                        page.locator('.agent-status summary').click()
                        expect(page.locator('#integration-status')).to_contain_text('0 running · 1 awaiting input')
                        check('Zero running agents does not erase a reported question')
                        page.locator('.recommendation .primary').click()
                        expect(page.locator('#modal')).to_contain_text('Fixture command wrapper')
                        check('Human-attention action opens the real task/result details')
                    if kind == 'complete':
                        expect(page.locator('.recommendation')).to_contain_text('All tracked work is complete')
                        check('All-complete state has no agent onboarding prompt', page.locator('[data-action=agent-setup]').count() == 0)
                    if kind == 'unknown':
                        expect(page.locator('#integration-status')).to_contain_text('Agent status unknown')
                        expect(page.locator('.recommendation .primary')).to_have_text('Check agent status')
                        check('Stale integration status is visibly unknown, not running or complete')
                    if kind == 'disconnected':
                        context.set_offline(False)
                        ready(page, 'available')
                        check('Reconnect returns to real available work')
                    context.close()
        finally:
            browser.close()
    check('No uncaught UI JavaScript errors', not errors)
    report = {'passed': len(checks), 'checks': checks, 'errors': errors,
              'boundary': 'Real Chrome, HTTP, SQLite, native browser storage and isolated fixtures. '
                          'Network disconnection/hidden visibility injected; stale reports fixture timestamps. '
                          'Phone screenshots are responsive viewports, not Android hardware. '
                          'No native overlay, actual screen observation, model, microphone, installation or performance claim.'}
    (OUTPUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
