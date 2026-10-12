import { chromium, type Page } from '@playwright/test';
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

type Box = { left: number; top: number; width: number; height: number };

function centerBox(page: Page): Box {
  const viewport = page.viewportSize()!;
  return { left: viewport.width / 2 - 150, top: viewport.height / 2 - 150, width: 300, height: 300 };
}

function litIn(page: Page, box: Box, step = 6): Promise<{ total: number; lit: number }> {
  return page.evaluate(async ({ box, step }) => {
    const field = window.__noemaField!;
    const reads: Promise<[number, number, number, number]>[] = [];
    for (let y = box.top + step / 2; y < box.top + box.height; y += step) {
      for (let x = box.left + step / 2; x < box.left + box.width; x += step) {
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) reads.push(field.readPixel(x, y));
      }
    }
    const pixels = await Promise.all(reads);
    return { total: pixels.length, lit: pixels.filter((pixel) => pixel[3] > 0).length };
  }, { box, step });
}

// step 2 CSS px = every backing pixel at DPR 1 (0.5× store), so a 1-px stroke under a quiet surface cannot slip between samples.
function quietPixels(page: Page, step = 2): Promise<{ total: number; lit: number }> {
  return page.evaluate(async (step) => {
    const field = window.__noemaField!;
    const rects = Array.from(document.querySelectorAll('[data-quiet]'), (element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 1 && rect.height > 1);
    const reads: Promise<[number, number, number, number]>[] = [];
    for (let y = step / 2; y < innerHeight; y += step) {
      for (let x = step / 2; x < innerWidth; x += step) {
        const inside = rects.some((r) => x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1);
        if (inside) reads.push(field.readPixel(x, y));
      }
    }
    const pixels = await Promise.all(reads);
    return { total: pixels.length, lit: pixels.filter((pixel) => pixel[3] > 0).length };
  }, step);
}

async function stripQuiet(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('[data-quiet]').forEach((element) => element.removeAttribute('data-quiet'));
    window.dispatchEvent(new Event('resize'));
  });
}

const ROUTES = ['#/overview', '#/capture', '#/notes', '#/plan', '#/settings'] as const;

/** Alpha 0 under every [data-quiet] surface on every route, over two animated frames per route. */
async function expectQuietEverywhere(page: Page, noema: NoemaServer, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await enableMotion(noema);
  await openField(page, noema);
  await expectState(page, 'animated');
  for (const hash of ROUTES) {
    await page.evaluate((next) => { location.hash = next; }, hash);
    await expect(hash === '#/settings' ? page.locator('dialog[open]') : page.locator('h1').first()).toBeVisible();
    await expect.poll(async () => (await quietPixels(page)).lit, { message: hash }).toBe(0);
    for (let frame = 0; frame < 2; frame++) {
      const counts = await quietPixels(page);
      expect(counts.total, hash).toBeGreaterThan(0);
      expect(counts.lit, hash).toBe(0);
    }
  }
}

