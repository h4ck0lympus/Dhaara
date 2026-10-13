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
