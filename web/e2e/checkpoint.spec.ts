import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { delayIdbTransactions, failIdbWrite, stubIpc } from './faults';
import { expect, gotoApp, readLocalDb, test } from './fixtures';
import { createNote, navLink } from './screenTest';

const requestClose = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event('noema:checkpoint-close')); });
const ipcMessages = (page: Page) => page.evaluate(() => (window as unknown as { __ipcMessages?: string[] }).__ipcMessages ?? []);
const editor = (page: Page) => page.getByLabel('Rough learning note');

async function startSlowSave(page: Page): Promise<void> {
  await editor(page).fill('saving slowly');
  await expect(page.locator('#draft-status')).toHaveText(S.draftSaved);
  await page.getByRole('button', { name: 'Save note' }).click();
}

test.describe('Close checkpoint', () => {
  test('The checkpoint saves a draft typed just before closing', async ({ page, noema }) => {
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    expect(await page.evaluate(() => window.__noemaCheckpointCloseReady)).toBe(true);
    await editor(page).fill('typed right before closing');
    await requestClose(page);
    await expect.poll(() => ipcMessages(page)).toEqual(['noema:close-approved']);
    expect(((await readLocalDb(page)).draft as { raw: string }).raw).toBe('typed right before closing');
  });

  test('A save in flight keeps the window open', async ({ page, noema }) => {
    await delayIdbTransactions(page, 1500);
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    await startSlowSave(page);
    await requestClose(page);
    await expect(page.getByRole('status').filter({ hasText: S.closeSaveInFlight })).toBeVisible();
    expect(await ipcMessages(page)).toEqual([]);
  });

  test('A save in flight blocks navigation', async ({ page, noema }) => {
    await delayIdbTransactions(page, 1500);
    await gotoApp(page, noema, '#/capture');
    await startSlowSave(page);
    await navLink(page, 'Notes').click();
    await expect(page.getByRole('status').filter({ hasText: S.finishingLocalSave })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#/capture');
  });

  test('A draft-write failure asks for confirmation', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'kv', key: 'draft', times: 10, error: 'QuotaExceededError' });
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('cannot be stored');
    await expect(page.locator('#draft-status')).toHaveText(S.draftError);
    const declined = page.waitForEvent('dialog').then(async prompt => { expect(prompt.message()).toBe(S.closeDraftFailed); await prompt.dismiss(); });
    await requestClose(page);
    await declined;
    await page.waitForTimeout(200);
    expect(await ipcMessages(page)).toEqual([]);
    await expect(editor(page)).toHaveValue('cannot be stored');
    const accepted = page.waitForEvent('dialog').then(prompt => prompt.accept());
    await requestClose(page);
    await accepted;
    await expect.poll(() => ipcMessages(page)).toEqual(['noema:close-approved']);
  });

  test('An unsaved note edit asks before closing; declining keeps the edit', async ({ page, noema }) => {
    const note = await createNote(noema, 'note under edit');
    await stubIpc(page);
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note', { exact: true }).fill('half-finished edit');
    const declined = page.waitForEvent('dialog').then(async prompt => { expect(prompt.message()).toBe(S.closeConfirm); await prompt.dismiss(); });
    await requestClose(page);
    await declined;
    await page.waitForTimeout(200);
    expect(await ipcMessages(page)).toEqual([]);
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('half-finished edit');
  });

  test('An ordinary browser never marks itself ready for the desktop close', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    expect(await page.evaluate(() => window.__noemaCheckpointCloseReady)).toBeUndefined();
  });

  test('A failed chunk load after an update saves the draft, then offers Reload', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('kept across the update');
    await page.evaluate(() => { window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })); });
    const offer = page.getByRole('status').filter({ hasText: S.updateReady });
    await expect(offer).toBeVisible();
    await expect(offer.getByRole('button', { name: S.reload })).toBeVisible();
    expect(((await readLocalDb(page)).draft as { raw: string }).raw).toBe('kept across the update');
  });
});
