# Physical Sway acceptance

**Stage A (handbook §24): PENDING — the next validation gate.** The React +
Electron cutover does not satisfy it. Managed mode is an opt-in Linux
development mode; its physical lifecycle checks are PENDING. Default remains
external. A person must execute this one fixture workflow on the actual Sway
session. Do not substitute headless tests or mark the gate passed from screenshots.

## Session and source checkpoint

[Sanitized session inventory](../qa/device-acceptance/session.json): Linux/Sway
1.9; GTK 3.24.41, WebKitGTK 2.52.6, gtk-layer-shell 0.8.2; Python 3.12.3,
Rust 1.93.1. Reported hardware is i7-1270P, 31.06 GiB usable RAM, one DRM card.
eDP-1 is 1920×1200 and DP-5 is 1920×1080, both scale 1.0. Keyboard, pointer and
touchpad devices are reported; no headless output name is reported. These are
read-only inventory facts, not proof of physical interaction or GPU use.

Dhara is untracked in `/home/p4nic/code`; the parent's HEAD is not its revision.
[Before-source manifest](../qa/device-acceptance/source-before.sha256) covers
59 active source/configuration/test/documentation files. SHA256:
`1e1e42bb6ed25d5ab613225b1638ef2832f4c79234e0bff99fdbc93ccb67548c`.
[Previous final-source manifest](../qa/device-acceptance/source-after.sha256)
identifies the historical preparation handoff (64 files), verified unchanged
before lifecycle edits. The [managed-mode implementation manifest](../qa/managed-service/source-after.sha256)
is also preserved, along with the later screenshot and task-capture handoffs.
Record `git rev-parse HEAD` and `git status --short` from the repository root
with device results to identify the revision and any local changes. Source
checksum manifests are no longer generated or verified; earlier manifests are
historical evidence only.

## Isolated manual launch

Run from `/home/p4nic/code/noema` in Bash terminals on the actual Sway session.
Build the interface and the shell once (Node 22, `.nvmrc`):

```bash
npm --prefix web ci && npm --prefix web run build
npm --prefix electron ci && npm --prefix electron run build
```

The commands below start the Electron binary directly
(`electron/node_modules/electron/dist/electron`), so `$!` is the shell's own PID
for the session recorder and the sampler. No package installation or shipped
installer is claimed. The following commands are **handoff commands, not an
executed physical workflow**.

Terminal 1 — create fresh private files; launch the existing service explicitly:

```bash
DHARA_FIXTURE="$(.venv/bin/python qa/device_fixture.py)"
if [[ -f "$DHARA_FIXTURE/fixture-port.txt" ]]; then
  printf 'Fixture path: %s\n' "$DHARA_FIXTURE"
  env -u DHARA_MODEL -u DHARA_SPEECH_MODEL -u DHARA_ALLOW_REMOTE_MODEL \
    -u DHARA_ACCESS_TOKEN -u DHARA_TOKEN -u DHARA_DATA_DIR -u DHARA_ALLOWED_HOSTS \
    .venv/bin/python run.py --host 127.0.0.1 --port 18765 --data-dir "$DHARA_FIXTURE/data" &
  DHARA_SERVICE_PID=$!
  printf 'Service PID: %s\n' "$DHARA_SERVICE_PID"
  fg
fi
```

Keep that terminal foregrounded until Uvicorn confirms startup. Preparation
checks that port 18765 is free, but this is not readiness/identity proof. If
binding fails, **stop; do not open or authenticate to its occupant**. Select
another fixed fixture port using `qa/device_fixture.py --port PORT`, replacing
18765 consistently in all commands. Never stop a conflicting service. The port
and profile must stay unchanged through fixture reconnect/restart tests.

Terminal 2 — paste the generated path when prompted. On a Sway session Electron
runs as a native Wayland client; the session recorder below confirms it:

```bash
read -r -p 'Fixture path from terminal 1: ' DHARA_FIXTURE
if [[ -f "$DHARA_FIXTURE/fixture-port.txt" ]]; then
  electron/node_modules/electron/dist/electron electron/ \
    --server http://127.0.0.1:18765 --profile "$DHARA_FIXTURE/profile" &
  DHARA_SHELL_PID=$!
  printf 'Shell PID: %s\n' "$DHARA_SHELL_PID"
  fg
fi
```

