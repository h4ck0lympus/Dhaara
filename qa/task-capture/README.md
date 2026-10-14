# One-input task capture · 2026-10-09

These are screenshots of the actual served interface, not mockups. Baseline and
implemented form use the same empty-workspace fixture recipe and sentence
“Review the cleanup path”, in independently disposable databases/profiles.
Headless installed Google Chrome 154.0.8037.92, desktop 1200×900 and phone-width
390×844, scale 1; fixture service Python 3.12.3.
Phone-width evidence is responsive layout, not a supported/validated phone app.
No personal screen, data, microphone or native companion was accessed.

| View | Before | After |
|---|---|---|
| Desktop | [Detailed form](before-desktop.png) | [One input + collapsed Details](after-desktop.png) |
| Phone-width | [Detailed form](before-phone.png) | [One input + collapsed Details](after-phone.png) |

The authorized visual change removes mandatory-looking database fields from the
initial task interaction. It leaves the application layout, palette, framework,
approved bitmap and ordinary note capture intact. The before form exceeds the
viewport; the after form exposes the input and Add task without scrolling.
All four images were opened and visually inspected. No old evidence was deleted.
Current whole-QA inventory is 39 PNGs: previous 35 plus these four.

`before-results.json`: one real baseline save; `results.json`: 27 Chromium UI
checks. Real HTTP, SQLite, native IndexedDB, persistent-profile reopen; quota,
SQLite trigger failure, offline transport and lost acknowledgement deliberately
injected. No task AI/voice/hardware/performance claim. `now-regression` records
58 checks; `capture-recovery` records 22. `webkit-final` / `webkit-external-final` record
68 / 44 actual Rust/Wry/WebKit managed/external checks, including programmatic
normal close, task-draft restart and injected failed task checkpoint. Those are
private Xvfb/X11, not physical or native Wayland input acceptance.

The permanent contract/known gaps are in [TASK_CAPTURE.md](../../docs/TASK_CAPTURE.md).
Exact executed commands and all newly rerun results are in
[TEST_REPORT.md](../../docs/TEST_REPORT.md). Current source fingerprint is
[source-after.sha256](source-after.sha256), covering 73 active files, not the
untracked app's parent HEAD. Verify source from the repository root; verify
`SHA256SUMS` from this evidence directory.
