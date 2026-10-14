# Noema: continuation prompt for an existing repository

Paste the section below into a coding agent working in the real Noema repository. Supply the documentation bundle alongside the source. This prompt resumes development; it does not ask for another design mockup.

---

Continue building **Noema** from the actual source in this workspace. Do not start over, discard user data, or replace the existing lightweight architecture just to match an earlier stack proposal.

## Read before editing

Locate the repository and its current revision. Read:

1. `README.md`, `docs/BUILD_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TEST_REPORT.md`, and `docs/SCREEN_AWARENESS.md` when present.
2. `Noema-Documentation/Noema-Handbook.md` and `Noema-Documentation/prompts/Noema-Build-Prompt.md`, or those same files in their supplied location.
3. The actual frontend, backend, helpers, tests, and approved desktop/mobile/tablet images in the documentation `assets/` directory.

Run the baseline tests with disposable data before editing. Report what exists, what is failing, and the next unmet milestone briefly, then work on it. If a file is absent, state that rather than pretending to have read it. Do not modify historical evidence to make it resemble newly executed tests.

## Preserve the product

Noema is an intelligent **learning notebook plus to-do/attention system**, centered on **"What can I do now?"** It manages several human/agent workflows without forcing the user to maintain another complex dashboard.

The user is a security engineer learning through CTF pwn/reverse-engineering challenges, algorithms, and other technical work. They want one text/voice/visual brain-dump space with explicit Save, meaning-preserving cleanup, automatic folder filing, preserved originals, editable notes, and reliable recovery. Notes do not automatically become tasks.

Tasks and runs are separate. A completed agent run creates review work, not a completed task. Next actions must be grounded in existing available work. Priorities are automatic but have persistent manual overrides. Pinned focus wins over metadata and vision. Do not invent urgency, estimates, or task completion.

Keep the UI zen and compact: near-black application background, restrained original optional dot motion inside the app, readable typography, compact task rows, and no giant cards/slogans/permanent panels. Keep the agreed desktop, phone, and tablet direction. A tiny illustrated cat or static dot is an optional desktop companion, resizable and positioned on the monitored output/workspace; it must not steal focus or hide observation consent.

## Verify the historical baseline rather than assuming it

The documented v0.2.0 archive contains FastAPI/SQLite, a real static HTML/CSS/JavaScript UI, multimodal captures/revisions, deterministic priorities and availability, reminders, task-scoped agent events/command wrapper, optional local note cleanup and CPU transcription, and experimental Sway metadata/cat/screen helpers. It is not React/PostgreSQL/Tauri unless a later verified change introduced those.

Its report records 125 Python tests and 20 isolated-browser checks. The browser checks use transport/storage doubles; screen/model tests use fixtures/mocks. Hardware capture, GTK multi-monitor behavior, actual speech/vision quality, native persistent browser storage, full-app resource usage, non-Sway native clients, and cloud sync are not established by those reports. A newer inspected source revision takes precedence over this history.

## Hardware and permission constraints

Target: **i7-1270P, 32 GB RAM, integrated Intel graphics, no dedicated GPU**. The ordinary app must work with no resident model or paid API. Reuse the single serialized optional worker, bounded context/threads, sparse observation, and model unloading policy. Notes/speech take precedence over queued screen inference. Do not describe the approximately 117 MiB historical backend-only idle sample as full-app RAM or battery performance.

Keep observation off by default, scoped, local-first, and explicitly started. Preserve allowlists, separate token scopes, freshness/session expiry, easy pause, immutable originals, and rejection of late results after revocation or changed focus. A tiny dot must not turn into covert capture. Never execute instructions read from screenshots or use a vision result to finish tasks or launch commands.

## Choose the next milestone from evidence

First validate the local daily-use loop and existing data compatibility. If real Sway hardware is available, verify the cat on each monitor/workspace, then test explicitly permitted observation on non-sensitive windows and measure compute. If hardware or models are unavailable, do not fabricate validation or merely stop: select a testable missing part such as actual browser persistence/recovery, long-capture handling, import/restore, or integration reliability, and document the device check still required.

Longer-term work includes evaluated technical voice notes and time-linked visuals, secure authenticated cross-device sync, native shells/minimize behavior, non-Sway adapters, closed-browser reminders, learned filing and semantic retrieval. Do not implement all of these as untested placeholders in one pass. Do not expose a development server publicly or silently download models.

## Required result for this work session

Implement one meaningful, runnable improvement. Preserve current tests, add failure-path/regression tests, and inspect the actual UI if it changes. Provide the exact commands you ran, raw test results, changed files, setup/migration notes, and a short built/experimental/planned status update. Keep user data and credentials out of test artifacts.

Update the current build/status and a precise continuation note. Clearly distinguish tests newly run here from archived results and mocked checks. Do not claim installation, cloud deployment, live screen/agent access, native platform compatibility, or performance you have not demonstrated.

**Begin by inspecting the real repository and running its baseline tests; then continue the next unmet milestone without redesigning Noema from scratch.**
