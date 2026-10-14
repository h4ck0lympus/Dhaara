# Single-binary packaging (AppImage) — design

Date: 2026-10-13 · Status: **draft for owner review, not committed** · Owner: Vishal Juneja
Decisions: 29C (one artifact for the owner first; the release variants come from the same build
later) · 30A (AppImage with a frozen Python service; `.deb` later from the same AppDir) · 31A
(the five design sections below, approved in chat).

## 1. Goal

One file, `Dhara-<version>-x86_64.AppImage`, that starts Dhara on a Linux x86_64 desktop with no
npm, venv, build or sandbox steps: double-click or `./Dhara-0.1.0-x86_64.AppImage`, and the
Electron shell runs the bundled service against a workspace under the user's data directory.
Development flows (external mode, managed mode with the venv) stay exactly as documented.

**Success:** on this machine, `release/build.sh` produces the AppImage; running it with no
arguments opens Dhara on an empty workspace; running it with `--data-dir /home/p4nic/code/noema/.data`
opens the owner's existing notes; the full gate stays green; the packaged-launch test passes
under the private headless Sway.

**Out of scope (follow-ons, in order):** the `.deb` target from the same AppDir; macOS and
Windows (the managed lifecycle is Linux-only); auto-update; signing; bundling the speech extra
or the Sway kitten companion; a system-wide install.

## 2. What the artifact contains

| Part | Source | Size (approx.) | Notes |
|---|---|---|---|
| Electron 44.7.0 runtime | `electron/node_modules/electron/dist` | 283 MB unpacked | copied as-is; `default_app.asar` removed |
| Shell app | `electron/dist`, `electron/static`, `electron/package.json` | < 1 MB | placed at `resources/app` (Electron's documented manual distribution layout; no asar) |
| Frozen service | PyInstaller one-directory build of `run.py` | ≈ 25–40 MB | `resources/service/dhara-service/` |
| Web bundle | `web/dist` | 2 MB | added to the frozen service as data at `web/dist`, so `dhara/server.py`'s `ROOT/'web'/'dist'` resolves unchanged |
| Sandbox helper | `chrome-sandbox` from the Electron dist | 0.1 MB | shipped so the one-time install line has a source |
| Launcher | `resources/launch.cjs` | 2 KB | §5 |
| Desktop entry + icon | `release/dhara.desktop`, `web/public/icon.svg` | — | required by `appimagetool` |

Compressed AppImage: roughly 110–130 MB. AI (Ollama) stays an external HTTP service; speech
stays an optional extra that the packaged build does not include.

## 3. Build pipeline — `release/build.sh`

One script, idempotent, run from the repository root with Node 22.23.3 and the repo `.venv`:

1. `npm --prefix web ci && npm --prefix web run build` (unchanged commands).
2. `.venv/bin/pip install -e '.[release]'` where the new `release` extra pins `pyinstaller` to
   one exact 6.x version (the plan's pre-flight build fixes the number and records it in
   `pyproject.toml`; the same pre-flight pins the `appimagetool` release and its SHA-256).
3. `.venv/bin/pyinstaller release/dhara-service.spec --noconfirm --distpath release/out/service`
   — one-directory build; entry `run.py`; name `dhara-service`; `datas = [('web/dist', 'web/dist')]`;
   `hiddenimports` for uvicorn's dynamically loaded modules (`uvicorn.loops.auto`,
   `uvicorn.protocols.http.auto`, `uvicorn.protocols.websockets.auto`, `uvicorn.lifespan.on`);
   pydantic is covered by PyInstaller's contrib hooks. `run.py` already starts uvicorn from a
   function, which is what a frozen build needs.
4. `npm --prefix electron ci && npm --prefix electron run build`.
5. Assemble `release/out/AppDir/`:
   - `usr/lib/dhara/` ← Electron dist (binary renamed `dhara`; `default_app.asar` deleted);
   - `usr/lib/dhara/resources/app/` ← `electron/package.json`, `electron/dist/`, `electron/static/`;
   - `usr/lib/dhara/resources/service/dhara-service/` ← step 3's output;
   - `usr/lib/dhara/resources/launch.cjs` ← `release/launch.cjs`;
   - `AppRun` (3-line shell script: `export ELECTRON_RUN_AS_NODE=1` then
     `exec "$APPDIR/usr/lib/dhara/dhara" "$APPDIR/usr/lib/dhara/resources/launch.cjs" "$@"`,
     so the launcher runs as plain Node inside the bundled Electron);
   - `dhara.desktop`, `dhara.svg`, `.DirIcon`.
