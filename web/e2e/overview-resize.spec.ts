import { expect, gotoApp, test } from './fixtures';
import { note, task } from './nowSeed';

test('Home keeps a centred reading column at every window size', async ({ page, dhara }) => {
  await task(dhara, 'Read the ownership chapter');
  await gotoApp(page, dhara);
  for (const [width, height] of [[1200, 800], [1924, 1030], [2560, 1440], [3440, 1440], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const home = (await page.locator('.home').boundingBox())!;
    const bar = (await page.locator('.capture-bar').boundingBox())!;
    expect(home.width).toBeLessThanOrEqual(780);
    expect(Math.abs(home.x + home.width / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(bar.x).toBeCloseTo(home.x, 0);
    expect(bar.width).toBeCloseTo(home.width, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('Notes panes fill wide windows and the note pane takes the remaining width', async ({ page, dhara }) => {
  const saved = await note(dhara, 'Wide window note');
  await gotoApp(page, dhara, `#/notes?note=${saved.id}`);
  for (const [width, height] of [[1200, 800], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    const folders = (await page.locator('.folders-pane').boundingBox())!;
    const list = (await page.locator('.list-pane').boundingBox())!;
    const reader = (await page.locator('.note-pane').boundingBox())!;
    expect(Math.round(folders.x)).toBe(0);
    expect(list.x).toBeGreaterThan(folders.x + folders.width - 1);
    expect(reader.x).toBeGreaterThan(list.x + list.width - 1);
    expect(Math.round(reader.x + reader.width)).toBe(width);
  }
  await page.getByRole('button', { name: 'Resize note list pane (arrow keys)' }).focus();
  const before = (await page.locator('.list-pane').boundingBox())!.width;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await page.locator('.list-pane').boundingBox())!.width).toBe(before + 16);
  await page.keyboard.press('Control+2');
  await expect(page.locator('.list-pane')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.list-pane')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show note list' }).click();
  await expect.poll(async () => (await page.locator('.list-pane').boundingBox())!.width).toBe(before + 16);
});
