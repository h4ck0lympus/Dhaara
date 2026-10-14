#!/usr/bin/env python3
"""THROWAWAY terrain budget run for spec 7 (decision 13B: never committed). Reuses bench.py's Sway/sample/keyboard.
Samples only the Electron tree (service in its own scope, excluded). Electron is launched by Playwright with chromiumSandbox: true."""
import json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
import bench
from bench import Host, Sway, keyboard, record, sample

bench.SWAY_CONFIG = bench.SWAY_CONFIG.replace('mode 1440x960', 'mode 1440x900')
REPO = Path('/home/p4nic/code/noema')
HERE = Path(__file__).resolve().parent
ELECTRON = REPO / 'electron/node_modules/electron/dist' / (REPO / 'electron/node_modules/electron/path.txt').read_text().strip()
NODE = Path(os.environ['NODE_BIN']) if 'NODE_BIN' in os.environ else Path(shutil.which('node'))
PORT = 8799
TOKEN = 'terrain-bench-token-0123456789abcdef'
ORIGIN = f'http://127.0.0.1:{PORT}'


class Pid:  # stands in for a Popen: bench.Host only needs pid, poll, terminate, kill, wait
    def __init__(self, pid): self.pid = pid
    def poll(self): return None if Path(f'/proc/{self.pid}').exists() else 0
    def terminate(self): os.kill(self.pid, 15)
    def kill(self): os.kill(self.pid, 9)
    def wait(self, timeout=None):
        end = time.monotonic() + (timeout or 1e9)
        while self.poll() is None:
            if time.monotonic() > end: raise subprocess.TimeoutExpired('electron', timeout)
            time.sleep(.1)


class NoemaHost(Host):
    def __init__(self, sway):
        self.name, self.sway, self.procs, self.logs, self.units = 'noema', sway, {}, {}, []
        self.run_id = 'terrain-' + os.urandom(6).hex()
        bench.RUN_IDS.append(self.run_id)
        self.t0 = time.monotonic()
        self.data = Path(tempfile.mkdtemp(prefix='noema-terrain-data-'))
        self.profile = Path(tempfile.mkdtemp(prefix='noema-terrain-profile-'))
        self.launcher = None
        self.env = {k: v for k, v in sway.env.items() if not k.startswith('NOEMA_')} | {'NOEMA_ACCESS_TOKEN': TOKEN}
        self.service = subprocess.Popen(
            self.scoped('service', [str(REPO / '.venv/bin/python'), str(REPO / 'run.py'), '--host', '127.0.0.1',
                                    '--port', str(PORT), '--data-dir', str(self.data)]),
            cwd=REPO, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            self.wait_health()
            self.api('PATCH', '/api/settings', {'motion': True})
            unit = f'{self.run_id}-shell'
            self.units.append(unit)
            env = dict(self.env, NOEMA_BENCH_UNIT=unit, NOEMA_BENCH_ELECTRON=str(ELECTRON))
            self.launcher = subprocess.Popen([str(NODE), str(HERE / 'launch.mjs'), str(HERE / 'electron-scope.sh'), ORIGIN, str(self.profile)],
                                             cwd=REPO, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            line = self.launcher.stdout.readline()
            if not line: raise RuntimeError('Electron launcher failed (sandbox or window)')
            self.procs['shell'] = Pid(json.loads(line)['pid'])
            cmdline = Path(f'/proc/{self.procs["shell"].pid}/cmdline').read_bytes()
            assert b'--no-sandbox' not in cmdline, 'sandbox was disabled'
        except BaseException:
            self.stop()
            raise

    def api(self, method, path, body):
        request = urllib.request.Request(ORIGIN + path, data=json.dumps(body).encode(), method=method, headers={
            'Authorization': f'Bearer {TOKEN}', 'X-Noema-Request': '1', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())

    def wait_health(self, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.service.poll() is not None: raise RuntimeError('run.py exited during startup')
            try:
                with urllib.request.urlopen(ORIGIN + '/api/health', timeout=1): return
            except OSError: time.sleep(.2)
        raise RuntimeError('run.py never became healthy')

    def stop(self, timeout=8):
        if self.launcher and self.launcher.poll() is None:
            try: self.launcher.stdin.close(); self.launcher.wait(timeout)
            except Exception: self.launcher.kill()
        if 'shell' in self.procs: super().stop(timeout)
        if self.service.poll() is None:
            self.service.terminate()
            try: self.service.wait(timeout)
            except subprocess.TimeoutExpired: self.service.kill(); self.service.wait()
        shutil.rmtree(self.data, ignore_errors=True); shutil.rmtree(self.profile, ignore_errors=True)


def frames_change(sway, tag):
    shots = bench.OUT / 'terrain-shots'; shots.mkdir(exist_ok=True)
    a, b = shots / f'{tag}-1.png', shots / f'{tag}-2.png'
    if not sway.grim(a): raise RuntimeError('grim failed')
    time.sleep(1)
    if not sway.grim(b): raise RuntimeError('grim failed')
    return a.read_bytes() != b.read_bytes()


def run(runs=3):
    for i in range(runs):
        sway, host = Sway('gles2'), None
        try:
            host = NoemaHost(sway)
            if not host.wait_mapped(): raise RuntimeError('Electron window never mapped on the private Sway')
            time.sleep(10)
            view = host.main_view()
            sway.msg(f'[pid={view["pid"]}] focus')
            k, send = keyboard(sway)
            res = {'rect': view['rect']}
            send('x')
            res['animated_frames_change'] = frames_change(sway, f'{host.run_id}-animated')
            stop = threading.Event()
            def poke():
                while not stop.wait(5): send('x')
            poker = threading.Thread(target=poke, daemon=True); poker.start()
            try: res['animated'] = sample(host, 30, label='animated')
            finally: stop.set(); poker.join()
            k.stdin.close(); k.wait(5)
            time.sleep(65)
            res['paused_frames_change'] = frames_change(sway, f'{host.run_id}-paused')
            res['paused'] = sample(host, 30, label='paused-idle')
            sway.msg(f'[pid={view["pid"]}] move scratchpad')
            time.sleep(5)
            res['hidden_views_visible'] = [v.get('visible') for v in sway.views() if v['pid'] in set(host.pids())]
            res['hidden'] = sample(host, 30, label='hidden')
            record('terrain', run=i, alive=host.alive(), **res)
        except Exception as error:  # noqa: BLE001
            record('terrain', run=i, ok=False, err=repr(error)[:300])
        finally:
            if host: host.stop()
            sway.stop(); time.sleep(2)


if __name__ == '__main__':
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
