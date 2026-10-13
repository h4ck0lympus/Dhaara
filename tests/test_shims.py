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
