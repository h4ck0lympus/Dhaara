import { writeFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { S } from '../src/strings';
import { blockIdbOpen, delayIdbTransactions, failIdbWrite } from './faults';
import { expect, gotoApp, readLocalDb, refetch, seedLocalDb, test } from './fixtures';
import { serverState } from './nowSeed';
import { MB, PNG, beforeUnloadArmed, expectPhoneFriendly, fakeMicrophonePage, navLink, persistentBrowser, readDraftFileBytes, waitForServiceWorker } from './screenTest';

const RAW = 'free_slot(0x1234) may leave a pointer. Not confirmed; changing size did not help.';   // native_storage_check.py:25

const editor = (page: Page) => page.getByLabel('Rough learning note');
const draftStatus = (page: Page) => page.locator('#draft-status');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save note' });
const localError = (page: Page) => page.locator('#local-save-error');
const notice = (page: Page) => page.locator('.saved-notice');
const goOffline = async (page: Page, context: BrowserContext) => {
  await context.setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();
};
const draftRaw = async (page: Page) => ((await readLocalDb(page)).draft as { raw: string }).raw;

test.describe('Capture', () => {
  test('Unsaved draft never ingested into server notebook', async ({ page, noema }) => {   // native_storage_check.py:166; handbook-trace R3
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill(RAW);
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    expect(await draftRaw(page)).toBe(RAW);
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Capture creates a learning note, never an automatic task', async ({ page, noema }) => {   // now_ui_check.py:163; handbook-trace R1
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Learning note: I am unsure about ownership. Not a commitment.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    expect((await serverState(noema)).tasks).toEqual([]);
  });

  test('Ordinary learning-note capture creates no task', async ({ page, noema }) => {   // task_capture_check.py:250
    await noema.api('POST', '/api/tasks', { title: 'Existing commitment' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Learning note: review tomorrow is an example, not a task commitment.');
    await saveButton(page).click();
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    expect((await serverState(noema)).tasks.map(task => task.title)).toEqual(['Existing commitment']);
  });

  test('Text and uploaded image commit together', async ({ page, noema }) => {   // browser_check.py:118-127
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('LeetCode trick: sorted input. two pointers, move left if the sum is small. not sure about duplicates yet.');
    await page.locator('input[type=file]').setInputFiles({ name: 'example.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'example.png' })).toBeVisible();
    await saveButton(page).click();
    await expect(notice(page)).toHaveAttribute('data-storage', 'server');
    const [note] = (await serverState(noema)).notes;
    const full = await noema.api<{ attachments: unknown[]; raw: string }>('GET', `/api/notes/${note.id}`);
    expect(full.attachments).toHaveLength(1);
    expect(full.raw).toContain('not sure');
  });

  test('After server acknowledgement Capture shows the title and folder with Open note and Change folder', async ({ page, noema }) => {   // handbook-trace U16
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('heap... maybe wrong\nfree_slot(0x1234);');
    await saveButton(page).click();
    await expect(notice(page)).toContainText('Saved on your server');
    const [note] = (await serverState(noema)).notes;
    await expect(notice(page)).toContainText(note.title);
    await expect(notice(page)).toContainText(note.folder);
    await notice(page).getByRole('button', { name: 'Change folder' }).click();
    await notice(page).getByLabel('Folder').fill('Security / Heap');
    await notice(page).getByRole('button', { name: 'Move' }).click();
    await expect(notice(page)).toContainText('Security / Heap');
    const full = await noema.api<{ version: number; raw: string; folder: string }>('GET', `/api/notes/${note.id}`);
    expect(full.folder).toBe('Security / Heap');
    expect(full.version).toBe(2);
    expect(full.raw).toBe('heap... maybe wrong\nfree_slot(0x1234);');
    await notice(page).getByRole('button', { name: 'Open note' }).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
  });

  test('While queued, Capture says the capture is on this device', async ({ page, noema, context }) => {   // handbook-trace U16; browser_check.py:136-141
    await gotoApp(page, noema, '#/capture');
    await goOffline(page, context);
    await editor(page).fill('Offline learning note. Keep my original.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect(page.getByRole('status').filter({ hasText: S.captureSavedOffline })).toBeVisible();
    await expect(notice(page)).toContainText('Queued on this device · not on your server yet');
    await expect(notice(page).getByRole('button', { name: 'Open note' })).toHaveCount(0);
    await expect(notice(page).getByRole('button', { name: 'Change folder' })).toHaveCount(0);
    expect((await readLocalDb(page)).outbox).toHaveLength(1);
    await context.setOffline(false);
    await expect(notice(page)).toContainText('Saved on your server');
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('Draft, queued and saved-on-server labels are distinct', async ({ page, noema, context }) => {   // handbook-trace U17
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('label check');
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    const device = await draftStatus(page).textContent();
    await goOffline(page, context);
    await saveButton(page).click();
    await expect(notice(page)).toHaveAttribute('data-storage', 'queued');
    const queued = await notice(page).locator('.storage-label').textContent();
    await context.setOffline(false);
    await expect(notice(page)).toHaveAttribute('data-storage', 'server');
    const server = await notice(page).locator('.storage-label').textContent();
    expect(new Set([device, queued, server]).size).toBe(3);
    expect(device).toBe('Draft on this device · not uploaded');
    expect(queued).toBe('Queued on this device · not on your server yet');
    expect(server).toBe('Saved on your server');
  });

  test('Capture text never moves under the cursor', async ({ page, noema }) => {   // handbook-trace U15; spec §8 Refetch
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('alpha beta gamma');
    await editor(page).evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(6, 6));
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    await refetch(page);
    await expect(editor(page)).toHaveValue('alpha beta gamma');
    await expect(editor(page)).toBeFocused();
    expect(await editor(page).evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([6, 6]);
    await page.keyboard.type('new ');
    await expect(editor(page)).toHaveValue('alpha new beta gamma');
    // No live preview copy of the text anywhere outside the editor (React mirrors a controlled textarea's value into its own text, so the editor and its ancestors are excluded).
    expect(await page.locator('.capture-screen').evaluate(root => {
      const writing = root.querySelector('textarea');
      return [...root.querySelectorAll('*')].some(element => !element.contains(writing) && (element.textContent ?? '').includes('alpha new beta gamma'));
    })).toBe(false);
  });

  test('Ctrl+Enter saves; plain Enter inserts a newline', async ({ page, noema }) => {   // spec §4.5 Keyboard
    await gotoApp(page, noema, '#/capture');
    await editor(page).click();
    await page.keyboard.type('line one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('line two');
    await expect(editor(page)).toHaveValue('line one\nline two');
    await page.keyboard.press('Control+Enter');
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
  });

  test('Ctrl+Enter during IME composition does not save', async ({ page, noema }) => {   // spec §4.5 "IME composition is respected"
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('かな');
    await editor(page).evaluate(element => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    await expect(editor(page)).toHaveValue('かな');
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('An empty Save is refused with the existing message and queues nothing', async ({ page, noema }) => {   // app.js:402
    await gotoApp(page, noema, '#/capture');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: S.writeSomething })).toBeVisible();
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('A save in flight blocks navigation', async ({ page, noema }) => {   // spec §8 Navigation guards
    await delayIdbTransactions(page, 1500);
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Saving slowly.');
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    await saveButton(page).click();
    await navLink(page, 'Notes').click();
    await expect(page.getByRole('status').filter({ hasText: S.finishingLocalSave })).toBeVisible();
    await expect(page).toHaveURL(/#\/capture$/);
    await expect(editor(page)).toHaveValue('');
    await navLink(page, 'Notes').click();
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('Phone capture has no horizontal overflow', async ({ page, noema }) => {   // browser_check.py:149-150
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('A quick thought from my phone with a_very_long_identifier_that_must_wrap_instead_of_overflowing_0x41414141');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Phone width uses bottom navigation and full-screen Capture', async ({ page, noema }) => {   // handbook-trace U10
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/capture');
    const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
    expect(nav.y + nav.height).toBeGreaterThan(844 - 100);
    expect(nav.width).toBeGreaterThan(300);
    expect((await editor(page).boundingBox())!.width).toBeGreaterThan(330);
    await expectPhoneFriendly(page, '.capture-screen');
  });
});

test.describe('Capture attachments and task link', () => {
  test('Rejects files that would fail on the server, each with its own message', async ({ page, noema }) => {   // spec §4.4 validation
    const big = test.info().outputPath('big.png');
    const a = test.info().outputPath('a.png');
    const b = test.info().outputPath('b.png');
    const padded = Buffer.concat([PNG, Buffer.alloc(31 * MB - PNG.length)]);   // decodable PNG plus trailing bytes
    writeFileSync(big, Buffer.alloc(32 * MB + 1));
    writeFileSync(a, padded);
    writeFileSync(b, padded);
    await gotoApp(page, noema, '#/capture');
    const picker = page.locator('input[type=file]');
    await expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/mpeg');
    await picker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByRole('alert').filter({ hasText: S.unsupportedType })).toBeVisible();
    await picker.setInputFiles(big);
    await expect(page.getByRole('alert').filter({ hasText: S.fileTooLarge('big.png') })).toBeVisible();
    await picker.setInputFiles([a, b]);
    await expect(page.getByRole('alert').filter({ hasText: S.totalTooLarge })).toBeVisible();
    await expect(page.locator('.attachment')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove a.png' }).click();
    await picker.setInputFiles(Array.from({ length: 13 }, (_, index) => ({ name: `p${index}.png`, mimeType: 'image/png', buffer: PNG })));
    await expect(page.getByRole('alert').filter({ hasText: S.tooManyFiles })).toBeVisible();
    await expect(page.locator('.attachment')).toHaveCount(12);
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('Paste and drop add images to the tray, and Remove takes one out', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    const bytes = [...PNG];
    await editor(page).evaluate((element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], 'pasted.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByRole('img', { name: 'pasted.png' })).toBeVisible();
    await page.locator('.writing-canvas').evaluate((element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], 'dropped.png', { type: 'image/png' }));
      element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByRole('img', { name: 'dropped.png' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove pasted.png' }).click();
    await expect(page.getByRole('img', { name: 'pasted.png' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'dropped.png' })).toBeVisible();
  });

  test('A capture can link to an open task as a small optional link', async ({ page, noema }) => {   // handbook-trace U19 (related task)
    const task = await noema.api<{ id: string }>('POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, noema, '#/capture');
    await page.getByLabel('Link to a task').selectOption({ label: 'Two Sum' });
    await editor(page).fill('two pointers after sorting');
    await saveButton(page).click();
    await expect(notice(page)).toContainText('Saved on your server');
    const state = await serverState(noema);
    expect(state.notes[0].task_id).toBe(task.id);
    expect(state.tasks).toHaveLength(1);
  });
});

test.describe('Capture on native browser storage', () => {
  test('Draft text and exact Blob bytes survive browser process restart', async ({ playwright, noema }) => {   // native_storage_check.py:175
    const errors: string[] = [];
    const profile = test.info().outputPath('profile');
    let context = await persistentBrowser(playwright.chromium, profile, errors);
    try {
      let page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await editor(page).fill(RAW);
      await page.locator('input[type=file]').setInputFiles({ name: 'heap.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      await expect(draftStatus(page)).toHaveText(S.draftSaved);
      await context.close();

      context = await persistentBrowser(playwright.chromium, profile, errors);
      page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await expect(editor(page)).toHaveValue(RAW);
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      expect((await readDraftFileBytes(page)).equals(PNG)).toBe(true);
      expect((await serverState(noema)).notes).toEqual([]);
    } finally {
      await context.close();
    }
    expect(errors).toEqual([]);
  });

  const SEEDED = { id: 'abort-draft-0001', raw: 'A draft that must survive an aborted Save.', task_id: '', files: [] };

  test('Aborted atomic Save keeps persisted draft and rolls back queue insertion', async ({ page, noema }) => {   // native_storage_check.py:215
    await seedLocalDb(page, noema.origin, { draft: SEEDED });
    await failIdbWrite(page, { store: 'outbox', key: SEEDED.id, error: 'AbortError' });
    await gotoApp(page, noema, '#/capture');
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    await saveButton(page).click();
    await expect(localError(page)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not save the capture: ' })).toBeVisible();
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    const local = await readLocalDb(page);
    expect(local.outbox).toEqual([]);
    expect((local.draft as { id: string; raw: string })).toMatchObject({ id: SEEDED.id, raw: SEEDED.raw });
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Reload recovers original draft after transaction abort', async ({ page, noema }) => {   // native_storage_check.py:218
    await seedLocalDb(page, noema.origin, { draft: SEEDED });
    await failIdbWrite(page, { store: 'outbox', key: SEEDED.id, error: 'AbortError' });
    await gotoApp(page, noema, '#/capture');
    await saveButton(page).click();
    await expect(localError(page)).toBeVisible();
    await page.reload();
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
  });

  test('Injected quota failure has persistent truthful UI and retains editor text', async ({ page, noema }) => {   // native_storage_check.py:230
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Exact unsaved edit after simulated quota failure.');
    await expect(localError(page)).toBeVisible();
    await expect(localError(page)).toContainText(S.localSaveErrorNotice);
    await expect(draftStatus(page)).toHaveText(S.draftError);
    await page.waitForTimeout(1000);
    await expect(localError(page)).toBeVisible();
    await expect(draftStatus(page)).toHaveText(S.draftError);
    await expect(editor(page)).toHaveValue('Exact unsaved edit after simulated quota failure.');
  });

  test('Recovery control fits phone viewport', async ({ page, noema }) => {   // native_storage_check.py:233
    await page.setViewportSize({ width: 390, height: 844 });
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Phone quota failure.');
    await expect(localError(page)).toBeVisible();
    await expect(page.getByRole('button', { name: S.retryLocalSave })).toBeInViewport();
    await expectPhoneFriendly(page, '#local-save-error');
  });

  test('Retry commits recovered edit through native IndexedDB', async ({ page, noema }) => {   // native_storage_check.py:238
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Exact unsaved edit after simulated quota failure.');
    await expect(localError(page)).toBeVisible();
    await page.getByRole('button', { name: S.retryLocalSave }).click();
    await expect(localError(page)).toBeHidden();
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    expect(await draftRaw(page)).toBe('Exact unsaved edit after simulated quota failure.');
  });

  test('Immediate Save cancels draft debounce without resurrecting a saved draft', async ({ page, noema }) => {   // native_storage_check.py:274
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Immediate Save before debounce: maybe not cleared, 0x4141.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    await page.waitForTimeout(500);   // longer than the 350 ms debounce
    await page.reload();
    await expect(editor(page)).toHaveValue('');
    expect(await draftRaw(page)).toBe('');
  });

  test('Unavailable storage at boot leaves editable UI and failed Save retains text', async ({ page, noema }) => {   // native_storage_check.py:287
    await blockIdbOpen(page);
    await gotoApp(page, noema, '#/capture');
    await expect(localError(page)).toBeVisible();
    await editor(page).fill('Still editable with storage unavailable.');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not save the capture: ' })).toBeVisible();
    await expect(editor(page)).toHaveValue('Still editable with storage unavailable.');
    expect((await serverState(noema)).notes).toEqual([]);
  });
});

test.describe('Offline Capture', () => {
  test('Offline capture remains queued in storage adapter', async ({ page, noema, context }) => {   // browser_check.py:136-139
    await gotoApp(page, noema, '#/capture');
    await goOffline(page, context);
    await editor(page).fill('Offline learning note. Keep my original.');
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: S.captureSavedOffline })).toBeVisible();
    const { outbox } = await readLocalDb(page);
    expect(outbox.map(item => item.raw)).toEqual(['Offline learning note. Keep my original.']);
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Service worker opens actual capture UI offline with last snapshot', async ({ page, noema, context }) => {   // native_storage_check.py:179
    await noema.api('POST', '/api/tasks', { title: 'Offline task from the last snapshot' });
    await gotoApp(page, noema, '#/capture');
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(page.getByText(S.offlineBanner(true, false))).toBeVisible();
    await expect(page.getByLabel('Link to a task').locator('option', { hasText: 'Offline task from the last snapshot' })).toHaveCount(1);
  });

  test('Explicit offline Save atomically queues original and resets stored draft', async ({ page, noema, context }) => {   // native_storage_check.py:184
    await gotoApp(page, noema, '#/capture');
    await goOffline(page, context);
    await editor(page).fill('free_slot(0x1234) may leave a pointer.');
    await expect(page.locator('#draft-status')).toHaveText(S.draftSaved);
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    const local = await readLocalDb(page);
    expect(local.outbox.map(item => item.raw)).toEqual(['free_slot(0x1234) may leave a pointer.']);
    expect((local.draft as { raw: string; id: string }).raw).toBe('');
    expect((local.draft as { id: string }).id).not.toBe(local.outbox[0].id);
  });

  test('Queued attachment capture survives offline browser restart', async ({ playwright, noema }) => {   // native_storage_check.py:193
    const errors: string[] = [];
    const profile = test.info().outputPath('profile');
    let context = await persistentBrowser(playwright.chromium, profile, errors);
    try {
      let page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await waitForServiceWorker(page);
      await goOffline(page, context);
      await editor(page).fill('Offline heap sketch');
      await page.locator('input[type=file]').setInputFiles({ name: 'heap.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      await saveButton(page).click();
      await expect(editor(page)).toHaveValue('');
      await expect.poll(async () => (await readLocalDb(page)).outbox.length).toBe(1);
      const [queued] = (await readLocalDb(page)).outbox;
      await context.close();

      context = await persistentBrowser(playwright.chromium, profile, errors);
      await context.setOffline(true);
      page = await context.newPage();
      await page.goto(`${noema.origin}/#/capture`);
      await expect(editor(page)).toBeVisible();
      const { outbox } = await readLocalDb(page);
      expect(outbox.map(item => [item.id, item.raw, item.fileCount])).toEqual([[queued.id, 'Offline heap sketch', 1]]);
      expect((await serverState(noema)).notes).toEqual([]);
    } finally {
      await context.close();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Sketch', () => {
  test('Sketch offers pen, eraser, undo and a text tool', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    await page.getByRole('button', { name: 'Sketch' }).click();
    const dialog = page.getByRole('dialog', { name: 'A quick sketch' });
    await expect(dialog.getByText('Draw while you talk. Your recording continues.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add to capture' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draw something first.' })).toBeVisible();

    const canvas = dialog.getByLabel('Drawing canvas');
    const box = (await canvas.boundingBox())!;
    const inkIn = (x0: number, y0: number, x1: number, y1: number) => canvas.evaluate((element: HTMLCanvasElement, area) => {
      const scale = element.width / element.getBoundingClientRect().width;
      const [ax, ay, bx, by] = area.map(value => Math.round(value * scale));
      const pixels = element.getContext('2d')!.getImageData(ax, ay, Math.max(1, bx - ax), Math.max(1, by - ay)).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
      return false;
    }, [x0, y0, x1, y1]);
    const stroke = async (y: number) => {
      await page.mouse.move(box.x + 20, box.y + y);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + y, { steps: 8 });
      await page.mouse.up();
    };

    await stroke(60);
    expect(await inkIn(90, 58, 110, 62)).toBe(true);
    await dialog.getByRole('button', { name: 'Undo' }).click();
    expect(await inkIn(90, 58, 110, 62)).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await stroke(60);
    await dialog.getByRole('button', { name: 'Eraser' }).click();
    await expect(dialog.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'false');
    await stroke(60);
    expect(await inkIn(90, 58, 110, 62)).toBe(false);

    await dialog.getByRole('button', { name: 'Text' }).click();
    await dialog.getByLabel('Sketch text').fill('ptr');
    const shifted = (await canvas.boundingBox())!;   // the text input shifts the layout
    await page.mouse.click(shifted.x + 60, shifted.y + 150);
    expect(await inkIn(60, 134, 100, 152)).toBe(true);

    await dialog.getByRole('button', { name: 'Add to capture' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('img', { name: 'sketch.png' })).toBeVisible();
    const draft = (await readLocalDb(page)).draft as { files: { name: string }[] };
    expect(draft.files.map(file => file.name)).toEqual(['sketch.png']);
  });
});

test.describe('Capture recording', () => {
  test('Capture has one writing surface, a mic/image/sketch toolbar and one Save note action', async ({ page, noema }) => {   // handbook-trace U13
    await gotoApp(page, noema, '#/capture');
    const screen = page.locator('.capture-screen');
    await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Capture a thought.');
    await expect(screen.getByText('A quiet place for the rough edges.')).toBeVisible();
    await expect(screen.getByRole('textbox')).toHaveCount(1);
    await expect(screen.getByLabel(/title|folder/i)).toHaveCount(0);
    for (const name of ['Record a thought', 'Image', 'Sketch']) await expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Save note' })).toHaveCount(1);
    await expect(screen.getByRole('button', { name: 'Save note' })).toHaveText('Save note ↗');
    await expect(screen.getByRole('group', { name: 'Visuals & recordings' })).toBeVisible();
    await expect(draftStatus(page)).toHaveText(S.draftMemory);
  });

  test('No microphone permission is requested before Record', async ({ playwright, noema }) => {   // handbook-trace R9
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(playwright.chromium, errors);
    try {
      await page.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const counter = window as unknown as { micRequests: number };
        counter.micRequests = 0;
        navigator.mediaDevices.getUserMedia = constraints => {
          counter.micRequests += 1;
          return original(constraints);
        };
      });
      await gotoApp(page, noema, '#/capture');
      await expect(page.getByText('Audio stays local until you save.')).toBeVisible();
      await editor(page).fill('typing never opens the microphone');
      expect(await page.evaluate('window.micRequests')).toBe(0);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('group', { name: 'Recording', exact: true })).toBeVisible();
      expect(await page.evaluate('window.micRequests')).toBe(1);
      await page.getByRole('button', { name: 'Stop' }).click();
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Recording shows elapsed time, Pause/Resume and Stop; paused is labelled distinctly', async ({ playwright, noema }) => {   // handbook-trace U14
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(playwright.chromium, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      await page.getByRole('button', { name: 'Record' }).click();
      const controls = page.getByRole('group', { name: 'Recording', exact: true });
      await expect(controls).toHaveAttribute('data-phase', 'recording');
      await expect(controls.locator('.recording-phase')).toHaveText('Recording');
      await expect(controls.locator('.recording-elapsed')).not.toHaveText('0:00', { timeout: 3000 });
      await controls.getByRole('button', { name: 'Pause' }).click();
      await expect(controls).toHaveAttribute('data-phase', 'paused');
      await expect(controls.locator('.recording-phase')).toHaveText('Paused');
      await expect(controls.getByRole('button', { name: 'Resume' })).toBeVisible();
      const frozen = await controls.locator('.recording-elapsed').textContent();
      await page.waitForTimeout(1500);
      await expect(controls.locator('.recording-elapsed')).toHaveText(frozen!);
      expect(await controls.evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('dashed');
      await controls.getByRole('button', { name: 'Resume' }).click();
      await expect(controls.locator('.recording-phase')).toHaveText('Recording');
      expect(await controls.evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('solid');
      await controls.getByRole('button', { name: 'Stop' }).click();
      await expect(controls).toBeHidden();
      await expect(page.getByText('Recording added. Save when ready.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Record another thought' })).toBeVisible();
      await expect(page.locator('.attachment audio')).toHaveCount(1);
      await expect(page.locator('.attachment-name')).toHaveText(/^voice-.*\.webm$/);
      await saveButton(page).click();
      await expect(notice(page)).toContainText('Saved on your server');
      const [note] = (await serverState(noema)).notes;
      const full = await noema.api<{ attachments: { mime: string }[] }>('GET', `/api/notes/${note.id}`);
      expect(full.attachments.map(attachment => attachment.mime)).toEqual(['audio/webm']);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Visual tray stays usable while recording', async ({ playwright, noema }) => {   // handbook-trace U14
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(playwright.chromium, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      await page.getByRole('button', { name: 'Record' }).click();
      const controls = page.getByRole('group', { name: 'Recording', exact: true });
      await expect(controls).toBeVisible();
      await page.locator('input[type=file]').setInputFiles({ name: 'while-recording.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'while-recording.png' })).toBeVisible();
      await page.getByRole('button', { name: 'Sketch' }).click();
      await expect(page.getByRole('dialog', { name: 'A quick sketch' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'A quick sketch' })).toBeHidden();
      await expect(controls).toHaveAttribute('data-phase', 'recording');
      await controls.getByRole('button', { name: 'Stop' }).click();
      await expect(page.locator('.attachment')).toHaveCount(2);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Save, navigation and unload are refused while recording', async ({ playwright, noema }) => {   // spec §4.5 guards
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(playwright.chromium, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      expect(await beforeUnloadArmed(page)).toBe(false);
      await editor(page).fill('thinking aloud');
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('group', { name: 'Recording', exact: true })).toBeVisible();
      await saveButton(page).click();
      await expect(page.getByRole('status').filter({ hasText: S.stopRecordingBeforeSaving })).toBeVisible();
      expect((await readLocalDb(page)).outbox).toEqual([]);
      await navLink(page, 'Notes').click();
      await expect(page.getByRole('status').filter({ hasText: S.stopRecordingBeforeLeaving })).toBeVisible();
      await expect(page).toHaveURL(/#\/capture$/);
      expect(await beforeUnloadArmed(page)).toBe(true);
      await page.getByRole('button', { name: 'Stop' }).click();
      await expect(page.getByRole('group', { name: 'Recording', exact: true })).toBeHidden();
      expect(await beforeUnloadArmed(page)).toBe(false);
      await navLink(page, 'Notes').click();
      await expect(page).toHaveURL(/#\/notes$/);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });
});
