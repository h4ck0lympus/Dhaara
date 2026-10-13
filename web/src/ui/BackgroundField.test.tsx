// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundField } from './BackgroundField';
import { FRAME_INTERVAL_MS } from './field';

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
    expect(window.__dharaField).toBeUndefined();
  });

  it('installs the seam only with ?e2e=1, rejects reads while not drawing, and removes it on unmount', async () => {
    withoutWebGl2();
    window.history.replaceState(null, '', '/?e2e=1');
    const { unmount } = render(<BackgroundField motion />);
    expect(window.__dharaField?.frames).toBe(0);
    await expect(window.__dharaField!.readPixel(0, 0)).rejects.toThrow('The field is not drawing');
    unmount();
    expect(window.__dharaField).toBeUndefined();
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

  it('animates through setTimeout only: no requestAnimationFrame loop and no polling interval', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    const { container } = render(<BackgroundField motion />);
    expect(container.querySelector('canvas')!.dataset.state).toBe('animated');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(draws()).toBeGreaterThan(3);
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });

  for (const type of ['pointermove', 'keydown', 'wheel', 'touchstart', 'focus']) {
    it(`resumes from idle on ${type}`, () => {
      const { container } = render(<BackgroundField motion />);
      const canvas = container.querySelector('canvas')!;
      act(() => { vi.advanceTimersByTime(61_000); });
      expect(canvas.dataset.state).toBe('paused');
      // An element focus reaches the window listener only through capture; a window focus is covered by the blur/focus e2e test.
      const target = type === 'focus' ? container.appendChild(document.createElement('button')) : window;
      act(() => { target.dispatchEvent(new Event(type)); });
      expect(canvas.dataset.state).toBe('animated');
    });
  }

  it('coalesces a burst of scroll events over a moving quiet surface into one still redraw', () => {
    const surface = document.body.appendChild(document.createElement('div'));
    surface.setAttribute('data-quiet', '');
    let top = 0;
    surface.getBoundingClientRect = () => ({ left: 0, top: (top += 20), width: 100, height: 100, right: 100, bottom: top + 100, x: 0, y: top, toJSON() {} });
    // jsdom has no layout, so the fixed canvas would measure 0 x 0 and clip the surface away.
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    const { container } = render(<BackgroundField motion={false} />);
    expect(container.querySelector('canvas')!.dataset.state).toBe('static');
    const before = draws();
    act(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('scroll')); });
    act(() => { vi.advanceTimersByTime(FRAME_INTERVAL_MS); });
    expect(draws()).toBe(before + 1);
    surface.remove();
  });

  it('coalesces a burst of resize events into one still redraw', () => {
    render(<BackgroundField motion={false} />);
    const before = draws();
    act(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('resize')); });
    act(() => { vi.advanceTimersByTime(FRAME_INTERVAL_MS); });
    expect(draws()).toBe(before + 1);
  });

  it('releases its GL resources when a regrid fails', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { unmount } = render(<BackgroundField motion />);
    calls.checkFramebufferStatus.mockReturnValue(0);
    for (let i = 0; i < 30; i++) { now += 300; act(() => { vi.advanceTimersByTime(300); }); }
    expect(calls.deleteProgram).toHaveBeenCalledTimes(2);
    unmount();
    expect(calls.deleteProgram).toHaveBeenCalledTimes(2);
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
