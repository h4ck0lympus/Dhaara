import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { agentRun, noHorizontalOverflow, note, openKind, seed, task } from './nowSeed';

const LONG = 'Investigate-the-allocator-cleanup-path-without-any-spaces-' + 'x'.repeat(120);
const PAGES = ['#/overview', '#/notes', '#/plan', '#/settings'];

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a[href], select, summary, input:not([type="hidden"]), textarea')]
    .filter(el => el.tabIndex >= 0)
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden')
    .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
    .map(({ el, box }) => `${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`));
}

async function seedEverything(dhara: Parameters<typeof seed>[0]): Promise<void> {
  await seed(dhara, 'available');
  await seed(dhara, 'attention');
  await task(dhara, LONG);
  await task(dhara, 'Someday idea', { status: 'parked' });
  await agentRun(dhara, await task(dhara, 'Running agent task'));
  await note(dhara, `${LONG} as a note title`);
}

test('Phone layout has no horizontal overflow on any page', async ({ page, dhara }) => {
  await seedEverything(dhara);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of PAGES) {
    await gotoApp(page, dhara, hash);
    expect(await noHorizontalOverflow(page), hash).toBe(true);
  }
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /New task/ }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Tablet and desktop layouts have no horizontal overflow', async ({ page, dhara }) => {
  await seedEverything(dhara);
  for (const size of [{ width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 820, height: 1180 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    for (const hash of PAGES) {
      await gotoApp(page, dhara, hash);
      expect(await noHorizontalOverflow(page), `${size.width}×${size.height} ${hash}`).toBe(true);
    }
  }
});

test('Phone keeps the top navigation and gives Home the full width', async ({ page, dhara }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, dhara);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Notes', 'Tasks']);
  expect((await nav.boundingBox())!.y).toBeLessThan(80);
  const content = (await page.locator('main.content').boundingBox())!;
  expect(Math.round(content.x)).toBe(0);
  expect(Math.round(content.width)).toBe(390);
  await page.getByRole('button', { name: /Capture a thought/ }).click();
  await expect(page.getByLabel('Rough learning note')).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Phone Notes shows the list, then the note alone with a way back', async ({ page, dhara }) => {
  const saved = await note(dhara, 'Phone reading note');
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, dhara, '#/notes');
  await expect(page.getByRole('complementary', { name: 'Folders' })).toBeHidden();
  await expect(page.getByLabel('Folder', { exact: true })).toBeVisible();
  await page.locator('.note-row').first().click();
  await expect(page).toHaveURL(new RegExp(`note=${saved.id}`));
  await expect(page.locator('.list-pane')).toBeHidden();
  await page.getByRole('link', { name: '← All notes' }).click();
  await expect(page.locator('.list-pane')).toBeVisible();
});

test('Readable text meets a 4.5 contrast ratio in dark and light', async ({ page, context, dhara }) => {
  await openKind(page, context, dhara, 'available');
  const measure = () => page.evaluate(() => {
    const lum = (color: string) => {
      const v = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(x => x / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const background = lum(getComputedStyle(document.body).backgroundColor);
    return ['.home-greeting p', '.focus-next', '.eyebrow', '.home-row', '.nav-item:not(.active)'].map(selector => {
      const el = document.querySelector(selector);
      const fg = el ? lum(getComputedStyle(el).color) : background;
      return [selector, (Math.max(fg, background) + 0.05) / (Math.min(fg, background) + 0.05)] as const;
    });
  });
  for (const [selector, ratio] of await measure()) expect(ratio, `dark ${selector}`).toBeGreaterThanOrEqual(4.5);
  await dhara.api('PATCH', '/api/settings', { theme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const [selector, ratio] of await measure()) expect(ratio, `light ${selector}`).toBeGreaterThanOrEqual(4.5);
});

test('Phone touch targets are at least 44×44 px', async ({ page, context, dhara }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKind(page, context, dhara, 'available');
  expect(await smallTargets(page)).toEqual([]);
  await seedEverything(dhara);
  await task(dhara, 'Finished today', { status: 'done' });
  await gotoApp(page, dhara);
  await page.getByRole('button', { name: /^Agents:/ }).click();
  expect(await smallTargets(page)).toEqual([]);
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /Done today/ }).click();
  expect(await smallTargets(page)).toEqual([]);
  await gotoApp(page, dhara, '#/notes');
  expect(await smallTargets(page)).toEqual([]);
  await gotoApp(page, dhara, '#/settings');
  expect(await smallTargets(page)).toEqual([]);
  await gotoApp(page, dhara, '#/plan');
  await page.getByRole('button', { name: /New task/ }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await smallTargets(page)).toEqual([]);
});

test('Task rows are compact single lines at desktop width', async ({ page, dhara }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const title of ['Read the chapter', 'Review the fix', 'Trace ownership', 'Check duplicates', 'Write the summary']) await task(dhara, title, { project: 'Learning' });
  await gotoApp(page, dhara, '#/plan');
  const rows = page.locator('.task-board .task-row');
  await expect(rows).toHaveCount(5);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(48);
    expect(await row.locator('.task-title').evaluate(el => el.getClientRects().length)).toBe(1);
  }
});
