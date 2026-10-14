# Noema: standalone product and engineering build prompt

This file is a paste-ready brief for a coding agent. It works with an existing Noema repository or a new workspace. Give the agent the actual source and the `assets/` directory when available. The full handbook is additional context, not a prerequisite for understanding this prompt. Requirements below describe the intended product; they are not assertions that every feature already works.

---

## Your assignment

Build **Noema**, a lightweight, private, cross-platform learning notebook and intelligent to-do system for managing multiple parallel human and AI-agent workflows.

Its central question is **"What can I do now?"** It should reduce the effort of remembering, organizing, and resuming work. It is not a dashboard designed to maximize the number of simultaneous tasks.

You are implementing a usable product, not generating another UI concept, landing page, static demo, or plan-only response. Start by inspecting the workspace. Work in small, runnable, tested milestones. Preserve working code and user data. Clearly separate implemented code, executed tests, unvalidated integrations, and future work.

### Context and hardware

The primary user is a security engineer who works on CTF pwn/reverse-engineering challenges, ordinary software work, LeetCode/competitive programming, job applications, research, and technical learning. They use Sway on Linux and move between workspaces with different agents and browser sessions. They also want the same notes, commitments, and resumption context on other devices.

Required platforms are **Linux, Windows, macOS, and Android**, with responsive phone and tablet layouts. The initial native desktop integration is Sway. Do not imply that all platforms permit the same observation, overlay, or background behavior.

The target laptop has an **Intel Core i7-1270P, 32 GB RAM, and integrated Intel graphics**. Assume no usable dedicated GPU. The application must coexist with terminals, browsers, builds, fuzzers, and coding agents. No paid subscription, paid model API, model download, or resident AI model may be required for the base notes/tasks experience. Optional local inference is preferred. Cloud-backed storage remains a product goal; it is not the same thing as cloud inference.

## 1. First inspect; do not blindly rebuild

Before changing application code:

1. Locate and read the real repository, README, current build/status report, architecture, security boundaries, tests, and any existing source revision. Locate the provided UI assets. State what exists and what is missing in a short working note.
2. With an existing repository, run the available baseline tests in an isolated environment. Do not delete or reset an existing data directory. Preserve existing migrations, raw notes, attachments, tokens, task semantics, and compatible interfaces.
3. With no code available, create a small repository with a runnable first vertical slice. Do not claim access to a previous local directory, deployment, connected app, or source archive that is not actually present.
4. Use explicit user requirements and later corrections over decorative details in mockups. Treat documentation status as a claim to verify against source, not a substitute for inspection.
5. Record the exact source revision or archive identity you used. Keep test databases and synthetic examples separate from user data.

### Known historical baseline, not a permanent assumption

A recovered **v0.2.0** archive exists in the documentation history, following v0.1.0. It uses Python/FastAPI, SQLite, private attachments, and a static HTML/CSS/JavaScript frontend with no Node build requirement. Optional adapters provide Ollama cleanup/vision, CPU transcription, a generic command wrapper, and Sway helpers. If that code is supplied, continue it rather than replacing it with a new scaffold.

The v0.2.0 report records 125 passing Python tests and 20 isolated-browser checks. Its browser harness uses transport/storage test doubles, and its screen tests use synthetic images, mocked compositor responses, and a mocked model transport. Those numbers do **not** establish native storage, real microphone/model quality, physical Sway behavior, multi-monitor compatibility, or cross-device synchronization. Rerun what you can, and identify what you cannot test.

If a newer source revision is supplied, use that revision's inspected state. Never downgrade newer code to match this historical paragraph.

## 2. Product model: keep different things separate

Use these concepts, adapted to the existing schema rather than forcing an unnecessary rewrite:

- **Workflow/project:** a persistent area of work, independent of any particular OS workspace number.
- **Task:** an intended outcome, with state, next action, optional dependencies/dates/estimate, and priority mode.
- **Agent run:** one attempt associated with a task. Several runs can belong to the same task and have different states.
- **Learning note:** knowledge, reasoning, observations, hypotheses, failed approaches, or reusable techniques. It is not automatically a task.
- **Capture bundle:** explicitly saved text, audio, transcript, visuals, and provenance that can produce organized notes.
- **Current focus:** the task the user is concentrating on. It may be explicitly selected/pinned or inferred from permitted context.
- **Reminder:** a durable request to return to something, separate from whether a notification was delivered.

