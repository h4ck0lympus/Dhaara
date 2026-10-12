import type { Page } from '@playwright/test';
import { failFetch } from './faults';
import { expect, gotoApp, test } from './fixtures';
import { createNote, editNote, expectPhoneFriendly } from './screenTest';

const rows = (page: Page) => page.locator('.note-row');
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' });

test.describe('Notes list', () => {
  test('Notes opens on search and recent notes', async ({ page, noema }) => {
    const older = await createNote(noema, 'heap slot cleanup observation');
    const newer = await createNote(noema, 'two pointers on sorted input');
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A place to return to.');
    await expect(page.getByText('Your notes, with their original thinking intact.')).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recent notes' })).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText(newer.title);
    await expect(rows(page).nth(1)).toContainText(older.title);
    await rows(page).nth(0).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${newer.id}$`));
  });

  test('Search waits 300 ms and uses the server, which also matches the original wording', async ({ page, noema }) => {
    const target = await createNote(noema, 'zebra pointer');
    await editNote(noema, target, { title: 'Pointer note', body: 'Rewritten body' });
    await createNote(noema, 'heap slot cleanup');
    await gotoApp(page, noema, '#/notes');
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/search')) requests.push(request.url()); });
    await searchBox(page).pressSequentially('zebra', { delay: 40 });
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Pointer note');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('q=zebra');
    await expect(searchBox(page)).toHaveAttribute('maxlength', '500');
  });

  test('Search falls back to title and folder matches on this device when the server search fails', async ({ page, noema }) => {
    // Both searches below must fail; a single-use fault would let the second one reach the real server.
    await failFetch(page, { path: /\/api\/search/, times: 10, fault: { status: 400, body: '{"detail":"Search failed"}', contentType: 'application/json' } });
    const note = await createNote(noema, 'zebra pointer');
    await editNote(noema, note, { title: 'Pointer note' });
    await gotoApp(page, noema, '#/notes');
    await searchBox(page).fill('pointer');
    await expect(page.getByText('Server search is unavailable. Showing title and folder matches on this device.')).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await searchBox(page).fill('zebra');
    await expect(page.getByText('No matching notes.')).toBeVisible();
  });

  test('Desktop width shows a narrow folder pane that filters the list', async ({ page, noema }) => {
    await editNote(noema, await createNote(noema, 'first'), { folder: 'Security / CTFs' });
    await editNote(noema, await createNote(noema, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page, noema, '#/notes');
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(pane).toBeVisible();
    await expect(page.getByLabel('Folder', { exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await pane.getByRole('button', { name: 'Security / CTFs' }).click();
    await expect(pane.getByRole('button', { name: 'Security / CTFs' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Security / CTFs');
  });

  test('Tablet width shows a collapsible folder pane in Notes', async ({ page, noema }) => {
    await createNote(noema, 'first');
    await page.setViewportSize({ width: 900, height: 700 });
    await gotoApp(page, noema, '#/notes');
    const toggle = page.getByRole('button', { name: 'Folders' });
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pane).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(pane).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
  });

  test('Phone width replaces the folder pane with a compact selector', async ({ page, noema }) => {
    await editNote(noema, await createNote(noema, 'first'), { folder: 'Security / CTFs' });
    await editNote(noema, await createNote(noema, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await page.getByLabel('Folder', { exact: true }).selectOption('Programming / Algorithms');
    await expect(rows(page)).toHaveCount(1);
    await expectPhoneFriendly(page, '.notes-screen');
  });

  test('Portrait tablet collapses to the single phone column', async ({ page, noema }) => {   // handbook-trace U12
    const note = await createNote(noema, 'portrait reading');
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await expect(page.getByLabel('Folder', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole('region', { name: 'Recent notes' }).boundingBox())!.width).toBeGreaterThan(768 * 0.85);
    await expect(rows(page)).toContainText(note.title);
  });
});
