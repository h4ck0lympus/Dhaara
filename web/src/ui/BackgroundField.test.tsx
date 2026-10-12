// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundField } from './BackgroundField';
// Vite's ?raw import (typed by vite/client) gives the source text without needing Node types in src/.
import SOURCE from './BackgroundField.tsx?raw';

function withoutWebGl2() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('BackgroundField', () => {
  it('requests WebGL2 without antialiasing or a preserved drawing buffer', () => {
    const getContext = withoutWebGl2();
    render(<BackgroundField motion={false} />);
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ antialias: false, preserveDrawingBuffer: false }));
  });

  it('shows the static fallback state without WebGL2 and stays decorative, whatever the motion setting', () => {
    withoutWebGl2();
    const { container, rerender } = render(<BackgroundField motion />);
    const canvas = container.querySelector('canvas');
    expect(canvas?.className).toBe('background-field');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.dataset.state).toBe('unsupported');
    rerender(<BackgroundField motion={false} />);
    expect(canvas?.dataset.state).toBe('unsupported');
  });

  it('installs no test seam without ?e2e=1', () => {
    withoutWebGl2();
    render(<BackgroundField motion />);
    expect(window.__noemaField).toBeUndefined();
  });

  it('installs the seam only with ?e2e=1, rejects reads while not drawing, and removes it on unmount', async () => {
    withoutWebGl2();
    window.history.replaceState(null, '', '/?e2e=1');
    const { unmount } = render(<BackgroundField motion />);
    expect(window.__noemaField?.frames).toBe(0);
    await expect(window.__noemaField!.readPixel(0, 0)).rejects.toThrow('The field is not drawing');
    unmount();
    expect(window.__noemaField).toBeUndefined();
  });

  it('schedules frames with setTimeout only: no requestAnimationFrame loop and no quiet-rect polling', () => {
    expect(SOURCE).not.toContain('requestAnimationFrame');
    expect(SOURCE).not.toContain('setInterval');
    expect(SOURCE).toContain('window.setTimeout(tick, FRAME_INTERVAL_MS)');
    expect(SOURCE).toContain('Math.min(now - last, MAX_STEP_MS)');
  });

  it('recomputes quiet rects from a ResizeObserver, a MutationObserver on the app root and scroll', () => {
    expect(SOURCE).toContain('new ResizeObserver(onQuietChange)');
    expect(SOURCE).toContain('{ childList: true, subtree: true }');
    expect(SOURCE).toContain("window.addEventListener('scroll', onQuietChange, LISTEN)");
  });

  it('renders the height pass into RGBA16F when EXT_color_buffer_float is available and falls back to packed RGBA8', () => {
    expect(SOURCE).toContain("gl.getExtension('EXT_color_buffer_float') !== null");
    expect(SOURCE).toContain('float ? gl.RGBA16F : gl.RGBA8');
    expect(SOURCE).toContain('gl.drawArraysInstanced(gl.LINES, 0, 2, grid.columns * grid.rows)');
  });
});

// A recording WebGL2 stand-in: constants are numbers, create*/get* succeed, everything else is a spy.
function fakeGl() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const impl: Record<string, () => unknown> = {
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}), createFramebuffer: () => ({}),
    createBuffer: () => ({}), createVertexArray: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getExtension: () => null, getUniformLocation: () => ({}), checkFramebufferStatus: () => 36053,
  };
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === 'FRAMEBUFFER_COMPLETE') return 36053;
      if (/^[A-Z0-9_]+$/.test(name)) return 1;
      return (calls[name] ??= vi.fn(impl[name] ?? (() => undefined)));
    },
  });
  return { gl, calls };
}

describe('BackgroundField with a WebGL2 context', () => {
  let calls: Record<string, ReturnType<typeof vi.fn>>;
  let focused = true;
  beforeEach(() => {
    vi.useFakeTimers();
    focused = true;
    const fake = fakeGl();
    calls = fake.calls;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.gl as unknown as WebGL2RenderingContext);
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
  const draws = () => calls.drawArraysInstanced?.mock.calls.length ?? 0;
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  };

  it('animates when focused and draws nothing while the document is hidden', () => {
    const { container } = render(<BackgroundField motion />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.dataset.state).toBe('animated');
    act(() => { vi.advanceTimersByTime(500); });
    expect(draws()).toBeGreaterThan(3);
    setHidden(true);
    expect(canvas.dataset.state).toBe('paused');
    const after = draws();
    act(() => { vi.advanceTimersByTime(2000); window.dispatchEvent(new Event('resize')); });
    expect(draws()).toBe(after);
    setHidden(false);
    expect(canvas.dataset.state).toBe('animated');
    expect(draws()).toBeGreaterThan(after);
  });

  it('draws exactly one still frame on entering paused, then none on later events', () => {
    const { container } = render(<BackgroundField motion />);
    act(() => { vi.advanceTimersByTime(200); });
    const before = draws();
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(container.querySelector('canvas')!.dataset.state).toBe('paused');
    expect(draws()).toBe(before + 1);
    act(() => { window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(1000); });
    expect(draws()).toBe(before + 1);
  });

  it('starts paused when the window has no focus at load', () => {
    focused = false;
    const { container } = render(<BackgroundField motion />);
    expect(container.querySelector('canvas')!.dataset.state).toBe('paused');
  });

  it('deletes its programs, buffers and height texture on unmount', () => {
    const { unmount } = render(<BackgroundField motion />);
    unmount();
    expect(calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(calls.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(calls.deleteTexture).toHaveBeenCalledTimes(1);
  });

  it('steps quality down from the measured tick interval, not CPU submit time', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    render(<BackgroundField motion />);
    const texImages = () => calls.texImage2D.mock.calls.length;
    const initial = texImages();
    // Ticks arrive 300ms apart (slow GPU) while each draw itself is instant.
    for (let i = 0; i < 30; i++) { now += 300; act(() => { vi.advanceTimersByTime(300); }); }
    expect(texImages()).toBeGreaterThan(initial);
  });
});
