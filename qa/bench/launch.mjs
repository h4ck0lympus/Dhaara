// THROWAWAY: launch the built Electron app through Playwright with chromiumSandbox: true (never --no-sandbox).
// argv: <wrapper-executable> <server-origin> <profile-dir>. Prints {"pid":N} once the first window exists; quits on stdin close.
import { createRequire } from 'node:module';
import { join } from 'node:path';
const dir = '/home/p4nic/code/noema/electron';
const { _electron } = createRequire(join(dir, 'package.json'))('@playwright/test');
const [exe, server, profile] = process.argv.slice(2);
const app = await _electron.launch({ executablePath: exe, chromiumSandbox: true, timeout: 30_000, args: [dir, '--server', server, '--profile', profile] });
const win = await app.firstWindow();
await win.getByText('Server connected').first().waitFor({ timeout: 30_000 });
console.log(JSON.stringify({ pid: app.process().pid }));
process.stdin.on('end', async () => { try { await app.close(); } catch {} process.exit(0); });
process.stdin.resume();
