#!/usr/bin/env python3
"""THROWAWAY A/B host benchmark in a private headless Sway (Xwayland disabled).

Never touches the user's session: own XDG_RUNTIME_DIR, own Sway, no DISPLAY.
Results are JSON lines in OUT/results.jsonl.
"""
import json, os, re, shutil, signal, subprocess, sys, tempfile, time, secrets, threading, queue, statistics
from pathlib import Path

UI = Path('/home/p4nic/code/noema/experiments/ui-ab')
sys.path.insert(0, '/home/p4nic/code/noema/qa')
from process_sample import measure  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('BENCH_OUT', HERE / 'out'))
OUT.mkdir(parents=True, exist_ok=True)
ELECTRON = UI / 'node_modules/electron/dist' / (UI / 'node_modules/electron/path.txt').read_text().strip()
WRY = UI / 'hosts/wry/target/release/noema-ui-ab-wry'
SWAY_CONFIG = """xwayland disable
output * bg #101110 solid_color
output HEADLESS-1 mode 1440x960 position 0 0
default_border none
focus_follows_mouse no
"""
RUN_IDS = []


def record(kind, **data):
    data = {'kind': kind, 't': time.time(), **data}
    with (OUT / 'results.jsonl').open('a') as f:
        f.write(json.dumps(data) + '\n')
    print(json.dumps({k: v for k, v in data.items() if k != 'samples'})[:600], flush=True)


# ---------------------------------------------------------------- compositor
class Sway:
    def __init__(self, renderer='gles2', scale=1.0):
        self.runtime = Path(tempfile.mkdtemp(prefix='noema-bench-'))
        os.chmod(self.runtime, 0o700)
        (self.runtime / 'sway.config').write_text(SWAY_CONFIG + f'output HEADLESS-1 scale {scale}\n')
        env = {k: v for k, v in os.environ.items()
               if k not in ('SWAYSOCK', 'WAYLAND_DISPLAY', 'DISPLAY', 'XAUTHORITY', 'I3SOCK')}
        env.update(XDG_RUNTIME_DIR=str(self.runtime), WLR_BACKENDS='headless',
                   WLR_HEADLESS_OUTPUTS='1', WLR_LIBINPUT_NO_DEVICES='1', WLR_RENDERER=renderer,
                   XDG_SESSION_TYPE='wayland', GDK_BACKEND='wayland')
        if renderer == 'pixman':
            env.update(LIBGL_ALWAYS_SOFTWARE='1', WEBKIT_DISABLE_DMABUF_RENDERER='1')
        self.renderer = renderer
        self.log = open(self.runtime / 'sway.log', 'w')
        self.proc = subprocess.Popen(['sway', '-c', str(self.runtime / 'sway.config')], env=env,
                                     stdout=self.log, stderr=subprocess.STDOUT)
        for _ in range(200):
            socks = list(self.runtime.glob('sway-ipc.*.sock'))
            way = [p for p in self.runtime.glob('wayland-*') if not p.name.endswith('.lock')]
            if socks and way:
                break
            if self.proc.poll() is not None:
                raise RuntimeError('sway died: ' + (self.runtime / 'sway.log').read_text()[-800:])
            time.sleep(.05)
        else:
            raise RuntimeError('sway sockets missing')
        env.update(SWAYSOCK=str(socks[0]), WAYLAND_DISPLAY=way[0].name)
        self.env = env

    def msg(self, cmd=None, kind=None):
        args = ['swaymsg', '-s', self.env['SWAYSOCK']] + (['-t', kind] if kind else []) + ([cmd] if cmd else [])
        r = subprocess.run(args, capture_output=True, text=True, timeout=10)
        try:
            return json.loads(r.stdout)
        except json.JSONDecodeError:
            return r.stdout

    def tree(self):
        return self.msg(kind='get_tree')

    def views(self):
        out = []
        def walk(n):
            if n.get('pid') and n.get('type') in ('con', 'floating_con'):
                out.append(n)
            for c in n.get('nodes', []) + n.get('floating_nodes', []):
                walk(c)
        walk(self.tree())
        return out

    def grim(self, path):
        return subprocess.run(['grim', str(path)], env=self.env, capture_output=True, timeout=15).returncode == 0

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill(); self.proc.wait()
        self.log.close()
        shutil.rmtree(self.runtime, ignore_errors=True)


# ---------------------------------------------------------------- processes
def children_map():
    m = {}
    for p in Path('/proc').iterdir():
        if p.name.isdigit():
            try:
                st = (p / 'stat').read_text()
                ppid = int(st[st.rindex(')') + 2:].split()[1])
                m.setdefault(ppid, []).append(int(p.name))
            except (OSError, ValueError):
                pass
    return m


