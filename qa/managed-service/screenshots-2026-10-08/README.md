# Current managed desktop screenshots · 2026-10-08

These are the existing interface in the **normal Rust/Wry development binary**,
not a mockup, browser replacement, QA-injected screen or new design.

| View | Screenshot |
|---|---|
| New, empty workspace | [now-empty.png](now-empty.png) |
| Populated workspace with pinned focus and dependent work | [now-populated.png](now-populated.png) |

Both capture the same 1200×800 application window on a private 1280×900 Xvfb/X11
display at scale 1, with software rendering requested. Only that window was
captured; no personal desktop content or existing notebook/profile was opened.
The populated state has one explicitly saved synthetic learning note/image,
two explicitly created tasks, one dependency, manual Low priority and pinned
focus. No deadlines, estimates, agents, observation or recording were invented.
The small kitten is the **in-app browser preview**, not a native desktop overlay.

The normal app refreshed through its existing timer after fixture API changes.
No framework/layout/asset change or acceptance-suite rerun was made. A
programmatic private-X11 normal-close request exited the shell with status 0;
its owned backend PID disappeared. Temporary fixture data/profile/tokens were
then removed; these images/evidence and all older QA images remain.

These screenshots are **not physical Sway, mouse/keyboard, native-overlay,
monitor/scaling, microphone, performance or installation acceptance**. The
physical gate and A-FOCUS-01 remain pending. See [capture metadata](capture.json).

Exact executed capture command, from the repository root:

```bash
LD_LIBRARY_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu .venv/bin/python qa/managed_screenshots.py --output qa/managed-service/screenshots-2026-10-08 --xvfb /tmp/noema-webview-sdk-V3K1nA/root/usr/bin/Xvfb
.venv/bin/python -m compileall -q qa/managed_screenshots.py
```

For a repeat capture use a **new** output directory; existing evidence is never
overwritten. The extracted SDK was reused, not installed. The source handoff
after this documentation/capture utility pass is [source-after.sha256](source-after.sha256);
the previous 68-file lifecycle manifest remains historical and unmodified.
