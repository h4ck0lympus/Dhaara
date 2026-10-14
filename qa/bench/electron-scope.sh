#!/bin/sh
# THROWAWAY: exec the real Electron binary in its own systemd scope so cgroup memory covers only the Electron tree.
exec systemd-run --user --scope -q --unit "$NOEMA_BENCH_UNIT" -p MemoryAccounting=yes -- "$NOEMA_BENCH_ELECTRON" "$@"
