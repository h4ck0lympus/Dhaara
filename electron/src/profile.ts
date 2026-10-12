import path from 'node:path';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from './paths.js';

// The profile holds the session cookie: it is credential storage (spec §6.3).
export const PROFILE_MESSAGES = {
  noHome: 'Cannot locate profile; supply --profile PATH',
  dedicated: 'Choose a dedicated profile directory',
  create: 'Cannot create the Electron profile',
  protect: 'Cannot protect profile',
} as const;

export function resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string {
  if (option !== null) return absolutePath(option, cwd);
  const xdg = env.XDG_DATA_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : env.HOME ? path.join(env.HOME, '.local/share') : null;
  if (base === null) throw new Error(PROFILE_MESSAGES.noHome);
  return path.join(base, 'noema', 'electron');
}

export function prepareProfile(profile: string): void {
  if (!hasFinalComponent(profile)) throw new Error(PROFILE_MESSAGES.dedicated);
  const failed = ensurePrivateDir(profile);
  if (failed === 'create') throw new Error(PROFILE_MESSAGES.create);
  if (failed === 'protect') throw new Error(PROFILE_MESSAGES.protect);
}