6. `appimagetool` (pinned release of the AppImage project's tool, downloaded once into
   `release/cache/` and verified against a SHA-256 recorded in the script) builds
   `release/out/Dhara-<version>-x86_64.AppImage` with the **static type-2 runtime** (`--runtime-file`),
   so the result does not depend on `libfuse2` and falls back to extraction where FUSE is absent.
   `<version>` is read from `electron/package.json` and must equal `pyproject.toml`'s; the
   script fails if they differ.
7. Self-check: the AppImage extracts (`--appimage-extract`) to a temp dir; the manifest lists the
   expected paths; `dhara-service --help` exits 0; `dhara --version` prints the Electron version;
   sizes are printed. The script exits non-zero on any miss.

`release/out/` and `release/cache/` are git-ignored. The script is not part of the gate (it
downloads a tool and takes minutes); the plan adds `npm --prefix electron run package` as its
alias and the docs name it.

## 4. Packaged-mode defaults (the only shell code change)

`parseArgs(argv, cwd, repoRoot, env)` gains one more argument, `packaged: PackagedFacts | null`,
where `PackagedFacts = { resourcesPath: string; dataHome: string }` (`main.ts` passes
`app.isPackaged ? { resourcesPath: process.resourcesPath, dataHome: $XDG_DATA_HOME or
~/.local/share } : null`). When `packaged` is non-null and the user passed neither `--server`
nor `--manage-service`:

| Option | Packaged default | Today's default |
|---|---|---|
| `manageService` | `true` | `false` |
| `dataDir` | `<dataHome>/dhara/workspace` | required with `--manage-service` |
| `python` | `<resourcesPath>/service/dhara-service/dhara-service` | `<repoRoot>/.venv/bin/python` |
| `entryPoint` | `''` (none) | `<repoRoot>/run.py` |

Every explicit flag still wins (`--data-dir`, `--server`, `--python`, `--entry-point`,
`--profile`). `ManagedService` spawns `[python, ...args]` when `entryPoint` is empty and
`[python, entryPoint, ...args]` otherwise; the spawn arguments (`--desktop-managed --host
127.0.0.1 --port 8765 --data-dir <workspace> --owner-pid <pid>`), protocol 2, the exit codes
and every message are unchanged. The workspace directory is created with mode 0700 by the
existing `prepareWorkspace`. `app.isPackaged` is true inside the AppImage because the executable
is renamed `dhara` (Electron reports packaged whenever the binary is not named `electron`), so
`devTools` stays off there as today and `userArgv` runs in its non-default-app form.

The README's "Packaged build" paragraph states the default workspace path and that
`--data-dir` overrides it.

## 5. Launcher and the Chromium sandbox — `release/launch.cjs`

Ubuntu 24.04 restricts unprivileged user namespaces, so Electron needs its root-owned setuid
helper; FUSE mounts ignore setuid, so the helper cannot live inside the AppImage. The launcher
runs under the bundled Electron in Node mode (`ELECTRON_RUN_AS_NODE=1`) before Chromium starts,
decides once, then replaces itself with the real process:

1. If `CHROME_DEVEL_SANDBOX` is already set: use it.
2. Else if unprivileged user namespaces work for Chromium's needs (`unshare -Urpn true` exits 0: user, pid and net namespaces; a host whose AppArmor allows creating a user namespace but confines it fails this probe, as Chromium's zygote would): no helper needed.
3. Else, the first root-owned (`uid 0`) setuid (`mode & 0o4000`) file among
   `~/.local/share/dhara/chrome-sandbox`, `/opt/google/chrome/chrome-sandbox`: export it as
   `CHROME_DEVEL_SANDBOX`.
4. Else: print to stderr, exit 3:
   ```
   Dhara: Chromium's sandbox helper must be owned by root on this system. Run once:
     sudo install -o root -g root -m 4755 "<AppDir>/usr/lib/dhara/chrome-sandbox" ~/.local/share/dhara/chrome-sandbox
   then start Dhara again. (Dhara never runs without the sandbox.)
   ```
   `~/.local/share/dhara/` is created 0700 if missing so the line works as printed.

Then `spawn(<AppDir>/usr/lib/dhara/dhara, userArgs, { stdio: 'inherit', env })` with
`ELECTRON_RUN_AS_NODE` removed from `env` (otherwise the child would also run as Node) and no app
path argument (Electron loads `resources/app` by itself once `default_app.asar` is gone, so
every argument reaches `cli.ts` as in a packaged app), and exit with the child's code. The decision logic takes its
filesystem facts through an injected object (`{ stat, exists, userns() }`) so it is unit-tested
without root. `--no-sandbox` is never passed; the launcher refuses to start if the user passes it
(`Dhara: --no-sandbox is not supported.`, exit 3).