def tree_pids(root):
    m, out, stack = children_map(), [], [root]
    while stack:
        p = stack.pop(); out.append(p); stack.extend(m.get(p, []))
    return out


def gpu_ns(pids):
    """Sum DRM fdinfo engine busy time (ns), deduplicated by drm-client-id."""
    seen, total = {}, 0
    for pid in pids:
        fd = Path(f'/proc/{pid}/fdinfo')
        try:
            entries = list(fd.iterdir())
        except OSError:
            continue
        for e in entries:
            try:
                text = e.read_text()
            except OSError:
                continue
            if 'drm-client-id' not in text:
                continue
            cid = re.search(r'drm-client-id:\s*(\d+)', text).group(1)
            busy = sum(int(v) for v in re.findall(r'drm-engine-[\w-]+:\s*(\d+) ns', text))
            seen[cid] = max(seen.get(cid, 0), busy)
    return sum(seen.values())


class Host:
    """Replicates scripts/launch.py with --ozone-platform=wayland and release Wry."""

    def __init__(self, name, sway, companion=False, cdp=False, size=(1440, 900)):
        self.name, self.sway, self.procs = name, sway, {}
        self.run_id = 'bench-' + secrets.token_hex(6)
        RUN_IDS.append(self.run_id)
        env = dict(sway.env, NOEMA_RUN_ID=self.run_id, NOEMA_WIDTH=str(size[0]), NOEMA_HEIGHT=str(size[1]))
        self.env = env
        self.logs = {}
        self.units = []
        self.t0 = time.monotonic()
        if companion:
            env['NOEMA_COMPANION_SECRET'] = secrets.token_urlsafe(32)
            env['NOEMA_COMPANION_HOST'] = name
            self.procs['companion'] = self._spawn('companion', [str(ELECTRON), str(UI / 'dist-host/hosts/companion/main.mjs'), '--ozone-platform=wayland'])
        if name == 'b':
            args = [str(ELECTRON), str(UI / 'dist-host/hosts/electron/main.mjs'), '--ozone-platform=wayland']
            if cdp:
                args += ['--remote-debugging-port=9339', '--remote-allow-origins=http://127.0.0.1']
            self.procs['shell'] = self._spawn('shell', args)
        else:
            srv = subprocess.Popen(self.scoped('service', [sys.executable, str(UI / 'scripts/serve.py'), '--port', '8791']), cwd=UI,
                                   env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            self.procs['service'] = srv
            line = srv.stdout.readline()
            if not line.startswith(b'Isolated Noema demo:'):
                raise RuntimeError('demo server did not bind')
            self.procs['shell'] = subprocess.Popen(self.scoped('shell', [str(WRY)]), cwd=UI, env=env, stdout=subprocess.PIPE,
                                                   stderr=open(OUT / f'{self.run_id}-shell.err', 'w'))

    def scoped(self, role, args):
        unit = f'{self.run_id}-{role}'
        self.units.append(unit)
        return ['systemd-run', '--user', '--scope', '-q', '--unit', unit, '-p', 'MemoryAccounting=yes', '--', *args]

    def _spawn(self, role, args):
        log = open(OUT / f'{self.run_id}-{role}.log', 'w')
        self.logs[role] = log
        return subprocess.Popen(self.scoped(role, args), cwd=UI, env=self.env, stdout=log, stderr=subprocess.STDOUT)

    def wait_ready(self, timeout=40):
        """Seconds from spawn until window.noemaExperimentReady (A: stdout marker, B: CDP)."""
        deadline = time.monotonic() + timeout
        if self.name == 'a':
            q = queue.Queue()
            threading.Thread(target=lambda: q.put(self.procs['shell'].stdout.readline()), daemon=True).start()
            try:
                line = q.get(timeout=timeout)
            except queue.Empty:
                return None
            return time.monotonic() - self.t0 if line.startswith(b'demo:ready') else None
        r = subprocess.run([str(UI / 'node_modules/node/bin/node'), str(HERE / 'cdp_ready.mjs'), str(timeout)], capture_output=True, text=True,
                           timeout=timeout + 5)
        self.webgl = r.stdout.strip()
        return time.monotonic() - self.t0 if r.returncode == 0 else None

    def wait_mapped(self, timeout=40):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.main_view():
                return time.monotonic() - self.t0
            if not self.alive():
                return None
            time.sleep(.1)
        return None

    def pids(self):
        out = []
        for p in self.procs.values():
            if p.poll() is None:
                out += tree_pids(p.pid)
        return out

    def main_view(self):
        shell = set(tree_pids(self.procs['shell'].pid))
        vs = [v for v in self.sway.views() if v['pid'] in shell]
        return max(vs, key=lambda v: v['rect']['width'] * v['rect']['height']) if vs else None

    def companion_views(self):
        if 'companion' not in self.procs:
            return []
        comp = set(tree_pids(self.procs['companion'].pid))
        return [v for v in self.sway.views() if v['pid'] in comp]

    def alive(self):
        return self.procs['shell'].poll() is None

    def roots(self):
        return {r: p.pid for r, p in self.procs.items() if p.poll() is None}

    def stop(self, timeout=8):
        for p in self.procs.values():
            if p.poll() is None:
                p.terminate()
        for p in self.procs.values():
            try:
                p.wait(timeout)
            except subprocess.TimeoutExpired:
                p.kill(); p.wait()
        for log in self.logs.values():
            log.close()


CG = Path(f'/sys/fs/cgroup/user.slice/user-{os.getuid()}.slice/user@{os.getuid()}.service/app.slice')


def cgroup_mem(units, exclude=()):
    tot = {'current': 0, 'nonfile': 0}
    for u in units:
        if any(u.endswith('-' + e) for e in exclude):
            continue
        d = CG / f'{u}.scope'
        try:
            tot['current'] += int((d / 'memory.current').read_text())
            st = dict(l.split() for l in (d / 'memory.stat').read_text().splitlines())
            tot['nonfile'] += int(st['anon']) + int(st['shmem']) + int(st['kernel'])
        except (OSError, KeyError, ValueError):
            pass
    return tot


def drm_resident(pids):
    seen = {}
    for pid in pids:
        try:
            entries = list(Path(f'/proc/{pid}/fdinfo').iterdir())
        except OSError:
            continue
        for e in entries:
            try:
                text = e.read_text()
            except OSError:
                continue
            m = re.search(r'drm-client-id:\s*(\d+)', text)
            if m:
                seen[m.group(1)] = sum(int(v) for v in re.findall(r'drm-resident-[\w-]+:\s*(\d+) KiB', text))
    return sum(seen.values()) / 1024


def sample(host, seconds, warmup=0, interval=1, label=''):
    pids = host.pids()
    g0 = gpu_ns(pids); s0 = gpu_ns(tree_pids(host.sway.proc.pid))
    cg, stop = [], threading.Event()
    def poll():
        while not stop.is_set():
            cg.append((cgroup_mem(host.units), cgroup_mem(host.units, exclude=('service', 'companion')), drm_resident(host.pids())))
            stop.wait(interval)
    th = threading.Thread(target=poll, daemon=True); th.start()
    try:
        m = measure(host.roots(), warmup=warmup, duration=seconds, interval=interval, phase='tooling-test')
    finally:
        stop.set(); th.join()
    pids = [p['pid'] for p in m['observed_processes']]
    g1 = gpu_ns(pids); s1 = gpu_ns(tree_pids(host.sway.proc.pid))
    pss = [s['summed_pss_bytes'] for s in m['samples'] if s['summed_pss_bytes'] is not None]
    return {'label': label, 'status': m['status'], 'cpu_pct_one_core': m['cpu_percent_one_core'],
            'gpu_pct_app': round((g1 - g0) / 1e9 / m['sample_seconds'] * 100, 3),
            'gpu_pct_compositor': round((s1 - s0) / 1e9 / m['sample_seconds'] * 100, 3),
            'pss_mib_median': round(statistics.median(pss) / 2**20, 1) if pss else None,
            'pss_mib_max': round(max(pss) / 2**20, 1) if pss else None,
            'private_mib_max': round(m['memory_ranges_bytes']['summed_private_bytes']['max'] / 2**20, 1)
                if m['memory_ranges_bytes']['summed_private_bytes'] else None,
            'cg_total_mib_median': round(statistics.median(c[0]['current'] for c in cg) / 2**20, 1),
            'cg_nonfile_mib_median': round(statistics.median(c[0]['nonfile'] for c in cg) / 2**20, 1),
            'cg_nonfile_mib_max': round(max(c[0]['nonfile'] for c in cg) / 2**20, 1),
            'cg_host_only_nonfile_mib_median': round(statistics.median(c[1]['nonfile'] for c in cg) / 2**20, 1),
            'gpu_resident_mib_median': round(statistics.median(c[2] for c in cg), 1),
            'nonfile_series_mib': [round(c[0]['nonfile'] / 2**20, 1) for c in cg] if seconds > 120 else None,
            'procs': m['process_count_max'], 'complete': m['private_memory_complete'],
            'pss_series_mib': [round(p / 2**20, 1) for p in pss] if seconds > 120 else None}


def keyboard(sway):
    k = subprocess.Popen([str(HERE / 'vkbd')], env=sway.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    if k.stdout.readline().strip() != 'ready':
        raise RuntimeError('virtual keyboard failed')
    def send(line):
        k.stdin.write(line + '\n'); k.stdin.flush(); k.stdout.readline()
    return k, send


TEXT = ('delete may free the chunk but leave the slot pointing at it. not confirmed. need to check show. '
        'sorted input, two pointers, sum too small move left forward. ')


def typing_for(send, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        for word in TEXT.split(' '):
            send('t ' + word + ' ')
            if time.monotonic() >= end:
                break
        send('c a'); send('t  ')


# ---------------------------------------------------------------- suites
def suite_startup(n=10, renderer='gles2'):
    for i in range(n):
        for name in ('a', 'b'):
            sway = Sway(renderer)
            host = None
            try:
                host = Host(name, sway, cdp=(name == 'b'))
                mapped = host.wait_mapped()
                ready = host.wait_ready()
                time.sleep(1)
                err = None if host.alive() else 'exited'
                record('startup', host=name, renderer=renderer, run=i, mapped_s=mapped and round(mapped, 3),
                       ready_s=ready and round(ready, 3), webgl=getattr(host, 'webgl', None), ok=bool(mapped and ready and host.alive()), err=err)
            except Exception as e:  # noqa: BLE001
                record('startup', host=name, renderer=renderer, run=i, ok=False, err=repr(e)[:300])
            finally:
                if host: host.stop()
                sway.stop()
                time.sleep(1)


def suite_workload(runs=3, renderer='gles2', companion=False):
    for i in range(runs):
        for name in ('a', 'b'):
            sway = Sway(renderer)
            host = None
            try:
                host = Host(name, sway, companion=companion)
                if not host.wait_mapped():
                    raise RuntimeError('never mapped')
                time.sleep(20)
                res = {'idle': sample(host, 30, label='idle')}
                if companion:
                    cv = host.companion_views()
                    res['companion_views'] = [{'floating': v['type'] == 'floating_con', 'rect': v['rect'],
                                               'focused': v['focused'], 'app_id': v.get('app_id')} for v in cv]
                    mv = host.main_view()
                    res['main_focused_after_companion'] = bool(mv and mv['focused'])
                else:
                    k, send = keyboard(sway)
                    sway.msg(f'[pid={host.main_view()["pid"]}] focus')
                    send('c k')
                    out = {}
                    t = threading.Thread(target=lambda: typing_for(send, 32))
                    t.start(); res['editing'] = sample(host, 30, label='editing'); t.join()
                    send('x'); k.stdin.close(); k.wait(5)
                    sway.msg(f'[pid={host.main_view()["pid"]}] move scratchpad')
                    time.sleep(5)
                    hv = [v for v in sway.views() if v['pid'] in set(host.pids())]
                    res['hidden_views_visible'] = [v.get('visible') for v in hv]
                    res['hidden'] = sample(host, 20, label='hidden')
                    sway.msg('scratchpad show')
                    sway.msg(f'[pid={host.main_view()["pid"]}] floating disable')
                record('workload', host=name, renderer=renderer, companion=companion, run=i,
                       alive=host.alive(), **res)
            except Exception as e:  # noqa: BLE001
                record('workload', host=name, renderer=renderer, companion=companion, run=i, ok=False, err=repr(e)[:300])
            finally:
                if host: host.stop()
                sway.stop()
                time.sleep(2)


def suite_wayland():
    for name in ('a', 'b'):
        # scale, hotplug, churn, clipboard, screenshots
        sway = Sway('gles2')
        host = None
        r = {}
        try:
            host = Host(name, sway)
            host.wait_mapped(); time.sleep(6)
            shots = OUT / 'shots'; shots.mkdir(exist_ok=True)
            for scale in ('1', '1.5', '2'):
                sway.msg(f'output HEADLESS-1 scale {scale}')
                time.sleep(4)
                ok = sway.grim(shots / f'{name}-scale{scale}.png')
                mv = host.main_view()
                r[f'scale_{scale}'] = {'alive': host.alive(), 'mapped': bool(mv), 'shot': ok}
            sway.msg('output HEADLESS-1 scale 1')
            # clipboard: paste in, cut out
            k, send = keyboard(sway)
            token = 'clip' + secrets.token_hex(4)
            subprocess.run(['wl-copy', token], env=sway.env, timeout=5)
            sway.msg(f'[pid={host.main_view()["pid"]}] focus')
            send('c k'); time.sleep(.3); send('c a'); send('c v'); time.sleep(.5)
            subprocess.run(['wl-copy', '--clear'], env=sway.env, timeout=5)
            send('c a'); send('c x'); time.sleep(.8)
            got = subprocess.run(['wl-paste', '-n'], env=sway.env, capture_output=True, text=True, timeout=5).stdout
            r['clipboard_roundtrip'] = got.strip() == token
            send('x')
            # hotplug
            before = host.pids()
            sway.msg('create_output'); time.sleep(1)
            outs = [o['name'] for o in sway.msg(kind='get_outputs')]
            new = [o for o in outs if o != 'HEADLESS-1'][0]
            sway.msg(f'[pid={host.main_view()["pid"]}] move container to output {new}')
            sway.msg(f'focus output {new}'); time.sleep(2)
            on_new = host.main_view()
            sway.msg(f'output {new} unplug'); time.sleep(4)
            mv = host.main_view()
            r['hotplug'] = {'alive': host.alive(), 'remapped': bool(mv), 'moved_to_new': bool(on_new)}
            # churn
            p0 = sample(host, 3, label='pre-churn')
            t0 = time.monotonic()
            for i in range(60):
                pid = host.main_view()['pid'] if host.main_view() else None
                if not pid:
                    break
                sel = f'[pid={pid}] '
                for cmd in ('fullscreen toggle', 'fullscreen toggle', 'floating enable', f'resize set {700 + 7 * i} {500 + 5 * i}',
                            'floating disable', 'move container to workspace 2', 'workspace 2', 'workspace 1',
                            'move container to workspace 1', 'move scratchpad', 'scratchpad show', 'floating disable'):
                    sway.msg(sel + cmd)
                    if cmd.startswith('workspace'):
                        sway.msg(cmd)
            time.sleep(5)
            p1 = sample(host, 5, label='post-churn')
            r['churn'] = {'iterations': 60, 'seconds': round(time.monotonic() - t0, 1), 'alive': host.alive(),
                          'mapped': bool(host.main_view()), 'nonfile_before': p0['cg_nonfile_mib_median'], 'nonfile_after': p1['cg_nonfile_mib_median']}
            k.stdin.close(); k.wait(5)
            ok = sway.grim(shots / f'{name}-after-churn.png')
            # compositor death
            pids = [p for r, pr in host.procs.items() if r != 'service' and pr.poll() is None for p in tree_pids(pr.pid)]
            sway.proc.kill(); sway.proc.wait()
            killed = time.monotonic(); deadline = killed + 15
            while time.monotonic() < deadline and host.alive():
                time.sleep(.05)
            exited = time.monotonic() - killed
            time.sleep(1)
            left = [p for p in pids if Path(f'/proc/{p}').exists()]
            r['compositor_killed'] = {'shell_exit_s': None if host.alive() else round(exited, 2),
                                      'shell_exit_code': host.procs['shell'].poll(),
                                      'surviving_processes_after_16s': len(left)}
            record('wayland', host=name, **r)
        except Exception as e:  # noqa: BLE001
            record('wayland', host=name, ok=False, err=repr(e)[:400], partial=r)
        finally:
            if host: host.stop()
            sway.stop()
            time.sleep(2)


def suite_soak(seconds=900, renderer='gles2'):
    for name in ('a', 'b'):
        sway = Sway(renderer)
        host = None
        try:
            host = Host(name, sway, companion=True)
            host.wait_mapped(); time.sleep(20)
            res = sample(host, seconds, interval=10, label='soak')
            record('soak', host=name, renderer=renderer, alive=host.alive(), **res)
        except Exception as e:  # noqa: BLE001
            record('soak', host=name, ok=False, err=repr(e)[:300])
        finally:
            if host: host.stop()
            sway.stop()
            time.sleep(2)


def cleanup():
    for rid in RUN_IDS:
        shutil.rmtree(UI / '.demo/evidence' / rid, ignore_errors=True)


if __name__ == '__main__':
    try:
        for s in sys.argv[1:]:
            name, _, arg = s.partition(':')
            fn = globals()['suite_' + name]
            fn(**json.loads(arg)) if arg else fn()
    finally:
        cleanup()
