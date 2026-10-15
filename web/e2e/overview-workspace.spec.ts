import { expect, gotoApp, test } from './fixtures';
import { task, agentRun } from './nowSeed';

test('Home capture, tasks, agents and notifications stay actionable', async ({ page, dhara }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  for (let i = 0; i < 8; i++) await task(dhara, `Available work ${i}`);
  await agentRun(dhara, await task(dhara, 'Review firmware results'), 'completed');
  await agentRun(dhara, await task(dhara, 'Agent busy work'));
  await gotoApp(page, dhara);
  await expect(page.getByRole('region', { name: 'If you have a few minutes' }).getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Tasks' }).locator('.task-row')).toHaveCount(4);

  await page.getByRole('button', { name: /Capture a thought/ }).click();
  await page.getByLabel('Rough learning note').fill('A saved observation about firmware parsing');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.saved-notice')).toBeVisible();
  await expect(page).toHaveURL(/#\/overview$/);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Rough learning note')).toHaveCount(0);

  const agents = page.getByRole('link', { name: 'Agents: 1 need you, 1 working' });
  await expect(agents).toBeVisible();
  await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
  await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Review firmware results')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();

  await agents.click();
  await expect(page).toHaveURL(/#\/plan$/);
  await expect(page.getByRole('region', { name: 'Needs you' })).toContainText('Review firmware results');
  await page.getByRole('button', { name: '1 agent working' }).click();
  await expect(page.getByRole('list', { name: 'Agents working' })).toContainText('Agent busy work');
});

test('Home task rows complete in place and See all opens Tasks', async ({ page, dhara }) => {
  await task(dhara, 'Finish the parser notes', { due_at: new Date(Date.now() + 3_600_000).toISOString() });
  await gotoApp(page, dhara);
  const list = page.getByRole('region', { name: 'Tasks' });
  await expect(list.locator('.task-due')).toHaveText('Today');
  await list.getByRole('button', { name: 'Complete Finish the parser notes' }).click();
  await expect(page.locator('.toast-layer')).toContainText('Task completed.');
  await expect(list.locator('.task-row')).toHaveCount(0);
  await list.getByRole('link', { name: 'See all →' }).click();
  await page.getByRole('button', { name: 'Done today · 1' }).click();
  await expect(page.getByRole('region', { name: 'Done today' })).toContainText('Finish the parser notes');
});

test('background motion animates, stops with the setting and respects reduced motion; phone fits', async ({ page, dhara }) => {
  await dhara.api('PATCH', '/api/settings', { motion: true });
  await gotoApp(page, dhara);
  const waves = page.locator('.ambient-waves');
  const playing = () => waves.locator('path').first().evaluate(el => getComputedStyle(el).animationName !== 'none');
  expect(await playing()).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await playing()).toBe(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await dhara.api('PATCH', '/api/settings', { motion: false });
  await page.reload();
  await expect(waves).toHaveAttribute('data-motion', 'false');
  expect(await playing()).toBe(false);
  await gotoApp(page, dhara, '#/plan');
  await expect(page.locator('.ambient-swirl')).toHaveAttribute('data-motion', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, dhara);
  await page.getByRole('button', { name: /Capture a thought/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
