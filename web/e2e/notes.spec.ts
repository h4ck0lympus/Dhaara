import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { failFetch } from './faults';
import { expect, gotoApp, refetch, test } from './fixtures';
import type { DharaServer } from './server';
import { PNG, WAV, beforeUnloadArmed, createNote, editNote, expectPhoneFriendly, seedSuggestion } from './screenTest';
import { S } from '../src/strings';

const rows = (page: Page) => page.locator('.note-row');
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' });

test.describe('Notes list', () => {
  test('Notes opens on search and recent notes', async ({ page, dhara }) => {
    const older = await createNote(dhara, 'heap slot cleanup observation');
    const newer = await createNote(dhara, 'two pointers on sorted input');
    await gotoApp(page, dhara, '#/notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notes');
    await expect(page.getByText('Your knowledge, with its original thinking intact.')).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recent notes' })).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText(newer.title);
    await expect(rows(page).nth(1)).toContainText(older.title);
    await rows(page).nth(0).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${newer.id}$`));
  });

  test('Search waits 300 ms and uses the server, which also matches the original wording', async ({ page, dhara }) => {
    const target = await createNote(dhara, 'zebra pointer');
    await editNote(dhara, target, { title: 'Pointer note', body: 'Rewritten body' });
    await createNote(dhara, 'heap slot cleanup');
    await gotoApp(page, dhara, '#/notes');
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/search')) requests.push(request.url()); });
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    for (const text of ['z', 'ze', 'zeb', 'zebr', 'zebra']) {
      await searchBox(page).fill(text);
      await page.clock.runFor(40);
    }
    await page.clock.runFor(259);
    expect(requests).toHaveLength(0);
    await page.clock.runFor(1);
    await page.clock.resume();
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Pointer note');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('q=zebra');
    await expect(searchBox(page)).toHaveAttribute('maxlength', '500');
  });

  test('Search falls back to title and folder matches on this device when the server search fails', async ({ page, dhara }) => {
    await failFetch(page, { path: /\/api\/search/, times: 10, fault: { status: 400, body: '{"detail":"Search failed"}', contentType: 'application/json' } });
    const note = await createNote(dhara, 'zebra pointer');
    await editNote(dhara, note, { title: 'Pointer note' });
    await gotoApp(page, dhara, '#/notes');
    await searchBox(page).fill('pointer');
    await expect(page.getByText('Server search is unavailable. Showing title and folder matches on this device.')).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await searchBox(page).fill('zebra');
    await expect(page.getByText('No matching notes.')).toBeVisible();
  });

  test('Desktop width shows a narrow folder pane that filters the list', async ({ page, dhara }) => {
    await editNote(dhara, await createNote(dhara, 'first'), { folder: 'Security / CTFs' });
    await editNote(dhara, await createNote(dhara, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page, dhara, '#/notes');
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(pane).toBeVisible();
    await expect(page.getByLabel('Folder', { exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await pane.getByRole('button', { name: 'Security / CTFs' }).click();
    await expect(pane.getByRole('button', { name: 'Security / CTFs' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Security / CTFs');
  });

  test('Tablet width shows a collapsible folder pane in Notes', async ({ page, dhara }) => {
    await createNote(dhara, 'first');
    await page.setViewportSize({ width: 900, height: 700 });
    await gotoApp(page, dhara, '#/notes');
    const toggle = page.getByRole('button', { name: 'Folders' });
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pane).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(pane).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
  });

  test('Phone width replaces the folder pane with a compact selector', async ({ page, dhara }) => {
    await editNote(dhara, await createNote(dhara, 'first'), { folder: 'Security / CTFs' });
    await editNote(dhara, await createNote(dhara, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, dhara, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await page.getByLabel('Folder', { exact: true }).selectOption('Programming / Algorithms');
    await expect(rows(page)).toHaveCount(1);
    await expectPhoneFriendly(page, '.notes-screen');
  });

  test('Portrait tablet collapses to the single phone column', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'portrait reading');
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoApp(page, dhara, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await expect(page.getByLabel('Folder', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole('region', { name: 'Recent notes' }).boundingBox())!.width).toBeGreaterThan(768 * 0.85);
    await expect(rows(page)).toContainText(note.title);
  });
});

test.describe('Note view', () => {
  const noteField = (page: Page) => page.getByLabel('Note', { exact: true });

  async function editAndSave(page: Page, title: string, body: string) {
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill(title);
    await noteField(page).fill(body);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }

  test('Note edits create revision and retain raw text', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'LeetCode trick: two pointers. not sure about duplicates yet.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await editAndSave(page, 'Two pointers — personal insight', 'My edited note. Still unsure about duplicates.');
    await expect(page.getByRole('status').filter({ hasText: 'Revision saved. The original is unchanged.' })).toBeVisible();
    const full = await dhara.api<{ version: number; raw: string; body: string }>('GET', `/api/notes/${note.id}`);
    expect(full.version).toBe(2);
    expect(full.raw).toBe(note.raw);
    expect(full.body).toBe('My edited note. Still unsure about duplicates.');
  });

  test('Ctrl+Z in the note editor undoes typing', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'undo me');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await noteField(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and more words');
    await expect(noteField(page)).toHaveValue('undo me and more words');
    for (let step = 0; step < 15; step += 1) await page.keyboard.press('Control+z');
    await expect(noteField(page)).toHaveValue('undo me');
  });

  test('Original tab shows untouched capture', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'LeetCode trick: two pointers. not sure about duplicates yet.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await editAndSave(page, 'Two pointers — personal insight', 'My edited note.');
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.original-block')).toHaveText('LeetCode trick: two pointers. not sure about duplicates yet.');
    await expect(page.locator('.note-body')).toHaveCount(0);
  });

  test('Note renderer does not execute untrusted HTML', async ({ page, dhara }) => {
    const hostile = '<img src=x onerror="window.pwned=1">\n<script>window.pwned=2</script>';
    const note = await createNote(dhara, hostile);
    seedSuggestion(dhara, note.id, { id: 'sugg-0001', title: 'Model title', body: '<img src=y onerror="window.pwned=3"> **bold**', folder: 'Inbox' });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await expect(page.locator('.note-body').first()).toContainText('<img src=x onerror="window.pwned=1">');
    await page.locator('details.suggestion summary').click();
    await expect(page.locator('details.suggestion')).toContainText('<img src=y');
    await expect(page.locator('details.suggestion strong')).toHaveText('bold');
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toContainText('<script>window.pwned=2</script>');
    expect(await page.evaluate('window.pwned')).toBeUndefined();
    await expect(page.locator('.note-screen img')).toHaveCount(0);
  });

  test('Applying a suggestion keeps the edit history and says Nothing was overwritten', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'heap slot raw thought');
    const edited = await editNote(dhara, note, { title: 'My heap note', body: 'my manual body' });
    seedSuggestion(dhara, note.id, { id: 'sugg-0002', title: 'Organized heap note', body: 'Clean body', folder: 'Security / CTFs' });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    const suggestion = page.locator('details.suggestion');
    await expect(suggestion.locator('summary')).toHaveText('An AI suggestion arrived after your edit. Nothing was overwritten.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(edited.title);
    await expect(page.locator('.note-body').first()).toContainText('my manual body');
    await suggestion.locator('summary').click();
    await suggestion.getByRole('button', { name: 'Use this version' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organized heap note');
    const full = await dhara.api<{ raw: string; version: number; suggestions: unknown[] }>('GET', `/api/notes/${note.id}`);
    expect(full.raw).toBe('heap slot raw thought');
    expect(full.version).toBe(3);
    expect(full.suggestions).toEqual([]);
    const history = await dhara.api<{ version: number; body: string }[]>('GET', `/api/notes/${note.id}/history`);
    expect(history.map(revision => revision.version)).toEqual([3, 2, 1]);
    expect(history.find(revision => revision.version === 2)?.body).toBe('my manual body');
  });

  test('Image attachment preview, capture save, note edit/save/reopen, immutable original', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/capture');
    const capture = page.getByLabel('Rough learning note');
    await capture.fill('A distinct learning note\nKeep the original intact.');
    await page.locator('input[type=file]').setInputFiles({ name: 'example.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.attachment img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(capture).toHaveValue('');
    await expect(page.locator('.saved-notice')).toContainText('Saved on your server');
    await page.locator('.saved-notice').getByRole('button', { name: 'Open note' }).click();
    await expect(page.locator('.note-page')).toContainText('A distinct learning note');
    await expect(page.locator('.embedded-image img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit' }).click();
    await noteField(page).fill('Edited organized note');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toContainText('Keep the original intact.');
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await expect(page.locator('.note-body').first()).toContainText('Edited organized note');
    await page.reload();
    await expect(page.locator('.note-body').first()).toContainText('Edited organized note');
  });

  test('Attachments display from the server; Organize and Transcribe report that local AI is off', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'with visuals', [
      { name: 'diagram.png', type: 'image/png', bytes: PNG },
      { name: 'voice.wav', type: 'audio/wav', bytes: WAV },
    ]);
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await expect(page.getByRole('img', { name: 'diagram.png' })).toHaveAttribute('src', /^\/api\/attachments\//);
    await expect(page.locator('.note-visuals audio')).toHaveCount(1);
    await page.getByRole('button', { name: 'Organize with local AI' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'AI cleanup is off.' })).toBeVisible();
    await page.getByRole('button', { name: 'Transcribe recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Transcription is off.' })).toBeVisible();
    expect((await dhara.api<{ version: number }>('GET', `/api/notes/${note.id}`)).version).toBe(1);
  });

  test('Export Markdown downloads the note built on the device', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'export <b>me</b> please');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Markdown' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${note.title.replace(/[^\w -]/g, '').slice(0, 70) || 'note'}.md`);
    expect(readFileSync((await file.path())!, 'utf8')).toBe(`# ${note.title}\n\nFolder: ${note.folder}\n\n${note.body}\n`);
  });

  const CONFLICT = 'This note changed on the server. Your edits were not overwritten — Reload latest replaces them with the newest version; Keep editing keeps them.';

  async function conflictedEdit(page: Page, dhara: DharaServer) {
    const note = await createNote(dhara, 'conflict base');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('My unsaved title');
    await noteField(page).fill('My unsaved body');
    await editNote(dhara, note, { title: 'Changed elsewhere', body: 'Other device body' });
    await refetch(page);
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    await expect(noteField(page)).toHaveValue('My unsaved body');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const conflict = page.locator('.note-form [role=alert]');
    await expect(conflict).toContainText(CONFLICT);
    await expect(page.locator('.latest-version')).toContainText('Changed elsewhere');
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    return { note, conflict };
  }

  test('A conflicting save never overwrites; Keep editing stays stale and a later Save conflicts again', async ({ page, dhara }) => {
    const { note, conflict } = await conflictedEdit(page, dhara);
    await conflict.getByRole('button', { name: 'Keep editing' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(noteField(page)).toHaveValue('My unsaved body');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.note-form [role=alert]')).toContainText(CONFLICT);
    const full = await dhara.api<{ title: string; version: number }>('GET', `/api/notes/${note.id}`);
    expect(full).toMatchObject({ title: 'Changed elsewhere', version: 2 });
  });

  test('Reload latest asks first; declining keeps the draft, accepting loads the other revision', async ({ page, dhara }) => {
    const { note, conflict } = await conflictedEdit(page, dhara);
    page.once('dialog', prompt => void prompt.dismiss());
    await conflict.getByRole('button', { name: 'Reload latest' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    page.once('dialog', prompt => void prompt.accept());
    await page.locator('.note-form [role=alert]').getByRole('button', { name: 'Reload latest' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Changed elsewhere');
    await expect(noteField(page)).toHaveValue('Other device body');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Changed elsewhere');
    expect((await dhara.api<{ version: number }>('GET', `/api/notes/${note.id}`)).version).toBe(3);
  });

  test('Leaving an unsaved note edit asks first; declining keeps the edit', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'guard me');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    expect(await beforeUnloadArmed(page)).toBe(false);
    await page.getByRole('button', { name: 'Edit' }).click();
    await noteField(page).fill('unsaved words');
    expect(await beforeUnloadArmed(page)).toBe(true);
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.leaveNoteEdit); void prompt.dismiss(); });
    await page.getByRole('link', { name: '← All notes', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
    await expect(noteField(page)).toHaveValue('unsaved words');
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.leaveNoteEdit); void prompt.dismiss(); });
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(noteField(page)).toHaveValue('unsaved words');
    page.once('dialog', prompt => void prompt.accept());
    await page.getByRole('link', { name: '← All notes', exact: true }).click();
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('A missing note says so', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/note/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Note unavailable');
    await expect(page.getByText('Note not found')).toBeVisible();
  });

  test('Phone width gives the open note the full content area', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'phone reading with a_very_long_identifier_0x4141414141414141414141414141');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(note.title);
    expect((await page.locator('.note-page').boundingBox())!.width).toBeGreaterThan(390 * 0.85);
    await expectPhoneFriendly(page, '.note-screen');
  });
});

