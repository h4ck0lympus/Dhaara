// Linux: Chromium's setuid sandbox helper must be root-owned 4755; Noema never uses --no-sandbox (spec §6.3).
// Port of experiments/ui-ab/scripts/launch.py:20-31: reuse an installed root-owned helper if one exists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/electron/dist/chrome-sandbox');
const SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox';
const configured = (file) => {
  try {
    const info = fs.statSync(file);
    return info.isFile() && info.uid === 0 && (info.mode & 0o4777) === 0o4755;
  } catch {
    return false;
  }
};

if (process.platform !== 'linux') process.exit(0);
if (!fs.existsSync(path.dirname(helper))) {
  console.error(`Electron is not installed (${path.dirname(helper)} is missing). Run: npm --prefix electron ci`);
  process.exit(1);
}
if (configured(helper)) process.exit(0);
if (!configured(SYSTEM_HELPER)) {
  console.error(`Electron needs a root-owned 4755 sandbox helper. Run: sudo chown root:root ${helper} && sudo chmod 4755 ${helper}`);
  process.exit(1);
}
const backup = `${helper}.bundled`;
if (fs.existsSync(backup)) fs.rmSync(helper, { force: true });
else fs.renameSync(helper, backup);
fs.symlinkSync(SYSTEM_HELPER, helper);
console.log('Using the installed root-owned Chromium sandbox helper; the bundled helper is preserved.');
