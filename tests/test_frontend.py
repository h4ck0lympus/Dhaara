import os
import subprocess

import pytest

from dhara.frontend import ensure_built, stale


def web_tree(tmp_path, built_at=None, source_at=100.0):
    web = tmp_path / 'web'
    (web / 'src' / 'ui').mkdir(parents=True)
    src = web / 'src' / 'ui' / 'App.tsx'
    src.write_text('x')
    os.utime(src, (source_at, source_at))
    for name in ('index.html', 'package.json'):
        (web / name).write_text('x')
        os.utime(web / name, (50, 50))
    if built_at is not None:
        (web / 'dist').mkdir()
        index = web / 'dist' / 'index.html'
        index.write_text('x')
        os.utime(index, (built_at, built_at))
    return web


def test_missing_or_older_build_is_stale_and_newer_build_is_fresh(tmp_path):
    assert stale(web_tree(tmp_path / 'a'))
    assert stale(web_tree(tmp_path / 'b', built_at=99.0))
    assert not stale(web_tree(tmp_path / 'c', built_at=101.0))


def test_any_source_counts_but_output_node_modules_and_e2e_do_not(tmp_path):
    web = web_tree(tmp_path, built_at=101.0)
    (web / 'src' / 'node_modules').mkdir()
    cache = web / 'src' / 'node_modules' / 'cache'
    cache.write_text('x')
    os.utime(cache, (500, 500))
    for ignored in ('e2e', 'test-results'):
        (web / ignored).mkdir()
        (web / ignored / 'spec.ts').write_text('x')
        os.utime(web / ignored / 'spec.ts', (500, 500))
    assert not stale(web)
    os.utime(web / 'package.json', (200, 200))
    assert stale(web)


def test_a_packaged_install_without_sources_is_never_stale(tmp_path):
    web = tmp_path / 'web'
    (web / 'dist').mkdir(parents=True)
    assert not stale(web)
    assert ensure_built(web, run=pytest.fail) == 'fresh'


def test_ensure_built_runs_the_web_build_only_when_stale(tmp_path, monkeypatch):
    monkeypatch.setattr('shutil.which', lambda name: '/usr/bin/npm')
    calls = []
    fresh = web_tree(tmp_path / 'fresh', built_at=101.0)
    assert ensure_built(fresh, run=lambda *a, **k: calls.append(a)) == 'fresh'
    old = web_tree(tmp_path / 'old', built_at=99.0)
    assert ensure_built(old, run=lambda cmd, check: calls.append((cmd, check))) == 'built'
    assert calls == [(['/usr/bin/npm', '--prefix', str(old), 'run', 'build'], True)]


def test_ensure_built_reports_missing_npm_and_propagates_build_failure(tmp_path, monkeypatch):
    web = web_tree(tmp_path, built_at=99.0)
    monkeypatch.setattr('shutil.which', lambda name: None)
    assert ensure_built(web, run=pytest.fail) == 'no-npm'
    monkeypatch.setattr('shutil.which', lambda name: '/usr/bin/npm')
    def fail(cmd, check):
        raise subprocess.CalledProcessError(1, cmd)
    with pytest.raises(subprocess.CalledProcessError):
        ensure_built(web, run=fail)