In a third terminal, set `DHARA_FIXTURE` to that same path, and record the actual
shell PID shown above:

```bash
read -r -p 'Fixture path: ' DHARA_FIXTURE
read -r -p 'Fixture shell PID: ' DHARA_SHELL_PID
.venv/bin/python qa/device_session.py --shell-pid "$DHARA_SHELL_PID" \
  --output "$DHARA_FIXTURE/reports/session.json"
```

Require `fixture_shell_protocols` to contain `xdg_shell`, not `xwayland`. This
only verifies client protocol, not input. Do not copy a real profile or notebook.
The helper creates a synthetic code/hypothesis text file and a checkerboard PNG;
it inserts no notes/tasks. Service data, attachments, profile, tokens and outbox
stay under the private `/tmp/noema-device-*` directory. Keep it until acceptance
is finished; `/tmp` is not durable backup. Never share its token files/profile.

## One device workflow and results

Record each row as PASS / FAIL / BLOCKED / NOT RUN, plus a short factual result
and exact reproduction for failures. Current rows are all **BLOCKED ON DEVICE**;
none has recorded human execution. Use actual keyboard/pointer, not scripted UI
signals. Additional monitors/scales not available for testing are NOT RUN, not
passed from historical 150%/200% headless captures.

## Managed-mode guided device check (pending)

This is a short additional lifecycle check, not a replacement acceptance
framework or a claim that A passed. Use the existing fixture helper, recorder
and sampler. **All four checks below remain BLOCKED ON DEVICE.** No separate
backend terminal should be needed in managed mode.

Managed mode always serves `http://127.0.0.1:8765`, because IndexedDB, the
outbox and the service worker belong to that origin. Prepare the fixture on that
port. If your own service holds 8765, preparation refuses; stop your own service
deliberately first. Never stop an occupant you have not identified.

```bash
DHARA_MANAGED_FIXTURE="$(.venv/bin/python qa/device_fixture.py --port 8765)"
printf 'Keep this fixture path for relaunch: %s\n' "$DHARA_MANAGED_FIXTURE"
electron/node_modules/electron/dist/electron electron/ --manage-service \
  --data-dir "$DHARA_MANAGED_FIXTURE/data" \
  --python /home/p4nic/code/noema/.venv/bin/python \
  --profile "$DHARA_MANAGED_FIXTURE/profile"
```

1. **Launch:** wait for verified startup and the existing UI. Using the actual
   keyboard, enter a synthetic unsaved Capture draft. Record `xdg_shell` using
   the existing session recorder and the actual shell PID; this alone does not
   prove input. Do not enable observation/recording. Managed mode has no other
   port: if preparation reports 8765 occupied, stop; never stop its occupant.
2. **Hide, close, reopen:** physically hide/restore with your Sway binding;
   backend remains available. Close normally; the draft checkpoints and the
   fixture backend becomes unavailable. Rerun the exact same command/path/
   origin/profile; verify the draft and saved originals/revisions/task pin.
   Do not rerun the fixture-creation line, which would choose a new workspace.
3. **Failure and Retry:** reproduce a startup error using a missing `--python`
   path with a separate fresh fixture. Check compact error, responsive Cancel
   and no backend left. For runtime crash/retry, stop only the positively
   identified fixture backend; confirm error/Retry, retain a draft, physically
   click Retry and confirm no reload/loss/duplicates. Never kill a port occupant
   or unrelated Python/agent process. Report if attribution is uncertain.
4. **External unchanged:** close managed mode, start the same fixture manually
   using the original two-terminal commands with 18765 replaced by 8765, then
   close the shell. Confirm the external backend/browser remains available.
   Record observed outcomes and any platform-dependent failure reproduction.

Record a selected-root sample while actually open/hidden/editing as described
below, adding the owned service PID obtained from `/api/desktop-instance` and
all attributable webview/helper roots. Virtual X11 idle evidence in the test
report does not pass A4.2 or demonstrate physical Sway resource behavior.

## Original complete device checklist (pending)

