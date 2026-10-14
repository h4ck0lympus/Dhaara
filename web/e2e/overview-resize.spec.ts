import { mkdirSync } from 'node:fs';
import { expect, gotoApp, test } from './fixtures';

test('Overview fills resized windows with the activity panel at the right edge', async ({ page, dhara }) => {
  await gotoApp(page, dhara);
  mkdirSync('../qa/dhaara-design/responsive', { recursive: true });
  for (const [width, height] of [[1200, 800], [1924, 1030], [2560, 1440], [3440, 1440]]) {
    await page.setViewportSize({ width, height });
    const rail = (await page.locator('.overview-activity').boundingBox())!;
    const center = (await page.locator('.overview-work').boundingBox())!;
    const capture = (await page.locator('.quick-capture').boundingBox())!;
    const notes = (await page.locator('.recent-notes').boundingBox())!;
    expect(width - rail.x - rail.width).toBeLessThanOrEqual(40);
    expect(rail.x).toBeGreaterThan(center.x + center.width);
    expect(capture.x).toBeCloseTo(center.x, 0);
    expect(capture.width).toBeCloseTo(center.width, 0);
    expect(height - notes.y - notes.height).toBeLessThanOrEqual(32);
    expect(capture.y).toBeGreaterThan(height * .6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../qa/dhaara-design/responsive/${width}x${height}.png` });
  }
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const rail = (await page.locator('.overview-activity').boundingBox())!;
  expect(3440 - rail.x - rail.width).toBeLessThanOrEqual(40);
  await page.getByRole('button', { name: 'Capture a thought…', exact: true }).click();
  await page.getByLabel('Rough learning note').fill('Inline capture remains usable after fullscreen resize.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