A continued prompt in the same agent session should normally attach to the existing task. Do not create a new task for every message. An agent returning a result means review may be needed; it never proves the task is complete.

## 3. Learning notes: one brain-dump space

The user should be able to open Capture and type or speak without supplying a title, folder, tags, project, grammar, or structure. They may jump between ideas, revise an assumption, use fragments, or have trouble articulating a thought.

Required behavior:

- Keep the input surface stable. Never reorganize text under the cursor or repeatedly rewrite a live draft.
- **Explicit Save is the notebook-ingestion gate.** Local unsaved draft recovery is allowed and should be disclosed; saving a draft locally is not permission to upload it, process it through a remote model, or permanently publish it into the notebook.
- Persist the original before expensive processing. Keep the original wording/audio/visuals accessible separately from an editable organized note.
- Clean grammar, remove filler, group related ideas, and order material sensibly without changing meaning. Preserve uncertainty, negation, corrections, chronology where relevant, assumptions, code, numbers, offsets, identifiers, and failed attempts.
- Never invent missing reasoning or turn a hypothesis into a verified finding. "Maybe the pointer is not cleared" must not become "Confirmed use-after-free."
- A two-line insight should remain short. Do not impose a long template or fill empty headings with invented material.
- Infer an appropriate existing folder/project from content and permitted context. Show the assigned title/folder after saving, with an easy correction and Inbox fallback. Folder correction should eventually improve future filing.
- Where a capture contains unrelated topics, support safe split/merge with all outputs linked back to the original. This is a later milestone if absent in the baseline.
- Preserve revision history and detect concurrent edits. A late model response must become a suggestion instead of overwriting a newer manual edit.
- Keep exact-text/code search. Add meaning-based retrieval only when it improves actual use, without making a vector database a baseline dependency.
- Notes must remain usable when a model is unavailable. Show "Saved; organization pending" or a clear recoverable error. Do not label rule-based filing as AI grammar cleanup.

Examples are learning notes about a suspected CTF object-lifetime issue or a two-pointer algorithm trick. A note containing "I do not understand this yet" is not automatically an obligation. Create a task/reminder only from explicit intent or an accepted suggestion.

## 4. Voice and visual capture

Voice is thinking aloud, not polished dictation. Provide clear record, pause/resume, stop, and recording indicators. Allow quiet recording without forcing the user to watch live text. Live transcription is a later enhancement if not implemented and evaluated.

- Save original audio and separate transcription from note organization.
- Accept hesitation, unfinished sentences, pauses, restarts, self-correction, and typed corrections to technical names.
- Test technical vocabulary, hexadecimal values, code identifiers, and negation on real recordings. Readable prose is not evidence of correct transcription.
- Never fabricate calibrated confidence scores. Mark uncertain passages only when supported, retain audio replay, and explain any confidence limitations.
- In-progress recording recovery, chunked persistence, and long-capture processing must have explicit failure behavior. Do not silently truncate long recordings or text.

Keep a **small visual tray** next to or below voice capture. It supports pasted/dropped images, screenshots, photos, simple sketches, and annotations as part of the same capture. Typing, recording, and attaching visuals can happen together. Start with simple pen/erase/undo controls, not a full design application.

Preserve original visuals. Record the audio-relative insertion time so a later milestone can link a visual to its spoken explanation. Captioning/search may help, but a model's interpretation must not replace the source or claim verified reverse-engineering conclusions. Do not make OCR or continuous image interpretation the default for every attachment.

## 5. Tasks, attention, and future planning

The main view is an attention view of existing work, not a wall of independent widgets. It should explain:

- What the user is focused on.
- What genuinely needs their answer or review.
- What is reported to be running in parallel.
- What they can act on now.
- What is intentionally scheduled or parked for later.

### What can I do now?

Filter before ranking. Exclude completed/parked tasks, unresolved dependencies, future-start tasks, and tasks that genuinely cannot proceed until an agent or external party responds. An agent result that is ready for review can be actionable; an active agent alone does not make its task actionable.

