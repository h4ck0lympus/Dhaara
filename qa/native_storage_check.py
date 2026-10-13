"""Real loopback UI, IndexedDB, service worker and browser-profile restart checks.

Requires optional Playwright and an existing Chrome/Chromium executable. Uses
only disposable server data and browser profiles. No transport/storage doubles.
Faults deliberately abort a real transaction or drop a real upload response;
this is not a physical disk-full, power-loss, microphone or device test.
"""
import base64
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time

import httpx
from playwright.sync_api import Error as PlaywrightError, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dhara.env import env, strip
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=')
RAW = 'free_slot(0x1234) may leave a pointer. Not confirmed; changing size did not help.'
READ = """async ({store, key}) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('dhara-local-v1', 1);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly'), table = tx.objectStore(store);
      const r = key === null ? table.getAll() : table.get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}"""
FAULTS = """
// Explicit fault injection, never included in production assets.
const originalPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function(value, key) {
  if (window.noemaFault === 'abort-reset' && key === 'draft' && value.raw === '')
    throw new DOMException('Injected reset failure', 'QuotaExceededError');
  if (window.noemaFault === 'quota' && key === 'draft')
    throw new DOMException('Injected quota failure', 'QuotaExceededError');
  const request = originalPut.apply(this, arguments);
  if (window.noemaEditDuringWrite && key === 'draft' && value.raw === 'First draft write') {
    request.addEventListener('success', () => {
      window.noemaEditDuringWrite=false;
      const editor=document.querySelector('#brain-dump');
      editor.value='Newer input during first write';
      editor.dispatchEvent(new Event('input'));
      request.transaction.addEventListener('complete', () => setTimeout(() => {
        window.noemaStatusAfterOldCommit=document.querySelector('#draft-status').textContent;
      }, 0));
    });
  }
  if (window.noemaFault === 'abort-transaction' && key === 'draft' && value.raw === '')
    request.addEventListener('success', () => request.transaction.abort());
  return request;
};
"""


