'use strict';
// Dhara's AppImage launcher (packaging spec §5). AppRun runs this file as plain Node inside the bundled Electron
// (ELECTRON_RUN_AS_NODE=1), before Chromium starts: it decides the sandbox helper once, then starts the real app
// and exits with its code. decide() is unit-tested with injected facts (electron/test/launch.test.ts).
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXIT_REFUSED = 3;
const NO_SANDBOX = 'Dhara: --no-sandbox is not supported.';
const SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox';   // the same fallback as electron/scripts/link-sandbox.mjs

/** $XDG_DATA_HOME when absolute, else ~/.local/share (electron/src/profile.ts dataHome, but this one must still print a line). */
function dataHome(env) {
  const xdg = env.XDG_DATA_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(env.HOME || os.homedir(), '.local/share');
}

/** Spec §5 rule 4 for the user-owned copy decide() makes: the two commands electron/scripts/link-sandbox.mjs prints; the last line is spec §10's nosuid alternative. */
function helperMessage(target) {
  return [
    "Dhara: Chromium's sandbox helper must be owned by root on this system. Run once:",
    `  sudo chown root:root ${target} && sudo chmod 4755 ${target}`,
    'then start Dhara again. (Dhara never runs without the sandbox.)',
    `If your home directory is mounted nosuid, install that file as ${SYSTEM_HELPER} instead.`,
  ].join('\n');
}

function ownerMessage(builtFor, uid) {
  return `Dhara: this AppImage was built for user id ${builtFor} and you are user id ${uid}, so Chromium would ignore the sandbox helper. Extract it once (--appimage-extract) and start squashfs-root/AppRun.`;
}

/**
 * Spec §5 rules 1–4 with injected facts: { stat(file) → { uid, mode } | null, userns() → boolean, uid }; exe is the running binary.
 * Returns { env } for the real process (ELECTRON_RUN_AS_NODE removed) or { message } to print before exiting EXIT_REFUSED.
 * Chromium reads CHROME_DEVEL_SANDBOX only when no chrome-sandbox sits beside the binary and the binary belongs to the
 * running user (sandbox/linux/suid/client/setuid_sandbox_host.cc), so a helper is usable only for the uid the image was built for.
 */
function decide({ env, argv, exe, dataHome: home, bundledHelper, facts }) {
  if (argv.some((a) => /^--?no-sandbox(=|$)/.test(a))) return { message: NO_SANDBOX };  // Chromium accepts -flag and --flag=value
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;                                     // otherwise the child would also run as Node
  const builtFor = facts.stat(exe)?.uid;
  const foreign = builtFor === facts.uid ? null : { message: ownerMessage(builtFor, facts.uid) };
  if (next.CHROME_DEVEL_SANDBOX) return foreign ?? { env: next };       // 1: an explicit helper is used as is
  if (facts.userns()) return { env: next };                             // 2: the namespace sandbox needs no helper
  if (foreign) return foreign;                                          // 0: no helper works for this uid, so search and copy nothing
  const user = path.join(home, 'dhara', 'chrome-sandbox');
  for (const file of [user, SYSTEM_HELPER]) {                           // 3: the first root-owned setuid file wins
    const info = facts.stat(file);
    if (info !== null && info.uid === 0 && (info.mode & 0o4000) !== 0) return { env: { ...next, CHROME_DEVEL_SANDBOX: file } };
  }
  try {
    fs.mkdirSync(path.dirname(user), { recursive: true, mode: 0o700 }); // 4: a user-owned copy for the one-time line
    fs.copyFileSync(bundledHelper, user);                               // the image is unmounted once this process exits, so the line must not name it
    fs.chmodSync(user, 0o755);
  } catch {
    // the message still names the path (a root-owned copy from an earlier run refuses the overwrite: only the chmod is missing)
  }
  return { message: helperMessage(user) };
}

const facts = {
  stat(file) {
    try {
      const info = fs.statSync(file);
      return { uid: info.uid, mode: info.mode };
    } catch {
      return null;
    }
  },
  // The user, pid and net namespaces Chromium's namespace sandbox creates. A missing unshare gives status null, which counts as "no namespaces" and falls through to the helper search (spec §10).
  userns: () => spawnSync('unshare', ['-Urpn', 'true'], { stdio: 'ignore' }).status === 0,
  uid: process.getuid(),
};

function main() {
  const here = __dirname;                                               // <AppDir>/usr/lib/dhara/resources
  const argv = process.argv.slice(2);                                   // [dhara, launch.cjs, ...user arguments]
  const decision = decide({ env: process.env, argv, exe: process.execPath, dataHome: dataHome(process.env), bundledHelper: path.join(here, 'chrome-sandbox'), facts });
  if (decision.message !== undefined) {
    process.stderr.write(`${decision.message}\n`);
    process.exit(EXIT_REFUSED);
  }
  // No app path argument: with default_app.asar gone Electron loads resources/app itself, so every argument reaches cli.ts.
  const child = spawn(path.join(here, '..', 'dhara'), argv, { stdio: 'inherit', env: decision.env });
  process.on('SIGTERM', () => child.kill('SIGTERM'));                   // a desktop "quit" reaches this pid; Electron then runs its close checkpoint
  child.on('error', (error) => {
    process.stderr.write(`Dhara: ${error.message}\n`);
    process.exit(EXIT_REFUSED);
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

module.exports = { EXIT_REFUSED, NO_SANDBOX, SYSTEM_HELPER, dataHome, decide, helperMessage, ownerMessage };
if (require.main === module) main();