Rank eligible existing tasks using stored priority, explicit deadlines/commitments, blockers, and appropriate known context. Show a short reason and a clear Start/Resume action. Prefer one useful recommendation and a few alternatives over a long list. An optional time filter may use known estimates but must not invent effort or agent completion times.

"Nothing actionable right now" is a valid outcome. Do not manufacture tasks, fill every idle minute, automatically launch another agent, or replace a pinned focus.

### Priority and focus

Provide Automatic / High / Medium / Low. Automatic priority uses available evidence and exposes a reason; it does not invent urgency or always rank one life area above another. A manual override persists until the user changes it or selects Automatic again. A new model result cannot quietly undo an override.

Priority is separate from availability and from notification policy. Screen inference may suggest or, in an explicitly enabled mode, select an unpinned focus; it must not automatically complete or reprioritize tasks.

A focus should open with the goal, latest relevant result, unresolved concern, next action, and correct session/artifact/notes. Do not infer task completion from a tab closing or a quick window switch.

### Reminders and Plan

Support future tasks at any time, dependencies, optional not-before dates/deadlines, and intentional parking. Keep dates/time zones explicit. A vague idea is not automatically scheduled.

Persist reminder schedules and due/unread state. Restart must not lose them. Provide snooze/dismiss and group ordinary completions. A notification is one delivery channel, not the only record of the obligation. Be honest about delivery when a browser, device, or host is stopped. Never silently populate a calendar or send an application.

## 6. Agent integrations

Use lifecycle events and supported APIs/hooks before screen interpretation. Do not run one new LLM monitor per agent.

Implement or preserve a small, scoped event interface and generic command wrapper. Track started, heartbeat/progress, needs-input, completed, failed, cancelled, and stale/unknown states as appropriate. Distinguish reported process liveness from semantic progress and finished runs from accepted task outcomes.

Use stable event IDs, sequences, idempotent retries, durable event outboxes, and terminal-state protection. Late heartbeats cannot reopen a completed run. Keep tokens out of child-process environments/logs where not needed; revoke and scope tokens per integration/task.

A wrapper observes only the command it launches. For an attached browser conversation without integration, preserve the link and honest manual/unknown state. Never claim visibility into arbitrary already-running sessions. Do not copy every agent transcript into learning notes by default.

## 7. Minimal zen UI and exact reference assets

Use the provided files when available:

- `assets/desktop-approved.png`: agreed desktop concept and tiny companion.
- `assets/mobile-approved.png`: agreed phone concept.
- `assets/tablet-approved.png`: agreed tablet concept.
- `assets/cat-reference.png`: tiny illustrated black-cat reference.

They may be inside `Noema-Documentation/`. Inspect the actual pixels rather than inventing their contents. Concept screenshots are visual references, **not backgrounds to bake into a fake app**, not evidence of implemented functionality, and not production data. Use real controls, real state, and editable content. Rights to a user-supplied character are not established for public distribution; use owned/licensed production assets if distributing publicly.

### Visual requirements

- A minimal, human-oriented, Notion-like note-taking experience. Compact task rows, quiet hierarchy, and restrained controls instead of oversized dashboard cards.
- Near-black/charcoal **inside the main application**, readable text, modest contrast between surfaces, and limited accent colors. Use coherent, legible system typography and a suitable monospace face for code; avoid tiny, low-contrast labels or decorative button fonts.
- An original, very subtle abstract dot/particle field inside the app only. Do not copy the user's example background literally, alter desktop wallpaper, or let particles interfere with reading.
- Slow optional motion; stop it when hidden and honor reduced motion. No animated 3D scene, excessive glow, gradients everywhere, huge greetings, repeated slogans, productivity scores, streaks, or permanent notification overlays.
- Desktop: narrow collapsible navigation; a focused content column; contextual details only on request.
- Use the existing navigation mapping: **Now = Overview**, **Capture**, **Notes**, **Plan = Tasks**. These are four destinations, not duplicated sets of screens.
- Phone: bottom navigation, large usable touch targets, full-screen capture, no desktop shortcut hints. Tablet: optional collapsible folder/recent-note pane and comfortable sketching; not a crowded dashboard just because more width exists.
- Capture must be quiet and stable. Original/organized/history views are available without a permanent side-by-side AI preview.
- Expose recording, local-save/queued/server-save states, model failures, and permissions clearly without constant interruption. Do not claim "Synced" before remote acknowledgment exists.

