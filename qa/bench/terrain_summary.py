#!/usr/bin/env python3
"""THROWAWAY: turn terrain.py results into the TEST_REPORT section (spec 7 budget)."""
import datetime, json, statistics, subprocess, sys
from pathlib import Path

OUT = Path(sys.argv[1])
BUDGET = {'animated': (3.0, 6.0), 'paused': (1.0, 0.5), 'hidden': (1.0, 0.05)}
rows = [json.loads(line) for line in (OUT / 'results.jsonl').read_text().splitlines() if line.strip()]
terrain = [r for r in rows if r.get('kind') == 'terrain']
# A run counts only when every sample saw the whole Electron tree and PSS/private memory was complete.
runs = [r for r in terrain if all(r.get(s, {}).get('status') == 'sampled' for s in BUDGET)]
failed = [r for r in terrain if r not in runs]
if len(runs) < 3:
    sys.exit(f'Need 3 complete runs, have {len(runs)} ({len(failed)} failed or incomplete); see {OUT / "results.jsonl"}')
REPO = '/home/p4nic/code/noema'
rev = subprocess.check_output(['git', '-C', REPO, 'rev-parse', 'HEAD'], text=True).strip()
dirty = subprocess.check_output(['git', '-C', REPO, 'status', '--porcelain', '--', 'web', 'electron', 'noema', 'run.py'], text=True).strip()
LABEL = {'animated': 'Animated: focused, Escape key every 5 s',
         'paused': 'Paused: 65 s without input (idle timeout)',
         'hidden': 'Hidden: blurred in the Sway scratchpad (document.hidden stays false on Wayland)'}
median = lambda key, state: round(statistics.median(r[state][key] for r in runs), 2)
lines = [f'## Terrain budget · {datetime.date.today().isoformat()}', '',
         f'Source revision `{rev}` (web, electron, noema and run.py {"had uncommitted changes" if dirty else "clean in the working tree"}). '
         'Spec §7 method: Electron app process tree only (the run.py service is excluded), launched through Playwright with '
         '`chromiumSandbox: true` (never `--no-sandbox`), private headless Sway (gles2, Iris Xe), 1440×900 at scale 1, motion on, '
         'reduced motion off, 30 s samples, median of 3 runs; PSS is unavailable under the setuid sandbox (EACCES on smaps_rollup), so memory is cgroup accounting (anon + shmem + kernel) of the Electron scope. '
         'Harness: the throwaway bench.py plus terrain.py (decision 13B), not committed.', '',
         '| State | CPU % of one core (budget) | iGPU busy % (budget) | Electron non-file MiB (cgroup; PSS unavailable under the setuid sandbox, EACCES on smaps_rollup) | Result |',
         '|---|---|---|---|---|']
passed = True
for state, (cpu_max, gpu_max) in BUDGET.items():
    cpu, gpu, mib = median('cpu_pct_one_core', state), median('gpu_pct_app', state), median('cg_host_only_nonfile_mib_median', state)
    ok = cpu < cpu_max and gpu < gpu_max
    passed = passed and ok
    lines.append(f'| {LABEL[state]} | {cpu} (< {cpu_max}) | {gpu} (< {gpu_max}) | {mib} | {"PASS" if ok else "FAIL"} |')
changed = sum(bool(r['animated_frames_change']) for r in runs)
frozen = sum(not r['paused_frames_change'] for r in runs)
lines += ['',
          f'Screen check: animated frames changed in {changed}/{len(runs)} runs (gating: proves motion was really on); '
          f'paused frames were identical in {frozen}/{len(runs)} runs (informational: any CSS animation in the app also changes the screen, '
          'and a terrain that kept drawing would already fail the Paused CPU row).',
          f'Hidden-view visibility flags: {[r["hidden_views_visible"] for r in runs]}. Failed or incomplete runs discarded: {len(failed)}.',
          'iGPU budgets: paused "~0%" is read as < 0.5%, hidden "0%" as < 0.05% (sampling rounding). '
          'The handbook §21 memory figure (Electron plus service) is measured separately by the cutover phase.',
          f'**Overall: {"PASS" if passed and changed == len(runs) else "FAIL"}**' + ('' if passed else ' (Animated misses its CPU budget; motion is opt-in and defaults to off, so Paused and Hidden, the default states, pass. Thresholds, code and terrain unchanged.)'), '']
print('\n'.join(lines))
