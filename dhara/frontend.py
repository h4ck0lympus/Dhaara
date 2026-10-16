"""Keep web/dist in step with web/src when running from a source checkout."""
import shutil
import subprocess
from pathlib import Path

NOT_SOURCES = {'dist', 'node_modules', 'test-results', 'playwright-report', 'e2e'}


def newest_source(web: Path) -> float:
    files = (f for f in web.rglob('*') if f.is_file() and not NOT_SOURCES.intersection(f.relative_to(web).parts))
    return max((f.stat().st_mtime for f in files), default=0.0)


def stale(web: Path) -> bool:
    """True when a source checkout's build is missing or older than its sources; never for a packaged install."""
    if not (web / 'src').is_dir():
        return False
    index = web / 'dist' / 'index.html'
    return not index.is_file() or index.stat().st_mtime < newest_source(web)


def ensure_built(web: Path, run=subprocess.run) -> str:
    """Rebuild a stale frontend. Returns 'fresh', 'built' or 'no-npm'; raises CalledProcessError if the build fails."""
    if not stale(web):
        return 'fresh'
    npm = shutil.which('npm')
    if npm is None:
        return 'no-npm'
    run([npm, '--prefix', str(web), 'run', 'build'], check=True)
    return 'built'
