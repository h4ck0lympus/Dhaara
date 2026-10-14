import { useEffect, useRef } from 'react';
import '../styles/field.css';
import {
  FRAME_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  QUALITY_STEPS,
  QUIET_SELECTOR,
  backingSize,
  buildInstances,
  fieldState,
  gridSize,
  packQuietRects,
  removeContained,
  stepQuality,
  type FieldInputs,
  type FieldState,
  type GridSize,
} from './field';
import { HEIGHT_FRAGMENT, HEIGHT_VERTEX, STROKE_FRAGMENT, STROKE_VERTEX } from './fieldShaders';

const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};
const STATIC_TIME = 21.5;     // experiments BackgroundField.tsx:6
const TIME_PER_MS = 0.00011;  // experiments BackgroundField.tsx:123
const MAX_STEP_MS = 100;      // experiments BackgroundField.tsx:123: a resume never jumps the terrain
const ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
const LISTEN = { capture: true, passive: true } as const;

type Pixel = [number, number, number, number];
type PixelRead = { x: number; y: number; resolve(pixel: Pixel): void; reject(error: Error): void };
type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;
type Resources = {
  height: WebGLProgram;
  stroke: WebGLProgram;
  heightUniforms: Uniforms<'time' | 'aspect' | 'grid'>;
  strokeUniforms: Uniforms<'heights' | 'aspect' | 'size' | 'quiet' | 'backing' | 'scale' | 'strength'>;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  instances: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  float: boolean;
};
const NOT_DRAWING = 'The field is not drawing';
type Controller = { setMotion(on: boolean): void; stop(): void };

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Field shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Field shader failed');
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Field program allocation failed');
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Field program failed');
  return program;
}

function locate<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Uniforms<K> {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Uniforms<K>;
}

