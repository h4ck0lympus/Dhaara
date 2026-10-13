import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { expect, gotoApp, refetch, test } from './fixtures';
import { createNote, navLink, openRuntimeLink } from './screenTest';
import { serverState } from './nowSeed';
import type { DharaServer } from './server';

type SettingsBody = { settings: { display_name: string; observation_enabled: boolean; motion: boolean; companion: string; companion_size: number }; context_rules: unknown[] };
const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Your workspace' });
const serverBody = (dhara: DharaServer) => dhara.api<SettingsBody>('GET', '/api/state');
const serverSettings = async (dhara: DharaServer) => (await serverBody(dhara)).settings;
const navSettings = (page: Page) => page.locator('aside.sidebar').getByRole('button', { name: 'Settings' });

test.describe('Settings', () => {
  test('Display name edited in Settings updates the greeting and avatar', async ({ page, dhara }) => {   // handbook-trace U6
    await gotoApp(page, dhara, '#/settings');
    await expect(page.locator('.avatar')).toHaveCount(0);
    const dialog = settingsDialog(page);
    const name = dialog.getByLabel('Your name');
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('maxlength', '60');
    await name.fill('  Ada  ');
    await dialog.getByRole('button', { name: 'Save name' }).click();
    await expect.poll(async () => (await serverSettings(dhara)).display_name).toBe('Ada');
    await expect(name).toHaveValue('Ada');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\.$/);
    await expect(page.locator('.avatar')).toHaveText('A');
  });

  test('A snapshot refetch never replaces the name being typed', async ({ page, dhara }) => {   // spec §8 Refetch
    await gotoApp(page, dhara, '#/settings');
    const name = settingsDialog(page).getByLabel('Your name');
    await name.fill('Half-typed');
    await dhara.api('PATCH', '/api/settings', { display_name: 'Other device' });
    await refetch(page);
    await expect(name).toHaveValue('Half-typed');
  });

  test('Native settings URL opens actual existing dialog at startup', async ({ page, dhara }) => {   // settings_link_check.py:29
    await gotoApp(page, dhara, '#settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
  });

  test('Settings link adds no navigation screen', async ({ page, dhara }) => {   // settings_link_check.py:31
    await gotoApp(page, dhara, '#settings');
    await expect(settingsDialog(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
    await expect(page).toHaveURL(/#\/overview$/);
  });

  test('Linked settings edits actual existing server permission', async ({ page, dhara }) => {   // settings_link_check.py:34
    await gotoApp(page, dhara, '#settings');
    await settingsDialog(page).getByLabel('Enable window context').check();
    await expect.poll(async () => (await serverSettings(dhara)).observation_enabled).toBe(true);
  });

  test('Settings link preserves current Capture route and editor text', async ({ page, dhara }) => {   // settings_link_check.py:44
    await gotoApp(page, dhara, '#/capture');
    const editor = page.getByLabel('Rough learning note');
    await editor.fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(editor).toHaveValue('Synthetic unsaved capture for settings-link recovery.');
    await expect(page).toHaveURL(/#\/capture$/);
  });

  test('Settings navigation never ingests an unsaved draft', async ({ page, dhara }) => {   // settings_link_check.py:46
    await gotoApp(page, dhara, '#/capture');
    await page.getByLabel('Rough learning note').fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await openRuntimeLink(page, '#/settings');
    await expect(settingsDialog(page)).toBeVisible();
    expect((await serverState(dhara)).notes).toEqual([]);
  });

  test('Settings link preserves note-edit route and unsaved editor text', async ({ page, dhara }) => {   // settings_link_check.py:58
    const note = await createNote(dhara, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const field = page.getByLabel('Note', { exact: true });
    await field.fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(field).toHaveValue('Synthetic unsaved note edit.');
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
  });

  test('Opening settings never replaces the saved note original', async ({ page, dhara }) => {   // settings_link_check.py:60
    const note = await createNote(dhara, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note', { exact: true }).fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    const full = await dhara.api<{ raw: string; version: number }>('GET', `/api/notes/${note.id}`);
    expect(full).toMatchObject({ raw: 'Synthetic saved original for editor preservation.', version: 1 });
  });

  test('Kitten reveals implemented size, mode and observation controls', async ({ page, dhara }) => {   // now_ui_check.py:222
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toBeVisible();
    await expect(dialog.getByLabel('Companion mode').locator('option')).toHaveText(['cat', 'dot', 'hidden']);
    const size = dialog.getByLabel('Companion size');
    await expect(size).toHaveAttribute('min', '24');
    await expect(size).toHaveAttribute('max', '72');
    await expect(dialog.getByText('Logical pixels; native helper reads this setting.')).toBeVisible();
    await expect(dialog.getByLabel('Enable window context')).toBeVisible();
  });

  test('Observation permission does not claim an active observer or screenshots', async ({ page, dhara }) => {   // now_ui_check.py:235
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    const status = dialog.locator('#observation-status');
    await expect(status).toContainText('Observation paused');
    await dialog.getByLabel('Enable window context').check();
    await expect(status).toContainText('Allowed · no recent observer report');
    await expect(status).toContainText('no screenshot observation is implemented');
    await expect(dialog).not.toContainText('Recent window metadata report');
    await dialog.getByLabel('Enable window context').uncheck();
    await expect(status).toContainText('Observation paused');
  });

  test('Companion modes persist; browser reports no native connection and contains no kitten overlay', async ({ page, dhara }) => {   // verify.py:71
    await gotoApp(page, dhara, '#/settings');
    let dialog = settingsDialog(page);
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await expect.poll(async () => (await serverSettings(dhara)).companion).toBe('dot');
    await expect(dialog.getByText('This browser does not connect to the desktop companion.')).toBeVisible();
    await page.reload();
    await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
    await navSettings(page).click();
    dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toHaveValue('dot');
    await expect(page.locator('img[src*="cat"], #companion-launch, .companion')).toHaveCount(0);
  });

  test('Observation and motion start off; observation, companion mode and size reach the server', async ({ page, dhara }) => {   // handbook-trace R9 (capture disabled by default)
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    const observation = dialog.getByLabel('Enable window context');
    await expect(observation).not.toBeChecked();
    await expect(dialog.getByLabel('Enable background motion')).not.toBeChecked();
    await observation.check();
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await dialog.getByLabel('Companion size').fill('56');
    await expect.poll(async () => serverSettings(dhara))
      .toMatchObject({ observation_enabled: true, motion: false, companion: 'dot', companion_size: 56 });
  });

  test('Window-to-task rules can be added and removed', async ({ page, dhara }) => {
    await dhara.api('POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    await dialog.getByText('Window-to-task rules').click();
    await dialog.getByLabel('App ID').fill('org.mozilla.firefox');
    await dialog.getByLabel('Title contains').fill('Two Sum');
    await dialog.getByLabel('Task', { exact: true }).selectOption({ label: 'Two Sum' });
    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await expect(dialog.getByText('org.mozilla.firefox / Two Sum → Two Sum')).toBeVisible();
    expect((await serverBody(dhara)).context_rules).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => (await serverBody(dhara)).context_rules.length).toBe(0);
  });

  test('A new token is shown once, survives nowhere, and can be revoked', async ({ page, dhara }) => {
    await dhara.api('POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, dhara, '#/settings');
    let dialog = settingsDialog(page);
    await dialog.getByText('Agent & observer tokens').click();
    await dialog.getByLabel('Label').fill('Local coding agent');
    await expect(dialog.getByRole('button', { name: 'Create token' })).toBeDisabled();
    await expect(dialog.getByText('Choose at least one task for an agent token')).toBeVisible();
    await dialog.getByLabel('Allowed tasks · agent tokens').selectOption({ label: 'Two Sum' });
    await dialog.getByRole('button', { name: 'Create token' }).click();
    const value = dialog.locator('.token-value');
    await expect(value).toHaveText(/\S{20,}/);
    const token = (await value.textContent())!;
    await expect(dialog.getByText('Copy this token now. It will not be displayed again.')).toBeVisible();
    await expect(dialog.getByText('Local coding agent · agent')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(token);
    await page.reload();
    await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
    await navSettings(page).click();
    dialog = settingsDialog(page);
    await dialog.getByText('Agent & observer tokens').click();
    await expect(dialog.getByText('Local coding agent · agent')).toBeVisible();
    await expect(dialog.locator('.token-value')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(dialog.getByText('Local coding agent · agent')).toHaveCount(0);
    expect(await dhara.api<unknown[]>('GET', '/api/tokens')).toEqual([]);
  });

  test('Export downloads the notebook archive; Local capture queue opens the outbox', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const dialog = settingsDialog(page);
    const download = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Export notes & tasks' }).click();
    expect((await download).suggestedFilename()).toBe('dhara-export.zip');   // server.py:337
    await expect(dialog.getByText('Version 0.1.0 · local-first development build')).toBeVisible();   // app.js:465
    await dialog.getByRole('button', { name: 'Local capture queue' }).click();
    await expect(page.getByRole('dialog', { name: S.outboxTitle })).toBeVisible();
  });

  test('Settings opens from the navigation on every screen', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/notes');
    await navSettings(page).click();
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navLink(page, 'Notes')).toHaveAttribute('aria-current', 'page');
  });
});
