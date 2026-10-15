"""Rename shims (rename spec §4.1, §4.7, §4.8): the old names keep working for one release."""
import os
import sys

import pytest


def _forget(package):
    for name in [m for m in sys.modules if m == package or m.startswith(package + '.')]:
        del sys.modules[name]


def test_import_noema_warns_and_exposes_dhara():
    _forget('noema')
    with pytest.warns(DeprecationWarning, match="renamed 'dhara'"):
        import noema
    import noema.server
    import noema.desktop_service
    import dhara.server
    import dhara.desktop_service
    assert noema.server is dhara.server
    assert noema.server.create_app is dhara.server.create_app
    assert noema.desktop_service.workspace_lock is dhara.desktop_service.workspace_lock
    assert noema.__version__ == dhara.__version__


def test_env_prefers_dhara_then_noema_with_one_deprecation_line(monkeypatch, capsys):
    from dhara import env as helper
    monkeypatch.setattr(helper, '_warned', set())
    monkeypatch.setenv('DHARA_MODEL', 'new')
    monkeypatch.setenv('NOEMA_MODEL', 'old')
    assert helper.env('MODEL') == 'new'
    monkeypatch.delenv('DHARA_MODEL')
    assert helper.env('MODEL') == 'old'
    assert helper.env('MODEL') == 'old'
    assert capsys.readouterr().err == 'NOEMA_MODEL is deprecated; set DHARA_MODEL instead\n'
    monkeypatch.delenv('NOEMA_MODEL')
    assert helper.env('MODEL') is None
    assert helper.env('MODEL', 'default') == 'default'


def test_strip_removes_both_prefixes_and_nothing_else():
    from dhara.env import strip
    environment = {'DHARA_MODEL': 'a', 'NOEMA_MODEL': 'b', 'DHARA_KEEP': 'c', 'PATH': '/bin'}
    assert strip(environment, ('MODEL',)) is environment
    assert environment == {'DHARA_KEEP': 'c', 'PATH': '/bin'}


def test_managed_launch_strips_both_prefixes():
    from dhara.desktop_service import STRIPPED_ENV, STRIPPED_NAMES
    from dhara.env import PREFIXES
    assert PREFIXES == ('DHARA_', 'NOEMA_')
    assert set(STRIPPED_ENV) == {prefix + name for prefix in PREFIXES for name in STRIPPED_NAMES}
    assert {'DHARA_DATA_DIR', 'NOEMA_DATA_DIR', 'DHARA_ACCESS_TOKEN', 'NOEMA_ACCESS_TOKEN'} <= set(STRIPPED_ENV)


@pytest.mark.skipif(sys.platform != 'linux', reason='the flock lock is Linux-only')
def test_workspace_lock_uses_the_dhara_name_and_ignores_a_held_noema_lock(tmp_path):
    import fcntl
    from dhara.desktop_service import LOCK_NAME, workspace_lock
    old = os.open(tmp_path / '.noema-service.lock', os.O_RDWR | os.O_CREAT, 0o600)
    fcntl.flock(old, fcntl.LOCK_EX | fcntl.LOCK_NB)
    held = workspace_lock(tmp_path)
    try:
        assert LOCK_NAME == '.dhara-service.lock'
        assert (tmp_path / LOCK_NAME).exists()
        with pytest.raises(ValueError):
            workspace_lock(tmp_path)
    finally:
        held.close()
        os.close(old)


def _old_notebook(root):
    import sqlite3
    path = root / 'noema.sqlite3'
    c = sqlite3.connect(path)
    c.execute('CREATE TABLE marker(x)'); c.execute("INSERT INTO marker VALUES('old')"); c.commit(); c.close()
    return path


def test_notebook_file_moves_on_a_clean_start_and_only_once(tmp_path):
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    store = Store(tmp_path)
    assert store.path == tmp_path / 'dhara.sqlite3' and not old.exists()
    with store.db() as c:
        assert c.execute('SELECT x FROM marker').fetchone()[0] == 'old'
    assert Store(tmp_path).path == tmp_path / 'dhara.sqlite3'


def test_notebook_file_stays_when_journal_side_files_exist(tmp_path, caplog):
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    (tmp_path / 'noema.sqlite3-wal').write_bytes(b'')
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == old and not (tmp_path / 'dhara.sqlite3').exists()
    assert 'unclean close' in caplog.text


def test_notebook_file_never_moves_over_an_existing_new_file(tmp_path, caplog):
    from dhara.store import Store
    Store(tmp_path)
    old = _old_notebook(tmp_path)
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == tmp_path / 'dhara.sqlite3' and old.exists()
    assert 'left in place' in caplog.text


def test_notebook_file_stays_when_the_rename_fails(tmp_path, monkeypatch, caplog):
    from pathlib import Path
    from dhara.store import Store
    old = _old_notebook(tmp_path)
    def refuse(self, target):
        raise OSError('simulated EXDEV')
    monkeypatch.setattr(Path, 'rename', refuse)
    with caplog.at_level('WARNING', logger='dhara.store'):
        store = Store(tmp_path)
    assert store.path == old and not (tmp_path / 'dhara.sqlite3').exists()
    assert 'simulated EXDEV' in caplog.text