The exact final font, palette tokens, and sample text are not independently locked by a concept image. Where a mockup contains clutter or stale example tasks, the explicit minimalism and truthful-state requirements take precedence. Do not perform an unrelated visual redesign of a working application.

## 8. Tiny desktop cat and stealth dot

The minimized experience should eventually be a **very small, illustrated/anime/pixel-style black cat**, not a realistic 3D cat or a large assistant panel. It is a desktop companion, not a permanent overlay within the note editor.

- Allow resizing smaller, collapsing into a tiny static dot, restoring the app, and hiding the companion. Keep observation state and pause controls discoverable.
- Click/tap to reveal a short task list, at most a few items, and the current focus. Do not show large persistent speech bubbles or unsolicited motivational chatter.
- Do not steal focus, intercept unrelated input, reserve tiling space, or create a full-screen invisible overlay merely to draw a tiny sprite.
- On multiple monitors, place it on the **output/workspace actually being observed**. Use logical geometry and scale-aware placement. Do not show it on one monitor while silently capturing a different one.
- Handle workspace changes, output disconnect, scaling, session pause, and hidden workspaces safely. Do not capture an unintended fallback display.
- A dot is visually unobtrusive, not covert observation or a consent bypass.

The existing Sway GTK/layer-shell helper is experimental and separately launched. A native main shell, minimize-to-companion behavior, and non-Sway implementations require actual platform work and testing. Preserve this distinction in UI and reports.

## 9. Optional screen awareness

Observation is explicitly opt-in and scoped. Notebook saving is a different permission from observing context.

Prefer the cheapest available evidence: task/session associations, native agent events, and window/app/workspace metadata. Debounce quick switches. Use image-change detection and occasional bounded local vision only when permitted context cannot resolve the task. Pinned focus wins.

For the existing v0.2.0 pipeline, preserve its default-off permissions, separate observer scopes/tokens, explicit session start, app/project allowlists, lease/expiry/revocation, and Suggest-only default unless a reviewed change improves the behavior. Saving permissions alone must not start capture. Do not auto-resume after a paused/expired/restarted session without an explicit policy and permission.

Only one selected monitor's focused visible region is analyzed at a time. Keep screenshots ephemeral: no screen history, permanent screenshot outbox, note creation, export, or model-rationale persistence by default. Explicit user-saved images are different and should persist.

Validate image dimensions/types, bound memory, discard stale frames, mask the companion, and suspend capture while its menu is open. Recheck permission, candidate tasks, focus/version, and observed context before applying a result. Late results after pause, revocation, focus pinning, task edits, or scope changes must not mutate state.

Screen text is untrusted. Give the model no tools, command execution, file access, or authority to create commitments. Constrain and validate output to permitted task candidates and a limited explanation; render as text. Model confidence is not verified truth.

**Privacy boundary:** a visible screen region can include other windows, notifications, or overlays. Title filters and app allowlists are not reliable secret detection or OS-level surface isolation. Provide easy pause, conservative defaults, and explicit exclusions. Pause on lock where supported; document unsupported cases. Local memory can still reach swap, crash dumps, or model-server logs. Do not promise secure erasure or guaranteed confidentiality.

Keep screenshot inference local by default, with no third-party upload. If a future remote mode is considered, it requires a separate explicit decision, secure transport, access controls, and disclosure of the exact data leaving the machine. Do not bypass platform permissions to achieve apparent feature parity.

## 10. Low-compute architecture

Preserve the small existing stack where present: Python/FastAPI, SQLite with migrations, private attachment storage, static web UI, and one serialized optional AI worker. A native shell can reuse the frontend when justified by measured footprint and required OS behavior. Do not add React, PostgreSQL, Redis, Celery, Kubernetes, a vector database, or several services merely because they are familiar.