test.describe('terrain pixels', () => {
  // Parity-map row 113 (qa/now_ui_check.py:252) and handbook-trace U25, title verbatim.
  test('Dot field never paints over the reading surface', async ({ page, noema }) => {
    await expectQuietEverywhere(page, noema, { width: 1440, height: 900 });
  });

  test('Dot field never paints over the reading surface at phone width', async ({ page, noema }) => {
    await expectQuietEverywhere(page, noema, { width: 390, height: 844 });
  });

  // A standalone <dialog data-quiet> (the shape contract §6.2 gives every app dialog), mounted and unmounted the way
  // React does it. The app's Settings route is not used here: it re-mounts the Now screen on open, which would put
  // data-quiet back on the main column and hide whether the dialog itself was measured.
  test('opening and closing a dialog updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await stripQuiet(page);
    const open = () => page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'quiet-dialog';
      dialog.setAttribute('data-quiet', '');
      Object.assign(dialog.style, { width: '320px', height: '320px', padding: '0', border: '0' });
      document.getElementById('root')!.append(dialog);
      dialog.showModal();
    });
    await open();
    const box = (await page.locator('#quiet-dialog').boundingBox())!;
    const inner = { left: box.x + 2, top: box.y + 2, width: box.width - 4, height: box.height - 4 };
    await expect.poll(async () => (await litIn(page, inner)).lit).toBe(0);
    await page.evaluate(() => {
      const dialog = document.getElementById('quiet-dialog') as HTMLDialogElement;
      dialog.close();
      dialog.remove();
    });
    await expect.poll(async () => (await litIn(page, inner)).lit).toBeGreaterThan(0);
    await open();
    await expect.poll(async () => (await litIn(page, inner)).lit).toBe(0);
  });

  test('resizing a quiet surface without a DOM mutation updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate((b) => {
      const probe = document.createElement('div');
      probe.id = 'quiet-probe';
      probe.setAttribute('data-quiet', '');
      Object.assign(probe.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: '0px', height: '0px' });
      document.getElementById('root')!.append(probe);
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate((b) => {
      const probe = document.getElementById('quiet-probe')!;
      probe.style.width = `${b.width}px`;
      probe.style.height = `${b.height}px`;
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBe(0);
  });

  test('scrolling a quiet surface into view updates the quiet rects', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await page.evaluate((b) => {
      const scroller = document.createElement('div');
      scroller.id = 'quiet-scroller';
      Object.assign(scroller.style, { position: 'fixed', inset: '0', overflow: 'auto', pointerEvents: 'none' });
      const spacer = document.createElement('div');
      Object.assign(spacer.style, { position: 'relative', height: `${innerHeight * 3}px` });
      const surface = document.createElement('div');
      surface.setAttribute('data-quiet', '');
      Object.assign(surface.style, {
        position: 'absolute', left: `${b.left}px`, top: `${innerHeight * 2 + b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
      });
      spacer.append(surface);
      scroller.append(spacer);
      document.getElementById('root')!.append(scroller);
    }, box);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    await page.evaluate(() => { document.getElementById('quiet-scroller')!.scrollTop = innerHeight * 2; });
    await expect.poll(async () => (await litIn(page, box)).lit).toBe(0);
  });

  test('the packed RGBA8 height texture draws when EXT_color_buffer_float is missing', async ({ page, noema }) => {
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (this: WebGL2RenderingContext, name: string) {
        if (name === 'EXT_color_buffer_float') {
          (window as unknown as { __floatBlocked: boolean }).__floatBlocked = true;
          return null;
        }
        return original.call(this, name);
      } as typeof original;
    });
    await openField(page, noema);
    await expectState(page, 'static');
    expect(await page.evaluate(() => (window as unknown as { __floatBlocked?: boolean }).__floatBlocked)).toBe(true);
    await expect.poll(async () => (await quietPixels(page)).lit).toBe(0);
    await stripQuiet(page);
    await expect.poll(async () => (await litIn(page, centerBox(page))).lit).toBeGreaterThan(0);
  });

  test('the terrain is visible in the composited page, not hidden behind the app background', async ({ page, noema }) => {
    await openField(page, noema);
    await stripQuiet(page);
    const box = centerBox(page);
    await expect.poll(async () => (await litIn(page, box)).lit).toBeGreaterThan(0);
    const clip = { x: box.left, y: box.top, width: box.width, height: box.height };
    const withField = await page.screenshot({ clip, animations: 'disabled' });
    await page.locator(FIELD).evaluate((canvas) => { (canvas as HTMLCanvasElement).style.visibility = 'hidden'; });
    const without = await page.screenshot({ clip, animations: 'disabled' });
    expect(withField.equals(without)).toBe(false);
  });
  // Real composited layout, no DOM stripping: the shell must not mark the whole content area quiet.
  test('the terrain shows outside the reading surfaces and not under them in the real layout', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await expect.poll(async () => (await quietPixels(page)).total).toBeGreaterThan(0);
    expect((await quietPixels(page)).lit).toBe(0);
    const outside = await page.evaluate(async () => {
      const field = window.__noemaField!;
      const rects = Array.from(document.querySelectorAll('[data-quiet]'), (element) => element.getBoundingClientRect());
      const main = document.querySelector('main.content')!.getBoundingClientRect();
      const reads: Promise<[number, number, number, number]>[] = [];
      for (let y = main.top + 1; y < Math.min(main.bottom, innerHeight); y += 4) {
        for (let x = main.left + 1; x < main.right; x += 4) {
          if (!rects.some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1)) reads.push(field.readPixel(x, y));
        }
      }
      const pixels = await Promise.all(reads);
      return pixels.filter((pixel) => pixel[3] > 0).length;
    });
    expect(outside).toBeGreaterThan(0);
  });
});

test.describe('terrain layout fidelity', () => {
  test('collapsing the sidebar moves the quiet rects with the surfaces', async ({ page, noema }) => {
    await openField(page, noema);
    await expectState(page, 'static');
    await expect.poll(async () => (await quietPixels(page)).total).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await expect.poll(async () => (await quietPixels(page)).lit).toBe(0);
  });

  // A dedicated browser: Playwright hides scrollbars by default, and launchOptions cannot be set per describe.
  test.describe('with a classic scrollbar', () => {
    test('no strokes under the right edge of the reading column', async ({ noema }) => {
      const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await checkScrollbarEdge(page, noema);
      } finally {
        await browser.close();
      }
    });
  });
});

async function checkScrollbarEdge(page: Page, noema: NoemaServer): Promise<void> {
  await openField(page, noema);
  await expectState(page, 'static');
  await page.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.cssText = 'height:4000px;width:1px;position:absolute;top:0;left:0;pointer-events:none';
    document.body.append(tall);
    window.dispatchEvent(new Event('resize'));
  });
  expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth), 'a classic scrollbar is present').toBeGreaterThan(0);
  await expect.poll(async () => (await quietPixels(page)).total).toBeGreaterThan(0);
  // The strokes sit under the quiet rects only if the backing store maps 1:1 onto the CSS box: a store sized from
  // innerWidth (scrollbar included) is squeezed into the narrower box and shifts every rect. A screenshot strip is too
  // faint to see the shift (strokes next to a quiet rect are near alpha 0), so assert the mapping itself.
  const ratios = await page.locator(FIELD).evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    return { x: c.width / c.clientWidth, y: c.height / c.clientHeight };
  });
  expect(Math.abs(ratios.x - ratios.y)).toBeLessThan(0.001);
}
