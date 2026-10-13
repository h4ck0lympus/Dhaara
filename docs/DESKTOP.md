# Electron desktop shell

Dhara's desktop shell is Electron (`electron/`). It loads the same React bundle
that a browser loads, from the Python service's origin; there is no second UI
and no second API client. It replaced the Rust Wry/Tao shell (`desktop/`) at the
React + Electron cutover, chosen from the 2026-10-10 private headless-Sway
benchmark (idle 269 MiB + 110 MiB GPU versus 347 MiB + 233 MiB; hidden 0.75%
versus 10% of one core). Physical Sway acceptance (handbook §24 Stage A) is
still pending; use the [device checklist](PHYSICAL_SWAY_ACCEPTANCE.md).
Rollback steps are in [PROGRESS.md](PROGRESS.md).

## Build

Requirements: Node 22 (pinned in `.nvmrc`) with npm, plus the Python
environment from the README. Neither build downloads a model or installs
anything system-wide.

```bash
npm --prefix web ci && npm --prefix web run build
npm --prefix electron ci && npm --prefix electron run build
```

`web/dist` is not committed. Without it the API still works and `/` answers
503 "Frontend not built: run `npm --prefix web run build`".

Linux needs Electron's setuid sandbox helper (`chrome-sandbox`, root-owned,
mode 4755); the shell is never started with `--no-sandbox`. After
`npm --prefix electron ci`, run:

```bash
node electron/scripts/link-sandbox.mjs
```

It links an installed root-owned `/opt/google/chrome/chrome-sandbox` when there
is one (keeping the bundled helper as `chrome-sandbox.bundled`). Otherwise it
prints the exact `sudo chown root:root ... && sudo chmod 4755 ...` line to run
yourself. A fresh checkout must do this before `npm --prefix electron test`.

## Launch in external mode (default)

Start the service you chose, then the shell:

```bash
.venv/bin/python run.py
npm --prefix electron start -- --server http://127.0.0.1:8765
```

External mode only connects. It never starts or stops the service.
Dhara flags go after the app path (after `--` with npm); Chromium switches go
before it. Relative paths resolve against the launch directory, and the last of a
repeated flag wins. Any CLI or profile error prints `Dhara: <message>` to stderr
and exits 2 without creating a window or directory; `--help` exits 0.
`npm --prefix electron start` runs from `electron/`, so give absolute paths.
When you need the shell's own PID (for `qa/device_session.py` or
`qa/process_sample.py`), start the binary directly from the repository root:
`electron/node_modules/electron/dist/electron electron/ --server http://127.0.0.1:8765`.

| Flag | Meaning |
|---|---|
| `--server URL` | Service origin, default `http://127.0.0.1:8765`. A literal loopback IP over http with no credentials, path, query or fragment (`localhost` and `::ffff:` forms are rejected); anything else exits 2 with "Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765". |
| `--profile DIR` | Profile, default `$XDG_DATA_HOME/dhara/electron`, else `~/.local/share/dhara/electron`; created with mode 0700 (an existing directory keeps its mode). |
| `--manage-service` | Linux only: start and own the service (below); requires `--data-dir`. |
| `--data-dir PATH` | Managed-mode workspace; rejected without `--manage-service`. |
| `--python PATH` | Managed-mode interpreter, default `<repo>/.venv/bin/python`. |
| `--entry-point PATH` | Managed-mode entry script, default `<repo>/run.py`. |
| `--startup-timeout S` | Managed readiness timeout, 0.1–60 s, default 15. |

A second launch on the same profile focuses the first window, ignores its own
arguments and exits 0.

## Opt-in Linux managed mode (lifecycle protocol 2)

```bash
npm --prefix electron start -- --manage-service \
  --data-dir /absolute/path/to/dhara-workspace
```

Managed mode serves only `http://127.0.0.1:8765`. The origin includes the port,
and IndexedDB, the outbox and the service worker are stored per origin, so the
port never changes. If 8765 is taken, startup stops with "Endpoint is occupied
or unavailable. Do not stop its occupant; choose external mode or a deliberate
stable endpoint." and offers Retry. The occupant is never contacted or killed.

Startup, in order:

1. Electron resolves `--data-dir`, rejects a path with no final component,
   creates it with mode 0700 (permissions are changed only when it creates the
   directory) and canonicalises it.
2. It spawns `<python> <entry-point> --desktop-managed --host 127.0.0.1 --port 8765
   --data-dir <canonical> --owner-pid <electron pid>` in the child's own process
   group, removes `DHARA_MODEL`, `DHARA_SPEECH_MODEL`, `DHARA_TOKEN`,
   `DHARA_ACCESS_TOKEN`, `DHARA_ALLOWED_HOSTS`, `DHARA_ALLOW_REMOTE_MODEL` and
   `DHARA_DATA_DIR` from its environment, and writes `{"instance":"<64 hex>"}`
   to its stdin. Stdin stays open as the lifetime lease.
