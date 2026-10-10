#!/usr/bin/env python3
"""Content-free Linux process-tree accounting; never starts or stops an app.

Only /proc stat, uptime and smaps_rollup are read. No command lines,
environment, window titles, clipboard, sockets, audio or screen content.
"""
import argparse
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import re
import time


@dataclass(frozen=True)
class Process:
    pid: int
    parent: int
    start: int
    cpu: float
    rss: int

    @property
    def identity(self):
        return self.pid, self.start


def parse_stat(text, ticks, page_size):
    # comm may contain spaces and ')'; it is deliberately discarded.
    pid = int(text.split(' ', 1)[0])
    fields = text[text.rindex(')') + 2:].split()
    if fields[0] == 'Z':
        return None
    return Process(pid, int(fields[1]), int(fields[19]),
                   (int(fields[11]) + int(fields[12])) / ticks,
                   max(0, int(fields[21])) * page_size)


def read_processes(proc=Path('/proc')):
    ticks, page_size = os.sysconf('SC_CLK_TCK'), os.sysconf('SC_PAGE_SIZE')
    records = {}
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            record = parse_stat((entry / 'stat').read_text(), ticks, page_size)
            if record:
                records[record.pid] = record
        except (OSError, ValueError, IndexError):
            # Exited/restricted processes are never logged by name or args.
            continue
    return records


def memory_private(pid, proc=Path('/proc')):
    try:
        values = {}
        for line in (proc / str(pid) / 'smaps_rollup').read_text().splitlines():
            key, _, value = line.partition(':')
            if key in ('Pss', 'Private_Clean', 'Private_Dirty', 'Private_Hugetlb'):
                values[key] = int(value.split()[0]) * 1024
        if not {'Pss', 'Private_Clean', 'Private_Dirty'} <= values.keys():
            return None
        return values['Pss'], sum(values.get(k, 0) for k in
                                 ('Private_Clean', 'Private_Dirty', 'Private_Hugetlb'))
    except (OSError, ValueError, IndexError):
        return None


def membership(records, roots, known):
    """Never substitute a reused PID; retain discovered, reparented children."""
    selected = {p.pid: known[p.identity] for p in records.values() if p.identity in known}
    missing = []
    for role, identity in roots.items():
        record = records.get(identity[0])
        if record and record.identity == identity:
            selected[record.pid] = role
        else:
            missing.append(role)
    while True:
        additions = {p.pid: selected[p.parent] for p in records.values()
                     if p.pid not in selected and p.parent in selected}
        if not additions:
            break
        selected.update(additions)
    for pid, role in selected.items():
        known[records[pid].identity] = role
    return selected, missing


