"""Compatibility shim: the `noema` package was renamed `dhara` (rename spec §4.8).

`from noema.server import create_app` keeps working for one release and warns once.
Delete this package (and `"noema"` in pyproject `packages`) in the dated follow-up.
"""
import importlib
import pkgutil
import sys
import warnings

import dhara

warnings.warn("The 'noema' package was renamed 'dhara'; import dhara instead.", DeprecationWarning, stacklevel=2)
__version__ = dhara.__version__
for _module in pkgutil.iter_modules(dhara.__path__):
    globals()[_module.name] = sys.modules[f'noema.{_module.name}'] = importlib.import_module(f'dhara.{_module.name}')  # bind as an attribute too: import noema.server; noema.server
