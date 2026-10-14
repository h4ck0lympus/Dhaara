// DHARA_<name> with a NOEMA_<name> fallback (rename spec §4.1). The dated follow-up deletes LEGACY_PREFIX and the fallback branch.
export const PREFIX = 'DHARA_';
export const LEGACY_PREFIX = 'NOEMA_';   // rename-shim: read-only fallback for one release
export const STRIPPED_NAMES = ['MODEL', 'SPEECH_MODEL', 'TOKEN', 'ACCESS_TOKEN', 'ALLOWED_HOSTS', 'ALLOW_REMOTE_MODEL', 'DATA_DIR'] as const;
/** Managed launch strips every optional feature and credential under both prefixes (spec §6.4.2). */
export const STRIPPED_ENV: readonly string[] = [PREFIX, LEGACY_PREFIX].flatMap((prefix) => STRIPPED_NAMES.map((name) => prefix + name));

const warned = new Set<string>();
const stderr = (line: string) => { process.stderr.write(`${line}\n`); };

/** DHARA_<name>, else NOEMA_<name> (one deprecation line per process and name), else undefined. */
export function env(name: string, source: NodeJS.ProcessEnv = process.env, log: (line: string) => void = stderr): string | undefined {
  const value = source[PREFIX + name];
  if (value !== undefined) return value;
  const legacy = source[LEGACY_PREFIX + name];
  if (legacy === undefined) return undefined;
  if (!warned.has(name)) {
    warned.add(name);
    log(`Dhara: ${LEGACY_PREFIX}${name} is deprecated; set ${PREFIX}${name} instead`);
  }
  return legacy;
}
