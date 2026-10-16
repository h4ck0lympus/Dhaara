import net from 'node:net';
import path from 'node:path';
import { managedPort } from './lifecycle.js';
import { absolutePath } from './paths.js';

export type CliOptions = {
  server: string;
  profile: string | null;
  manageService: boolean;
  dataDir: string | null;
  python: string;
  entryPoint: string;
  startupTimeoutMs: number;
  companion: boolean;
};

export class CliError extends Error {}

export const DEFAULT_SERVER = 'http://127.0.0.1:8765';
const LOOPBACK_ONLY = 'Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765';
const UNKNOWN = 'Unknown argument; use --help. No token file is needed by the webview.';
const RUST_F64 = /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|inf|infinity|nan)$/i;
const VALUE_FLAGS: Record<string, string> = {
  '--server': '--server needs a URL',
  '--profile': '--profile needs a path',
  '--data-dir': '--data-dir needs a path',
  '--python': '--python needs a path',
  '--entry-point': '--entry-point needs a path',
  '--startup-timeout': '--startup-timeout needs seconds',
};

export const HELP_TEXT = [
  'Dhara Electron desktop',
  'Default: external service; start Python separately.',
  '--server http://127.0.0.1:8765 --profile /path/to/private/profile',
  'Opt-in Linux development mode: --manage-service --data-dir /path/to/workspace',
  'Optional: --python /path/to/python --entry-point /path/to/run.py --startup-timeout 15 --no-companion',
  'Relative paths resolve against the launch directory (electron/ under npm --prefix).',
  'Close checkpoints your drafts, then quits and stops an owned service. Retry is explicit.',
  'Browser and old webview drafts are NOT migrated into this separate Electron profile.',
].join('\n');

export function helpText(packaged: PackagedFacts | null): string {
  if (packaged === null) return HELP_TEXT;
  return HELP_TEXT.replace('Default: external service; start Python separately.', `Default: managed service on ${path.join(packaged.dataHome, 'dhara', 'workspace')}; --server <url> connects to an external service.`);
}

export function userArgv(argv: readonly string[], defaultApp: boolean): string[] {
  if (!defaultApp) return argv.slice(1);
  const appPath = argv.findIndex((arg, index) => index > 0 && !arg.startsWith('-'));
  return appPath < 0 ? [] : argv.slice(appPath + 1);
}

function isLoopbackLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIPv4(host)) return host.split('.')[0] === '127';
  return net.isIPv6(host) && host === '::1';
}

export function validateServer(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('Invalid service URL');
  }
  if (url.protocol !== 'http:' || !isLoopbackLiteral(url.hostname) || url.href !== `${url.origin}/`) throw new CliError(LOOPBACK_ONLY);
  return url.origin;
}

export type PackagedFacts = { resourcesPath: string; dataHome: string };

export function parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv, packaged: PackagedFacts | null = null): CliOptions | 'help' {
  const values = new Map<string, string>();
  let manageService = false;
  let companion = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return 'help';
    if (arg === '--no-companion') {
      companion = false;
      continue;
    }
    if (arg === '--manage-service') {
      manageService = true;
      continue;
    }
    if (!Object.hasOwn(VALUE_FLAGS, arg)) throw new CliError(UNKNOWN);
    const value = argv[index + 1];
    if (value === undefined) throw new CliError(VALUE_FLAGS[arg]);
    index += 1;
    if (arg === '--startup-timeout' && !RUST_F64.test(value)) throw new CliError('Invalid startup timeout');
    values.set(arg, value);
  }
  const server = validateServer(values.get('--server') ?? DEFAULT_SERVER);
  const seconds = Number(values.get('--startup-timeout') ?? '15');
  if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 60) throw new CliError('Use a startup timeout from 0.1 to 60 seconds');
  const packagedDefaults = packaged !== null && !values.has('--server') && !manageService ? packaged : null;
  if (packagedDefaults !== null) manageService = true;
  const dataDir = values.get('--data-dir') ?? (packagedDefaults === null ? undefined : path.join(packagedDefaults.dataHome, 'dhara', 'workspace'));
  if (!manageService && dataDir !== undefined) {
    throw new CliError('--data-dir requires explicit --manage-service; external mode never owns a service');
  }
  if (manageService) {
    if (process.platform !== 'linux') throw new CliError('Managed development mode is supported only on Linux');
    if (dataDir === undefined) throw new CliError('Managed mode requires an explicit --data-dir; no implicit real notebook');
    if (server !== `http://127.0.0.1:${managedPort(env)}`) throw new CliError('Managed mode uses http://127.0.0.1:8765 only');
  }
  return {
    server,
    profile: values.get('--profile') ?? null,
    manageService,
    dataDir: dataDir === undefined ? null : absolutePath(dataDir, cwd),
    python: absolutePath(values.get('--python') ?? (packaged === null ? path.join(repoRoot, '.venv/bin/python') : path.join(packaged.resourcesPath, 'service/dhara-service/dhara-service')), cwd),
    entryPoint: absolutePath(values.get('--entry-point') ?? (packaged === null ? path.join(repoRoot, 'run.py') : ''), cwd),
    startupTimeoutMs: Math.round(seconds * 1000),
    companion,
  };
}
