import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import { agentRun, noHorizontalOverflow, openKind, seed, task } from './nowSeed';

const LONG = 'Investigate-the-allocator-cleanup-path-without-any-spaces-' + 'x'.repeat(120);

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a[href], select, summary, input:not([type="hidden"]), textarea')]
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden')
    .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
    .map(({ el, box }) => `${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`));
}
const sidebarBox = async (page: Page) => (await page.locator('.sidebar').boundingBox())!;

test('Phone layout has no horizontal overflow', async ({ page, noema }) => {
  await seed(noema, 'available');
  await task(noema, LONG);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ['#/overview', '#/plan']) {
    await gotoApp(page, noema, hash);
    expect(await noHorizontalOverflow(page), hash).toBe(true);
  }
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Tablet layout has no horizontal overflow', async ({ page, noema }) => {
  await seed(noema, 'available');
  await task(noema, LONG);
  for (const size of [{ width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(size);
    for (const hash of ['#/overview', '#/plan']) {
      await gotoApp(page, noema, hash);
      expect(await noHorizontalOverflow(page), `${size.width}×${size.height} ${hash}`).toBe(true);
    }
  }
});

// Trace U10/U12 titles belong to Phase 2b (capture.spec.ts, notes.spec.ts); these two cover the shell part.
test('Phone width moves the navigation to a bottom bar and gives content the full width', async ({ page, noema }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, noema);
  const bar = await sidebarBox(page);
  expect(Math.round(bar.y + bar.height)).toBe(844);
  expect(Math.round(bar.width)).toBe(390);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
  await nav.getByRole('link', { name: 'Capture' }).click();
  const content = (await page.locator('main.content').boundingBox())!;
  expect(Math.round(content.x)).toBe(0);
  expect(Math.round(content.width)).toBe(390); // no sidebar column beside the writing area
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('Portrait tablet uses the phone bottom bar; landscape tablet keeps the sidebar', async ({ page, noema }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await gotoApp(page, noema);
  let bar = await sidebarBox(page);
  expect(Math.round(bar.y + bar.height)).toBe(1180);
  expect(Math.round(bar.width)).toBe(820);
  await page.setViewportSize({ width: 900, height: 700 }); // tablet landscape keeps the sidebar
  bar = await sidebarBox(page);
  expect(Math.round(bar.x)).toBe(0);
  expect(Math.round(bar.height)).toBe(700);
  expect(bar.width).toBeLessThan(200);
});

test('Readable body/secondary text meets a 4.5 contrast ratio', async ({ page, context, noema }) => {
  await openKind(page, context, noema, 'available');
  const ratios = await page.evaluate(() => {
    const lum = (color: string) => {
      const v = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(x => x / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const background = lum(getComputedStyle(document.body).backgroundColor);
    return ['.recommendation p', '.focus-kind', '.page-heading p', '#connection-label', '.status-summary', '.recommendation .eyebrow'].map(selector => {
      const el = document.querySelector(selector);
      return [selector, el ? (lum(getComputedStyle(el).color) + 0.05) / (background + 0.05) : 0] as const;
    });
  });
  for (const [selector, ratio] of ratios) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
});

test('Phone touch targets are at least 44×44 px', async ({ page, context, noema }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKind(page, context, noema, 'available');
  expect(await smallTargets(page)).toEqual([]);
  await seed(noema, 'attention'); // run awaiting review: Review result link
  await seed(noema, 'waiting');
  await seed(noema, 'complete');
  await agentRun(noema, await task(noema, 'Running agent task'));
  await gotoApp(page, noema, '#/plan');
  expect(await smallTargets(page)).toEqual([]);
  for (const label of ['Needs you', 'Running', 'Available now', 'Completed', 'All']) {
    await page.getByRole('group', { name: 'Task views' }).getByRole('button', { name: label, exact: true }).click();
    expect(await smallTargets(page), label).toEqual([]);
  }
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add task' }).locator('#task-details summary').click();
  expect(await smallTargets(page)).toEqual([]);
});

test('Plan rows are compact single lines at desktop width', async ({ page, noema }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const title of ['Read the chapter', 'Review the fix', 'Trace ownership', 'Check duplicates', 'Write the summary']) await task(noema, title, { project: 'Learning' });
  await gotoApp(page, noema, '#/plan');
  const rows = page.locator('.plan-list .task-row');
  await expect(rows).toHaveCount(5);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(72);
    expect(await row.locator('.task-title > span').evaluate(el => el.getClientRects().length)).toBe(1);
  }
});