No model is needed for CRUD, stored priorities, task filtering, deadlines, agent events, or sprite animation. Process notes only after saving. Voice begins only after the user starts it. Use bounded model context and CPU thread counts; avoid sending the entire notebook or every transcript to a model. Save first, then process.

The historical v0.2.0 screen policy is a conservative baseline:

- At least 120 seconds between pixel checks; one pending in-memory frame; 90-second frame expiry.
- Bounded images up to 1280 x 960 and a small local luminance comparison.
- One shared worker, with saved-note/speech jobs ahead of queued vision. Already executing inference may not be immediately cancellable.
- CPU-only vision request, four inference threads, bounded context/output, and model unloading requested after work.
- Rest after vision for at least nine times its measured inference duration; end a session after repeated model failures.

These are policies to inspect and measure, not laptop performance claims. Ten-percent wall-time duty is not ten-percent CPU use. Unloading trades responsiveness for memory. Models may consume multiple GB while active even though the base app requires none.

Earlier targets were under 400 MB for the open app excluding AI, under 100 MB for a minimized companion/observer, and under 1% of one core in a quiet background state. They are **aspirations, not achieved budgets**. The recorded approximately 117 MiB backend-only idle sample already prevents claiming a sub-100-MB whole application. Measure the full process tree, CPU, latency, and battery on the actual laptop before making claims or increasing cadence.

## 11. Persistence, sync, and security

The user ultimately needs cloud-backed access across devices, without depending on a paid subscription. Deliver this through an explicit, tested data-level synchronization/shared-service design; a responsive phone page alone is insufficient.

- Preserve immutable capture provenance during editing, versioned notes, task state, links, attachments, and durable reminders.
- Use stable capture/event IDs and optimistic versions. Retrying the same operation must not duplicate a note or notification; reusing an ID with a different payload must fail safely.
- Make local draft, queued capture, server-saved, and fully synchronized states distinct. Preserve conflicts instead of silent last-write-wins data loss.
- Do not sync a live SQLite file through a generic file-sync folder. Define and test a record/attachment protocol and one authoritative reminder schedule.
- Before remote access, implement authenticated HTTPS, paired devices, revocation, safe session/token storage, authorization, conflict recovery, backups, and a retention/deletion policy. Do not expose a loopback development server as a production service.
- Scope agents and models to authorized projects. Employer material must not automatically enter a personal cloud or unrelated agent context. Screen allowlists are not a complete multi-tenant security model.
- Encrypt transport and document at-rest/key/recovery choices. Do not claim end-to-end encryption if a server must see plaintext to process it.
- Export readable Markdown and structured data with attachments; provide tested import/restore before calling export a complete backup solution. Never export credentials or raw observer context accidentally.
- Handle browser cleanup, disk-full, interrupted writes, model failure, and offline retries explicitly. Default startup must not download models, activate sensors, or send data to an AI service.

## 12. Implementation sequence

Do not treat this as an instruction to finish every platform in one sitting. Choose the next unmet milestone from inspected source, deliver real code and tests, and leave a precise handoff. Do not repeatedly return architecture plans without implementing a vertical slice.

**Milestone 0 - Recover and verify.** Inventory source, data contracts, screenshots, known gaps, and baseline tests. Record the actual starting point.

**Milestone 1 - Reliable local daily loop.** Complete capture -> saved original -> organized/editable note -> search/recovery; task -> run -> review -> next action; priority overrides, pinned focus, parked/future work, and restart-safe reminders. Validate actual browser storage and failure states. Keep the UI minimal.

**Milestone 2 - Technical voice and visual notes.** Evaluate actual CPU transcription/cleanup quality, add long-capture and interrupted-recording recovery, improve folder corrections, and link visuals to audio. Make safe failures more important than fluent invented notes.

**Milestone 3 - Sway companion and bounded context.** Validate tiny cat/dot placement, workspace/output/scaling behavior and resource use. Validate metadata first, then explicitly permitted screen sampling with a live local model on non-sensitive test material. Preserve source-only/fixture-tested labels until hardware tests pass.

**Milestone 4 - Secure multi-device data and reminders.** Add authenticated shared storage/device pairing, native outbox durability, conflict reconciliation, import/backup/retention, and explicit notification-delivery boundaries. Test a real phone against a real shared service before claiming sync.

