"""Task capture UI: disposable HTTP/SQLite + real Chromium/IndexedDB.

Screenshots are synthetic headless desktop/phone-width views, not device proof.
Transport/storage failures are explicit injections; no microphone/model runs.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'qa'))
from now_ui_check import workspace


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--before', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    with workspace() as (origin, client, store), tempfile.TemporaryDirectory(prefix='dhara-task-profile-') as profile, sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            profile, executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'),
            headless=True, args=['--no-sandbox'], viewport={'width': 1200, 'height': 900})
        page = context.pages[0]
        page.goto(origin)
        page.locator('#view [data-action=new-task]').click()
        form = page.locator('#task-form')
        field = form.locator('[name=title]' if args.before else '[name=raw]')
        field.fill('Review the cleanup path')
        for label, width, height in [('desktop', 1200, 900), ('phone', 390, 844)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.screenshot(path=str(args.output / f'{"before" if args.before else "after"}-{label}.png'))
        if args.before:
            form.locator('[type=submit]').click()
            expect(page.locator('#modal')).not_to_be_visible()
            assert len(client.get('/api/state').json()['tasks']) == 1
            results.append('Baseline detailed form saves to disposable SQLite')
        else:
            def check(name, condition=True):
                assert condition, name
                results.append(name)

            def open_task():
                page.locator('#view [data-action=new-task]').first.click()
                return page.locator('#task-form')

            def submit(form):
                form.locator('[type=submit]').click()
                expect(page.locator('#modal')).not_to_be_visible()

            def state():
                return client.get('/api/state').json()

            def task(raw):
                return next(t for t in state()['tasks'] if t['original_input'] == raw)

            check('One multiline input; no unsupported voice button or mandatory details',
                  form.locator('input:visible, select:visible').count() == 0 and
                  form.locator('textarea:visible').count() == 1 and not form.locator('#task-details').evaluate('(e)=>e.open'))
            for width in (390, 1200):
                page.set_viewport_size({'width': width, 'height': 844 if width == 390 else 900})
                field.focus()
                expect(field).to_be_focused()
                check(f'{width}px layout has no horizontal overflow',
                      page.locator('#modal').evaluate('(e)=>e.scrollWidth<=e.clientWidth') and
                      page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                page.keyboard.press('Tab')
                expect(form.locator('#task-details summary')).to_be_focused()
                check(f'{width}px Details is keyboard reachable')
            field.focus()
            page.keyboard.press('End')
            page.keyboard.press('Enter')
            expect(page.locator('#modal')).to_be_visible()
            check('Ordinary Enter inserts a newline, never submits', not state()['tasks'] and '\n' in field.input_value())
            field.fill('Review the cleanup path')
            form.locator('#task-details summary').click()
            form.locator('[name=project]').fill('Explicit fixture workflow')
            form.locator('#task-details summary').click()
            expect(field).to_have_value('Review the cleanup path')
            check('Opening and closing Details preserves input and chosen workflow')
            field.focus()
            page.keyboard.press('Control+Enter')
            expect(page.locator('#modal')).not_to_be_visible()
            saved = task('Review the cleanup path')
            check('Keyboard submit durably creates one task without a model', len(state()['tasks']) == 1 and saved['project'] == 'Explicit fixture workflow')
            check('Compact confirmation includes Edit and does not open full editor',
                  page.locator('#toast [data-action=edit-task]').count() == 1 and page.url == origin + '/')

            form = open_task()
            field = form.locator('[name=raw]')
            field.fill('Review another cleanup tomorrow')
            submit(form)
            planned = task('Review another cleanup tomorrow')
            check('Planned day is separate from deadline/reminder/availability',
                  planned['planned_on'] is not None and planned['due_at'] is None and planned['not_before'] is None and not state()['reminders'])

            # Populate all existing fields through the real API, then edit with Details collapsed.
            dependency = client.post('/api/tasks', json={'title': 'Fixture prerequisite'}).json()
            keys = ['title', 'project', 'detail', 'next_action', 'status', 'priority', 'due_at', 'not_before', 'planned_on', 'estimate_minutes', 'dependencies', 'session_url']
            body = {k: saved[k] for k in keys}
            body.update(priority='low', detail='Retain context', next_action='Read saved release order',
                        due_at='2026-11-20T17:22:33+00:00', not_before='2026-10-01T11:23:45+00:00',
                        planned_on='2026-11-18', estimate_minutes=25, dependencies=[dependency['id']], session_url='https://example.test/task')
            changed = client.put('/api/tasks/' + saved['id'], json={**body, 'expected_version': saved['version']}).json()
            client.post('/api/focus', json={'task_id': saved['id'], 'pinned': True}).raise_for_status()
            pin = state()['focus']
            page.reload()
            page.locator(f'[data-action=task][data-id="{saved["id"]}"]').first.click()
            page.locator('#modal [data-action=edit-task]').click()
            form = page.locator('#task-form')
            check('Existing task Details starts collapsed', not form.locator('#task-details').evaluate('(e)=>e.open'))
            form.locator('[name=title]').fill('Manual correction, not an inference')
            form.locator('#task-details summary').click()
            form.locator('#task-details summary').click()
            submit(form)
            updated = client.get('/api/tasks/' + saved['id']).json()
            check('Collapsed editor preserves every hidden field, exact timestamps and original',
                  all(updated[k] == changed[k] for k in keys if k != 'title') and updated['original_input'] == saved['original_input'])
            check('Task save never replaces pinned focus', state()['focus'] == pin)

            # ESC, reload and actual persistent-profile reopen use native IndexedDB.
            form = open_task()
            field = form.locator('[name=raw]')
            field.fill('Maybe review Atlas next Friday; not confirmed')
            form.locator('#task-details summary').click()
            form.locator('[name=priority]').select_option('low')
            field.focus()
            page.keyboard.press('Escape')
            expect(page.locator('#modal')).not_to_be_visible()
            page.reload()
            form = open_task()
            expect(form.locator('[name=raw]')).to_have_value('Maybe review Atlas next Friday; not confirmed')
            form.locator('#task-details summary').click()
            expect(form.locator('[name=priority]')).to_have_value('low')
            check('Accidental dismissal and reload recover task draft and details')
            page.locator('#modal [data-action=close-modal]').first.click()
            expect(page.locator('#modal')).not_to_be_visible()
            context.close()
            context = p.chromium.launch_persistent_context(profile, executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
            page = context.pages[0]
            page.goto(origin)
            form = open_task()
            expect(form.locator('[name=raw]')).to_have_value('Maybe review Atlas next Friday; not confirmed')
            check('Actual browser-profile restart recovers task draft')
            submit(form)
            uncertain = task('Maybe review Atlas next Friday; not confirmed')
            check('Ambiguous workflow/date save without interview or fabricated fields',
                  uncertain['planned_on'] is None and uncertain['project'] == 'Unassigned' and uncertain['priority'] == 'low')

            # Explicit local quota failure; no request is allowed before draft/identity commits.
            form = open_task()
            form.locator('[name=raw]').fill('Retain this on local storage failure')
            page.evaluate('''() => {window.originalTaskPut=IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put=function(value,key){if(key==='task-draft')throw new DOMException('Injected quota failure','QuotaExceededError');return window.originalTaskPut.apply(this,arguments);};}''')
            before = len(state()['tasks'])
            form.locator('[type=submit]').click()
            expect(form.locator('.field-error')).to_contain_text('Not confirmed added')
            expect(form.locator('[name=raw]')).to_have_value('Retain this on local storage failure')
            page.locator('#modal [data-action=close-modal]').first.click()
            expect(form.locator('#task-draft-status')).to_contain_text('Draft not stored')
            check('Injected storage failure retains input, blocks dismissal and makes no task', len(state()['tasks']) == before)
            page.evaluate('() => {IDBObjectStore.prototype.put=window.originalTaskPut;}')
            submit(form)
            check('Local storage retry adds exactly once', len(state()['tasks']) == before + 1)

            # Actual SQLite trigger rejects commit. HTTP is real; failure cause is injected.
            with store.db() as db:
                db.execute("CREATE TRIGGER ui_fail BEFORE INSERT ON task_captures BEGIN SELECT RAISE(ABORT, 'Injected fixture failure'); END")
            form = open_task()
            form.locator('[name=raw]').fill('Retain on database failure')
            before = len(state()['tasks'])
            form.locator('[type=submit]').click()
            expect(form.locator('.field-error')).to_contain_text('Not confirmed added')
            expect(form.locator('[name=raw]')).to_have_value('Retain on database failure')
            check('Server storage failure shows no false success and rolls back task', len(state()['tasks']) == before)
            with store.db() as db:
                db.execute('DROP TRIGGER ui_fail')
            submit(form)
            check('Server storage retry adds once', len(state()['tasks']) == before + 1)

            # The real service commits; deliberately discard its response before the browser sees it.
            page.evaluate('''() => {window.originalTaskFetch=window.fetch;window.dropTaskReply=true;
                window.fetch=async function(url,options){const response=await window.originalTaskFetch.apply(this,arguments);
                    if(String(url)==='/api/task-captures'&&window.dropTaskReply){window.dropTaskReply=false;throw new TypeError('Injected lost acknowledgement');}return response;};}''')
            form = open_task()
            form.locator('[name=raw]').fill('Retried submission must not duplicate')
            before = len(state()['tasks'])
            form.locator('[type=submit]').click()
            expect(form.locator('.field-error')).to_contain_text('Not confirmed added')
            check('Lost acknowledgement is unconfirmed, not a success', len(state()['tasks']) == before + 1)
            submit(form)
            check('Retry after actual commit returns same task, never duplicates', len(state()['tasks']) == before + 1)
            page.evaluate('() => {window.fetch=window.originalTaskFetch;}')

            page.evaluate('''() => {window.originalTaskFetch=window.fetch;window.fetch=async function(url,options){if(String(url)==='/api/task-captures')return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});return window.originalTaskFetch.apply(this,arguments);};}''')
            form = open_task()
            form.locator('[name=raw]').fill('Generic success is not a task acknowledgement')
            before = len(state()['tasks'])
            form.locator('[type=submit]').click()
            expect(form.locator('.field-error')).to_contain_text('Not confirmed added')
            check('Injected generic HTTP 200 cannot falsely acknowledge a task', len(state()['tasks']) == before)
            page.evaluate('() => {window.fetch=window.originalTaskFetch;}')
            submit(form)

            page.evaluate('''() => {window.originalTaskFetch=window.fetch;window.failTaskSnapshot=false;window.fetch=async function(url,options){
                if(String(url)==='/api/state'&&window.failTaskSnapshot){window.failTaskSnapshot=false;return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});}
                const response=await window.originalTaskFetch.apply(this,arguments);if(String(url)==='/api/task-captures')window.failTaskSnapshot=true;return response;};}''')
            form = open_task()
            form.locator('[name=raw]').fill('Edit the acknowledged task despite failed refresh')
            submit(form)
            page.locator('#toast [data-action=edit-task]').click()
            expect(page.locator('#modal h2')).to_have_text('Edit task')
            expect(page.locator('#task-form [name=title]')).to_have_value('Edit the acknowledged task despite failed refresh')
            check('Confirmation Edit opens the saved task even when post-save snapshot failed', page.locator('#task-form [name=raw]').count() == 0)
            page.locator('#modal [data-action=close-modal]').first.click()
            page.evaluate('() => {window.fetch=window.originalTaskFetch;}')

            form = open_task()
            form.locator('[name=raw]').fill('Disconnected task draft, not a queued task')
            page.evaluate('''() => {window.originalTaskFetch=window.fetch;window.fetch=async function(url,options){if(String(url)==='/api/task-captures')throw new TypeError('Injected offline transport');return window.originalTaskFetch.apply(this,arguments);};}''')
            before = len(state()['tasks'])
            form.locator('[type=submit]').click()
            expect(form.locator('.field-error')).to_contain_text('Not confirmed added')
            check('Disconnected task saving retains draft, no task/outbox success', len(state()['tasks']) == before)
            page.locator('#modal [data-action=close-modal]').first.click()
            expect(page.locator('#modal')).not_to_be_visible()
            page.reload()
            form = open_task()
            expect(form.locator('[name=raw]')).to_have_value('Disconnected task draft, not a queued task')
            submit(form)
            check('Disconnected draft retry after reload uses durable capture identity', len(state()['tasks']) == before + 1)

            page.locator('#nav [data-page=capture]').click()
            page.locator('#brain-dump').fill('Learning note: review tomorrow is an example, not a task commitment.')
            page.locator('#save-capture').click()
            expect(page.locator('#brain-dump')).to_have_value('')
            page.wait_for_function("document.querySelector('#queue-indicator')?.textContent?.includes('queued') !== true")
            # Refresh through a second real request after upload acknowledgement.
            for _ in range(100):
                if state()['notes']:
                    break
                page.wait_for_timeout(50)
            check('Ordinary learning-note capture creates no task', len(state()['notes']) == 1 and len(state()['tasks']) == before + 1)
        context.close()
    (args.output / ('before-results.json' if args.before else 'results.json')).write_text(
        json.dumps({'environment': 'Headless Chromium, synthetic data', 'passed': results}, indent=2) + '\n')
    print(json.dumps({'passed': len(results), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
