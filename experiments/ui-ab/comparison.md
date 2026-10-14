# Current visual and interaction comparison

The user's later review identifies three separate sections and a desktop kitten.
The working target is therefore the blue repository dashboard, documented in
[design-spec.md](design-spec.md). The original sage reference and earlier evidence
remain preserved. No claim of user visual acceptance or exact pixel fidelity.

Both hosts render the same frontend at **1158 × 816, scale 1**, on private X11.
The layout now closely follows the blue reference's measured placement: sidebar
190 px, reading column 866 px, compact focus, three next-action rows, separate
Tasks list with colored priority dots, and quick capture. No estimated durations
or invented due dates. A small Add control and isolated-demo labels are additions.

| Item | A: Wry/Tao | B: Electron |
|---|---|---|
| Engine | WebKitGTK / JavaScriptCore 2.52.6 | Electron 44.7.0 / Chromium 152.0.7977.130 |
| Frontend | Shared React, Inter, static seeded SVG | Identical source and assets |
| Storage | Validated localStorage in isolated WebKit profile | Validated JSON through sandboxed preload |
| Native interaction | Add task, navigate, type/save note, close | Same; raw task, pin and activity verified in JSON |
| Companion | Separate shared Electron helper | Same helper and protocol |
| Differences | Text rasterization and minor line-height differences | Same layout, different rasterization |

Remaining visual differences are original particle geometry/lighting, font shapes,
icon strokes and example task wording. Native titlebars/traffic lights, desktop
margins, motivational asides and fabricated estimates are excluded. The older
large next-action card and inline kitten have been removed from the dashboard.

Task submission now reveals the saved task in Tasks, preserves raw input and pin,
and provides Edit. Keyboard submission, draft reopen/reload, idempotence and
failure recovery pass. The original reported failure's exact cause was not
established; current fresh browser and both native profiles save successfully.

Seven schema/companion tests and fourteen browser interaction groups pass. Browser
checks cover reference size, 1440 × 900, 1280 × 800, 390 × 844 and 1024 × 768,
keyboard focus/modality, task priorities/completion, capture/images, note edits,
voice simulation, and injected storage failures. No browser runtime errors.

[The gallery](evidence/index.html) contains actual A/B captures and responsive
browser views. [Native results](evidence/columns-companion-final/results.json)
verify normal close (exit 0), independent companion windows, main-window
minimization with the kitten still viewable, and a controlled external Xmessage
window recording LeetCode task activity. The minimized desktop screenshots were
visually inspected: the kitten has a transparent silhouette and controls fit.

The observer samples application/window metadata after Start observation. Unique
explicit task matches record activity/time; ambiguous matches do nothing. Pauses
and foreground changes break time accumulation, and completion stays manual.
It does not understand screenshots or update production tasks. Browser preview
correctly reports that no native companion is connected.

| Environment | Implementation / validation |
|---|---|
| Linux X11 | Metadata, separate transparent window, minimize behavior tested on private Xvfb/Openbox/xcompmgr |
| Linux Sway | Optional metadata adapter; production Sway helper unchanged; physical desktop behavior unverified |
| Other Linux Wayland | Shared window architecture, but metadata unavailable until a compositor adapter is added; native positioning/overlay policy varies |
| Windows | Foreground-window adapter and portable launcher implemented; device validation pending |
| macOS | Frontmost-window adapter and portable launcher implemented; Accessibility permission may be needed; device validation pending |

This is modular across OS boundaries, not evidence that every distro/compositor
already supports observation. Both variants use Electron for the companion; count
that process tree for both, or disable it consistently for host-only measurements.
Production source fingerprints match across all 98 covered files; no production
notebooks, profiles, tokens or agents were opened.

## Resource measurements

Pending. This UI milestone did not compare a Rust debug host with Electron as a
performance result. No startup median, full-app RAM/CPU, battery, Windows or physical
Sway claims. Reuse `qa/process_sample.py`; do not count a Vite watcher for either host.
Build Rust release first using the same SDK/package setup:

```bash
cd /home/p4nic/code/noema/experiments/ui-ab
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --release --locked --manifest-path hosts/wry/Cargo.toml -j 2
mkdir -p evidence/resources
NOEMA_WRY_BUILD=release NOEMA_WIDTH=1440 NOEMA_HEIGHT=900 python3 scripts/launch.py a &
noema_ab_launch=$!
python3 ../../qa/process_sample.py --root shell="$noema_ab_launch" --phase tooling-test --warmup 20 --duration 30 --interval 1 --output evidence/resources/a-idle-run1.json
wait "$noema_ab_launch"
```

Repeat with `python3 scripts/launch.py b` and output `b-idle-run1.json`; close each
window after sampling so `wait` returns. Repeat three times with distinct output
names before reporting medians. Include launcher descendants (A static Python server,
Rust/WebKit processes and companion Electron tree; B launcher/main/renderers/GPU/
utility processes and its companion Electron tree); add any
already-reparented attributable helpers explicitly via additional `--root webview-N=PID`.
Separate host-only roots from these service-inclusive launch trees. Prefer PSS;
summed RSS double-counts shared pages. Inspect the sampler's observed process list
and completeness flags rather than calling an incomplete sample full-app memory.

The sampler CLI reserves application phases for a production shell plus separate
service roots. Use its supported `tooling-test` phase for these isolated demo launch
trees; label the workload as idle or editing in the output filename.

For ordinary editing, repeat with the same `--phase tooling-test` while typing in Capture and
scrolling the populated Note for the same 30 seconds. For startup-to-usable, record
launch monotonic time and the existing A `demo:ready` marker; B must record after
`window.noemaExperimentReady` and fonts settle, rather than `did-finish-load` alone.
A/B screenshot delays are not startup measurements. Release/resource procedure is
provided for follow-up, not represented as measured or device-accepted here.
