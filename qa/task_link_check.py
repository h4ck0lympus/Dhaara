"""Real existing task dialog and draft preservation for native-companion links."""
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from qa.now_ui_check import workspace


def main():
    checks = []
    def check(ok, label):
        assert ok, label
        checks.append(label)
    with workspace() as (origin, api, _), sync_playwright() as playwright:
        task = api.post('/api/tasks', json={'title': 'Synthetic linked task', 'priority': 'low',
                                         'next_action': 'Read the saved synthetic action.'}).json()
        api.post('/api/focus', json={'task_id': task['id'], 'pinned': True}).raise_for_status()
        route = '#task/' + task['id']
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/google-chrome'),
                                             headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 960})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/' + route)
        expect(page.locator('#modal h2')).to_have_text(task['title'])
        expect(page.locator('#modal')).to_contain_text(task['next_action'])
        check(page.evaluate('location.hash') == '#plan', 'Startup task link opens existing dialog over Plan')
        check(page.locator('#nav a').count() == 4, 'Task link adds no main navigation/layout')
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        page.evaluate("location.hash='capture'")
        expect(page.locator('#brain-dump')).to_be_visible()
        page.locator('#brain-dump').fill('Synthetic unsaved capture stays untouched.')
        page.evaluate('(route)=>{location.hash=route;}', route)
        expect(page.locator('#modal h2')).to_have_text(task['title'])
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        expect(page.locator('#brain-dump')).to_have_value('Synthetic unsaved capture stays untouched.')
        check(page.evaluate('location.hash') == '#capture', 'Task link preserves unsaved Capture and route')
        check(not api.get('/api/state').json()['notes'], 'Opening task never ingests a learning-note draft')
        saved = api.post('/api/captures', data={'payload': json.dumps({
            'capture_id': uuid4().hex, 'raw': 'Synthetic saved note original.'})}).json()
        page.evaluate('(id)=>{location.hash="note/"+id;}', saved['id'])
        page.locator('[data-action="edit-note"]').click()
        page.locator('#note-form textarea').fill('Synthetic unsaved note edit.')
        page.evaluate('(route)=>{location.hash=route;}', route)
        expect(page.locator('#modal h2')).to_have_text(task['title'])
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        expect(page.locator('#note-form textarea')).to_have_value('Synthetic unsaved note edit.')
        check(page.evaluate('location.hash') == '#note/' + saved['id'], 'Task link preserves note-edit text and route')
        check(api.get('/api/notes/' + saved['id']).json()['raw'] == 'Synthetic saved note original.',
              'Saved note original is unchanged')
        state = api.get('/api/state').json()
        check(state['focus']['pinned'] and state['focus']['task_id'] == task['id']
              and state['tasks'][0]['priority'] == 'low', 'Task-link navigation never changes pin or manual priority')
        page.evaluate("location.hash='task/missing-synthetic-task'")
        expect(page.locator('#toast')).to_have_text('Task unavailable.')
        check(not page.locator('#modal').evaluate('(dialog)=>dialog.open'), 'Missing task has truthful error, no fake action')
        check(not errors, 'No uncaught JavaScript errors')
        browser.close()
    output = ROOT / 'qa/kitten-visibility'
    output.mkdir(exist_ok=True)
    report = {'passed': len(checks), 'checks': checks,
              'boundary': 'Real headless Chrome/HTTP/SQLite, disposable data. No physical input or OS browser dispatch.'}
    (output / 'task-link-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