## 6. Service freeze — `release/dhara-service.spec`

Entry `run.py`; `console=True`; one directory. The frozen service keeps every managed-mode
guarantee because they are stdlib/ctypes (PDEATHSIG, `flock`, `SO_REUSEADDR`, uvicorn
`sockets=`). `dhara/server.py` finds `web/dist` relative to its own `ROOT`, which in a
PyInstaller one-directory build is the `_internal` directory where the data lands, so no path
code changes. `DHARA_*`/`NOEMA_*` env reads work unchanged. The speech extra is absent:
`capabilities.speech` is false and the existing 409 message gains the clause "the packaged build
does not include speech" (one string, one test).

The frozen binary is exercised by the existing managed-service pytest suite a second time: the
tests read `DHARA_SERVICE_CMD` (default `[sys.executable, run.py]`) and the plan adds a
parametrized fixture that runs them with `release/out/service/dhara-service/dhara-service` when
that file exists (skipped with a reason otherwise).

## 7. Errors and data safety

- All startup failures keep their current messages and overlay behaviour (occupied port, locked
  workspace, invalid lease, early exit codes 10/11/12). The launcher adds exactly the two
  messages in §5.
- First start on a workspace that still holds `noema.sqlite3` runs the guarded move (rename spec
  §4.9); IndexedDB/service-worker/cookie/profile shims apply unchanged because the origin stays
  `http://127.0.0.1:8765`.
- The default workspace is private to the user (0700) and outside the AppImage; deleting the
  AppImage never touches notes.
- A second AppImage instance on the same workspace is refused by the existing lock with the
  existing message.

## 8. Tests

| Level | Test | Proves |
|---|---|---|
| vitest `electron/test/cli.test.ts` | packaged facts → the four defaults; explicit flags win; `null` facts → today's defaults (existing tests untouched) | §4 |
| vitest `electron/test/lifecycle*.test.ts` | empty `entryPoint` spawns `[python, ...args]`; the fake service receives the same argv | §4 |
| vitest `electron/test/launch.test.ts` | §5 rules 1–4 with injected facts; the exact stderr text and exit code; `--no-sandbox` refused; spawn argv/env | §5 |
| pytest `tests/test_managed_service.py` | the suite against the frozen binary when present (skip otherwise) | §6 |
| pytest `tests/test_core.py` | packaged speech message clause | §6 |
| electron e2e `electron/e2e/packaged.spec.ts` (private Sway) | extracts the AppImage, runs `AppRun --data-dir <tmp>`, waits for `GET /api/desktop-instance` protocol 2 with the shell's pid, sends SIGTERM, asserts exit 0, lock released, workspace 0700; skipped with a reason when `release/out/*.AppImage` is absent | end to end |
| script self-check | §3 step 7 | the artifact |

The gate command is unchanged; the e2e above is part of `npm --prefix electron test` and skips
cleanly without the artifact, so CI-equivalent runs stay green without a package step.

## 9. Docs

- `docs/DESKTOP.md`: new section "Packaged build (AppImage)": build command, defaults, the
  sandbox helper line, `--data-dir`, what is not included (speech, kitten), FUSE note.
- `README.md`: an Install paragraph pointing at the AppImage for users and at the dev flow for
  contributors.
- `docs/PROGRESS.md`: roadmap rows for the `.deb` follow-on and the release checklist.
- Handbook conformance (§4.7 of the migration spec): no product behaviour changes; local-first
  data placement is documented; the sandbox rule from `docs/SECURITY.md` is restated.

## 10. Risks

| Risk | Handling |
|---|---|
| PyInstaller misses a dynamic import (uvicorn, pydantic) | pre-flight build in the plan; hidden-import list in the spec file; the frozen suite run |
| `appimagetool`/static runtime download unavailable or changed | pinned URL + SHA-256; the script fails loudly; the cached copy is reused |
| Home directory mounted `nosuid` (helper in `~/.local/share` ignored) | the message names `/opt/google/chrome/chrome-sandbox` as the alternative; `.deb` follow-on installs system-wide |
| Version drift between `pyproject.toml` and `electron/package.json` | build fails on mismatch |
| AppImage runs where `unshare` is absent | rule 2 treats a missing `unshare` as "no namespaces" and falls through to the helper search |
