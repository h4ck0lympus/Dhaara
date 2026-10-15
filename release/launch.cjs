'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXIT_REFUSED = 3;
const NO_SANDBOX = 'Dhara: --no-sandbox is not supported.';
const SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox';

function dataHome(env) {
  const xdg = env.XDG_DATA_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(env.HOME || os.homedir(), '.local/share');
}

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

function decide({ env, argv, exe, dataHome: home, bundledHelper, facts }) {
  if (argv.some((a) => /^--?no-sandbox(=|$)/.test(a))) return { message: NO_SANDBOX };
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  const builtFor = facts.stat(exe)?.uid;
  const foreign = builtFor === facts.uid ? null : { message: ownerMessage(builtFor, facts.uid) };
  if (next.CHROME_DEVEL_SANDBOX) return foreign ?? { env: next };
  if (facts.userns()) return { env: next };
  if (foreign) return foreign;
  const user = path.join(home, 'dhara', 'chrome-sandbox');
  for (const file of [user, SYSTEM_HELPER]) {
    const info = facts.stat(file);
    if (info !== null && info.uid === 0 && (info.mode & 0o4000) !== 0) return { env: { ...next, CHROME_DEVEL_SANDBOX: file } };
  }
  try {
    fs.mkdirSync(path.dirname(user), { recursive: true, mode: 0o700 });
    fs.copyFileSync(bundledHelper, user);
    fs.chmodSync(user, 0o755);
  } catch {
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
  userns: () => spawnSync('unshare', ['-Urpn', 'true'], { stdio: 'ignore' }).status === 0,
  uid: process.getuid(),
};

function main() {
  const here = __dirname;
  const argv = process.argv.slice(2);
  const decision = decide({ env: process.env, argv, exe: process.execPath, dataHome: dataHome(process.env), bundledHelper: path.join(here, 'chrome-sandbox'), facts });
  if (decision.message !== undefined) {
    process.stderr.write(`${decision.message}\n`);
    process.exit(EXIT_REFUSED);
  }
  const child = spawn(path.join(here, '..', 'dhara'), argv, { stdio: 'inherit', env: decision.env });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', (error) => {
    process.stderr.write(`Dhara: ${error.message}\n`);
    process.exit(EXIT_REFUSED);
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

module.exports = { EXIT_REFUSED, NO_SANDBOX, SYSTEM_HELPER, dataHome, decide, helperMessage, ownerMessage };
if (require.main === module) main();