3. Python sets `PR_SET_PDEATHSIG(SIGTERM)`, exits unless its parent is
   `--owner-pid`, reads the lease, takes the `.dhara-service.lock` flock, binds
   127.0.0.1:8765 with `SO_REUSEADDR`, starts the stdin-EOF watcher and serves.
   Once serving it prints one line with exactly `protocol` (2), `instance`,
   `pid`, `workspace` and `port`.
4. Electron accepts that line only with exactly those keys and the expected
   values, then requires `GET /api/desktop-instance` to return exactly
   `{protocol: 2, instance, pid}`. Only then does it load the origin.

| Exit | Meaning | Message |
|---|---|---|
| 10 | workspace locked | This workspace already has a service. Use external mode or stop it deliberately. |
| 11 | port in use | Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint. |
| 12 or other | invalid lease or arguments (wrong owner pid, non-canonical or missing data directory, non-127.0.0.1 host), startup failure | Service exited during startup. Check Python dependencies, entry point and data permissions. |

A missing interpreter shows "Python not found. Check --python and installed
dependencies; no installation is automatic." A timeout shows "Service readiness
timed out. Check Python dependencies and data permissions, then Retry." An
identity mismatch shows "Service identity verification failed. No workspace
credentials were sent." and the origin is never loaded.

| State | What you see | Close or Quit |
|---|---|---|
| starting | Local startup page with status, Retry and Cancel. Retry never spawns while a service process is alive. | Cancel stops the service and quits; no page has loaded, so there is no checkpoint. |
| loaded | The app. | Runs the close checkpoint, then stops the service. |
| crashed | The page stays loaded and receives `dhara:service-down`; a strip along the bottom of the window offers Retry and Quit, so the page stays usable. Nothing restarts without Retry. A successful Retry removes the overlay and dispatches `dhara:service-up` without a reload. | Quit runs the checkpoint first. |
| stopping | — | Close stdin, wait 5 s, SIGTERM the group, wait 1 s, SIGKILL the group, reap. ESRCH counts as success. |

Group cleanup always runs after the child's exit is observed, so grandchildren
do not survive a Python crash. If Electron itself dies, even from SIGTERM or
SIGKILL, stdin EOF makes Python shut down its group (it SIGTERMs its process group at
once and SIGKILLs it 8 s later only if the service is still running); `PR_SET_PDEATHSIG` covers the moment before the watcher starts. Separately launched agents, browsers and the Sway
helper are never in that group.

## Close checkpoint

Closing the window asks the page to checkpoint. A capture save still in flight
keeps the window open with a toast. Recording or an open note edit asks for
confirmation. Both drafts are saved; if that fails the page asks "Local draft
saving failed. Close anyway and risk losing this draft? Cancel to keep it open
and retry." Before the page has finished loading and recovering its drafts, the
window closes without touching storage. If the page does not answer within
10 s, a native dialog offers "Force close" or "Keep open". A page that refuses instead
(a save in flight) keeps the window open with the toast above. This does not recover
active recordings, abrupt crashes, power loss or storage eviction.

## Profile, permissions and navigation

The profile holds the session cookie, IndexedDB drafts and outbox, and cache.
Treat it as credential storage; it is not encrypted. Only one instance runs per
profile (Chromium's singleton lock). Tests always use a throwaway `--profile`.

Microphone (audio only) and notification requests from the app's main frame
show a native prompt; video and everything else are denied.
Decisions last for the app session only and are asked again after a restart.

Navigation is restricted to the service origin. New windows are denied; http(s)
links open in your browser. Downloads are allowed only from the origin and its
`blob:` URLs, so export works. See [SECURITY.md](SECURITY.md).

## Moving from the Rust shell or a browser

Captures queued in the old Rust/WebKit profile (`~/.local/share/noema/webview`)
are not readable by Chromium. This is accepted (decision 11C), and that profile
is left untouched. Browser drafts and queued captures on the same origin keep
working: the database `dhara-local-v1` version 1 and its records are unchanged,
and queued items upload once with their original ids.

## Tests

```bash
npm --prefix electron test
```

This builds, runs the unit tests in `electron/test/` (CLI validation, origin
rules, profile, permissions, lifecycle) and the Playwright `_electron` suites in
`electron/e2e/` (isolation, permissions, close, single instance, the
restart/crash/offline scenario and managed mode). It needs `web/dist`, `.venv`,
the sandbox helper above and `sway` on PATH: global setup starts a private
headless Sway with its own `XDG_RUNTIME_DIR` and Xwayland disabled, so it never
touches your session. That suite does not satisfy physical Sway acceptance
(handbook §24 Stage A). Results are in
[TEST_REPORT.md](TEST_REPORT.md).

## Sway companion

The Python Sway helper (`tools/sway_companion.py`) is separate and unchanged
apart from its sprite path, `tools/assets/cat.png`. It still opens `/#task/<id>`
and `/#settings` in your browser; the React UI rewrites those to `#/task/<id>`
and `#/settings`. The browser kitten preview was removed. Main-window hide does
not launch or control the helper.
