import type { Page } from '@playwright/test';
import { expect, gotoApp, test } from './fixtures';
import type { NoemaServer } from './server';

const FIELD = 'canvas.background-field';

test.use({ viewport: { width: 1440, height: 900 } });

/** gotoApp loads origin + '/' + hash, so a '?e2e=1' prefix turns the seam on. Fonts are awaited so a late layout shift cannot redraw a static frame mid-test. */
async function openField(page: Page, noema: NoemaServer, hash = '#/overview'): Promise<void> {
  await gotoApp(page, noema, `?e2e=1${hash}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function enableMotion(noema: NoemaServer): Promise<void> {
  await noema.api('PATCH', '/api/settings', { motion: true });   // the helper takes the full path
}

function frames(page: Page): Promise<number> {
  return page.evaluate(() => window.__noemaField!.frames);
}

async function expectState(page: Page, state: 'animated' | 'static' | 'paused' | 'unsupported'): Promise<void> {
  await expect(page.locator(FIELD)).toHaveAttribute('data-state', state);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('terrain state machine', () => {
  test('motion defaults off: one static frame inside the app, no frame timer', async ({ page, noema }) => {
    await openField(page, noema);
    await expect(page.locator(`#root ${FIELD}`)).toHaveCount(1);
    await expectState(page, 'static');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
  });

  // Upper bound only: SwiftShader back-pressure slows ticks; the 12 fps cadence is pinned by the scheduler unit test.
  test('motion on animates through setTimeout without exceeding 12 fps', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    const before = await frames(page);
    await page.waitForTimeout(2000);
    const drawn = (await frames(page)) - before;
    expect(drawn).toBeGreaterThanOrEqual(2);
    expect(drawn).toBeLessThanOrEqual(26);
  });

  // Parity-map row 41 (experiments/ui-ab/scripts/verify.py:41), title verbatim.
  test('Terrain animates, stays static with reduced motion, pauses when hidden, and does not capture input', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    const start = await frames(page);
    await expect.poll(() => frames(page)).toBeGreaterThan(start + 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectState(page, 'static');
    let before = await frames(page);
    await page.waitForTimeout(350);
    expect(await frames(page)).toBe(before);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectState(page, 'animated');
    await setHidden(page, true);
    await expectState(page, 'paused');
    before = await frames(page);
    await page.waitForTimeout(350);
    expect(await frames(page)).toBe(before);
    await setHidden(page, false);
    await expectState(page, 'animated');
    expect(await page.locator(FIELD).evaluate((canvas) => getComputedStyle(canvas).pointerEvents)).toBe('none');
    // Hit testing skips the canvas everywhere, including the corner where no app surface covers it.
    expect(await page.evaluate(() => [[2, 2], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2]]
      .every(([x, y]) => !document.elementFromPoint(x, y)?.matches('canvas.background-field')))).toBe(true);
  });

  // Parity-map row 114 (qa/now_ui_check.py:260) and handbook-trace U25, title verbatim.
  test('Reduced motion stops the actual animation timer', async ({ page, noema }) => {
    await enableMotion(noema);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openField(page, noema);
    await expectState(page, 'static');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectState(page, 'animated');
  });

  // Parity-map row 115 (qa/now_ui_check.py:266), title verbatim.
  test('Injected hidden-document event stops animation', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await setHidden(page, true);
    await expectState(page, 'paused');
    const before = await frames(page);
    await page.waitForTimeout(1000);
    expect(await frames(page)).toBe(before);
    await setHidden(page, false);
    await expectState(page, 'animated');
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
  });

  test('window blur pauses and window focus resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expectState(page, 'paused');
    const before = await frames(page);
    await page.waitForTimeout(500);
    expect(await frames(page)).toBe(before);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectState(page, 'animated');
  });

  test('sixty seconds without input pauses and pointer input resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await page.clock.install();
    await openField(page, noema);
    await expectState(page, 'animated');
    // Restart the 60 s window from a known instant, so page-load time cannot push the 59 s check past the timeout.
    await page.mouse.move(10, 10);
    await page.clock.fastForward(59_000);
    await expectState(page, 'animated');
    await page.clock.fastForward(2_000);
    await expectState(page, 'paused');
    await page.mouse.move(40, 40);
    await expectState(page, 'animated');
  });

  test('turning motion on in Settings animates without a reload', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.getByLabel('Enable background motion').check();
    await expectState(page, 'animated');
  });

  test('without WebGL2 the static fallback shows and the app stays usable', async ({ page, noema }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
        return type === 'webgl2' ? null : original.call(this, type, options);
      } as typeof original;
    });
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'unsupported');
    await expect(page.locator(FIELD)).toBeHidden();
    await expect(page.evaluate(() => window.__noemaField!.readPixel(1, 1))).rejects.toThrow('The field is not drawing');
    await page.getByRole('navigation').getByText('Capture', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Capture a thought.' })).toBeVisible();
  });

  test('a lost WebGL context falls back to unsupported and a restored one resumes', async ({ page, noema }) => {
    await enableMotion(noema);
    await openField(page, noema);
    await expectState(page, 'animated');
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.background-field')!;
      const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      (window as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
      lose.loseContext();
    });
    await expectState(page, 'unsupported');
    await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
    await expectState(page, 'animated');
  });

  test('the test seam is absent without ?e2e=1', async ({ page, noema }) => {
    await gotoApp(page, noema);
    await expectState(page, 'static');
    expect(await page.evaluate(() => window.__noemaField === undefined)).toBe(true);
  });
});
