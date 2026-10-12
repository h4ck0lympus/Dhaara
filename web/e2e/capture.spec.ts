import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { blockIdbOpen, delayIdbTransactions, failIdbWrite } from './faults';
import { expect, gotoApp, readLocalDb, refetch, seedLocalDb, test } from './fixtures';
import { serverState } from './nowSeed';
import { MB, PNG, expectPhoneFriendly, navLink, persistentBrowser, readDraftFileBytes, waitForServiceWorker } from './screenTest';

const RAW = 'free_slot(0x1234) may leave a pointer. Not confirmed; changing size did not help.';   // native_storage_check.py:25

const editor = (page: Page) => page.getByLabel('Rough learning note');
const draftStatus = (page: Page) => page.locator('#draft-status');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save note' });
const localError = (page: Page) => page.locator('#local-save-error');
const notice = (page: Page) => page.locator('.saved-notice');
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
    await context.setOffline(true);
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
    await context.setOffline(true);
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
    await context.setOffline(true);
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
    await context.setOffline(true);
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
      await context.setOffline(true);
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
