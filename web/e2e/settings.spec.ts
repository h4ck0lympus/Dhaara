import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { expect, gotoApp, refetch, test } from './fixtures';
import { createNote, navLink, openRuntimeLink } from './screenTest';
import { serverState } from './nowSeed';
import type { DharaServer } from './server';

type SettingsBody = { settings: { display_name: string; observation_enabled: boolean; motion: boolean; companion: string; companion_size: number; theme: string }; context_rules: unknown[] };
const serverBody = (dhara: DharaServer) => dhara.api<SettingsBody>('GET', '/api/state');
const serverSettings = async (dhara: DharaServer) => (await serverBody(dhara)).settings;
const settingsLink = (page: Page) => page.getByRole('link', { name: 'Settings' });
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Settings' });
const windowContext = (page: Page) => page.getByRole('switch', { name: 'Use window context' });
const companion = (page: Page) => page.getByRole('group', { name: 'Companion' });

test.describe('Settings', () => {
  test('Display name edited in Settings updates the greeting', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const name = page.getByLabel('Your name');
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('maxlength', '60');
    await name.fill('  Ada  ');
    await name.press('Enter');
    await expect.poll(async () => (await serverSettings(dhara)).display_name).toBe('Ada');
    await expect(name).toHaveValue('Ada');
    await expect(page.locator('.toast-layer')).toContainText('Name saved.');
    await navLink(page, 'Home').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\.$/);
  });

  test('A snapshot refetch never replaces the name being typed', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const name = page.getByLabel('Your name');
    await name.fill('Half-typed');
    await dhara.api('PATCH', '/api/settings', { display_name: 'Other device' });
    await refetch(page);
    await expect(name).toHaveValue('Half-typed');
  });

  test('Legacy #settings links open the Settings page', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#settings');
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(heading(page)).toBeVisible();
    await expect(windowContext(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Home', 'Notes', 'Tasks']);
    await expect(settingsLink(page)).toHaveAttribute('aria-current', 'page');
  });

  test('Linked settings edits actual existing server permission', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#settings');
    await windowContext(page).click();
    await expect(windowContext(page)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await serverSettings(dhara)).observation_enabled).toBe(true);
  });

  test('Visiting Settings keeps the unsaved Capture draft and Back returns to it', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/capture');
    const editor = page.getByLabel('Rough learning note');
    await editor.fill('Synthetic unsaved capture for settings-link recovery.');
    await expect(page.locator('#draft-status')).toHaveText(S.draftSaved);
    await settingsLink(page).click();
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(page).toHaveURL(/#\/capture$/);
    await expect(editor).toHaveValue('Synthetic unsaved capture for settings-link recovery.');
    expect((await serverState(dhara)).notes).toEqual([]);
  });

  test('Leaving an unsaved note edit for Settings asks first and never touches the original', async ({ page, dhara }) => {
    const note = await createNote(dhara, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, dhara, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const field = page.getByLabel('Note', { exact: true });
    await field.fill('Synthetic unsaved note edit.');
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.leaveNoteEdit); void prompt.dismiss(); });
    await settingsLink(page).click();
    await expect(field).toHaveValue('Synthetic unsaved note edit.');
    await expect(page).toHaveURL(new RegExp(`#/notes\\?note=${note.id}$`));
    page.once('dialog', prompt => void prompt.accept());
    await openRuntimeLink(page, '#/settings');
    await expect(heading(page)).toBeVisible();
    const full = await dhara.api<{ raw: string; version: number }>('GET', `/api/notes/${note.id}`);
    expect(full).toMatchObject({ raw: 'Synthetic saved original for editor preservation.', version: 1 });
  });

  test('Companion shows implemented mode and size controls', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    await expect(companion(page).getByRole('button')).toHaveText(['Cat', 'Dot', 'Hidden']);
    await expect(companion(page).getByRole('button', { name: 'Cat' })).toHaveAttribute('aria-pressed', 'true');
    const size = page.getByLabel('Companion size');
    await expect(size).toHaveAttribute('min', '24');
    await expect(size).toHaveAttribute('max', '72');
    await expect(page.getByText('40 px')).toBeVisible();
  });

  test('Window context does not claim an active observer or screenshots', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const status = page.getByRole('region', { name: 'Status' });
    await expect(status).toContainText('Observation paused');
    await expect(page.getByText('no screenshots are taken or stored', { exact: false })).toBeVisible();
    await windowContext(page).click();
    await expect(status).toContainText('Allowed · no recent observer report');
    await expect(page.locator('.settings-page')).not.toContainText('Recent window metadata report');
    await windowContext(page).click();
    await expect(status).toContainText('Observation paused');
  });

  test('Companion modes persist; browser reports no native connection and contains no kitten overlay', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    await companion(page).getByRole('button', { name: 'Dot' }).click();
    await expect.poll(async () => (await serverSettings(dhara)).companion).toBe('dot');
    await expect(page.getByText('The desktop kitten runs separately from this window')).toBeVisible();
    await page.reload();
    await expect(page.locator('#connection-label')).toHaveText(S.connected);
    await expect(companion(page).getByRole('button', { name: 'Dot' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('img[src*="cat"], #companion-launch, .companion')).toHaveCount(0);
  });

  test('Observation starts off and motion starts on; observation, motion, theme, companion mode and size reach the server', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const motion = page.getByRole('switch', { name: 'Background motion' });
    await expect(windowContext(page)).toHaveAttribute('aria-checked', 'false');
    await expect(motion).toHaveAttribute('aria-checked', 'true');
    await motion.click();
    await windowContext(page).click();
    await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Light' }).click();
    await companion(page).getByRole('button', { name: 'Dot' }).click();
    await page.getByLabel('Companion size').fill('56');
    await expect.poll(async () => serverSettings(dhara))
      .toMatchObject({ observation_enabled: true, motion: false, theme: 'light', companion: 'dot', companion_size: 56 });
  });

  test('A failed save reverts the control and says why', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    await page.route('**/api/settings', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Settings storage failed"}' }));
    await windowContext(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Settings storage failed' })).toBeVisible();
    await expect(windowContext(page)).toHaveAttribute('aria-checked', 'false');
    expect((await serverSettings(dhara)).observation_enabled).toBe(false);
  });

  test('Window-to-task rules can be added and removed', async ({ page, dhara }) => {
    await dhara.api('POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, dhara, '#/settings');
    await page.getByText('Window-to-task rules').click();
    await page.getByLabel('App ID').fill('org.mozilla.firefox');
    await page.getByLabel('Title contains').fill('Two Sum');
    await page.getByLabel('Task', { exact: true }).selectOption({ label: 'Two Sum' });
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('org.mozilla.firefox / Two Sum → Two Sum')).toBeVisible();
    expect((await serverBody(dhara)).context_rules).toHaveLength(1);
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => (await serverBody(dhara)).context_rules.length).toBe(0);
  });

  test('A new token is shown once, survives nowhere, and can be revoked', async ({ page, dhara }) => {
    await dhara.api('POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, dhara, '#/settings');
    await page.getByText('Advanced: agent & observer tokens').click();
    await page.getByLabel('Label').fill('Local coding agent');
    await expect(page.getByRole('button', { name: 'Create token' })).toBeDisabled();
    await expect(page.getByText('Choose at least one task for an agent token')).toBeVisible();
    await page.getByLabel('Allowed tasks · agent tokens').selectOption({ label: 'Two Sum' });
    await page.getByRole('button', { name: 'Create token' }).click();
    const value = page.locator('.token-value');
    await expect(value).toHaveText(/\S{20,}/);
    const token = (await value.textContent())!;
    await expect(page.getByText('Copy this token now. It will not be displayed again.')).toBeVisible();
    await expect(page.getByText('Local coding agent · agent')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(token);
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-connection', 'online');
    await page.getByText('Advanced: agent & observer tokens').click();
    await expect(page.getByText('Local coding agent · agent')).toBeVisible();
    await expect(page.locator('.token-value')).toHaveCount(0);
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Local coding agent · agent')).toHaveCount(0);
    expect(await dhara.api<unknown[]>('GET', '/api/tokens')).toEqual([]);
  });

  test('Export downloads the notebook archive; Local capture queue opens the outbox', async ({ page, dhara }) => {
    await gotoApp(page, dhara, '#/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toBe('dhara-export.zip');
    await expect(page.getByText('Version 0.1.0 · local-first development build')).toBeVisible();
    await page.getByRole('region', { name: 'Your data' }).getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('dialog', { name: S.outboxTitle })).toBeVisible();
  });

  test('Settings opens from every screen and Escape goes back', async ({ page, dhara }) => {
    for (const [hash, nav] of [['#/overview', 'Home'], ['#/notes', 'Notes'], ['#/plan', 'Tasks']] as const) {
      await gotoApp(page, dhara, hash);
      await settingsLink(page).click();
      await expect(heading(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(navLink(page, nav)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('Status summarises the server, models and notes', async ({ page, dhara }) => {
    await createNote(dhara, 'one note');
    await gotoApp(page, dhara, '#/settings');
    const status = page.getByRole('region', { name: 'Status' });
    await expect(status).toContainText(S.connected);
    await expect(status).toContainText('1 note');
    await expect(status).toContainText(/Notes model.*(ready|Not configured)/);
    await expect(status).toContainText(/Agents connected.*(None yet|Codex|Claude)/);
  });
});
