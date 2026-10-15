import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_TOKEN = 'e2e-admin-token-0123456789abcdef';
export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const WEB_DIST = join(REPO, 'web', 'dist');
export const PYTHON = join(REPO, '.venv', 'bin', 'python');
const STARTUP_MS = 15_000;
const SERVE_DIST = [
  'import sys, uvicorn',
  'from dhara.server import create_app',
  "uvicorn.run(create_app(sys.argv[2], dist_dir=sys.argv[3]), host='127.0.0.1', port=int(sys.argv[1]), access_log=False)",
].join('\n');

export type DharaServer = {
  origin: string;
  port: number;
  dataDir: string;
  api<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  kill(): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
};

export type StartOptions = { dataDir?: string; env?: Record<string, string>; port?: number; distDir?: string };

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(DHARA|NOEMA)_/.test(key)) env[key] = value;   // rename-shim: both prefixes
  return { ...env, DHARA_ACCESS_TOKEN: E2E_TOKEN, ...extra };
}

export async function startDhara(options: StartOptions = {}): Promise<DharaServer> {
  if (!existsSync(join(options.distDir ?? WEB_DIST, 'index.html'))) throw new Error('Run npm --prefix web run build first');
  const ownsDataDir = options.dataDir === undefined;
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'dhara-e2e-'));
  let port = options.port ?? 0;
  const args = () =>
    options.distDir === undefined
      ? [join(REPO, 'run.py'), '--host', '127.0.0.1', '--port', String(port), '--data-dir', dataDir]
      : ['-c', SERVE_DIST, String(port), dataDir, options.distDir];
  let child: ChildProcess | null = null;

  async function launch(): Promise<void> {
    let stderr = '';
    let bound = 0;
    const proc = spawn(PYTHON, args(), { cwd: REPO, env: childEnv(options.env ?? {}), stdio: ['ignore', 'ignore', 'pipe'] });
    child = proc;
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
      bound ||= Number(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/.exec(stderr)?.[1] ?? 0);
    });
    const deadline = performance.now() + STARTUP_MS;
    while (performance.now() < deadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Dhara exited during startup (${proc.exitCode ?? proc.signalCode}):\n${stderr}`);
      if (bound) {
        port = bound;
        try {
          if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
        } catch {
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    proc.kill('SIGKILL');
    throw new Error(`Dhara did not answer /api/health within ${STARTUP_MS} ms:\n${stderr}`);
  }

  async function terminate(signal: NodeJS.Signals): Promise<void> {
    const proc = child;
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    proc.kill(signal);
    const escalate = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(escalate);
  }

  await launch();
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    port,
    dataDir,
    async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const response = await fetch(origin + path, {
        method,
        headers: {
          Authorization: `Bearer ${E2E_TOKEN}`,
          'X-Dhara-Request': '1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
      return (text ? JSON.parse(text) : null) as T;
    },
    kill: () => terminate('SIGKILL'),
    async restart() {
      await terminate('SIGTERM');
      await launch();
    },
    async stop() {
      await terminate('SIGTERM');
      if (ownsDataDir) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
