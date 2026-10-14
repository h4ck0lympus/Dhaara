# Screen awareness · Noema 0.2.0 · experimental

This is implemented source with deterministic protocol, inference-adapter and Sway-helper tests. **It has not been run against a real Sway compositor, multiple physical monitors or a live vision model in this build environment.** Start with the base app and synthetic/non-sensitive windows on your own laptop. Nothing in this package installs or enables observation automatically.

## What it does

The helper monitors the focused Sway window on its current output/workspace. Known app/title-to-task rules are cheaper and take precedence; pinned focus avoids screen analysis altogether. When explicitly allowed and needed, it samples a bounded visible window region, compares a tiny image locally, and sends changed frames to the local Noema server. One shared worker asks your local Ollama vision model to match an existing task in the projects you selected.

The default is a compact, dismissible focus suggestion. **Use this** selects and pins that task. Optional **Automatic** mode applies only a model-reported clear match while focus is unpinned. “Clear” is a model classification, not verified truth. Neither mode completes tasks, saves surveillance notes, changes priorities, starts agents or executes commands. Choosing a focus changes which existing actionable tasks appear in “What can I do now?”; the ranking policy itself does not run another model.

Only one monitor's focused window is sampled at a time. The tiny Sway companion follows the currently reported output/workspace. Opening its task menu temporarily holds pixel capture; its normal corner is masked. The dot mode is a small visual indicator, not a way to remove permission or capture disclosure.

## Base app first

From the extracted `noema` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py --data-dir "$HOME/.local/share/noema" --open
```

Use a stable data path. Create an ordinary task and save a note before adding optional inference. The core needs no AI model or GPU. Install/start a local Ollama service separately; Noema does not download or launch it.

## Optional setup on Sway

### 1. Prepare local dependencies and model

The optional helper needs `swaymsg` and `grim` installed through your Linux distribution, a running Sway session, and Pillow in the Python environment used for the server/helper. The GTK cat has its own optional system dependencies documented in the README; it is not required to run the observer.

```bash
source .venv/bin/activate
python -m pip install -e '.[vision]'
ollama list
```

Choose a **vision-capable model already installed in your local Ollama service**. A text-only model is insufficient. No specific model's speed, accuracy or compatibility is certified by this release; do not download a large model just to start the base app. Test a small suitable model with non-sensitive material before relying on it. Set its actual installed name (the value below is a placeholder):

```bash
export NOEMA_VISION_MODEL='your-installed-vision-model'
python run.py --data-dir "$HOME/.local/share/noema" --open
```

Stop an already running Noema server before starting the configured one on the same port. The adapter uses `NOEMA_OLLAMA_URL` when set, otherwise `http://127.0.0.1:11434`. **For screen analysis this URL must be loopback**, even when remote note processing has been explicitly permitted. No third-party screen API is used.

### 2. Select the scope

In **Settings**, enable **Window context**, then expand **Screen awareness · experimental**. Enable screen analysis and enter exact Sway application IDs (one per line). Select only the task projects you authorize the local model to see. Task titles and project names are model inputs; note bodies, saved recordings and unrelated projects are not supplied by this pipeline.

Use `swaymsg -t get_tree` to inspect the actual `app_id` values; XWayland windows use their class. That output can contain private window titles, so do not post it publicly without review. IDs differ by application/environment; do not assume every browser is `firefox`.

Keep the initial mode **Suggest only**, choose an interval, and apply permissions. Saving permission **does not start capture**. In **Agent & observer tokens**, create a **Screen observer** token, not an Agent or legacy Observer token.

### 3. Start explicitly

In a second terminal, use the same virtual environment. The following reads the token without adding the token text to shell history:

```bash
source .venv/bin/activate
read -r -s -p 'Screen observer token: ' NOEMA_TOKEN
printf '\n'
export NOEMA_TOKEN
python tools/sway_screen.py --observe-screen
unset NOEMA_TOKEN
```

Alternatively pass `--token-file /absolute/path/to/a/private-token-file`; keep that file readable only by you and outside the source package. Do not share or put tokens in version control. The helper only accepts a loopback Noema URL. It prints when observation starts and when capture is waiting/skipped. It never writes screenshots into a retry queue.

A session lasts at most one hour. A missing heartbeat ends the lease after 90 seconds. After pause, expiry, revocation or server restart, explicitly restart the helper; there is no unattended auto-resume.

### 4. Optional tiny cat

