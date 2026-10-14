# Verification report · Noema 0.1.0

Date: 2026-10-08. These results describe the source distributed with this report, not a running installation on the user's devices.

## Executed

| Check | Result |
|---|---|
| Python backend/helper suite | **62 passed**, no failures. Raw output: `qa/backend-tests.txt`. |
| Real-process integration | Included in the 62: a disposable actual HTTP server, task-scoped token, actual child command, exit 0 → review, exit 7 → failed, task remains unfinished, integration/admin tokens absent from child environment. |
| Frontend interaction harness | **14 passed**, no uncaught UI JavaScript errors. `qa/browser-results.json` / `qa/browser-tests.txt`. |
| JavaScript parse checks | `node --check` passed for `app.js`, `companion.js`, `sw.js`. Node was used for QA, not to run the product. |
| Python compile checks | `compileall` passed for package, tools and launcher. |
| Interface inspection | Inspected actual desktop and phone screenshots from the harness. Small cat renders; text/control hierarchy and phone bottom navigation show no observed overlap in inspected views. This is not a full accessibility/browser audit. |
| Backend idle sample | One disposable empty backend, models off, 10 seconds. Approximately 117 MiB RSS and 0.2% of one CPU core. See `qa/resource-results.json` for exact values and limits. |

## Backend/helper coverage

The suite covers task persistence and optimistic versions; invalid/missing/cyclic dependencies; automatic priorities and persistent manual overrides; future-start/dependency/estimate/agent availability filtering; notes never implicitly becoming tasks; immutable originals; capture idempotency; upload validation and failure cleanup; revisions/restore and lexical search; reminders due/snooze/dismiss/restart; agent duplicate/out-of-order/reused-ID handling and stale/terminal states; task-scoped token access and revocation; observation off/pinned focus/rule matching; queued AI success/failure/concurrent edit recovery using test doubles; export omissions; Sway tree parsing for outputs/workspaces/floating nodes and observer debounce; outbox retry; rejection of plaintext remote helper endpoints; and real wrapper subprocess execution.

Model response validation/recovery tests use fixtures. They are not a quality evaluation of a language or speech model.

## Browser harness boundary

Ordinary Chromium navigation to the local server returned `ERR_BLOCKED_BY_ADMINISTRATOR` in this environment. The restriction was not disabled or bypassed.

Instead, `qa/browser_check.py` mounts the **actual** HTML/CSS/JavaScript in an isolated page and explicitly bridges frontend fetches to a **real** disposable Python server. Because an opaque page origin cannot provide normal persistent browser storage, IndexedDB and localStorage use explicit in-memory test doubles. The harness also excludes native service-worker registration.

The 14 checks exercise UI behavior with this boundary: render real API state; task creation; priority control; multipart image/text capture; note edit/history/original recovery; queued capture and reconnect delivery; untrusted HTML rendering; phone overview/capture and tablet layout without horizontal overflow; no uncaught errors.

They do **not** establish that real browser IndexedDB, service workers, microphone permissions, audio recording devices, OS notifications, PWA installation or multi-device synchronization work end-to-end. Separate hardware/browser tests remain required.

Screenshots contain synthetic example tasks created by the harness. They do not show actual active work, user desktop observation or live agents.

## Resource measurement boundary

`qa/resource_check.py` starts a new backend with no clients/models and an empty disposable database. It samples process RSS and CPU-time deltas for ten seconds. This is a short **build-container, backend-only** sample, not a benchmark on the i7-1270P. It excludes the browser, native companion, Sway polling, active clients, AI inference, media decoding, database scale, battery use and other running agents. CPU figures near zero are limited by OS accounting resolution.

The previously discussed full minimized-process memory target has not been validated. The backend alone is above 100 MiB in this environment; do not advertise a sub-100-MB whole application on the strength of these results.

## Environment

Python 3.13.5 on Linux, Node v22.16.0 for JavaScript syntax checks, system Chromium plus Playwright for the isolated UI harness. Tested core packages: FastAPI 0.128.2, Uvicorn 0.48.0, Pydantic 2.13.5, python-multipart 0.0.29, HTTPX 0.28.1, pytest 9.0.2. Dependency versions are pinned in the package. Optional faster-whisper and a local model were not installed/downloaded for this run.

## Not performed

- Installing or running on the user's laptop, macOS, Windows, Android, real Sway or multiple physical monitors.
- Live Ollama inference, transcription accuracy/speed, video/screenshot interpretation.
- Native desktop overlay size/placement/permission validation or automatic minimize integration.
- Secure hosted deployment, account pairing, encrypted cloud storage, remote push notification delivery.
- Full security audit, load testing, resilience under disk-full/power-loss conditions, native accessibility evaluation, or indefinite background monitoring.

The source contains these boundaries explicitly so the next development session can build on verified behavior rather than treat the concept screens as already implemented features.

## Archive/relocation check

The initial source archive passed ZIP integrity and SHA-256 file-manifest checks. It was extracted into a fresh directory whose path contains spaces, and the complete backend/helper suite passed again: **62 tests**. This reused already-installed build-environment dependencies rather than performing a new internet installation. The subsequent final archive adds this report and its machine-readable result without changing application code. See `qa/archive-check.json`.
