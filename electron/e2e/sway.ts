import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, until } from '../test/proc.js';

const CONFIG = 'xwayland disable\noutput * bg #101110 solid_color\noutput HEADLESS-1 mode 1440x960 position 0 0\ndefault_border none\n';

export default async function startPrivateSway(): Promise<() => Promise<void>> {
  const dir = tempDir('dhara-e2e-sway-');
  const runtime = path.join(dir, 'runtime');
  fs.mkdirSync(runtime, { mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'sway.config'), CONFIG);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ['SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY']) delete env[key];
  Object.assign(env, { XDG_RUNTIME_DIR: runtime, WLR_BACKENDS: 'headless', WLR_LIBINPUT_NO_DEVICES: '1', WLR_RENDERER: 'pixman' });
  const sway = spawn('sway', ['-c', path.join(dir, 'sway.config')], { env, stdio: 'ignore' });
  const sockets = () => fs.readdirSync(runtime).filter((name) => /^wayland-\d+$/.test(name));
  await until(() => {
    if (sway.exitCode !== null) throw new Error('Private Sway failed to start');
    return sockets().length > 0 && fs.readdirSync(runtime).some((name) => name.startsWith('sway-ipc.'));
  }, 20_000);
  Object.assign(process.env, { XDG_RUNTIME_DIR: runtime, WAYLAND_DISPLAY: sockets()[0], SWAYSOCK: path.join(runtime, fs.readdirSync(runtime).find((name) => name.startsWith('sway-ipc.'))!) });
  delete process.env.DISPLAY;
  delete process.env.DBUS_SESSION_BUS_ADDRESS;
  return async () => {
    sway.kill('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
