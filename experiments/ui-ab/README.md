# Noema UI A/B experiment

One React/TypeScript/Vite frontend, two isolated desktop hosts. The desktop reference
is the visual target. This experiment never loads the production notebook service.
Default state is clearly labeled **Isolated demo**; task interpretation is a fixture
and voice capture is simulated. No stack winner or production migration is implied.

From this checkout, the already built prototypes can be launched separately:

```bash
cd /home/p4nic/code/noema/experiments/ui-ab
NOEMA_RUN_ID=columns-review1 npm run a
```

```bash
cd /home/p4nic/code/noema/experiments/ui-ab
NOEMA_RUN_ID=columns-review1 npm run b
```

The named review profile starts with the revised fixtures; existing default demo
profiles are preserved. A uses port 8791 and `.demo/a`; B uses port 8792 and `.demo/b`. Both load exactly
`dist/`. Stop with the normal window Close control; each checkpoints its demo draft.
Each launcher starts the shared independent desktop companion in the same isolated
profile. Observation starts paused. Neither starts the existing FastAPI service,
agents or production Sway helper.
Browser preview: `npm run preview`, then http://127.0.0.1:8793.

To reproduce the reference panel and use fresh matching demo profiles:

```bash
NOEMA_RUN_ID=review1 NOEMA_PANEL=open npm run a
NOEMA_RUN_ID=review1 NOEMA_PANEL=open npm run b
```

Each host gets a separate subdirectory under `.demo/evidence/review1`. Run sequentially
for screenshots. Use a new `NOEMA_RUN_ID` for fresh data; the default profiles persist
edits. `NOEMA_FIXTURE=empty|waiting|review|offline` selects other isolated fixtures.
`NOEMA_SCREEN=Capture|Notes|Plan` selects the initial screen. `NOEMA_WIDTH` /
`NOEMA_HEIGHT` choose desktop content dimensions. Without `NOEMA_PANEL=open`, the
panel is closed at rest. Settings also exposes fixture links and companion modes.

To install and build again from this directory:

```bash
npm install --cache /tmp/noema-ui-ab-npm-cache --fetch-retries=0 --fetch-timeout=15000
node_modules/node/bin/node node_modules/electron/install.js
npm run build
PKG_CONFIG_PATH=/tmp/noema-webview-sdk-V3K1nA/root/usr/lib/x86_64-linux-gnu/pkgconfig cargo build --offline --locked --manifest-path hosts/wry/Cargo.toml -j 2
npm run check
```

These install/build commands were exercised here. The checked-in lock pins npm
dependencies; `npm ci` is also available for a clean locked reinstall. The system
Node 18 installer emitted engine warnings; the explicitly installed local Node 22
was used for Electron setup. Launchers resolve the installed native runtime from
Electron’s platform-specific manifest (Linux, Windows or macOS). Final npm audit reported zero vulnerabilities. Node 22.23.3 is included locally for the Electron
installer; the system Node is unchanged. Electron installs its runtime explicitly,
never during launch. The temporary SDK path above exists in this checkout's test
environment. On a system with GTK3/WebKitGTK 4.1 development packages, omit the
`PKG_CONFIG_PATH=` assignment. Rust dependencies are pinned in the experiment lock;
a new machine must fetch them once with `cargo fetch --locked --manifest-path
hosts/wry/Cargo.toml` before an offline build. No root install occurred here.

Linux Electron needs a configured sandbox helper. This machine's already installed
`/opt/google/chrome/chrome-sandbox` was accepted; the launcher selects it only when
it is a regular root-owned mode-4755 file and preserves the bundled helper. On other
Linux systems, configure the experiment's bundled helper using an interactive
terminal if the launcher reports it unavailable:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

No sandbox or OS policy is disabled. `NOEMA_DISPLAY_BACKEND=x11 npm run b` explicitly
selects X11; `wayland` selects Wayland. The actual evidence here is private X11,
not physical Sway, Windows or mobile-device evidence.

Latest implementation: [reference/A/B evidence gallery](evidence/index.html).
The dashboard follows the three-section blue reference identified in review.
Default content size is 1158 × 816. Tasks have colored priority dots; Add is the
small plus in the Tasks heading. Both variants share every frontend component.

Click the desktop kitten for controls, then **Start observation**. In task details,
set **Match desktop activity** to a unique application/title phrase. The companion
records matched activity/time automatically in demo storage and follows the active
window’s monitor where the desktop allows window positioning. It remains visible
when the main app is minimized. Completion stays manual. Cat/Dot/Hidden is also
available in Settings; Hidden can be restored there. Observation is paused on each
new launch, and closing the app ends its helper.

The shared helper uses Electron even with A. Set `NOEMA_COMPANION=0` for a host-only
comparison. Companion APIs use ports 8794 (A) and 8795 (B), a private per-launch
session credential, and strict schemas. No renderer shell/filesystem API is exposed.

Platform boundaries: Linux X11 was tested on a private composited desktop. Sway is
an optional metadata adapter, independent of the preserved production helper.
Windows foreground-window and macOS frontmost-window adapters are implemented but
not device-tested; macOS may require Accessibility permission. Other Wayland
compositors explicitly report observation unavailable. Always-on-top, placement and
transparency on Wayland depend on compositor support. There is no screenshot/OCR or
screen-understanding model. Further compositor adapters plug into
`hosts/companion/platform.mts`; shared matching/window code remains unchanged.

Implementation: [design specification](design-spec.md), [scope](scope.md),
[asset inventory and licenses](assets.md), [comparison and evidence](comparison.md).

From the repository root, repeat verification:

```bash
.venv/bin/python experiments/ui-ab/scripts/verify.py --output evidence/browser-check --checks
.venv/bin/python experiments/ui-ab/scripts/native_evidence.py --output evidence/native-check --width 1158 --height 816 --panel closed
.venv/bin/python experiments/ui-ab/scripts/native_evidence.py --output evidence/companion-check --width 1158 --height 816 --panel closed --companion-checks
```

Browser checks use installed Chrome, real isolated localStorage/HTTP, and Chromium
sandboxing. Native checks use the existing temporary Xvfb executable, real Wry and
Electron windows, synthetic X11 input, and normal window close. Outputs go only
inside the experiment. Run native harnesses sequentially because A/B endpoints are
intentionally fixed. A new `--output` name creates fresh native profiles.

The companion check also uses unprivileged Openbox/xcompmgr packages extracted in
`/tmp/noema-companion-qa-sdk/root`. These run only on its private Xvfb and were not
installed into the operating system. No user desktop is captured or observed.
Windows/macOS launch examples use the same `npm run a` / `npm run b` scripts after
building the appropriate native host; only the Linux commands above were exercised.
