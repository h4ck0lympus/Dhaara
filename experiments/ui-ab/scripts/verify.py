"""Sandboxed Chromium checks, isolated profiles, no production service or notebook."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='evidence/browser-round1');parser.add_argument('--checks',action='store_true');args=parser.parse_args()
    output=ROOT/args.output;output.mkdir(parents=True,exist_ok=True)
    server=subprocess.Popen([sys.executable,str(ROOT/'scripts/serve.py'),'--port','8793'],stdout=subprocess.PIPE)
    try:
        assert server.stdout.readline().startswith(b'Isolated Noema demo:')
        with tempfile.TemporaryDirectory(prefix='noema-ab-browser-') as profile,sync_playwright() as p:
            context=p.chromium.launch_persistent_context(profile,executable_path='/usr/bin/google-chrome',headless=True,chromium_sandbox=True,viewport={'width':1158,'height':816},device_scale_factor=1)
            page=context.pages[0];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            def open(path=''):
                page.goto('http://127.0.0.1:8793/'+path);page.wait_for_function('window.noemaExperimentReady === true');page.evaluate('document.fonts.ready');
            open('?panel=open');page.screenshot(path=str(output/'now-open-reference.png'))
            page.get_by_role('button',name='Close',exact=True).click();expect(page.get_by_role('dialog',name='Add task')).not_to_be_visible();page.screenshot(path=str(output/'now-closed-reference.png'))
            for width,height,label in [(1440,900,'desktop-1440'),(1280,800,'desktop-1280'),(390,844,'phone'),(1024,768,'tablet')]:
                page.set_viewport_size({'width':width,'height':height});page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(output/f'now-{label}.png'));assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),label
                page.get_by_role('button',name='Add something for later').click();page.screenshot(path=str(output/f'add-{label}.png'));assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');page.get_by_role('button',name='Close',exact=True).click()
            page.set_viewport_size({'width':1546,'height':835});page.get_by_role('button',name='Capture',exact=True).click();page.screenshot(path=str(output/'capture.png'));page.get_by_role('button',name='Notes',exact=True).click();page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(output/'note.png'),full_page=True)
            checks=[]
            if args.checks:
                open('?screen=Plan')
                def check(name):
                    checks.append(name)
                    (output/'checks-in-progress.json').write_text(json.dumps(checks,indent=2)+'\n')
                terrain=page.locator('.background-field');expect(terrain).to_have_attribute('data-state','animated')
                first=terrain.evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(450);assert terrain.evaluate('(c)=>c.toDataURL()')!=first
                page.emulate_media(reduced_motion='reduce');expect(terrain).to_have_attribute('data-state','static');first=terrain.evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(350);assert terrain.evaluate('(c)=>c.toDataURL()')==first
                page.emulate_media(reduced_motion='no-preference');page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
                expect(terrain).to_have_attribute('data-state','paused');first=terrain.evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(350);assert terrain.evaluate('(c)=>c.toDataURL()')==first
                page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");expect(terrain).to_have_attribute('data-state','animated')
                assert terrain.evaluate('(c)=>getComputedStyle(c).pointerEvents')=='none';check('Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input')
                page.get_by_role('button',name='Plan',exact=True).click();page.get_by_role('button',name='Add task',exact=True).click();field=page.get_by_label('What do you need to do?');expect(field).to_be_focused();field.fill('leetcode by tonight');field.press('Enter');assert field.input_value().endswith('\n');field.fill('leetcode by tonight');field.press('Escape');expect(page.get_by_role('dialog',name='Add task')).not_to_be_visible();page.reload();page.wait_for_function('window.noemaExperimentReady');page.get_by_role('button',name='Add task',exact=True).click();expect(field).to_have_value('leetcode by tonight');check('Task draft survives close and reload; initially focused; Enter inserts newline')
                field.press('Control+Enter');expect(page.get_by_role('dialog',name='Add task')).not_to_be_visible();expect(page.locator('.plan-list').get_by_role('button',name='Practice LeetCode',exact=False)).to_have_count(1);page.get_by_role('button',name='Edit',exact=True).click();expect(page.get_by_text('Explicit fixture interpretation',exact=True)).to_be_visible();expect(page.get_by_text('Deadline: Tonight · coarse demo label')).to_be_visible();expect(page.get_by_text('leetcode by tonight',exact=True)).to_be_visible();page.get_by_role('button',name='Done',exact=True).click();check('Fixture preserves raw input, coarse Tonight, provenance; returns to Plan with Edit')
                page.get_by_role('button',name='Now',exact=True).click()
                expect(page.get_by_role('region',name='Tasks')).to_contain_text('Practice LeetCode')
                expect(page.locator('.focus-copy')).to_contain_text('Inspect the allocator example')
                open('?screen=Now')
                expect(page.get_by_role('region',name='Tasks')).to_contain_text('Practice LeetCode')
                page.get_by_role('button',name='Add something for later').click()
                field.fill('Check the cleanup path')
                page.evaluate('window.scrollTo(0,0)')
                page.get_by_role('button',name='Add task',exact=True).click()
                expect(page.get_by_role('dialog',name='Add task')).not_to_be_visible()
                page.wait_for_timeout(100)
                assert page.evaluate('scrollY')==0,'Focus restoration scrolled the page after submission'
                expect(page.get_by_role('region',name='Tasks')).to_contain_text('Check the cleanup path')
                check('Mouse submission from Now reveals the new task without jumping the viewport')
                page.screenshot(path=str(output/'task-visible-on-now.png'))
                page.get_by_role('region',name='Tasks').locator('.overview-task-title').filter(has_text='Practice LeetCode').click()
                expect(page.get_by_text('leetcode by tonight',exact=True)).to_be_visible()
                page.get_by_role('button',name='Done',exact=True).click()
                check('Saved task is visible and reopenable from Now after reload; pin is preserved')
                open('?screen=Plan')
                page.get_by_label('Priority for Practice LeetCode').select_option('High');page.reload();page.wait_for_function('window.noemaExperimentReady');expect(page.get_by_label('Priority for Practice LeetCode')).to_have_value('High');check('Manual priority persists after reload')
                page.get_by_role('button',name='Add task',exact=True).click();field.fill('Compare memory layouts');page.get_by_role('button',name='Add task',exact=True).last.click();page.get_by_role('button',name='Edit',exact=True).click();expect(page.get_by_text('Interpretation unavailable',exact=True)).to_be_visible();page.get_by_role('button',name='Done',exact=True).click();check('Unsupported input saved with honest unavailable interpretation')
                # Attempted double submit with the same draft identity through actual DOM events.
                page.get_by_role('button',name='Add task',exact=True).click();field.fill('Idempotent example');page.locator('.task-panel form').evaluate('(f)=>{f.requestSubmit();f.requestSubmit()}');expect(page.get_by_role('dialog',name='Add task')).not_to_be_visible();expect(page.get_by_role('button',name='Idempotent example',exact=False)).to_have_count(1);check('Repeated submit does not duplicate task')
                page.get_by_role('button',name='Now',exact=True).click();expect(page.locator('.focus-copy')).to_contain_text('Inspect the allocator example');expect(page.get_by_role('region',name='What can I do next?')).to_be_visible();expect(page.get_by_role('region',name='Tasks')).to_be_visible();page.get_by_role('region',name='Tasks').get_by_role('button',name='Complete Idempotent example',exact=True).click();expect(page.get_by_role('button',name='Reopen Idempotent example',exact=True)).to_be_visible();open('?screen=Now');expect(page.get_by_role('button',name='Reopen Idempotent example',exact=True)).to_be_visible();check('Separate focus, next actions and Tasks; colored priorities and manual completion persist without changing pin')
                page.get_by_role('button',name='Capture',exact=True).click();capture=page.get_by_label('Rough learning note');capture.fill('A distinct learning note\nKeep the original intact.');page.locator('input[type=file]').set_input_files({'name':'example.png','mimeType':'image/png','buffer':(ROOT/'frontend/public/assets/cat.png').read_bytes()});expect(page.locator('.image-previews img')).to_have_count(1);page.screenshot(path=str(output/'capture-populated.png'));page.get_by_role('button',name='Save note',exact=True).click();expect(capture).to_have_value('');page.get_by_role('button',name='Notes',exact=True).click();expect(page.locator('.note-page')).to_contain_text('A distinct learning note');expect(page.locator('.embedded-image img')).to_have_count(1);page.get_by_role('button',name='Edit note',exact=True).click();page.get_by_label('Edit organized note').fill('Edited organized note');page.get_by_role('button',name='Save changes',exact=True).click();page.get_by_role('button',name='Original',exact=True).click();expect(page.locator('.note-text')).to_contain_text('Keep the original intact');page.get_by_role('button',name='Organized',exact=True).click();expect(page.locator('.note-text')).to_contain_text('Edited organized note');page.reload();page.wait_for_function('window.noemaExperimentReady');page.get_by_role('button',name='Notes',exact=True).click();page.get_by_role('button',name='A distinct learning note',exact=True).click();expect(page.locator('.note-text')).to_contain_text('Edited organized note');check('Image attachment preview, capture save, note edit/save/reopen, immutable original')
                page.get_by_role('button',name='Capture',exact=True).click();page.get_by_role('button',name='Voice demo',exact=True).click();page.get_by_role('button',name='Record demo',exact=True).click();page.get_by_role('button',name='Pause',exact=True).click();page.get_by_role('button',name='Stop',exact=True).click();page.get_by_role('button',name='Insert example transcript',exact=True).click();assert 'Keep ownership separate' in capture.input_value();check('Voice controls are explicitly simulated; no recording permission opened')
                page.get_by_role('button',name='Demo settings').click();expect(page.get_by_text('Desktop companion not connected',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Start observation')).to_be_disabled();page.get_by_label('Companion preview',exact=True).select_option('Dot');page.get_by_role('button',name='Close settings').click();page.reload();page.wait_for_function('window.noemaExperimentReady');page.get_by_role('button',name='Demo settings').click();expect(page.get_by_label('Companion preview',exact=True)).to_have_value('Dot');page.get_by_label('Companion preview',exact=True).select_option('Cat');page.get_by_role('button',name='Close settings').click();expect(page.locator('.cat-button')).to_have_count(0);check('Companion modes persist; browser reports no native connection and contains no kitten overlay')
                page.get_by_role('button',name='Now',exact=True).click();page.set_viewport_size({'width':1546,'height':835});page.get_by_role('button',name='Add something for later').click()
                expect(page.get_by_role('dialog',name='Add task')).to_have_attribute('aria-modal','false')
                page.set_viewport_size({'width':390,'height':844})
                expect(page.get_by_role('dialog',name='Add task')).to_have_attribute('aria-modal','true')
                field.fill('Keyboard demo');field.focus();field.press('Shift+Tab');page.get_by_role('button',name='Close Add task').focus();page.keyboard.press('Shift+Tab');expect(page.get_by_role('button',name='Add task',exact=True)).to_be_focused();page.keyboard.press('Tab');expect(page.get_by_role('button',name='Close Add task')).to_be_focused();page.keyboard.press('Escape');check('Open desktop panel becomes a modal on resize; narrow dialog traps Tab and Escape closes')
                page.set_viewport_size({'width':1440,'height':900});page.get_by_role('button',name='Add something for later').click();field.fill('Preserve on failure');page.evaluate("Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('Injected storage failure')}})");field.fill('Preserve on failure, with more text');page.get_by_role('button',name='Add task',exact=True).click()
                expect(page.get_by_role('dialog',name='Add task')).to_be_visible();expect(field).to_have_value('Preserve on failure, with more text');expect(page.get_by_role('dialog',name='Add task').get_by_role('alert')).to_contain_text('Task could not be added')
                page.screenshot(path=str(output/'task-save-error.png'))
                page.get_by_role('button',name='Close',exact=True).click();expect(page.get_by_role('dialog',name='Add task')).to_be_visible();expect(field).to_have_value('Preserve on failure, with more text');check('Failed submission reports an inline error, retains wording and refuses unsafe close')
                for state in ['empty','waiting','review','offline']:
                    open('?fixture='+state);assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');page.screenshot(path=str(output/f'fixture-{state}.png'))
                check('Empty, waiting, review and offline/unknown fixture states rendered')
            for width,height,label in [(390,844,'phone'),(1024,768,'tablet')]:
                page.set_viewport_size({'width':width,'height':height})
                for screen in ['Capture','Notes','Plan']:
                    open('?screen='+screen)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),screen+' '+label
                    page.screenshot(path=str(output/f'{screen.lower()}-{label}.png'),full_page=True)
            assert not errors,errors
            (output/'results.json').write_text(json.dumps({'engine':context.browser.version,'sandbox':True,'scale':1,'checks':checks,'runtime_errors':errors,'evidence':'Browser responsive, not desktop host/device evidence'},indent=2)+'\n')
            print(json.dumps({'screenshots':len(list(output.glob('*.png'))),'checks':len(checks),'engine':context.browser.version}))
            context.close()
    finally:
        server.terminate();server.wait(timeout=5)
if __name__=='__main__':main()
