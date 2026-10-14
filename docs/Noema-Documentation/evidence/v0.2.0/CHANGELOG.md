# Changelog

## 0.2.0 · 2026-10-08

Continued from the recovered 0.1.0 source archive. This is a local development release, not a native installer, hosted deployment or target-device validation.

### Added

- Separate opt-in Sway pixel helper: focused-window/output bounds, two-sample stabilization, visibility check, output clipping, downscaling, companion-corner mask and local change detection. No screenshot files or durable screenshot retry.
- In-memory screen-session service and dedicated screen token; exact app/project permissions, model configuration gate, lease/expiry/revocation and fail-closed state changes.
- Local CPU-only Ollama vision adapter, constrained existing-task matches, one shared worker and one queued image. Note/speech processing takes precedence.
- Two-minute minimum interval plus adaptive nine-times-inference rest. Images waiting over 90 seconds expire; late or stale-context results cannot update focus.
- Small reviewable focus suggestion; opt-in automatic focus updates preserve manual pins and never mark tasks done, create notes or execute commands.
- Settings controls, session diagnostics and pause. Kitten pause, open-menu observation hold, exact-task deep links and explicit pixel-active indicator.
- Tests for permissions, image bounds, inference schemas/options, scoping, stale results, version conflicts, scheduling, private-title handling, geometry and unchanged screens.

### Corrected / hardened

- New defaults merge with saved 0.1 settings instead of requiring a workspace reset.
- Offline browser snapshots no longer include observed window titles or screen interpretation.
- Permission mutation/revocation and final model-result application share a lock.
- Model-inferred focus checks current task version and current focus in the same database transaction.

### Verification

125 Python backend/helper tests and 20 isolated-browser interaction checks pass in the recorded run. Actual screen capture, live model inference, GTK placement and device-specific browser APIs remain untested here; see docs/TEST_REPORT.md. No code is installed on the user's machine by this archive.

## 0.1.0 · recovered baseline

Persistent notes/captures/revisions; task planning and actionable-work ranking; durable reminders; scoped agent API and subprocess wrapper; optional local note/speech adapters; responsive app; metadata Sway observer and experimental cat. Its prior recorded suite had 62 backend/helper tests and 14 isolated-browser checks.