| ID | Required check on this same fixture | Current status |
|---|---|---|
| A2.1 | Launch service + native Wayland shell; use keyboard to navigate Now, Capture, Notes, Plan and Settings. | BLOCKED |
| A2.2 | Type the rough note from `synthetic-note.txt`, including code and the unconfirmed hypothesis. Paste the synthetic PNG from an image viewer, then exercise image upload and the real file picker. | BLOCKED |
| A2.3 | Explicit Save once; verify exactly one capture/note, image, unchanged Original, editable content and revision/history after an edit. Verify zero tasks before explicit creation. | BLOCKED |
| A2.4 | Leave a text draft unsaved, switch pages, hide/restore via your Sway binding, close normally, reopen the same profile/origin and verify recovery without notebook ingestion. Text debounce/crash/power-loss and unfinished audio recovery are not covered. | BLOCKED |
| A2.5 | Create “Synthetic allocator check” and “Synthetic parser check” with saved next actions. Make parser depend on allocator; set a manual Low priority. Select and pin allocator; verify pin/override/dependency across navigation and normal restart. | BLOCKED |
| A2.6 | Inspect the four focus cases below. Other-task recommendations must not change a pin; note the displayed explanation and actual action. | BLOCKED |
| A2.7 | Run the harmless task-scoped wrapper command below. Verify run ready-for-review while task remains unfinished. | BLOCKED |
| A2.8 | Ctrl-C only the fixture service in terminal 1; inspect truthful offline/stale UI. Edit and Save a synthetic capture offline. Restart service with the same data path/port, Retry if needed; verify drafts, queued upload and exactly one copy of the offline capture. | BLOCKED |
| A3.1 | With permission to interact with the desktop, launch helper below. Physically click kitten/menu; retain keyboard focus in a synthetic work window; outside clicks reach it. Check Cat/Dot/Hidden, 32/40 sizes and helper-local pause/resume with server permission off. Hidden restores by helper restart. | BLOCKED |
| A3.2 | Check popup bounds/placement on both actual monitors and chosen workspaces, main-window hide/restore and helper reopen. Record observed scales, not presumed HiDPI support. | BLOCKED |
| A3.3 | Activate Open task / Observation settings without intercepting dispatch. Record which OS browser/application opens, correct fixture origin and saved task/dialog. Native links currently use `webbrowser.open`, not a desktop-shell deep-link registration. | BLOCKED |
| A3.4 | Only with explicit metadata consent: create a competing title-to-task rule, focus only a synthetic terminal/window, permit metadata, wait for two polls, verify pin retained and fresh report. Pause helper, distinguish its pause from global permission/report age, resume, then disable global permission before leaving fixture windows. | BLOCKED |
| A4.1 | Explicitly deny microphone permission and check usable error/retry state. Then, by your action, allow and record ~5 seconds of non-sensitive speech; Stop, Save, replay, normal restart and replay saved attachment. No model download/transcription; unavailable physical microphone remains BLOCKED. | BLOCKED |
| A4.2 | Sample full attributable app set during open-idle, hidden-idle, editing/saving and companion + explicitly permitted metadata observation, following the periods below. | BLOCKED |

For actual OS dispatch, use an isolated destination browser profile or disposable
OS test session with its real default handler, not a dispatch stub. Do not
change the user's normal default browser/profile silently. If routing cannot
be isolated without that change, leave A3.3 BLOCKED and ask for that choice.

For A2.6, check (1) actionable pinned allocator with no competing available work;
(2) pinned parser waiting on allocator, then a pinned task waiting on a wrapped
agent; (3) another task needing review/attention; (4) no selected focus, cleared
only through the explicit confirmation. Restore each state intentionally.
To hold a harmless wrapped agent briefly, use the same wrapper command below
with `time.sleep(20)` before printing. Do not mark a task complete just to clear
an agent result without reviewing it.

Source inspection/characterization records **A-FOCUS-01**: selection currently
orders attention → available → actionable focus. An actionable pin is only the
fallback when no other available item exists. Selecting another suggestion
opens its details rather than silently replacing the pin. The displayed short
reason is that task's action/attention reason, not an explicit explanation of
why it outranks or bypasses the pin. Reproduce with an actionable pinned task
and an independent available task, record the actual text/action, and review
this explanation gap before passing A. No ranking/UI change was made without
device evidence. Four new pure tests characterize these cases; they are not
physical acceptance.

Task wrapper, in another fixture terminal (tokens entered silently, never in
arguments or reports):

