# Build status · Noema 0.2.0

Prepared 2026-10-08. Recoverable source baseline for the next development session. This is an actual local development build, not just concept screens. No code was installed on the user's laptop or deployed to a remote account by this release.

## Starting point

Recovered `Noema-v0.1.0.zip` from the user's Library and ran its original 62 tests successfully before changing source. Continued that implementation, preserving its notes/tasks semantics, lightweight browser frontend and SQLite data format. This version is not a claim that the separate earlier UI site was updated.

## Implemented in this update

- Experimental Sway screen helper with explicit launch flag, focused-output/visible-workspace geometry, two-sample stability check, clipped window-region capture using grim, bounded scaling and local image-change detection.
- Separate screen-scope token and session; default-off app/project permissions, owner binding, 90-second heartbeat lease, one-hour session expiration and restart/pause/revocation handling.
- One ephemeral image queue, no screenshot files/history/retry outbox; latest window metadata and any resulting focus ID may still be saved. Model rationale is not persisted and does not enter the browser's offline snapshot.
- Local CPU-only Ollama vision adapter with schema validation and candidate task-ID scoping. No tools or command execution, no completion inference, no automatic note creation.
- Compact reviewable focus suggestion; optional automatic mode updates unpinned focus only. Manual pins and concurrent edits/context changes take precedence.
- Shared note/speech/vision worker, minimum two-minute interval, and adaptive rest of at least nine times the elapsed vision inference duration. This is a scheduling policy, not a measured laptop-performance result.
- Settings controls, status, pause, companion menu capture hold, and exact-task browser deep links.
- Backend/helper and UI regression tests plus a complete screen setup/privacy guide.

## Retained from 0.1.0

Persistent tasks, automatic rule-based priorities and manual overrides; explainable available-work ranking; dependencies and scheduling; in-app reminders; scoped run-event API and real command wrapper/outbox; explicit text/image/sketch/audio captures; originals/revisions/restore; conservative folder filing; optional local note cleanup and CPU transcription; responsive Now/Capture/Notes/Plan interface; metadata-only Sway observer; experimental native GTK kitten/dot; portable export.

The app starts empty. Example content in QA screenshots is deliberately synthetic. Browser/PWA files and local draft/outbox code exist; native browser persistence and permissions still need device validation.

## Verified here

- **125 passing Python tests**, including the original integration tests with a real HTTP server/child process and new screen-helper/service tests.
- **20 passing isolated-browser interaction checks**, real frontend and real server with explicit transport/storage test doubles; no uncaught JavaScript errors.
- JavaScript syntax and Python compilation checks.
- Inspected desktop, phone and screen-permission screenshots.
- A short empty, idle backend-only sample: roughly **116.9 MiB RSS**, **0.2% of one CPU core over ten seconds**. Not a full-app, device, browser, cat, observer or inference measurement.
- ZIP integrity, per-file SHA-256 verification and a test run from a fresh extracted directory with spaces in its path; see the release test report and `qa/archive-check.json`.

## Implemented but not validated end-to-end on target hardware

- Real `grim` capture, physical Sway outputs/workspaces, monitor scaling, GTK/layer-shell placement, z-order and popover behavior.
- Local model availability/quality, CPU vision time/memory, technical speech recognition, microphone recording on hardware.
- Native browser IndexedDB/service workers/PWA installation/OS notification delivery.
- Windows/macOS/Android device runtime and packaging.

Screen and model tests use synthetic images, mocked compositor output and a mocked Ollama transport. They validate intended logic and failure paths, not real screen understanding. The build machine has no Sway session, GTK companion runtime, grim or installed Ollama/speech model. No model was downloaded for this test run.

## Still missing

1. Native main application shell and automatic cat appearance when that window is minimized; native overlays/observers outside Sway.
2. Authenticated hosted HTTPS deployment, cloud accounts/pairing, synchronization/reconciliation between independent devices and encrypted remote storage.
3. Push delivery with the browser closed or reminders while the host is powered off.
4. Live streaming transcription, rolling unfinished-recording recovery, audio-time-linked visuals and image/diagram understanding/search for saved notes.
5. Folder taxonomy learning, reliable mixed-topic split/merge, embedding-based semantic search and learned prioritization.
6. Native lifecycle hooks for arbitrary already-running Codex/browser sessions; the command wrapper only tracks what it launches.
7. Comprehensive data import/deletion/retention UI, production multi-user security, backup automation and a complete security audit.
8. Screen lock-state integration, robust occlusion/privacy filters, model calibration and real laptop CPU/battery/resource evaluation.

## Next milestone

Run the base app on the actual i7-1270P Sway laptop with the user's existing data directory backed up. Verify capture and reminders first. Test the native kitten on each output/workspace, then test the new observer only on non-sensitive allowlisted windows and a selected local model. Measure actual speed and memory before adjusting cadence or adding another platform's native shell. No need for another dashboard redesign.

## Do not claim

Do not call this fully shipped, cloud-synced, production-audited, installed on the user's device, universally cross-platform or capable of reliably understanding arbitrary screens. Do not claim sub-100-MB whole-app memory, real speech/model accuracy or battery performance from this backend-only sample. Do not imply a dot bypasses consent, screenshot-region capture isolates other surfaces, or pause immediately cancels an inference already executing.