**Milestone 5 - Native platform delivery.** Add the justified main shell, minimize behavior, and Windows/macOS/Android integrations using actual supported permissions and lifecycle rules. Test on each platform; communicate capability differences.

**Later refinements.** Better scoped agent adapters, source-linked resumption summaries, meaning-based retrieval, mixed-topic split/merge, and personalized priorities. These must not compromise original notes, privacy, manual control, or the resource budget.

Unavailability of hardware is a reason to mark a validation step pending, not a reason to fabricate success or stop all development. Work on independently testable items without silently changing scope. Make reversible engineering choices; ask only when a genuinely blocking privacy, data-loss, external action, or product tradeoff cannot be resolved from the brief.

## 13. Required acceptance tests

Maintain a testable requirements-to-evidence checklist, including at least:

1. **Capture:** rough CTF and algorithm notes preserve raw inputs, uncertainty, negation, identifiers, images, and revisions. A note is not automatically converted to a task.
2. **Retry/conflicts:** capture retry saves once; mismatched ID reuse is rejected; late AI results and concurrent edits do not overwrite newer user work; offline/restart scenarios preserve pending data.
3. **Attention:** active/blocked/future/parked tasks are handled correctly; next actions come from real commitments; unknown estimates are not fabricated; priority overrides and focus pins survive later inference.
4. **Agents:** several runs per task, needs-input, completion-to-review, failure, duplicate/out-of-order events, stale connections, revocation, and a real disposable child process through the wrapper. Terminal states cannot be reopened by old events.
5. **Reminders:** restart, snooze/dismiss, timezone interpretation, missed notification recovery, and eventual cross-device deduplication.
6. **Voice/visuals:** record/save/replay, typed corrections, simultaneous visuals, long recordings, interrupted recovery, and technical-content fidelity on actual recordings when available.
7. **Observation:** off by default; separate scoped consent; one observed output; unchanged/stale frames dropped; pin/scope/revocation respected; unsafe/invalid model output rejected; no screenshot persistence; no task completion or command execution from screen text.
8. **Companion:** size/dot controls, focus preservation, on-demand task list, monitor/workspace placement, hotplug/scaling, and consistent pause behavior on real hardware before claiming native readiness.
9. **UI:** actual desktop/phone/tablet views, keyboard/touch accessibility, clear empty/error/loading/offline states, no horizontal overflow, reduced motion, and no unnecessary permanent panels.
10. **Resource use:** separate base-app idle, minimized, active capture, transcription, and vision measurements, with hardware, duration, full process coverage, and exclusions reported.
11. **Security/ownership:** token scoping, hostile text rendering, file validation, secret omission, import/export/restore, and remote access only after authentication/TLS tests.
12. **Final product loop:** start an agent task on Linux, capture a voice-and-visual learning note from Android while it runs, review its result, and resume on another device with the original concern, correct links, and no duplicate state. Mark this pending until real cross-device integration passes.

Do not substitute a mocked transport, fake IndexedDB, a phone-width viewport, a screenshot, a configured model name, or a successful import for a real native-device test. Mocks are useful but must be labeled.

## 14. Delivery and ongoing handoff

At the end of each coding milestone, provide:

- Runnable source and exact setup/start/test commands for the inspected revision.
- A short change summary and a built / experimental / planned inventory.
- Tests actually executed with raw output and failures; distinguish inherited reports and simulations.
- Screenshots of the implemented interface with synthetic data clearly identified, not newly generated concept images presented as code.
- Migration/backups and configuration notes; explicit optional dependencies and permission steps.
- A current continuation note: files changed, design decisions, known bugs, untested device/model behavior, and the next focused task.

Never claim installation on the user's laptop, cloud deployment, automatic access to their live screen/agents, accurate local-model output, universal OS support, or resource targets without direct evidence. Do not leave hidden destructive scripts, telemetry, credentials, screen capture, or model downloads enabled by default.

**Start now by inspecting the supplied workspace and reporting the next concrete milestone in a few sentences. Then implement and test that milestone. Preserve the agreed product rather than replacing it with another generic AI dashboard.**
