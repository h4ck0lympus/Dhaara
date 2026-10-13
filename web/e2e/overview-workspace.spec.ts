import { expect, gotoApp, test } from './fixtures';
import { task, agentRun } from './nowSeed';

test('capture, library, tasks and notifications stay actionable', async ({ page, dhara }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  for (let i = 0; i < 8; i++) await task(dhara, `Available work ${i}`);
  await agentRun(dhara, await task(dhara, 'Review firmware results'), 'completed');
  await gotoApp(page, dhara);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Capture' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Notes' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Available next' }).locator('.preview-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Capture a thought…', exact: true }).click();
  await page.getByLabel('Rough learning note').fill('A saved observation about firmware parsing');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Saved to Dhara', { exact: false })).toBeVisible().catch(async () => {
    await expect(page.locator('.saved-notice')).toBeVisible();
  });
  await expect(page).toHaveURL(/#\/overview$/);
  await page.locator('.inline-workspace > .section-header').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Browse notes' }).click();
  await page.locator('.note-row').first().click();
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.locator('.note-screen')).toBeVisible();
  await page.locator('.inline-workspace > .section-header').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  await page.getByLabel('What do you need to do?').fill('Check the parser tomorrow');
  await page.locator('.inline-task').getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.locator('.inline-task')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/overview$/);
  await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
  await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Review firmware results')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('button', { name: 'View available tasks' }).click();
  await expect(page).toHaveURL(/view=available/);
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('Available work 6');
  await expect(page.locator('.task-row')).toHaveCount(1);
});

test('motion advances while visible, respects reduced motion, and phone fits', async ({ page, dhara }) => {
  await dhara.api('PATCH', '/api/settings', { motion: true });
  await gotoApp(page, dhara);
  await expect(page.locator('.background-field')).toHaveAttribute('data-state', 'animated');
  const before = await page.locator('.background-field').screenshot();
  await page.waitForTimeout(1800);
  expect((await page.locator('.background-field').screenshot()).equals(before)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.background-field')).toHaveAttribute('data-state', 'static');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Capture a thought…', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