Run `tools/sway_companion.py` using its **separate Observer token** and the system Python with GTK3/PyGObject/GtkLayerShell installed. Start it **without** `--observe-window-context` when the new screen helper is already reporting context. Do not run competing metadata producers unnecessarily.

The native cat reads server context to choose the output/workspace, has a small task popover and supports dot/size controls. Clicking a task opens that exact task in the browser. **Pause observation** disables the observation permission and ends the screen session. The helper is still a separate process: converting a minimized native Noema main window into the cat automatically is not implemented.

Native geometry, scaling, z-order, task-popover shape and multi-monitor placement require testing on your Sway setup. The browser's cat is a preview, not a desktop-level overlay.

## Compute policy

- No resident model is required at idle. The helper checks metadata every five seconds while enabled, debounces window changes and refreshes the lease every 30 seconds. The base app performs ordinary task ranking without AI.
- Pixel capture is limited to at least 120 seconds between checks, scaled to at most 1280 × 960, followed by a 64 × 48 luminance comparison. The helper avoids uploading unchanged frames, and the server validates changes again. Tiny text changes may not pass this heuristic; this is not exact change detection.
- One frame can wait in memory. Frames older than 90 seconds are discarded rather than analyzed late. There is no image history, video encoder or screenshot backlog.
- The single worker processes saved-note/transcription jobs first. An already-running screen inference is not preempted; a note job arriving then waits for that call to finish or time out.
- The vision request asks for CPU-only inference, four threads, a 4,096-token context, at most 240 generated tokens and `keep_alive: 0`. Actual inference behavior depends on the selected local model/server version.
- After a vision call, rest is at least nine times its measured elapsed duration, in addition to the normal interval. For example, a 50-second inference requires at least 450 seconds of rest. This targets at most 10% sustained **wall-time duty over complete work/rest cycles**, not 10% CPU use, and does not validate battery life. Slow CPUs therefore sample less frequently instead of continuously processing.
- Three model failures end the session. No model download or automatic installation occurs.

No full-app benchmark on the i7-1270P has been performed. The included idle sample is backend-only, without capture, browser, cat or inference. Pause screen observation while running heavy fuzzers/builds if necessary. Good voice-note transcription remains independent of screen observation.

## Privacy and correctness boundaries

The capture is a **focused window's visible screen region**, not an OS-isolated application surface. Overlapping windows, system notifications and other overlays can enter it. App allowlists and private/credential-related title exclusions are useful but incomplete; they are not secret detection, full occlusion detection or verified lock-state detection. **Pause before entering credentials, opening confidential documents or changing to sensitive work.** Only include projects you are authorized to process on this machine.

Images and model explanations exist in the helper/server/model process memory, not Noema's SQLite database, attachment directory, logs, export or browser offline snapshot. Metadata (the latest permitted window context) and a resulting focus task ID may be stored. The separate explicit Capture feature intentionally persists user-saved images/audio/notes. Operating-system swap/crash dumps and inference-server logs are outside Noema's memory-retention guarantee; this is not secure erasure or protection from an administrator.

Screen content may contain prompt injection. The model has no tools; its output is constrained to an allowed task ID/classification/reason, validated and rendered as text. This restricts available effects but **does not guarantee correct or secret-free natural-language reasoning**. Review suggestions and keep automatic mode off until you trust its performance on your work. Pinned focus always takes precedence.

Permission changes clear pending frames and reject stale results. **Pause does not instantly cancel compute already executing in Ollama**; that request can continue until completion/timeout, but its late result cannot change focus after the session is invalidated. Stop the helper as well when you are done. A small dot remains subject to these same controls and limitations.

## Diagnostics and known gaps

`python tools/doctor.py` checks configuration and installed prerequisites without capturing your desktop, contacting a model or downloading anything. Settings reports whether a model name is configured and shows a session's current state. A configured name is not proof that the model is installed/working.

Missing: actual Sway/vision hardware validation; Windows/macOS/Android observers; platform-native consent dialogs/lock detection; cloud pairing/sync; interactive model calibration; pixel-level selective redaction. The implementation prioritizes bounded, explicit behavior over silent universal monitoring.

Primary implementation references: [Sway IPC](https://github.com/swaywm/sway/blob/master/sway/sway-ipc.7.scd), [grim upstream manual mirror](https://github.com/emersion/grim/blob/master/grim.1.scd), [Ollama vision](https://docs.ollama.com/capabilities/vision), [Ollama chat API](https://docs.ollama.com/api/chat). The grim mirror is archived; inspect your installed `grim --help`/manual for version-specific differences.
