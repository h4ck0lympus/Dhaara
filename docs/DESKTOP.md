# Rust webview desktop · original interface restored

The rejected Qt/QML prototype has been replaced with a Rust **Wry + Tao**
system-webview shell. It loads the existing `public/` HTML/CSS/JavaScript
from the existing Python service, not a redesigned or duplicated native UI.
Original notes, task priorities, pinned focus, revisions and capture processing
retain the service's existing behavior. The browser app remains usable.

Approved desktop/mobile/tablet UI references and kitten assets in
`docs/Noema-Documentation/assets/` are unchanged. No new artwork or mockup
replaces them. The web app's existing CPU-first inference policy is unchanged;
changing the desktop shell is not evidence of lower RAM/battery consumption.

## Current acceptance gate

2026-10-09 independent task-capture milestone: the same webview now uses one
multiline input and collapsed Details. Close checkpoints the separate task draft
as well as note capture; a failed task checkpoint retains the window. Real
private-X11/WebKit managed/external restart tests are recorded in
[TEST_REPORT.md](TEST_REPORT.md); physical acceptance below is unchanged.
Restart the backend (or managed application) and reload the UI for the new API,
keeping the same profile, workspace and endpoint. [Task-capture contract](TASK_CAPTURE.md).

**A: BLOCKED ON DEVICE. B: IMPLEMENTED as opt-in Linux development mode;
physical lifecycle checks pending. Defaults remain external.** Live Sway IPC reports the target
i7-1270P and two connector outputs at 100%, but physical input, microphone,
native routing and full-process measurements have not been exercised. Follow
the [single device checklist](PHYSICAL_SWAY_ACCEPTANCE.md) for exact disposable
service/profile/companion/agent launch commands, source fingerprints and the
content-free process sampler. The normal Linux development binary was rebuilt;
no actual physical launch/quit/relaunch or installer is claimed. The revised
user instruction allows independent opt-in lifecycle work, not promotion of the
default or substitution of virtual evidence for physical acceptance.

## Launch from source

Keep your deliberately selected existing service running in one terminal:

```bash
.venv/bin/python run.py
```

In another terminal from the repository root:

```bash
cargo run --locked --manifest-path desktop/Cargo.toml -- --server http://127.0.0.1:8765
```

There is no Qt feature, QML, Python GUI binding or `--token-file` argument.
The original local web session/login flow is used. Without `--manage-service`,
the shell only connects and never stops the externally launched backend.
It does not install a service or produce a platform installer.
Keep using the same service data directory; no migration is needed.
For acceptance testing do not reuse the real notebook/service: use the isolated
fixture path/port/profile in the checklist above. Do not blindly reuse a port
occupant as Noema or send it workspace credentials.

