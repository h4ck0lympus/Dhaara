#!/usr/bin/env python3
"""THROWAWAY handbook 21 idle memory: Electron tree + service via cgroup accounting, motion off."""
import json, statistics, time
import terrain, bench
from terrain import NoemaHost
from bench import Sway, cgroup_mem
orig = NoemaHost.api
NoemaHost.api = lambda self, m, p, b: orig(self, m, p, {'motion': False} if p == '/api/settings' else b)
sway = Sway('gles2'); host = None
try:
    host = NoemaHost(sway)
    assert host.wait_mapped()
    time.sleep(20)
    shell, svc = [u for u in host.units if u.endswith('-shell')], [u for u in host.units if u.endswith('-service')]
    rows = []
    for _ in range(60):
        rows.append((cgroup_mem(shell), cgroup_mem(svc))); time.sleep(1)
    mib = lambda f: round(statistics.median(f(r) for r in rows) / 2**20, 1)
    mx = lambda f: round(max(f(r) for r in rows) / 2**20, 1)
    out = {k: [mib(lambda r: r[i][f]), mx(lambda r: r[i][f])] for k, i in (('shell', 0), ('service', 1)) for f in ('nonfile', 'current')}
    out = {f'{n}_{f}': [mib(lambda r, i=i, f=f: r[i][f]), mx(lambda r, i=i, f=f: r[i][f])] for n, i in (('shell', 0), ('service', 1)) for f in ('nonfile', 'current')}
    out['both_nonfile'] = [mib(lambda r: r[0]['nonfile'] + r[1]['nonfile']), mx(lambda r: r[0]['nonfile'] + r[1]['nonfile'])]
    out['both_current'] = [mib(lambda r: r[0]['current'] + r[1]['current']), mx(lambda r: r[0]['current'] + r[1]['current'])]
    print(json.dumps(out, indent=1))
    json.dump({'summary': out, 'rows': rows}, open(bench.OUT / 'results.json', 'w'), indent=1)
finally:
    if host: host.stop()
    sway.stop()
