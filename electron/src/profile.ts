import fs from 'node:fs';
import path from 'node:path';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from './paths.js';

export const PROFILE_MESSAGES = {
  noHome: 'Cannot locate profile; supply --profile PATH',
  dedicated: 'Choose a dedicated profile directory',
  create: 'Cannot create the Electron profile',
  protect: 'Cannot protect profile',
} as const;

export function dataHome(env: NodeJS.ProcessEnv): string {
  const xdg = env.XDG_DATA_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : env.HOME ? path.join(env.HOME, '.local/share') : null;
  if (base === null) throw new Error(PROFILE_MESSAGES.noHome);
  return base;
}

export function resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string {
  if (option !== null) return absolutePath(option, cwd);
  return path.join(dataHome(env), 'dhara', 'electron');
}

export function legacyProfile(env: NodeJS.ProcessEnv): string {
  return path.join(dataHome(env), 'noema', 'electron');   // rename-shim: old default location
}

export function adoptLegacyProfile(profile: string, legacy: string, log: (line: string) => void): string {
  if (fs.existsSync(profile) || !fs.existsSync(legacy)) return profile;
  try {
    fs.mkdirSync(path.dirname(profile), { recursive: true, mode: 0o700 });
    fs.renameSync(legacy, profile);
    return profile;
  } catch (error) {
    log(`Dhara: could not move the profile from ${legacy} to ${profile} (${(error as NodeJS.ErrnoException).code ?? 'error'}); using the old location`);
    return legacy;
  }
}

export function prepareProfile(profile: string): void {
  if (!hasFinalComponent(profile)) throw new Error(PROFILE_MESSAGES.dedicated);
  const failed = ensurePrivateDir(profile);
  if (failed === 'create') throw new Error(PROFILE_MESSAGES.create);
  if (failed === 'protect') throw new Error(PROFILE_MESSAGES.protect);
}