def measure(roots_by_pid, warmup=20, duration=60, interval=1, phase='open-idle'):
    if (not all(math.isfinite(v) for v in (warmup, duration, interval))
            or not 0 <= warmup <= 120 or not .01 <= duration <= 3600
            or not .01 <= interval <= 10 or interval > duration):
        raise ValueError('Use finite warmup 0–120s, duration .01–3600s and interval .01–10s <= duration')
    records = read_processes()
    if any(pid not in records for pid in roots_by_pid.values()):
        raise ValueError('A supplied root is missing, unreadable or exited; select live fixture PIDs')
    if len(set(roots_by_pid.values())) != len(roots_by_pid):
        raise ValueError('Root PIDs must be distinct')
    roots = {role: records[pid].identity for role, pid in roots_by_pid.items()}
    known = {}
    warm_started = time.monotonic()
    while True:
        records = read_processes()
        selected, missing = membership(records, roots, known)
        if missing:
            raise ValueError('Root exited or changed identity during warm-up: ' + ', '.join(missing))
        remaining = warmup - (time.monotonic() - warm_started)
        if remaining <= 0:
            break
        time.sleep(min(interval, remaining))
    actual_warmup = time.monotonic() - warm_started
    previous = {records[pid].identity: records[pid].cpu for pid in selected}
    start_ticks = float(Path('/proc/uptime').read_text().split()[0]) * os.sysconf('SC_CLK_TCK')
    started = time.monotonic()
    samples, missing_roots, lost = [], set(), set()
    total_cpu = 0.0
    while True:
        cpu = 0.0
        private = []
        for pid in selected:
            record = records[pid]
            before = previous.get(record.identity)
            if before is not None:
                cpu += max(0, record.cpu - before)
            elif record.start >= start_ticks:
                cpu += record.cpu  # A process born during this sample window.
            previous[record.identity] = record.cpu
            value = memory_private(pid)
            # A PID can exit/reuse between stat and smaps reads; reject that row.
            try:
                current = parse_stat(Path(f'/proc/{pid}/stat').read_text(),
                                     os.sysconf('SC_CLK_TCK'), os.sysconf('SC_PAGE_SIZE'))
            except (OSError, ValueError, IndexError):
                current = None
            private.append(value if current and current.identity == record.identity else None)
        total_cpu += cpu
        identities = {records[pid].identity for pid in selected}
        lost.update(set(previous) - identities)
        complete_private = all(v is not None for v in private) and bool(private)
        samples.append({'elapsed_seconds': round(time.monotonic() - started, 4),
                        'process_count': len(selected),
                        'summed_rss_bytes': sum(records[pid].rss for pid in selected),
                        'summed_pss_bytes': sum(v[0] for v in private) if complete_private else None,
                        'summed_private_bytes': sum(v[1] for v in private) if complete_private else None})
        remaining = duration - (time.monotonic() - started)
        if remaining <= 0:
            break
        time.sleep(min(interval, remaining))
        records = read_processes()
        selected, missing = membership(records, roots, known)
        missing_roots.update(missing)
    elapsed = time.monotonic() - started
    cores = os.cpu_count() or 1
    memory_ranges = {}
    for metric in ('summed_rss_bytes', 'summed_pss_bytes', 'summed_private_bytes'):
        values = [s[metric] for s in samples]
        memory_ranges[metric] = {'min': min(values), 'max': max(values)} if all(
            v is not None for v in values) else None
    return {
        'status': 'incomplete' if missing_roots else 'sampled', 'phase': phase,
        'evidence': 'Linux process accounting only; not device acceptance or a full-app performance guarantee',
        'coverage': 'Explicit roots plus observed descendants. Confirm all attributable helpers; add webview-N roots for already-reparented helpers. No automatic whole-application assertion.',
        'requested_seconds': {'warmup': warmup, 'sample': duration, 'interval': interval},
        'warmup_seconds': round(actual_warmup, 4), 'sample_seconds': round(elapsed, 4),
        'cpu_seconds_observed': round(total_cpu, 6),
        'cpu_percent_one_core': round(total_cpu / elapsed * 100, 4),
        'logical_cpu_count': cores,
        'cpu_percent_machine_capacity': round(total_cpu / elapsed / cores * 100, 4),
        'cpu_normalization': '100% one-core = one CPU second per wall second; machine capacity divides by logical CPU count',
        'process_count_min': min(s['process_count'] for s in samples),
        'process_count_max': max(s['process_count'] for s in samples),
        'roots': {role: {'pid': identity[0], 'start_ticks': identity[1]} for role, identity in roots.items()},
        'observed_processes': [{'pid': identity[0], 'start_ticks': identity[1], 'role': role}
                               for identity, role in sorted(known.items())],
        'missing_roots': sorted(missing_roots), 'departed_process_count': len(lost),
        'private_memory_complete': all(s['summed_pss_bytes'] is not None for s in samples),
        'memory_ranges_bytes': memory_ranges,
        'memory_metrics': 'RSS sums double-count shared pages; PSS proportions shared pages; private sums Private_Clean/Dirty/Hugetlb. Missing PSS/private = null, not zero.',
        'samples': samples,
        'exclusions': [
            'Unselected roots, pre-existing/reparented helpers not discovered as descendants, external OS browser, compositor, PipeWire and inference unless explicitly attributed',
            'CPU of short-lived processes between scans or after their last readable stat is missed; CPU is an observed lower bound, not guaranteed total work',
            'No battery, GPU, recording quality, model performance or physical input inference',
            'Sampler overhead is excluded from application CPU/memory; heterogeneous logical CPUs are not equal-performance cores',
        ],
        'privacy': 'No command lines, environments, window titles, clipboard, tokens, screen/audio content or process control',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', action='append', required=True, metavar='ROLE=PID',
                        help='Repeat for shell, service, companion, observer or explicitly attributed webview-N')
    parser.add_argument('--phase', choices=('open-idle', 'hidden-idle', 'editing',
                                          'companion-metadata', 'tooling-test'), required=True)
    parser.add_argument('--warmup', type=float, default=20)
    parser.add_argument('--duration', type=float, default=60)
    parser.add_argument('--interval', type=float, default=1)
    parser.add_argument('--output', type=Path, required=True, help='New JSON file; existing evidence is never overwritten')
    args = parser.parse_args()
    roots = {}
    try:
        for item in args.root:
            role, pid = item.split('=', 1)
            if (not re.fullmatch(r'(shell|service|companion|observer|webview-[1-9][0-9]*)', role)
                    or role in roots or int(pid) <= 1):
                raise ValueError('Use unique shell/service/companion/observer/webview-N roles with live PIDs > 1')
            roots[role] = int(pid)
        if args.phase != 'tooling-test' and not {'shell', 'service'} <= roots.keys():
            raise ValueError('Application phases require both shell and service roots; add companion/observer when running')
        # Reserve before a long sample; restrictive and exclusive, no lost evidence.
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as report:
            report.write('{"status":"incomplete"}\n')
            report.flush()
            result = measure(roots, args.warmup, args.duration, args.interval, args.phase)
            report.seek(0)
            json.dump(result, report, indent=2)
            report.write('\n')
            report.truncate()
        print(f"{result['status']}: {len(result['samples'])} samples; {result['process_count_min']}–{result['process_count_max']} processes. Report: {args.output}")
        return 0 if result['status'] == 'sampled' else 1
    except (ValueError, OSError) as error:
        parser.exit(2, f'Cannot sample: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