test.describe('Note history', () => {
  const historyDialog = (page: Page) => page.getByRole('dialog', { name: 'Note history' });
  const restoreButton = { name: 'Restore as a new revision' };

  test('Original and History are tabs beside the note', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'tab layout');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    const tabs = page.getByRole('group', { name: 'Note views' });
    await expect(tabs.getByRole('button')).toHaveText(['Note', 'Original', 'History']);
    await tabs.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toBeVisible();
    await expect(page.locator('.note-body')).toHaveCount(0);
    await tabs.getByRole('button', { name: 'History' }).click();
    await expect(historyDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(historyDialog(page)).toBeHidden();
    await expect(page.locator('.original-block')).toBeVisible();
  });

  test('History restore adds another revision', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'original raw words');
    await editNote(dhara, note, { title: 'Edited title', body: 'edited body' });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    const current = dialog.getByRole('listitem').filter({ hasText: 'Version 2 · manual' });
    await expect(current).toBeVisible();
    await expect(current.getByRole('button', restoreButton)).toHaveCount(0);
    await dialog.getByRole('listitem').filter({ hasText: 'Version 1' }).getByRole('button', restoreButton).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Restored as a new revision.' })).toBeVisible();
    const full = await dhara.api<{ version: number; body: string; raw: string }>('GET', `/api/notes/${note.id}`);
    expect(full.version).toBe(3);
    expect(full.body).toBe(full.raw);
    const history = await dhara.api<{ version: number }[]>('GET', `/api/notes/${note.id}/history`);
    expect(history.map(revision => revision.version)).toEqual([3, 2, 1]);
  });

  test('Revision previews render untrusted HTML as text', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'safe base');
    await editNote(dhara, note, { body: '<img src=z onerror="window.pwned=4">' });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    await dialog.getByRole('listitem').filter({ hasText: 'Version 2' }).locator('summary').click();
    await expect(dialog).toContainText('<img src=z onerror="window.pwned=4">');
    expect(await page.evaluate('window.pwned')).toBeUndefined();
  });

  test('A restore against a changed note shows the conflict and changes nothing', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'base words');
    const second = await editNote(dhara, note, { body: 'second' });
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Version 2' })).toBeVisible();
    await editNote(dhara, second, { body: 'third from another device' });
    await dialog.getByRole('listitem').filter({ hasText: 'Version 1' }).getByRole('button', restoreButton).click();
    await expect(dialog.getByRole('alert')).toContainText('This note changed on another screen.');
    expect((await dhara.api<{ body: string }>('GET', `/api/notes/${note.id}`)).body).toBe('third from another device');
  });
});
