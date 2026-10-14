# Build status · Noema 0.1.0

Prepared 2026-10-08. This source package is the recoverable baseline for the next development session.

## Starting point

Prior conversation material included UI concepts and a surfaced Noema UI site. A previously referenced backend directory was not present in this build runtime. This package is a new, tested implementation of the agreed scope, not a claim that the old site was updated or that files were written to the user's laptop.

## Delivered now

- Runnable Python/FastAPI local server with a persistent SQLite database and private attachment directory.
- Actual responsive Now/Capture/Notes/Plan interface, charcoal and muted olive, sparse optional dot motion, compact task rows, small supplied cat sprite.
- Explicit learning-note capture with text/images/sketches/audio; conservative automatic folder filing without models; raw originals, revision history, recovery and manual edits.
- Optional real API adapter for local Ollama cleanup and optional faster-whisper CPU subprocess. Model output is never executed.
- Automatic rule-based task priority, durable manual override, dependency validation and scheduling; explainable actionable-task selection, manual focus pinning.
- Durable reminders surfaced in the app, snooze/dismiss, restart recovery.
- Task-scoped agent API, durable command-wrapper outbox, real subprocess lifecycle, ready-for-review/needs-input/failed/stale states.
- Optional metadata-only Sway observer and experimental small native cat/dot with output/workspace placement logic.
- Portable data export, source, tests, screenshots and setup instructions.

## Runtime defaults on the i7-1270P target

There is no resident language/speech/vision model. The UI has no npm build or bundled Chromium engine. Python, the browser and SQLite perform ordinary app work. The optional worker serializes AI jobs; screenshot inference is absent. Four model threads and on-demand process/model unloading are initial conservative policies, not laptop performance measurements.

The short build-container idle sample uses about 117 MiB for the backend process only and about 0.2% of one core in its 10-second sampling window. See the raw JSON for exact values and exclusions. This does not validate the earlier aspiration of a sub-100-MB complete minimized application; browser and companion measurements are still needed.

## Implemented but not exercised end-to-end on target hardware

- Speech decoding, technical vocabulary accuracy, recording permissions and model download/install compatibility.
- Real local language-model response quality and latency.
- Native Sway GTK overlay, multi-monitor movement, scale factors and workspace visibility.
- Native browser IndexedDB persistence, service worker/PWA installation and operating-system notifications.
- Windows/macOS runtime and Android device behavior.

## Not implemented yet

1. Periodic screenshots with local change detection and vision-assisted task inference. Current observation is explicit metadata mapping only.
2. A native main application shell and automatic companion behavior upon minimizing it; Windows/macOS/Android overlay implementations.
3. Cloud accounts, hosted HTTPS sync, cross-device outbox reconciliation and encrypted remote storage. Two installations currently have separate data.
4. Background Web Push when the browser is closed, calendar integrations, and reminders delivered while the host is powered off.
5. Live streaming transcription, rolling recovery of unfinished recordings, audio-time-linked visual references, image understanding/search, reliable technical-term confidence marking.
6. Dynamic folder taxonomy learning, mixed-topic capture splitting, embedding-based semantic search and meaningful personalization of priorities.
7. Native lifecycle hooks for already-running Codex/browser sessions. The generic wrapper tracks a process it launches; it cannot see arbitrary existing agents.
8. Complete data import, deletion/retention management UI, production authorization/TLS hardening and comprehensive backup automation.

## Next focused implementation milestone

Run this package on the actual Sway laptop. Verify note capture and optional local speech on short technical recordings. Test the cat/dot on each monitor and workspace before writing Windows/macOS shells. Then add permission-scoped screenshots behind the existing observer API, with an explicit visual capture boundary and resource measurement. Native shell and secure cross-device deployment should follow verified local behavior, rather than another UI redesign.

## Do not claim

Do not describe this as fully shipped, production audited, deployed to the cloud, or installed on the user's machine. Do not claim local-model quality, automatic understanding of arbitrary screens, universal agent integration, or platform-wide notification delivery. Do not present example screenshot tasks as live user activity.
