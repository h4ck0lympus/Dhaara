#!/usr/bin/env python3
"""Measure a disposable, idle backend on this machine, not the whole product.

QA-only dependency: psutil. No model, browser, Sway session, audio or screenshots
are started. The result must not be represented as a laptop/battery benchmark.
"""
import json
import os
from pathlib import Path
import platform
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import psutil

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dhara.env import PREFIXES

def main():
    with tempfile.TemporaryDirectory(prefix='noema-resource-') as temporary:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = {k: v for k, v in os.environ.items() if not k.startswith(PREFIXES)}
        env['DHARA_ACCESS_TOKEN'] = secrets.token_urlsafe(32)
        process = subprocess.Popen(
            [sys.executable, str(ROOT / 'run.py'), '--port', str(port), '--data-dir', temporary],
            cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            ready = False
            for _ in range(100):
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=0.5) as response:
                        ready = response.status == 200
                    if ready:
                        break
                except OSError:
                    time.sleep(.1)
            if not ready:
                raise RuntimeError('Test backend did not start')
            time.sleep(1)
            sampled = psutil.Process(process.pid)
            before = sampled.cpu_times()
            started = time.monotonic()
            rss = []
            for _ in range(10):
                rss.append(sampled.memory_info().rss)
                time.sleep(1)
            elapsed = time.monotonic() - started
            after = sampled.cpu_times()
            cpu_seconds = (after.user + after.system) - (before.user + before.system)
            report = {
                'component': 'Idle Python/FastAPI/SQLite backend only',
                'platform': platform.system(),
                'python': platform.python_version(),
                'duration_seconds': round(elapsed, 2),
                'rss_mib_min': round(min(rss) / 1024**2, 2),
                'rss_mib_max': round(max(rss) / 1024**2, 2),
                'cpu_seconds': round(cpu_seconds, 4),
                'average_percent_of_one_core': round(cpu_seconds / elapsed * 100, 3),
                'ai_enabled': False,
                'database': 'New, empty, disposable database',
                'boundary': 'Short idle measurement in the build container, not on the user\'s i7-1270P. Excludes browser/webview, native companion, observer, inference, note processing, active clients, large datasets and battery usage. Values near zero are limited by OS accounting resolution. Not a full-app performance guarantee.',
            }
            (ROOT / 'qa' / 'resource-results.json').write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report, indent=2))
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

if __name__ == '__main__':
    main()
