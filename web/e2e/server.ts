import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_TOKEN = 'e2e-admin-token-0123456789abcdef';
export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const WEB_DIST = join(REPO, 'web', 'dist');
const PYTHON = join(REPO, '.venv', 'bin', 'python');
const STARTUP_MS = 15_000;
// run.py always serves web/dist; an injected dist goes through create_app(dist_dir=…) directly.
const SERVE_DIST = [
  'import sys, uvicorn',
  'from noema.server import create_app',
  "uvicorn.run(create_app(sys.argv[2], dist_dir=sys.argv[3]), host='127.0.0.1', port=int(sys.argv[1]), access_log=False)",
].join('\n');

export type NoemaServer = {
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
  // Inherited NOEMA_* (models, tokens, data dir, allowed hosts) must never leak into a test service.
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('NOEMA_')) env[key] = value;
  return { ...env, NOEMA_ACCESS_TOKEN: E2E_TOKEN, ...extra };
}

export async function startNoema(options: StartOptions = {}): Promise<NoemaServer> {
  if (!existsSync(join(options.distDir ?? WEB_DIST, 'index.html'))) throw new Error('Run npm --prefix web run build first');
  const ownsDataDir = options.dataDir === undefined;
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'noema-e2e-'));
  const port = options.port ?? (await getFreePort());
  const origin = `http://127.0.0.1:${port}`;
  const args =
    options.distDir === undefined
      ? [join(REPO, 'run.py'), '--host', '127.0.0.1', '--port', String(port), '--data-dir', dataDir]
      : ['-c', SERVE_DIST, String(port), dataDir, options.distDir];
  let child: ChildProcess | null = null;

  async function launch(): Promise<void> {
    let stderr = '';
    const proc = spawn(PYTHON, args, { cwd: REPO, env: childEnv(options.env ?? {}), stdio: ['ignore', 'ignore', 'pipe'] });
    child = proc;
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    const deadline = Date.now() + STARTUP_MS;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Noema exited during startup (${proc.exitCode ?? proc.signalCode}):\n${stderr}`);
      try {
        if ((await fetch(origin + '/api/health')).ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    proc.kill('SIGKILL');
    throw new Error(`Noema did not answer /api/health within ${STARTUP_MS} ms:\n${stderr}`);
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
  return {
    origin,
    port,
    dataDir,
    async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const response = await fetch(origin + path, {
        method,
        headers: {
          Authorization: `Bearer ${E2E_TOKEN}`,
          'X-Noema-Request': '1',
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