function createResources(gl: WebGL2RenderingContext): Resources | null {
  try {
    const height = link(gl, HEIGHT_VERTEX, HEIGHT_FRAGMENT);
    const stroke = link(gl, STROKE_VERTEX, STROKE_FRAGMENT);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const instances = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!texture || !framebuffer || !instances || !vao) throw new Error('Field buffers unavailable');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    return {
      height,
      stroke,
      heightUniforms: locate(gl, height, ['time', 'aspect', 'grid'] as const),
      strokeUniforms: locate(gl, stroke, ['heights', 'aspect', 'size', 'quiet', 'backing', 'scale', 'strength'] as const),
      texture,
      framebuffer,
      instances,
      vao,
      float: gl.getExtension('EXT_color_buffer_float') !== null,
    };
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function heightTarget(gl: WebGL2RenderingContext, r: Resources, grid: GridSize, float: boolean): boolean {
  gl.bindTexture(gl.TEXTURE_2D, r.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, grid.columns, grid.rows, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, r.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return complete;
}

function allocateGrid(gl: WebGL2RenderingContext, r: Resources, grid: GridSize): boolean {
  gl.bindBuffer(gl.ARRAY_BUFFER, r.instances);
  gl.bufferData(gl.ARRAY_BUFFER, buildInstances(grid.columns, grid.rows), gl.STATIC_DRAW);
  if (r.float && heightTarget(gl, r, grid, true)) return true;
  r.float = false; // RGBA16F missing or not renderable here: packed RGBA8 (spec §7)
  return heightTarget(gl, r, grid, false);
}

function startField(canvas: HTMLCanvasElement, motion: boolean): Controller {
  const inputs: FieldInputs = {
    supported: false,
    documentHidden: document.hidden,
    windowBlurred: !document.hasFocus(),
    idle: false,
    reducedMotion: false,
    motionSetting: motion,
  };
  const reads: PixelRead[] = [];
  const e2e = new URLSearchParams(window.location.search).get('e2e') === '1';
  let resources: Resources | null = null;
  let frames = 0, frameTimer = 0, seamTimer = 0, idleTimer = 0, scrollTimer = 0, resizeTimer = 0;

  function rejectReads(): void {
    for (const read of reads.splice(0)) read.reject(new Error(NOT_DRAWING));
  }
  function readPixel(x: number, y: number): Promise<Pixel> {
    return new Promise((resolve, reject) => {
      if (!resources) {
        reject(new Error(NOT_DRAWING));
        return;
      }
      reads.push({ x, y, resolve, reject });
      // Animated frames answer on their next tick; otherwise one draw answers every read queued in this task.
      if (!frameTimer && !seamTimer) seamTimer = window.setTimeout(() => { seamTimer = 0; draw(); }, 0);
    });
  }
  if (e2e) window.__dharaField = { get frames() { return frames; }, readPixel };

  const context = canvas.getContext('webgl2', CONTEXT_OPTIONS);
  if (!context) {
    canvas.dataset.state = fieldState(inputs);
    return {
      setMotion() {},
      stop() {
        if (e2e) delete window.__dharaField;
      },
    };
  }
  const gl: WebGL2RenderingContext = context;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  inputs.reducedMotion = reduced.matches;
  let cssWidth = 1, cssHeight = 1, scale = 1;
  let quality = { quality: 0, slow: 0 };
  let grid: GridSize = gridSize(QUALITY_STEPS[0]);
  let quiet = packQuietRects([], 0, 0);
  let time = STATIC_TIME, last = 0, shown: FieldState = 'unsupported';
  let lastActivity = performance.now();

  function prepare(): void {
    resources = createResources(gl);
    if (resources && !allocateGrid(gl, resources, grid)) release();
    inputs.supported = resources !== null;
  }

  function answerReads(): void {
    if (reads.length === 0) return;
    const width = canvas.width, height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (const read of reads.splice(0)) {
      const bx = Math.min(width - 1, Math.max(0, Math.floor(read.x * scale)));
      const by = Math.min(height - 1, Math.max(0, height - 1 - Math.floor(read.y * scale)));
      const i = (by * width + bx) * 4;
      read.resolve([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]);
    }
  }

  function draw(): number {
    const r = resources;
    if (!r) return 0;
    const started = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.framebuffer);
    gl.viewport(0, 0, grid.columns, grid.rows);
    gl.disable(gl.BLEND);
    gl.useProgram(r.height);
    gl.uniform1f(r.heightUniforms.time, time);
    gl.uniform1f(r.heightUniforms.aspect, cssWidth / cssHeight);
    gl.uniform2f(r.heightUniforms.grid, grid.columns - 1, grid.rows - 1);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    gl.useProgram(r.stroke);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.texture);
    const u = r.strokeUniforms;
    gl.uniform1i(u.heights, 0);
    gl.uniform1f(u.aspect, cssWidth / cssHeight);
    gl.uniform2i(u.size, grid.columns, grid.rows);
    gl.uniform4fv(u.quiet, quiet);
    gl.uniform1f(u.backing, canvas.height);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.strength, cssWidth < 700 ? 0.75 : 1);
    gl.bindVertexArray(r.vao);
    gl.drawArraysInstanced(gl.LINES, 0, 2, grid.columns * grid.rows);
    gl.bindVertexArray(null);
    frames++;
    const drawMs = performance.now() - started;
    answerReads();
    return drawMs;
  }

  function release(): void {
    const r = resources;
    resources = null;
    if (!r) return;
    gl.deleteProgram(r.height);
    gl.deleteProgram(r.stroke);
    gl.deleteBuffer(r.instances);
    gl.deleteTexture(r.texture);
    gl.deleteFramebuffer(r.framebuffer);
    gl.deleteVertexArray(r.vao);
  }

  function regrid(): void {
    grid = gridSize(QUALITY_STEPS[quality.quality]);
    if (resources && !allocateGrid(gl, resources, grid)) {
      release();
      inputs.supported = false;
      apply();
    }
  }

  function tick(): void {
    frameTimer = 0;
    const now = performance.now();
    if (fieldState(inputs) !== 'animated') return; // hidden or paused: never draw decorative motion (handbook §21)
    const interval = last ? now - last : 0;
    if (last) time += Math.min(now - last, MAX_STEP_MS) * TIME_PER_MS;
    last = now;
    draw();
    const before = quality.quality;
    if (interval) quality = stepQuality(quality, interval); // measured tick interval, so GPU back-pressure counts
    if (quality.quality !== before) regrid();
    if (fieldState(inputs) === 'animated') frameTimer = window.setTimeout(tick, FRAME_INTERVAL_MS);
  }

  function measureQuiet(): boolean {
    const rects = removeContained(Array.from(document.querySelectorAll(QUIET_SELECTOR), (element) => element.getBoundingClientRect()));
    const next = packQuietRects(rects, cssWidth, cssHeight);
    const changed = next.some((value, i) => Math.abs(value - quiet[i]) > 0.5);
    quiet = next;
    return changed;
  }

  // force: the canvas content is stale (resize, un-hide), so a still state must redraw even though it did not change.
  function apply(force = false): void {
    const state: FieldState = fieldState(inputs);
    const entered = state !== shown;
    shown = state;
    canvas.dataset.state = state;
    window.clearTimeout(frameTimer);
    frameTimer = 0;
    last = 0;
    if (state === 'unsupported') {
      rejectReads();
      return;
    }
    if (state === 'static') time = STATIC_TIME;
    measureQuiet(); // a resize can move quiet surfaces without resizing them, which the ResizeObserver misses
    if (state === 'animated') tick();
    else if (!inputs.documentHidden && (entered || force)) draw(); // one still frame on entering static/paused; it also answers pending seam reads
  }

  function onQuietChange(): void {
    if (!resources || document.hidden) return;
    if (measureQuiet() && (shown === 'static' || shown === 'paused')) draw();
  }

  // Scroll and live-drag resize fire at display rate; one pending timer per kind keeps a still state to the animated frame budget.
  function onScroll(): void {
    if (!scrollTimer) scrollTimer = window.setTimeout(() => { scrollTimer = 0; onQuietChange(); }, FRAME_INTERVAL_MS);
  }
  function onResize(): void {
    if (!resizeTimer) resizeTimer = window.setTimeout(() => { resizeTimer = 0; resize(); }, FRAME_INTERVAL_MS);
  }

  function resize(): void {
    // The canvas is fixed to the layout viewport, which excludes a classic scrollbar that window.innerWidth includes.
    cssWidth = Math.max(1, canvas.clientWidth);
    cssHeight = Math.max(1, canvas.clientHeight);
    const backing = backingSize(cssWidth, cssHeight, window.devicePixelRatio);
    canvas.width = backing.width;
    canvas.height = backing.height;
    scale = backing.scale;
    apply(true);
  }

  function onVisibility(): void {
    inputs.documentHidden = document.hidden;
    apply(!document.hidden);
  }
  function onReduced(): void {
    inputs.reducedMotion = reduced.matches;
    apply();
  }
  function onBlur(event: Event): void {
    if (event.target !== event.currentTarget) return;
    inputs.windowBlurred = true;
    apply();
  }
  function onActivity(event: Event): void {
    lastActivity = performance.now();
    const windowFocus = event.type === 'focus' && event.target === event.currentTarget;
    const changed = inputs.idle || (windowFocus && inputs.windowBlurred);
    if (windowFocus) inputs.windowBlurred = false;
    inputs.idle = false;
    if (!idleTimer) idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS);
    if (changed) apply();
  }
  function checkIdle(): void {
    idleTimer = 0;
    const quietFor = performance.now() - lastActivity;
    if (quietFor >= IDLE_TIMEOUT_MS) {
      inputs.idle = true;
      apply();
      return;
    }
    idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS - quietFor);
  }
  function onLost(event: Event): void {
    event.preventDefault();
    resources = null;
    inputs.supported = false;
    apply();
  }
  function onRestored(): void {
    prepare();
    apply();
  }

  const resizeObserver = new ResizeObserver(onQuietChange);
  function observeQuiet(): void {
    resizeObserver.disconnect();
    document.querySelectorAll(QUIET_SELECTOR).forEach((element) => resizeObserver.observe(element));
    // Collapsing the sidebar moves every quiet surface without resizing it; the content host's width does change.
    resizeObserver.observe(document.querySelector('main') ?? document.body);
  }
  const mutationObserver = new MutationObserver(() => {
    observeQuiet();
    onQuietChange();
  });

  prepare();
  observeQuiet();
  mutationObserver.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
  ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, LISTEN));
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, LISTEN);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReduced);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  idleTimer = window.setTimeout(checkIdle, IDLE_TIMEOUT_MS);
  resize();

  return {
    setMotion(on) {
      if (inputs.motionSetting === on) return;
      inputs.motionSetting = on;
      apply();
    },
    stop() {
      window.clearTimeout(frameTimer);
      window.clearTimeout(seamTimer);
      window.clearTimeout(idleTimer);
      window.clearTimeout(scrollTimer);
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, LISTEN));
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, LISTEN);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      release();
      rejectReads();
      if (e2e) delete window.__dharaField;
    },
  };
}

/** Monochrome stroke terrain. Decorative only: it never takes input, and it stays calm under every [data-quiet] surface. */
export function BackgroundField({ motion }: { motion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = startField(canvas, motion);
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
    // The context is created once per mount; motion changes go through setMotion below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    controllerRef.current?.setMotion(motion);
  }, [motion]);
  return <canvas ref={canvasRef} className="background-field" aria-hidden="true" />;
}
