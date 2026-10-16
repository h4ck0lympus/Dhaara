import { expect, gotoApp, test } from './fixtures';
import { serverState, task, agentRun } from './nowSeed';

test.use({ viewport: { width: 420, height: 720 } });

test('companion route shows only the kitty, and the panel captures notes and tasks', async ({ page, dhara }) => {
  const due = await task(dhara, 'Finish slides', { due_at: new Date(Date.now() - 60_000).toISOString() });
  await agentRun(dhara, await task(dhara, 'Which boards first?'), 'needs_input');
  await gotoApp(page, dhara, '#/companion');
  await expect(page.locator('html')).toHaveAttribute('data-companion', 'true');
  await expect(page.locator('.topbar')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const kitty = page.getByRole('button', { name: /^Dhara companion:/ });
  await expect(kitty).toHaveAccessibleName('Dhara companion: 2 need you');
  await expect(page.getByRole('img', { name: 'Kitty alert: 2 need you' })).toBeVisible();
  await page.getByRole('img', { name: /^Kitty/ }).hover();
  await expect(page.getByRole('img', { name: 'Kitty purring: happy to be petted' })).toBeVisible();
  await kitty.click();
  const panel = page.getByRole('region', { name: 'Dhara mini panel' });
  await expect(panel).toContainText('Which boards first?');
  await expect(panel).toContainText('Finish slides');
  await panel.getByLabel('Capture a thought').fill('GCD checksum is a simple sum');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText('Saved to Notes.');
  await panel.getByLabel('Capture a thought').fill('todo: renew passport');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText('Added to Tasks.');
  const state = await serverState(dhara);
  expect(state.notes.map(n => n.title)).toContain('GCD checksum is a simple sum');
  expect(state.tasks.map(t => t.title)).toContain('renew passport');
  await panel.getByRole('button', { name: `Complete ${due.title}` }).click();
  await expect.poll(async () => (await serverState(dhara)).tasks.find(t => t.id === due.id)?.status).toBe('done');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('quiet mode calms the kitty and dictation explains when it is unavailable', async ({ page, dhara, context }) => {
  await context.grantPermissions(['microphone']);
  await agentRun(dhara, await task(dhara, 'Agent question'), 'needs_input');
  await gotoApp(page, dhara, '#/companion');
  await page.getByRole('button', { name: /^Dhara companion:/ }).click();
  await page.getByRole('button', { name: 'Quiet 30 min' }).click();
  await expect(page.getByRole('img', { name: 'Kitty asleep: nothing needs you' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('img', { name: 'Kitty asleep: nothing needs you' })).toBeVisible();
});
