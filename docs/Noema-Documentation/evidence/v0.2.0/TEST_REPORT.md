# Verification report · Noema 0.2.0

Date: 2026-10-08. These results describe the distributed source, not an installation on the user's devices. Baseline 0.1.0 was recovered from the Library and passed its original 62 tests before this update.

## Executed

| Check | Recorded result |
|---|---|
| Python backend/helper suite | **125 passed**, no failures; `qa/backend-tests.txt`. |
| Original real-process integration | Preserved: actual disposable HTTP server, task-scoped token, real child command; exit 0 leads to review, exit 7 to failure; task remains unfinished; wrapper tokens absent from child environment. |
| Frontend interaction harness | **20 checks passed**, no uncaught UI JavaScript errors; `qa/browser-results.json` and `qa/browser-tests.txt`. |
| JavaScript syntax | `node --check` passed for `app.js`, `companion.js`, `sw.js`. Node is a QA tool, not an application runtime dependency. |
| Python compilation | `compileall` passed for package, tools, tests and launcher. |
| UI inspection | Actual assets/API rendered by harness; desktop, phone, capture and screen-permission views inspected. No observed horizontal overflow in tested phone/tablet views. Not a complete accessibility/browser audit. |
| Native navigation check | Chromium rejected ordinary local-server navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; recorded in `qa/native-navigation.json`. No browser policy was disabled or bypassed. |
| Setup diagnostic | `tools/doctor.py` ran read-only; `qa/doctor.txt`. No models downloaded or screens captured. |
| Idle sample | Backend-only, empty database, ten seconds: RSS 116.86–116.88 MiB, approximately 0.2% of one core; `qa/resource-results.json`. |

## Backend/helper coverage

Existing coverage includes task persistence/optimistic versions, invalid/cyclic dependencies, priority overrides, availability/deadline/estimate filtering, originals/revisions, capture idempotency, attachment validation, reminders/restart, agent event ordering/scopes/outbox, Sway metadata rules, pinned focus, note-worker failure/recovery and export omissions.

Added tests cover explicit screen permission and consent, optional dependency/model configuration, allowlisted apps/projects, token scoping/owner binding/revocation, existing-settings migration, session expiry/lease/restart, pinned/rule-mapped skip, sensitive-window title omission, image formats/size/metadata/downscaling, screenshot geometry/output/workspace clipping, capture-command argument construction, companion-corner mask, stabilization/change detection, scope changes while decoding/inferencing, bounded scheduling/adaptive backoff, stale pending images, task edits and pinned-focus changes during inference, invalid/out-of-scope model responses, late-result rejection, note-worker priority, three-failure pause, transient companion hold, non-persistence of screen rationale/images, and CPU/structured-output request options.

**Screen/model boundaries:** synthetic PNG/JPEG fixtures, mocked Sway tree/workspace output, simulated time and HTTPX mock transport. No live Sway compositor, actual grim capture, real vision model or speech decoding was exercised. These tests establish code-path behavior under the tested inputs, not inference quality or hardware compatibility.

## Browser harness boundary

Ordinary Chromium navigation to the local server was blocked by the environment. The existing harness loads the **actual** HTML/CSS/JavaScript in an isolated page and explicitly bridges frontend fetches to a **real disposable Python backend**. Because the page has an opaque origin, IndexedDB and localStorage use explicit in-memory test doubles. Service-worker registration is excluded from this harness.

The 20 checks exercise real API-state rendering, task creation/priority controls, multipart image/text capture, note edit/history/original recovery, an offline capture/reconnect outbox workflow through the storage adapter, escaped untrusted note/screen text, phone/tablet layout, permission-form validation, saved settings without automatic capture, observation pause, observed-title omission from the offline snapshot and exact-task companion deep links.

They **do not establish** real native IndexedDB durability, browser service workers, microphone hardware/permission flows, recording codecs, notifications, installable PWA behavior or cross-device synchronization. The outbox's real native browser storage still requires a device test.

Screenshots contain synthetic example tasks. They are not evidence that the user's desktop was observed or their agents were running.

## Resource measurement boundary

`qa/resource_check.py` launches a new backend with no connected clients, no enabled models and an empty disposable database. It samples process RSS and CPU-time deltas for ten seconds. This is a short **build-container backend-only** measurement, not a benchmark on the i7-1270P. It excludes browser/webview, cat, observer polling, image processing, inference, large datasets, active clients, disk encryption, battery use and the user's development workloads. Near-zero CPU values are limited by OS accounting resolution.

No model memory/latency or full minimized-app memory target was validated. The backend alone is above 100 MiB here; do not advertise sub-100-MB total usage. The adaptive inference rest policy is unit-tested scheduling logic, not an empirical CPU or battery guarantee.

## Environment

Linux; Python 3.13.5; Node v22.16.0 for syntax checks; Chromium/Playwright for isolated UI tests. Core packages: FastAPI 0.128.2, Uvicorn 0.48.0, Pydantic 2.13.5, python-multipart 0.0.29, HTTPX 0.28.1; test packages pytest 9.0.2 and Pillow 12.3.0. Optional faster-whisper, Ollama models, GTK bindings and Sway/grim were not installed for this run. Core and vision/test dependency versions are recorded in requirements/pyproject.

## Archive / relocation check

The release workflow verifies ZIP integrity and every file in `SHA256SUMS`, extracts the archive into a fresh directory whose path contains spaces, and reruns the full Python suite. The actual result is in `qa/archive-check.json`. This uses the already-installed build-environment dependencies, not a fresh internet dependency installation. Any final repackaging that adds this report/result without application-code changes is identified in that JSON.

## Not performed

Installation on the user's laptop; real Sway/cat/multi-monitor observation; live model or technical speech assessment; macOS/Windows/Android device tests; native browser persistent-storage/PWA/audio/notification validation; cloud deployment/account pairing/sync; full security audit, production load/resilience testing, full accessibility evaluation, or indefinite background monitoring.
