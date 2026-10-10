"""Real browser checks for the native helper's link to existing web settings."""
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
        if not ok:
            raise AssertionError(label)
        checks.append(label)
    with workspace() as (origin, api, _), sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/google-chrome'),
                                             headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 960})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/#settings')
        expect(page.locator('#observation-setting')).to_be_visible()
        check(page.locator('#modal').evaluate('(dialog)=>dialog.open'),
              'Native settings URL opens actual existing dialog at startup')
        check(page.locator('#nav a').count() == 4, 'Settings link adds no navigation screen')
        page.locator('#observation-setting').check()
        page.wait_for_function("async()=>{const r=await fetch('/api/state');return (await r.json()).settings.observation_enabled;}")
        check(api.get('/api/state').json()['settings']['observation_enabled'],
              'Linked settings edits actual existing server permission')
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        page.evaluate("location.hash='capture'")
        expect(page.locator('#brain-dump')).to_be_visible()
        page.locator('#brain-dump').fill('Synthetic unsaved capture for settings-link recovery.')
        page.evaluate("location.hash='settings'")
        expect(page.locator('#observation-setting')).to_be_visible()
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        expect(page.locator('#brain-dump')).to_have_value('Synthetic unsaved capture for settings-link recovery.')
        check(page.evaluate('location.hash') == '#capture',
              'Settings link preserves current Capture route and editor text')
        check(not api.get('/api/state').json()['notes'], 'Settings navigation never ingests an unsaved draft')
        saved = api.post('/api/captures', data={'payload': json.dumps({
            'capture_id': uuid4().hex, 'raw': 'Synthetic saved original for editor preservation.'})})
        saved.raise_for_status()
        note_id = api.get('/api/state').json()['notes'][0]['id']
        page.evaluate('(id)=>{location.hash="note/"+id;}', note_id)
        page.locator('[data-action="edit-note"]').click()
        page.locator('#note-form textarea').fill('Synthetic unsaved note edit.')
        page.evaluate("location.hash='settings'")
        expect(page.locator('#observation-setting')).to_be_visible()
        page.locator('#modal').evaluate('(dialog)=>dialog.close()')
        expect(page.locator('#note-form textarea')).to_have_value('Synthetic unsaved note edit.')
        check(page.evaluate('location.hash') == '#note/' + note_id,
              'Settings link preserves note-edit route and unsaved editor text')
        check(api.get('/api/notes/' + note_id).json()['raw'] == 'Synthetic saved original for editor preservation.',
              'Opening settings never replaces the saved note original')
        check(not errors, 'No uncaught JavaScript errors')
        browser.close()
    output = ROOT / 'qa/sway'
    output.mkdir(exist_ok=True)
    report = {'passed': len(checks), 'checks': checks,
              'boundary': 'Real headless Chrome/HTTP/SQLite with disposable data. '
                          'Not OS browser-launch routing or hardware permission validation.'}
    (output / 'settings-link-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
