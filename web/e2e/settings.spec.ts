import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { expect, gotoApp, refetch, test } from './fixtures';
import { createNote, navLink, openRuntimeLink } from './screenTest';
import { serverState } from './nowSeed';
import type { DharaServer } from './server';

type SettingsBody = { settings: { display_name: string; observation_enabled: boolean; motion: boolean; companion: string; companion_size: number } };
const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const serverBody = (dhara: DharaServer) => dhara.api<SettingsBody>('GET', '/api/state');
const serverSettings = async (dhara: DharaServer) => (await serverBody(dhara)).settings;
const navSettings = (page: Page) => page.locator('aside.sidebar').getByRole('button', { name: 'Settings' });

test.describe('Settings', () => {
  test('Display name edited in Settings updates the greeting and avatar', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    await expect(page.locator('.avatar')).toHaveCount(0);
    const dialog = settingsDialog(page);
    const name = dialog.getByLabel('Name', { exact: true });
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('maxlength', '60');
    await name.fill('  Ada  ');
    await name.press('Enter');
    await expect.poll(async () => (await serverSettings(dhara)).display_name).toBe('Ada');
    await expect(name).toHaveValue('Ada');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\.$/);
    await expect(page.locator('.avatar')).toHaveText('A');
  });

  test('A snapshot refetch never replaces the name being typed', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const name = settingsDialog(page).getByLabel('Name', { exact: true });
    await name.fill('Half-typed');
    await dhara.api('PATCH', '/api/settings', { display_name: 'Other device' });
    await refetch(page);
    await expect(name).toHaveValue('Half-typed');
  });

  test('Native settings URL opens actual existing dialog at startup', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#settings');
    await expect(settingsDialog(page).getByLabel('Screen', { exact: true })).toBeVisible();
  });

  test('Settings link adds no navigation screen', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#settings');
    await expect(settingsDialog(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Overview', 'Tasks']);
    await expect(page).toHaveURL(/#\/overview$/);
  });

  test('Linked settings edits actual existing server permission', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#settings');
    await settingsDialog(page).getByLabel('Screen', { exact: true }).check();
    await expect.poll(async () => (await serverSettings(dhara)).observation_enabled).toBe(true);
  });

  test('Settings link preserves current Capture route and editor text', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/capture');
    const editor = page.getByLabel('Rough learning note');
    await editor.fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Screen', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(editor).toHaveValue('Synthetic unsaved capture for settings-link recovery.');
    await expect(page).toHaveURL(/#\/capture$/);
  });

  test('Settings navigation never ingests an unsaved draft', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/capture');
    await page.getByLabel('Rough learning note').fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await openRuntimeLink(page, '#/settings');
    await expect(settingsDialog(page)).toBeVisible();
    expect((await serverState(dhara)).notes).toEqual([]);
  });

  test('Settings link preserves note-edit route and unsaved editor text', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const field = page.getByLabel('Note', { exact: true });
    await field.fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Screen', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(field).toHaveValue('Synthetic unsaved note edit.');
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
  });

  test('Opening settings never replaces the saved note original', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note', { exact: true }).fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    const full = await dhara.api<{ raw: string; version: number }>('GET', `/api/notes/${note.id}`);
    expect(full).toMatchObject({ raw: 'Synthetic saved original for editor preservation.', version: 1 });
  });

  test('Kitten reveals implemented size, mode and observation controls', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toBeVisible();
    await expect(dialog.getByLabel('Companion mode').locator('option')).toHaveText(['cat', 'dot', 'hidden']);
    const size = dialog.getByLabel('Companion size');
    await expect(size).toHaveAttribute('min', '24');
    await expect(size).toHaveAttribute('max', '72');
    await expect(dialog.getByLabel('Screen', { exact: true })).toBeVisible();
  });

  test('Companion modes persist; browser reports no native connection and contains no kitten overlay', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    let dialog = settingsDialog(page);
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await expect.poll(async () => (await serverSettings(dhara)).companion).toBe('dot');
    await page.reload();
    await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
    await navSettings(page).click();
    dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toHaveValue('dot');
    await expect(page.locator('img[src*="cat"], #companion-launch, .companion')).toHaveCount(0);
  });

  test('Observation starts off and motion starts on; observation, companion mode and size reach the server', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    const observation = dialog.getByLabel('Screen', { exact: true });
    await expect(observation).not.toBeChecked();
    await expect(dialog.getByLabel('Motion', { exact: true })).toBeChecked();
    await dialog.getByLabel('Motion', { exact: true }).uncheck();
    await observation.check();
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await dialog.getByLabel('Companion size').fill('56');
    await expect.poll(async () => serverSettings(dhara))
      .toMatchObject({ observation_enabled: true, motion: false, companion: 'dot', companion_size: 56 });
  });

  test('Export downloads the notebook archive; an empty capture queue stays hidden', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    const download = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Export notes & tasks' }).click();
    expect((await download).suggestedFilename()).toBe('dhara-export.zip');
    await expect(dialog.getByRole('button', { name: 'Local capture queue' })).toHaveCount(0);
  });

  test('Settings opens from the navigation on every screen', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/notes');
    await navSettings(page).click();
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navLink(page, 'Overview')).toHaveAttribute('aria-current', 'page');
  });
});