Linux development requirements: Rust/Cargo, C toolchain, GTK 3 and WebKitGTK
4.1 development packages, typically `libgtk-3-dev libwebkit2gtk-4.1-dev`.
Dependencies are locked in `desktop/Cargo.lock`. Linux uses WebKitGTK;
Windows uses the system WebView2 path and requires separate build/device tests.
See primary [Wry documentation](https://docs.rs/wry/latest/wry/) and
[Tao documentation](https://docs.rs/tao/latest/tao/). Qt is no longer a dependency.

On this workspace, runtime libraries existed but development headers did not.
Ubuntu development packages were downloaded/extracted into a disposable SDK
at `/tmp/noema-webview-sdk-V3K1nA`, not installed system-wide. To rebuild with
those extracted headers while that directory exists:

```bash
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml -j 2
```

The compiled debug binary can be launched without that development environment:

```bash
desktop/target/debug/noema-desktop --server http://127.0.0.1:8765
```

That is a development executable, not a demonstrated installer or portable release.

## Opt-in Linux managed development mode

Prepare dependencies separately as usual; launch never installs dependencies or
downloads models. Choose an explicit workspace. Do not test against your real
notebook; the short physical checklist uses `qa/device_fixture.py` instead.

```bash
desktop/target/debug/noema-desktop --manage-service \
  --data-dir /absolute/path/to/noema-workspace \
  --python /home/p4nic/code/noema/.venv/bin/python \
  --entry-point /home/p4nic/code/noema/run.py \
  --server http://127.0.0.1:8765 \
  --profile /absolute/path/to/noema-webview-profile
```

Python/entry defaults are this checkout's `.venv/bin/python` and `run.py`, resolved
at build time; moving the checkout requires explicit paths or rebuilding. Paths
are passed as separate process arguments, not a shell string. Data must be
explicit (`--data-dir`); no implicit production notebook is selected. Keep the
same data path, profile and literal loopback origin across every restart. The
production default endpoint remains **127.0.0.1:8765**, never randomly changed.
Fixture tests reserve a disposable port once and reuse it through that test.
Changing origin/profile can make unsent browser storage appear absent; there is
no browser-to-webview draft migration.

| Action/state | Managed mode | External mode (default) |
|---|---|---|
| Open | Start exclusively owned Python service, verify readiness, then load UI. | Connect to deliberately selected existing service. |
| Hide/minimize | Keep service/window session running; no daemon/autostart added. | No backend lifecycle action. |
| Close / Cancel-Quit after UI loads | Existing draft checkpoint and failure/risk choices first; then stop owned service. | Existing checkpoint, close shell only. |
| Cancel during startup | Cancel bounded startup, stop/reap owned child; do not modify existing draft storage. | Not a managed-startup state. |
| Backend crash | Compact error + Retry service; editor remains loaded. Retry verifies a new owned instance and dispatches existing reconnect handling without reload. | Existing web connection retry; backend stays user-managed. |
| Quit completed | Browser/companion cannot use the stopped backend until explicitly restarted. Their separate processes are not killed. | Backend/browser continue running. |

**Retry:** repair the stated runtime/dependency/path/port problem, then click
**Retry service**. Startup timeout defaults to 15 seconds; `--startup-timeout`
accepts 0.1–60 seconds. Cleanup can add up to 6 seconds. There is no automatic
restart loop. Missing runtime/dependency, early exit, unavailable data directory,
identity failure, endpoint conflict and timeout produce bounded generic actionable
messages, not raw potentially sensitive stderr. After loading, Cancel/Quit cannot
bypass the existing failed-checkpoint confirmation. Save/copy important work
before explicitly accepting that risk. There is no separate tray Quit mode.

### Ownership and Linux termination policy

The profile lock remains exclusive. A second `.noema-service.lock` holds an
exclusive OS lock for the canonical workspace, shared with normal Linux `run.py`
launches. The Rust owner prebinds the configured loopback socket; an occupied
endpoint is neither contacted, reused nor killed. The Python child inherits that
listener and the same workspace lock via private FDs, and acknowledges its
canonical workspace, fresh public instance ID and PID on a bounded private pipe
after Uvicorn startup. Rust also checks `/api/desktop-instance` on that listener.
A generic 200 or port occupancy is not readiness. No admin credential is sent
through args, URL, native bridge or diagnostic output. Existing host/origin,
cookie/session, scoped-token and CSRF-marker protections remain in force.

Normal Close first finishes the frontend checkpoint. Rust then closes a private
stdin lifetime pipe, waits up to 5 seconds, escalates TERM for 1 second if needed,
then KILL only to the dedicated process group of its **still-unreaped own child**,
and reaps that child. It never uses process names or a PID file as authority.
Repeated/concurrent Retry is serialized and cannot spawn competing instances.
An external backend, a different workspace, and separately launched agent
wrappers/commands are never members of this ownership group.

Before Python imports, Linux `PR_SET_PDEATHSIG(SIGTERM)` plus a parent-PID
race check prevents an unleased startup from outliving its owner; an early-
startup owner SIGKILL is tested with a controlled sleeping entry process.
If the Linux shell is killed (tested SIGTERM and SIGKILL after readiness), kernel pipe closure
tells Python to request graceful Uvicorn exit and TERM its dedicated group; an
8-second fallback applies while Python remains alive. Optional inference is
disabled in managed mode, so this service currently has threads, not model
subprocesses. Cooperative group cleanup is not a sandbox for descendants that
deliberately detach/escape. Forced shell death cannot run the frontend checkpoint;
only already committed drafts/outbox survive. Simultaneous shell/backend kills,
power loss, stuck kernel I/O and hostile same-user processes are not validated.
No always-running daemon, login autostart, background retention or companion
orchestration is introduced. The existing browser can use the managed service
while the shell owns it; use external mode for intentionally independent lifetime.

### Lifecycle regression commands

```bash
cargo build --offline --locked --manifest-path desktop/Cargo.toml --no-default-features --example service_probe
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-managed-final
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path desktop/Cargo.toml --features qa -j 2
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --managed --sample --no-screenshots --output qa/managed-service/validated --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
```

Use a **new** output directory on rerun; sample files refuse overwrite. Build the
probe first: 17 added lifecycle/API pytest cases otherwise skip explicitly. The
probe runs the same production owner with real disposable Python processes;
only the WebKit checkpoint failure injects storage/confirmation faults. No
physical input or native file picker/microphone validation is implied. Rebuild
the normal binary without `--features qa` afterward. Current evidence and exact
results are in [TEST_REPORT.md](TEST_REPORT.md).

## Persistence and boundaries

The default Linux profile is `$XDG_DATA_HOME/noema/webview` (absolute XDG path)
or `$HOME/.local/share/noema/webview`. Windows uses LOCALAPPDATA; macOS uses
Library/Application Support. These non-Linux paths are implemented but untested.
Use `--profile /absolute/path/to/dedicated/profile` to choose a separate location.

The profile persists native webview cookies, cache, IndexedDB drafts and Blobs.
An OS file lock prevents two shell processes using it simultaneously and
releases on exit/crash without deleting stored data. New Linux directories
are mode 0700 and lock files mode 0600. Storage is not application-encrypted.

**Chrome/browser drafts are not automatically migrated into the desktop profile.**
Save/export them through the existing browser first; do not delete old browser
storage or copy live profile databases. Saved notebook data is shared through
the service. Keep its host/port stable: browser-local storage is origin-scoped.

Normal window close runs a narrow local script that awaits the existing
serialized draft write before approving close. Closing during local Capture
Save is blocked; active recording or unsaved note editing prompts before
discard. If a nonempty draft cannot checkpoint, close asks for explicit risk
acceptance. During incomplete startup, it closes without overwriting storage.
This is not recovery for active audio chunks, unsaved note edits, abrupt
power loss, storage eviction or every crash/debounce timing case.

The shell accepts literal loopback HTTP base URLs only. Top-level navigation
is restricted to the chosen origin. Explicit HTTP(S) new-window links open
in the user's browser; file/javascript/credential-bearing links are rejected.
Downloads allow only service URLs and service-origin Blob URLs. Native IPC is
origin-checked and only approves closing; QA reports/Retry activation compile solely under
the explicit `qa` feature. No native command/filesystem API is exposed.

Linux microphone/camera/notification requests ask permission; display capture
and geolocation are denied. These are implemented adapters, not demonstrated
microphone/notification delivery. Existing recording, file input, sketch and
export controls are the web app's actual controls, not new native ports.
The shell waits at idle; the unchanged page retains its normal refresh and
animation behavior. No performance benefit is asserted.

## Exact verification commands

Baseline before replacing the desktop code:

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-webview-baseline
```

Policy, parsing, compile and regression checks:

```bash
cargo fmt --manifest-path desktop/Cargo.toml -- --check
cargo test --locked --manifest-path desktop/Cargo.toml --no-default-features --lib
node --check desktop/src/close.js
node --check desktop/qa/scenario.js
node --check public/app.js
.venv/bin/python -m compileall -q qa/webview_check.py
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml --features qa -j 2
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/webview_check.py --skip-build --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
.venv/bin/python -m pytest -q -p no:cacheprovider --basetemp=/tmp/noema-webview-post-change
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/browser_check.py
CHROMIUM_PATH=/usr/bin/google-chrome .venv/bin/python qa/native_storage_check.py
```

With system development packages and Xvfb installed, `.venv/bin/python
qa/webview_check.py` builds and runs the same native checks without temporary
SDK arguments. The harness uses a temporary service/database and profile,
workers/models disabled, three native process launches and a private Xvfb
display. It never opens production `.data` or screenshots the user's desktop.
Synthetic screenshots/logs/results go to `qa/webview/`.

These are real Rust/Wry/WebKit, native IndexedDB/Blob, HTTP and SQLite checks.
The 26 assertions include actual code editing/engine undo and synthetic image
paste. UI actions are programmatic. They are not physical Sway, Windows, microphone,
file-picker, notification, installer, accessibility, hardware/model or
performance tests. Chrome failure-injection coverage does not establish every
WebKit offline/failure behavior. See [TEST_REPORT.md](TEST_REPORT.md).

After QA, rebuild without `--features qa` to remove the injected scenario:

```bash
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --locked --manifest-path desktop/Cargo.toml -j 2
```

## Reversion scope and changed files

Updated: `desktop/Cargo.toml`, `desktop/Cargo.lock`, `public/app.js` (only a
native-close checkpoint hook; the original layout/capture logic is preserved),
`desktop/src/lib.rs`, `desktop/src/main.rs`, README and the desktop/
architecture/security/build-status/test-report documents.
Added: `desktop/src/close.js`, `desktop/qa/scenario.js`,
`qa/webview_check.py` and synthetic `qa/webview/` evidence.
Removed from active code: `desktop/build.rs`, `desktop/src/bridge.rs`,
`desktop/qml/Main.qml`, `desktop/qml/Qa.qml`,
`desktop/tests/service.rs`, `qa/rust_desktop_check.py`.

The previous source and desktop guide are backed up at
`/tmp/noema-qml-revert-ZTT7mE`; that temporary backup is recoverable while
it exists, not a permanent release archive. Historical Qt test evidence in
`qa/rust-desktop/` remains labeled retired. Global Qt/PySide packages from
the earlier exploration were not deleted. No notebook data, browser recovery
fix, server schema, OS helper or approved asset was reverted.

## Sway companion validation continuation

The unchanged normal Rust executable now maps through Wayland in private
headless Sway and survives compositor scratchpad hide/restore. Native GTK
companion controls and placement have 31 real protocol checks; this is not
physical-device acceptance. The main layout, framework and desktop source are
unchanged. A minimal web `#settings` handler opens the existing dialog from the
native helper and preserves open editors. See [current controls and validation commands](TEST_REPORT.md).

`tools/sway_companion.py` now caps the native sprite at 40 px, offers local
Cat/Dot/Hide and 24/32/40 px sizes, and separates recent reports from permission.
The unchanged sprite rests in a pale-sage rounded, bordered container with a
small shadow (40 logical-pixel sprite / 56-pixel container by default; 32 / 48).
A scale-aware Cairo buffer follows GTK output scaling. Clicking shows one
available task's actual saved action and a link to its existing dialog;
secondary controls live behind Companion menu. Popovers are non-modal and
keyboard mode remains NONE. Long content is abbreviated/scrollable rather than
expanding beyond the monitor. Resting state has no task panel or animation.
Forty-one private-headless visibility checks cover dark/light backgrounds,
Cat/Dot/Hidden and 1/1.5/2 compositor scales. This is not physical monitor or
pointer validation. A later `qa/sway_check.py --pointer` suite adds 41 actual
Sway IPC/Wayland pointer checks, including outside-click pass-through and
preserved work-window focus at 1/1.5/2 scales. Its virtual device exists only in
the private fixture compositor; this still is not physical input validation.
Task URL dispatch is intercepted. See [input evidence](../qa/companion-input/README.md).
Reliable native-presence detection and event-triggered
attention messages are not implemented; the browser preview is not suppressed
using a guess. The helper needs the system PyGObject Cairo bridge as well as GTK.
Appearance resets on restart; Hide requires restarting the helper to restore.
With explicit metadata opt-in, Pause/Resume gates that helper's future polls.
The helper remains separate and manually launched, using the existing observer
token. Main-window hide does not automatically launch or control it.

Next concrete step: perform the short managed-mode physical launch/quit/relaunch
check and the existing pending Sway acceptance with disposable data. Service
ownership is implemented above as opt-in, not promoted to the default. Packaging
remains separate. Measure the enabled full app workloads on actual Sway before
claiming resource targets; the virtual idle sample is not that acceptance.
Android, synchronization and companion/observer integration remain separate work.
