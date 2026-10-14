"""Configuration reads: DHARA_<name>, else NOEMA_<name> (rename spec §4.1), else the default.

The NOEMA_ fallback is a one-release shim; the dated follow-up deletes LEGACY_PREFIX and the
fallback branch below, and nothing else needs to change.
"""
import os
import sys

PREFIX = 'DHARA_'
LEGACY_PREFIX = 'NOEMA_'  # rename-shim: read-only fallback for one release
PREFIXES = (PREFIX, LEGACY_PREFIX)
_warned = set()


def env(name, default=None):
    """The value of DHARA_<name>; else NOEMA_<name> with one deprecation line per process; else default."""
    value = os.environ.get(PREFIX + name)
    if value is not None:
        return value
    legacy = os.environ.get(LEGACY_PREFIX + name)
    if legacy is None:
        return default
    if name not in _warned:
        _warned.add(name)
        print(f'{LEGACY_PREFIX}{name} is deprecated; set {PREFIX}{name} instead', file=sys.stderr)
    return legacy


def strip(environment, names):
    """Removes DHARA_<name> and NOEMA_<name> for every name from a mapping; returns the same mapping."""
    for prefix in PREFIXES:
        for name in names:
            environment.pop(prefix + name, None)
    return environment
