# Isolated desktop experiment

All changes are under `experiments/ui-ab`. Production `public/`, Python service,
Rust desktop host, native Sway helper, assets, profiles and notebook data remain
untouched. The experiment does not start production services or agents.

A is Wry/Tao with a Python stdlib static server and isolated WebKit profile.
B is Electron with isolated JSON storage and a validated preload bridge.
Both load the same React/TypeScript/Vite build and demo fixtures. Voice is simulated;
natural-language interpretation is an explicit fixture. No migration or winner.

The user's subsequent instructions expand the original UI-only scope: distinct
focus/next-actions/Tasks sections, transparent desktop kitten, metadata observation
and portability beyond Sway. A shared companion helper now provides an independent
Electron window for BOTH hosts. Its cost belongs to both application process sets;
this does not establish a Wry-native companion implementation.

The helper uses replaceable OS adapters. Window metadata is read only after Start
observation. Unique explicit task matches update activity/time in isolated demo
storage. Completion and pins are not inferred. There is no screen-content model,
screenshot capture, production interpreter or production task update.

A uses `.demo/a`, 8791 and companion 8794; B uses `.demo/b`, 8792 and companion
8795. Companion activity is under each host's `companion/` directory. Observation
starts paused on each launch. Browser preview on 8793 has no native companion.
`NOEMA_RUN_ID` creates distinct evidence profiles; `NOEMA_COMPANION=0` disables the
helper for host-only comparison. Fixed loopback ports fail if already occupied.
No nested repository, resets, pushes, production cutover or default stack change.

Linux X11 evidence is from a private virtual desktop. Sway, Windows and macOS
adapter code is not device-validated. Other Wayland compositors explicitly report
observation unavailable; compositor-specific adapters can implement the shared
interface. Resource comparison and full screen understanding remain future work.
