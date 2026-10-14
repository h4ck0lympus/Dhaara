# Native companion pointer acceptance

The existing popup receives compositor-delivered pointer events in a private
headless Sway session. Forty-one checks cover Cat/Dot at 100%/150%/200%, adjacent
menu controls, preserved work-window keyboard focus and outside-click delivery
to a real GTK work window. Task URL activation, 32/48 logical sizing, local
pause/resume and explicit Hidden are exercised at 200%. Permission, pinned
focus, manual priority and notes remain unchanged in disposable HTTP/SQLite data.

Current unmodified `grim` captures:

- [100%](after/pointer-panel-1x.png)
- [150%](after/pointer-panel-1.5x.png)
- [200%](after/pointer-panel-2x.png)

[Raw checks and coordinates](after/results.json) include source hashes.
No production or visual change was needed; the preceding
[same-fixture visibility comparison](../kitten-visibility/README.md) remains the
before/after baseline. The full-window synthetic button is a QA input sentinel,
not a Noema overlay or UI design.

Run from the repository root:

```bash
GI_TYPELIB_PATH=/tmp/noema-sway-sdk-dEQTbK/root/usr/lib/x86_64-linux-gnu/girepository-1.0 .venv/bin/python qa/sway_check.py --pointer
```

The typelib path is an already-extracted dependency on this machine, not an
installation instruction or portable location. The harness requires the existing
Sway, GTK3/layer-shell, Cairo, grim, Rust desktop development executable, C
compiler, pkg-config and Wayland client development files. It compiles
`qa/virtual_pointer.c` into its temporary directory, registers pointer capability,
and sends presses through the private Sway IPC socket. No GTK `clicked` signals
are synthesized. Runtime/socket/PID guards reject the user's compositor;
the C helper additionally rejects missing fixture runtime or an absolute
Wayland display path. Services, profile, virtual device and compositor are
temporary and stopped after the test. Protocol wire definitions follow
[upstream wlr-protocols](https://github.com/swaywm/wlr-protocols/blob/master/unstable/wlr-virtual-pointer-unstable-v1.xml).

Browser launch is intercepted and its actual URL asserted. Observation permission
stays off; local pause/resume is tested without running the recurring polling
thread. These are virtual compositor input checks, not physical mouse, monitor,
accessibility, OS browser routing, model or target-hardware performance evidence.