class Server:
    def __init__(self, root):
        self.root = root
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.url = f'http://127.0.0.1:{self.port}'
        self.token = secrets.token_urlsafe(32)
        self.env = strip(os.environ.copy(), ('MODEL', 'SPEECH_MODEL'))
        self.env['DHARA_ACCESS_TOKEN'] = self.token
        self.client = httpx.Client(base_url=self.url, headers={
            'Authorization': 'Bearer ' + self.token, 'X-Noema-Request': '1'
        }, timeout=10, trust_env=False)
        self.process = None

    def start(self):
        self.process = subprocess.Popen([
            sys.executable, str(ROOT/'run.py'), '--port', str(self.port),
            '--data-dir', str(self.root/'data')
        ], cwd=ROOT, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                if self.client.get('/api/health').status_code == 200:
                    return
            except httpx.ConnectError:
                pass
            if self.process.poll() is not None:
                raise RuntimeError('Disposable server exited before startup')
            time.sleep(.05)
        raise RuntimeError('Disposable server did not start')

    def stop(self):
        if self.process is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            self.process = None


def run(capture_screenshots=True):
    output = Path(env('QA_OUTPUT', str(ROOT/'qa/continuation/native-storage')))
    output.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []

    def check(name, condition=True):
        assert condition, name
        checks.append(name)

    def read(page, store, key=None):
        return page.evaluate(READ, {'store': store, 'key': key})

    def queue_count(page, count):
        page.wait_for_function(
            f'async n => (await ({READ})({{store:"outbox",key:null}})).length === n', arg=count)

    with tempfile.TemporaryDirectory(prefix='noema-native-storage-') as temporary:
        root = Path(temporary)
        server = Server(root)
        context = None
        try:
            server.start()
            # Synthetic daily-loop state, distinct from the notebook fixture.
            task = server.client.post('/api/tasks', json={
                'title': 'Disposable review task', 'priority': 'low', 'next_action': 'Check the hypothesis.'
            }).json()
            server.client.post('/api/focus', json={'task_id': task['id'], 'pinned': True}).raise_for_status()
            server.client.post('/api/reminders', json={
                'task_id': task['id'], 'at': (datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat()
            }).raise_for_status()
            with sync_playwright() as p:
                def browser(profile='profile'):
                    ctx = p.chromium.launch_persistent_context(
                        str(root/profile), executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/google-chrome'),
                        headless=True, viewport={'width': 1440, 'height': 1000}, args=['--no-sandbox'])
                    ctx.set_default_timeout(12000)
                    ctx.add_init_script(FAULTS)
                    ctx.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
                    return ctx

                context = browser()
                page = context.new_page()
                page.goto(server.url+'/#capture')
                expect(page.locator('#brain-dump')).to_be_visible()
                page.evaluate('navigator.serviceWorker.ready.then(() => true)')
                page.wait_for_function('() => navigator.serviceWorker.controller !== null')
                check('Real loopback navigation and native service worker control')
                page.evaluate('window.noemaEditDuringWrite=true')
                page.locator('#brain-dump').fill('First draft write')
                page.wait_for_function('() => window.noemaStatusAfterOldCommit !== undefined')
                check('Older committed draft cannot label newer input as saved', page.evaluate('window.noemaStatusAfterOldCommit') == 'Saving draft on this device…')
                expect(page.locator('#draft-status')).to_have_text('Draft on this device · not uploaded')
                assert read(page, 'kv', 'draft')['raw'] == 'Newer input during first write'
                page.locator('#brain-dump').fill(RAW)
                page.locator('#file-picker').set_input_files({'name': 'heap.png', 'mimeType': 'image/png', 'buffer': PNG})
                expect(page.locator('#draft-status')).to_have_text('Draft on this device · not uploaded')
                check('Unsaved draft never ingested into server notebook', not server.client.get('/api/state').json()['notes'])
                context.close()

                context = browser()
                page = context.new_page()
                page.goto(server.url+'/#capture')
                expect(page.locator('#brain-dump')).to_have_value(RAW)
                expect(page.locator('.visual-item img')).to_have_count(1)
                recovered = page.evaluate(f'async () => {{ const d=await ({READ})({{store:"kv",key:"draft"}}); return Array.from(new Uint8Array(await d.files[0].blob.arrayBuffer())); }}')
                check('Draft text and exact Blob bytes survive browser process restart', bytes(recovered) == PNG)
                context.set_offline(True)
                page.reload(wait_until='domcontentloaded')
                expect(page.locator('#brain-dump')).to_have_value(RAW)
                check('Service worker opens actual capture UI offline with last snapshot')
                page.locator('#save-capture').click()
                expect(page.locator('#brain-dump')).to_have_value('')
                queue_count(page, 1)
                queued_id = read(page, 'outbox')[0]['id']
                check('Explicit offline Save atomically queues original and resets stored draft', read(page, 'kv', 'draft')['raw'] == '')
                context.close()

                context = browser()
                context.set_offline(True)
                page = context.new_page()
                page.goto(server.url+'/#capture', wait_until='domcontentloaded')
                expect(page.locator('#brain-dump')).to_have_value('')
                queue_count(page, 1)
                check('Queued attachment capture survives offline browser restart', read(page, 'outbox')[0]['id'] == queued_id)
                context.set_offline(False)
                with page.expect_response(lambda response: response.url.endswith('/api/captures') and response.status == 201) as acknowledgment:
                    page.reload()
                check('Reconnect receives matching real server acknowledgment', acknowledgment.value.json()['id'] == queued_id)
                expect(page.locator('#brain-dump')).to_be_visible()
                queue_count(page, 0)
                response = server.client.get('/api/notes/'+queued_id)
                assert response.status_code == 200, response.text
                full = response.json()
                attachment = server.client.get('/api/attachments/'+full['attachments'][0]['id']).content
                check('Reconnect delivers one original note and exact attachment bytes', full['raw'] == RAW and attachment == PNG and len(server.client.get('/api/state').json()['notes']) == 1)

                # Abort between outbox.add and draft.put: native transaction rolls back.
                context.set_offline(True)
                page.locator('#brain-dump').fill('A draft that must survive an aborted Save.')
                expect(page.locator('#draft-status')).to_have_text('Draft on this device · not uploaded')
                page.evaluate("window.noemaFault='abort-reset'")
                page.locator('#save-capture').click()
                expect(page.locator('#local-save-error')).to_be_visible()
                expect(page.locator('#brain-dump')).to_have_value('A draft that must survive an aborted Save.')
                queue_count(page, 0)
                check('Aborted atomic Save keeps persisted draft and rolls back queue insertion', read(page, 'kv', 'draft')['raw'] == 'A draft that must survive an aborted Save.')
                page.reload(wait_until='domcontentloaded')
                expect(page.locator('#brain-dump')).to_have_value('A draft that must survive an aborted Save.')
                check('Reload recovers original draft after transaction abort')

                page.evaluate("window.noemaFault='abort-transaction'")
                page.locator('#save-capture').click()
                expect(page.locator('#local-save-error')).to_be_visible()
                queue_count(page, 0)
                check('Native abort after request success still rolls back both stores', read(page, 'kv', 'draft')['raw'] == 'A draft that must survive an aborted Save.')

                page.evaluate("window.noemaFault='quota'")
                page.locator('#brain-dump').fill('Exact unsaved edit after simulated quota failure.')
                expect(page.locator('#local-save-error')).to_be_visible()
                expect(page.locator('#draft-status')).to_have_text('Local save failed · keep this page open')
                check('Injected quota failure has persistent truthful UI and retains editor text')
                if capture_screenshots: page.screenshot(path=str(output/'storage-error-desktop.png'), full_page=True)
                page.set_viewport_size({'width': 390, 'height': 844})
                check('Recovery control fits phone viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                if capture_screenshots: page.screenshot(path=str(output/'storage-error-phone.png'), full_page=True)
                page.evaluate("window.noemaFault='' ")
                page.locator('[data-action=retry-local-save]').click()
                expect(page.locator('#local-save-error')).to_be_hidden()
                check('Retry commits recovered edit through native IndexedDB', read(page, 'kv', 'draft')['raw'] == 'Exact unsaved edit after simulated quota failure.')

                # Commit on server then lose acknowledgment: replay same capture ID.
                context.set_offline(False)
                def lose_response(route):
                    response = route.fetch()
                    assert response.status == 201
                    route.abort('failed')
                context.route('**/api/captures', lose_response)
                page.reload()
                expect(page.locator('#brain-dump')).to_be_visible()
                with page.expect_event('requestfailed', predicate=lambda request: request.url.endswith('/api/captures')):
                    page.locator('#save-capture').click()
                expect(page.locator('#brain-dump')).to_have_value('')
                queue_count(page, 1)
                lost_id = read(page, 'outbox')[0]['id']
                check('Lost server acknowledgment retains queued capture ID', server.client.get('/api/notes/'+lost_id).status_code == 200)
                context.close()
                server.stop()
                server.start()
                context = browser()
                page = context.new_page()
                with page.expect_response(lambda response: response.url.endswith('/api/captures') and response.status == 201) as acknowledgment:
                    page.goto(server.url+'/#capture')
                assert acknowledgment.value.json()['id'] == lost_id
                expect(page.locator('#brain-dump')).to_be_visible()
                queue_count(page, 0)
                snapshot = server.client.get('/api/state').json()
                check('Browser/server restart retries lost acknowledgment without duplicate notes', len(snapshot['notes']) == 2 and server.client.get('/api/notes/'+lost_id).json()['version'] == 1)
                check('Server restart retains manual priority, pinned focus and due reminder', snapshot['tasks'][0]['priority'] == 'low' and snapshot['focus']['pinned'] and snapshot['focus']['task_id'] == task['id'] and snapshot['reminders'][0]['state'] == 'due')
                page.locator('#brain-dump').fill('Immediate Save before debounce: maybe not cleared, 0x4141.')
                page.locator('#save-capture').click()
                expect(page.locator('#brain-dump')).to_have_value('')
                queue_count(page, 0)
                page.reload()
                expect(page.locator('#brain-dump')).to_have_value('')
                check('Immediate Save cancels draft debounce without resurrecting a saved draft', read(page, 'kv', 'draft')['raw'] == '' and len(server.client.get('/api/state').json()['notes']) == 3)
                context.close()

                # An unavailable database must not destroy the connected UI at boot.
                context = browser('unavailable-profile')
                context.add_init_script("const originalOpen=IDBFactory.prototype.open; window.noemaStorageUnavailable=true; IDBFactory.prototype.open = function(){if(window.noemaStorageUnavailable)throw new DOMException('Injected unavailable storage','SecurityError');return originalOpen.apply(this,arguments);};")
                page = context.new_page()
                page.goto(server.url+'/#capture')
                expect(page.locator('#brain-dump')).to_be_visible()
                expect(page.locator('#local-save-error')).to_be_visible()
                page.locator('#brain-dump').fill('Still editable with storage unavailable.')
                page.locator('#save-capture').click()
                expect(page.locator('#brain-dump')).to_have_value('Still editable with storage unavailable.')
                check('Unavailable storage at boot leaves editable UI and failed Save retains text')
                page.evaluate('window.noemaStorageUnavailable=false')
                page.locator('[data-action=retry-local-save]').click()
                expect(page.locator('#local-save-error')).to_be_hidden()
                check('Failed database open can retry in the same page without reloading', read(page, 'kv', 'draft')['raw'] == 'Still editable with storage unavailable.')
                context.close()
                context = None
            check('No uncaught UI JavaScript errors', not errors)
        finally:
            if context is not None:
                try:
                    context.close()
                except PlaywrightError:
                    pass  # Playwright has already closed its loop on an assertion failure.
            server.stop()
            server.client.close()
    report = {
        'passed': len(checks), 'checks': checks, 'errors': errors,
        'boundary': 'Real headless Chrome, loopback HTTP, native IndexedDB/Blob persistence, service worker and persistent browser profile. Quota/transaction failure and lost acknowledgment are injected; no physical disk-full/power-loss, target devices, microphone, local models, Sway, cloud sync or resource measurement.'
    }
    (output/'results.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    run()
