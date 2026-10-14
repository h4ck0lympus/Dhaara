import { mkdirSync } from 'node:fs';
import { expect, gotoApp, test } from './fixtures';
import { task, agentRun } from './nowSeed';

test('reference direction: working overview on desktop and phone', async ({ page, dhara }) => {
  const focus = await task(dhara, 'Garmin firmware analysis', { project: 'Pwn2Own', next_action: 'Compare the parser changes in the latest firmware.' });
  await dhara.api('POST', '/api/focus', { task_id: focus.id, pinned: true });
  await task(dhara, 'Continue the two-pointer problem', { next_action: 'Check duplicate values before moving the pointers.', estimate_minutes: 20 });
  await task(dhara, 'Review application draft', { due_at: '2026-12-15T12:00:00+00:00' });
  const coding = await task(dhara, 'Review binary differences', { project: 'Pwn2Own' });
  await agentRun(dhara, coding);
  await page.setViewportSize({ width: 1360, height: 900 });
  await gotoApp(page, dhara);
  await expect(page.getByRole('region', { name: 'Current focus' })).toBeVisible();
  mkdirSync('../qa/dhaara-design', { recursive: true });
  const phase = process.env.DHAARA_DESIGN_PHASE ?? 'after';
  await page.screenshot({ path: `../qa/dhaara-design/${phase}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../qa/dhaara-design/${phase}-phone.png`, fullPage: true });
});