```bash
read -r -p 'Fixture task ID from task details: ' DHARA_TASK_ID
read -rs -p 'Task-scoped Agent token from fixture Settings: ' DHARA_TOKEN
export DHARA_TOKEN
.venv/bin/python tools/agent.py --url http://127.0.0.1:18765 --task "$DHARA_TASK_ID" \
  --outbox "$DHARA_FIXTURE/agent-events.sqlite3" --name 'Synthetic review command' \
  -- .venv/bin/python -c "print('Synthetic result; human review required')"
unset DHARA_TOKEN
```

Companion, only when the user is ready to test its desktop interaction:

```bash
read -rs -p 'Observer token from fixture Settings: ' DHARA_TOKEN
export DHARA_TOKEN
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 \
  GDK_BACKEND=wayland /usr/bin/python3 tools/sway_companion.py \
  --url http://127.0.0.1:18765 --observe-window-context &
DHARA_COMPANION_PID=$!
unset DHARA_TOKEN
printf 'Companion PID: %s\n' "$DHARA_COMPANION_PID"
fg
```

The flag exposes pause/resume, **but global permission remains off** for
appearance tests. Enable it only for A3.4, on explicit user action. No screenshots
are observed. The temporary GI path is needed on this machine; the default
system search path currently lacks the GtkLayerShell typelib. On a machine with
the distribution typelib installed, omit that variable. No installation was
performed here. Use a dedicated synthetic terminal title for the mapping rule;
do not authorize observation while personal windows are focused. Close/Quit or
Ctrl-C only this foreground helper; no broad process cleanup commands.

## Resource sampling

From a separate terminal, enter the **current** root PIDs printed by launch.
The dependency-free sampler never launches/stops a process and never captures
content. Use 20 seconds warm-up, 60 seconds sample, 1 second intervals. Repeat
the command with phases `hidden-idle`, `editing`, `companion-metadata` and new
output names while performing each activity. Add `--root companion=PID` once
the helper is running, and `--root observer=PID` only for a separately launched
observer (the companion's observer thread is already included).

```bash
read -r -p 'Current fixture service PID: ' DHARA_SERVICE_PID
read -r -p 'Current fixture shell PID: ' DHARA_SHELL_PID
.venv/bin/python qa/process_sample.py --root "service=$DHARA_SERVICE_PID" \
  --root "shell=$DHARA_SHELL_PID" --phase open-idle --warmup 20 --duration 60 \
  --interval 1 --output "$DHARA_FIXTURE/reports/open-idle.json"
```

The sampler follows descendants and retains known children after reparenting,
using PID + Linux start ticks to reject PID reuse. Chromium's GPU, renderer
and utility processes are descendants of the Electron main process and are included from the shell root. Already-reparented/shared broker
processes not discovered from roots are excluded; add an explicitly attributed
`--root webview-1=PID` (and `webview-2`, etc.) when necessary. If the full set
cannot be attributed, record incomplete coverage, not a complete-app result.
Do not find roots using broad process-name matching or read unrelated arguments.
An OS browser opened by routing is separately running and excluded; note that.

Reports include actual periods, sample/process counts, CPU seconds and both
normalizations: 100% of one core is one CPU-second per wall-second; machine
capacity divides by logical CPU count, not equal-performance cores. RSS sums
double-count shared memory; PSS proportions shared pages, while private memory
sums Private_Clean/Dirty/Hugetlb. Missing/restricted PSS/private is `null`, not
zero. Root exits mark the sample incomplete. Sub-interval short-lived processes
and CPU after their last readable sample can be missed, so CPU is an observed
lower bound. Sampler/compositor/PipeWire and unattributed helpers are excluded.
No battery life, GPU benefit or model performance follows from these samples.

## Close the gate

Share only filled status rows, short failure reproductions, fixture protocol /
monitor scales and the sanitized session/resource JSON. No personal screenshots,
clipboard dumps, tokens, full environments or process arguments are needed.
If a fix is required, add a focused regression and repeat its physical check.
A passes only after every required row has real recorded device evidence and
open failures are resolved. B is now implemented independently as explicit
Linux development opt-in; its physical checks remain pending and defaults
must not be promoted from virtual evidence. Native-presence
detection, automatic preview suppression and event-triggered messages remain
pending; do not infer them from the popup. Next is physical acceptance of A
and the opt-in lifecycle. Unfinished voice recovery follows lifecycle
acceptance; it was not started in this pass.
