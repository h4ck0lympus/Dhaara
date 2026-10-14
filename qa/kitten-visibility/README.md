# Native kitten visibility evidence

Captured on a private headless Sway compositor, never the user's desktop.
Both phases use the same synthetic task fixture: a low-priority pinned allocator
task and an available parser task with “Inspect the synthetic example.” saved
as its next action. Observation permission is off. A focus sentinel on the other
synthetic output verifies that opening controls does not take keyboard focus.

The original helper source was saved before modification and used for `before/`.
The initial before capture preceded application code edits; the final before
capture repeated it with the focus sentinel. The bitmap file is identical in
both phases. `after/` contains the actual new GTK container and controls, not
design mockups. Screenshots are unmodified compositor output.

| Background at 100% | Before | After |
|---|---|---|
| Dark | [Original](before/dark-1x.png) | [Visible popup](after/dark-1x.png) |
| Light | [Original](before/light-1x.png) | [Visible popup](after/light-1x.png) |

Also captured: dark/light at 150% and 200%, 32-pixel kitten, dot on both
backgrounds, hidden, task panel, menu at 100%/200%, disconnected and long text.
Results record source hashes and measured logical sizes. GTK uses buffer scale
2 for both 150% and 200%; compositor scaling is tested, not physical display
appearance. Default container measures 56×56 logical pixels (64×64 surface
including shadow margins). Selecting 32 produces a 48×48 container.
The secondary menu is also checked while changing scale with it still open;
an explicitly dismissed panel must not reopen during a size/scale refresh.

41 after checks and 14 before checks include the independent service assertion.
GTK button signals are programmatic, not physical pointer input. External
browser launch is intercepted and its URL checked; the task route is separately
tested in real Chrome. Outage, changed-work and long-text states are explicit
presentation injections. Models/workers are disabled; databases/profiles are
temporary. Physical monitors, accessibility/IME, permissions delivery, laptop
resources, installation and model quality are not validated here.

Exact commands, changed files and remaining work: [test report](../../docs/TEST_REPORT.md).
