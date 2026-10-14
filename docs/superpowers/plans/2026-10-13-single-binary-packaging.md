# Single-binary packaging (AppImage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One file, `release/out/Dhara-<version>-x86_64.AppImage`, that starts Dhara on a Linux x86_64 desktop with no npm, venv, build or sandbox steps: the Electron shell runs the bundled, PyInstaller-frozen service against a private workspace under the user's data directory (decisions 29C, 30A, 31A, 32A). Development flows (external mode, managed mode with the venv) are unchanged; the gate command is unchanged.

**Architecture:** Three small shell changes and one new directory. `electron/src/cli.ts` gains a fifth `parseArgs` argument, `PackagedFacts | null`, that turns on managed mode with the bundled service by default when the app is packaged (`main.ts` passes `app.isPackaged ? {…} : null`); `electron/src/lifecycle.ts` spawns `[python, ...args]` when `entryPoint` is empty, because a frozen service is its own entry point. `release/` holds the launcher (`launch.cjs`, run as plain Node inside the bundled Electron to pick Chromium's sandbox helper, then start the real process), the PyInstaller spec, the desktop entry, `AppRun` and `build.sh`, which freezes the service, assembles the AppDir and calls a pinned, SHA-256-verified `appimagetool` with the pinned static type-2 runtime. The service gains one clause in one 409 message. The existing managed-service pytest cases run a second time against the frozen binary when it exists; a Playwright spec runs the real AppImage under the private headless Sway when it exists.

**Tech Stack:** TypeScript 5.9 / Vitest 5.0.3 / Playwright 1.64 for `electron/` (Node 22.23.3 through the npm scripts), Electron 44.7.0, Python 3.12 (`.venv/bin/python`, pytest), PyInstaller 6.22.3 + pyinstaller-hooks-contrib 2026.8, appimagetool 1.9.1, AppImage type2-runtime 20251108, bash, `desktop-file-validate` only for a manual check.

**Spec:** `/home/p4nic/code/noema/docs/superpowers/specs/2026-10-13-single-binary-packaging-design.md` (binding). Existing names and files: `/home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md` (§0 conventions and gate commands, §8 Electron APIs and Python managed mode). House style: `/home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/07-rename-dhara.md`.

No step relies on a line number: every edit is located by a grep whose expected output is given, and verified at execution time. The owner is testing Dhara in this checkout, so every test in this plan uses a free port or the `DHARA_ELECTRON_TEST` port override, a throwaway `--profile` and a temp workspace; port 8765 and `~/.local/share/dhara/` are never used by a test.

## Pre-flight record (done while writing this plan, under `/home/p4nic/.claude/jobs/31844a13/tmp/pkg-plan/`; nothing in the checkout was built or run)

Pinned by download on 2026-10-13 (SHA-256 of the exact bytes):

| Tool | Pin | URL | SHA-256 |
|---|---|---|---|
| PyInstaller | `6.22.3` (latest 6.x on PyPI; requires `pyinstaller-hooks-contrib>=2026.7`, Python `>=3.8,<3.16`) | `pyinstaller-6.22.3-py3-none-manylinux2014_x86_64.whl` from PyPI | `451a4ae14b719365bf1a2f0a99dae7b3463060061c3a394c70d5264cfb439528` |
| pyinstaller-hooks-contrib | `2026.8` (ships `hook-uvicorn.py` = `collect_submodules('uvicorn')`, `hook-pydantic.py`, `hook-anyio.py`) | `pyinstaller_hooks_contrib-2026.8-py3-none-any.whl` | `6d21d65323ea4467753afc21f52d7d0e69416ae8101dd88269bf273ad48db084` |
| appimagetool | release tag `1.9.1` (2025-11-18; the binary reports "continuous build (git version 8c8c91f), build 296, 2025-12-04"; static-pie, 15,092,216 bytes) | `https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage` | `ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0` |
| type2-runtime | release tag `20251108` (static-pie, no libfuse dependency, 944,632 bytes) | `https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64` | `2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d` |

Verified end to end in the tmp dir with a throwaway venv and the checkout's sources (the plan's code below is what ran): the frozen service is 34 MB, answers `--help` (exit 0), acknowledges protocol 2 with `pid == the spawned pid` (one-directory builds run Python in-process), serves `/` from `_internal/web/dist`, reports `capabilities.speech == false`, creates `admin.token`/`dhara.sqlite3`/`.dhara-service.lock` in the workspace and exits with `-SIGTERM` on lease EOF. The AppDir is 317 MB; `appimagetool -n --runtime-file …` takes 14 s and yields a 131,172,856-byte AppImage; `--appimage-extract` works without FUSE; `ELECTRON_RUN_AS_NODE=1 dhara -p process.versions.electron` prints `44.7.0`. Under a private headless Sway, the mounted AppImage started sandboxed, spawned the frozen service as the packaged shell's managed child, and after SIGTERM to the launcher the launcher exited 0, the service was gone and the lock was free.

Four findings that change the letter of the spec (each is a numbered deviation below, with its test):

1. Chromium's `GetSandboxBinaryPath()` (`sandbox/linux/suid/client/setuid_sandbox_host.cc`) prefers a file named `chrome-sandbox` **beside the executable** and reads `CHROME_DEVEL_SANDBOX` only when there is none. With the helper at `usr/lib/dhara/chrome-sandbox` as spec §2 says, every launch aborted with `The SUID sandbox helper binary was found, but is not configured correctly` even with `CHROME_DEVEL_SANDBOX` set. The bundled helper therefore ships at `usr/lib/dhara/resources/chrome-sandbox`.
2. The same function honours `CHROME_DEVEL_SANDBOX` only when `/proc/self/exe` is owned by the running uid. `appimagetool` stores root ownership (the mount showed `0:0`), which disables rules 1 and 3 for everyone. `build.sh` passes `--mksquashfs-opt -force-uid/-force-gid` with the builder's ids (the mount then shows `1000:1000` and the launch works); the launcher checks the ownership and prints one clear line instead of Chromium's abort when another user runs the file. This is decision 29C ("one artifact for the owner first"); the `.deb` follow-on installs a root-owned helper beside the binary and needs none of it.
3. A packaged `dhara --version` initialises the sandbox before anything else and then reaches `cli.ts` as `Unknown argument` (exit 2), so the self-check reads the Electron version in Node mode.
4. `unshare -Ur true` fails on this machine (`uid_map: Operation not permitted`): rule 2 is dead here and rule 3 resolves to `/opt/google/chrome/chrome-sandbox` (root-owned 4755, the same file `electron/scripts/link-sandbox.mjs` links).
5. The type-2 runtime execs `AppRun` in the launched pid and unmounts the image as soon as that process exits (checked in the tmp dir with a throwaway AppImage whose `AppRun` records `$$`: it equals the spawned pid; `mount` showed the `fuse.*.AppImage` mount with `nosuid`, and nothing after exit). So the pid a caller spawns is the launcher itself (the e2e's parent-pid check relies on it), and a rule-4 line that names a path inside the mount is unusable by the time the user can type it: deviation 11.

## Prerequisites

- Branch `feat/react-electron` at `7bee9f6` or later (`e2a8e9e` plus the owner's `feat(run)` and `feat(speech)` commits; the latter rewrote the 409 text that Task 4 extends); the tracked tree is clean; tag `cutover-gate` exists.
- `web/node_modules`, `electron/node_modules` and `.venv` installed; `node electron/scripts/link-sandbox.mjs` has run (the `chrome-sandbox` symlink and `chrome-sandbox.bundled` exist in the Electron dist; every `npm --prefix electron ci`, including the one inside `release/build.sh`, undoes that, so Tasks 6 and 7 rerun the script before the Electron e2e); `sway`, `fusermount3`, `curl`, `sha256sum`, `flock`, `unshare` on PATH (all present on this machine).
- Internet access once, for `pip install -e '.[release]'` and the two tool downloads (Task 6).
- `~/.local/share/dhara/chrome-sandbox` does not exist and `/opt/google/chrome/chrome-sandbox` is root-owned 4755 (`ls -l /opt/google/chrome/chrome-sandbox` → `-rwsr-xr-x 1 root root …`): the real build run and the packaged e2e take rule 3 through it.

- [ ] **Preflight (run before Task 1; stop if any line disagrees)**

```bash
cd /home/p4nic/code/noema
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
git rev-parse --abbrev-ref HEAD                      # feat/react-electron
git status --porcelain --untracked-files=no          # empty
git merge-base --is-ancestor 7bee9f6 HEAD && echo base-ok              # the feat(speech) commit Task 4's 409 anchor comes from
git tag -l cutover-gate                              # cutover-gate
node --version                                       # v22.23.3
.venv/bin/python --version                           # Python 3.12.3
test ! -e release && echo no-release-dir-yet
ls -l /opt/google/chrome/chrome-sandbox              # -rwsr-xr-x 1 root root …
test ! -e ~/.local/share/dhara/chrome-sandbox && echo no-user-helper
which sway fusermount3 curl flock unshare >/dev/null && echo tools-ok
grep -c '^## Close checkpoint$' docs/DESKTOP.md      # 1
grep -c '^### Linux / macOS$' README.md             # 1
grep -c '^| After the merge |' docs/PROGRESS.md      # 2
grep -c "^    for needle in ('pip install -e" tests/test_core.py   # 1
grep -c 'set to the printed path. Your recording is saved.' dhara/server.py   # 1
grep -c '^### Handbook §21 main-app memory · measured 2026-10-12$' docs/TEST_REPORT.md   # 1
```

## Global Constraints (verbatim from the spec)

§1 **Success:** "on this machine, `release/build.sh` produces the AppImage; running it with no arguments opens Dhara on an empty workspace; running it with `--data-dir /home/p4nic/code/noema/.data` opens the owner's existing notes; the full gate stays green; the packaged-launch test passes under the private headless Sway."

§1 **Out of scope (follow-ons, in order):** "the `.deb` target from the same AppDir; macOS and Windows (the managed lifecycle is Linux-only); auto-update; signing; bundling the speech extra or the Sway kitten companion; a system-wide install."

§3: "`release/out/` and `release/cache/` are git-ignored. The script is not part of the gate (it downloads a tool and takes minutes); the plan adds `npm --prefix electron run package` as its alias and the docs name it."

§4: "Every explicit flag still wins (`--data-dir`, `--server`, `--python`, `--entry-point`, `--profile`). `ManagedService` spawns `[python, ...args]` when `entryPoint` is empty and `[python, entryPoint, ...args]` otherwise; the spawn arguments (`--desktop-managed --host 127.0.0.1 --port 8765 --data-dir <workspace> --owner-pid <pid>`), protocol 2, the exit codes and every message are unchanged. The workspace directory is created with mode 0700 by the existing `prepareWorkspace`."

§5: "`--no-sandbox` is never passed; the launcher refuses to start if the user passes it (`Dhara: --no-sandbox is not supported.`, exit 3)."

§7 **Errors and data safety:**
- "All startup failures keep their current messages and overlay behaviour (occupied port, locked workspace, invalid lease, early exit codes 10/11/12). The launcher adds exactly the two messages in §5."
- "First start on a workspace that still holds `noema.sqlite3` runs the guarded move (rename spec §4.9); IndexedDB/service-worker/cookie/profile shims apply unchanged because the origin stays `http://127.0.0.1:8765`."
- "The default workspace is private to the user (0700) and outside the AppImage; deleting the AppImage never touches notes."
- "A second AppImage instance on the same workspace is refused by the existing lock with the existing message."

§8: "The gate command is unchanged; the e2e above is part of `npm --prefix electron test` and skips cleanly without the artifact, so CI-equivalent runs stay green without a package step."

Owner rules: ponytail (smallest complete change; never cut validation, data-loss protection, security, accessibility); TDD (failing test → RED command and expected output → minimal code → GREEN → commit); explicit over clever; DRY; commit messages ONE line, no body, no trailer; `git add <exact paths>`; never `--no-sandbox`; Node 22.23.3 via `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; Python via `.venv`.

## Deviations from the letter of the spec (same guarantees; owner may reverse)

1. **Helper location** (pre-flight finding 1): `usr/lib/dhara/resources/chrome-sandbox`, not `usr/lib/dhara/chrome-sandbox`; the install line names the new path. Test: Task 5's self-check fails if a `chrome-sandbox` sits beside the binary; Task 6's e2e asserts no `SUID sandbox helper` complaint.
2. **Ownership inside the image** (finding 2): `-force-uid`/`-force-gid` of the builder, plus a launcher rule 0 with a third message, `Dhara: this AppImage was built for user id <u> and you are user id <v>, so Chromium would ignore the sandbox helper. Extract it once (--appimage-extract) and start squashfs-root/AppRun.` (exit 3). The launcher therefore has three messages, not two. Test: Task 3 `rule 0`.
3. **Self-check version read** (finding 3): `ELECTRON_RUN_AS_NODE=1 dhara -p process.versions.electron` must equal `electron/node_modules/electron/dist/version`, instead of `dhara --version`.
4. **Packaged `python`/`entryPoint` defaults apply whenever the app is packaged**, not only when neither `--server` nor `--manage-service` was given (the `manageService`/`dataDir` defaults keep the spec's condition). An AppImage has no `.venv`, so `--manage-service --data-dir X` inside it would otherwise fail with "Python not found"; the packaged e2e needs exactly that form to stay off port 8765 while the owner tests. Test: Task 1 `an explicit --manage-service keeps every managed rule and still runs the bundled service`.
5. **Injected facts** are `{ stat, userns, uid }` plus the running `exe` path; `exists` is covered by `stat` returning `null`.
6. **`DHARA_SERVICE_CMD`** names the frozen command (default `release/out/service/dhara-service/dhara-service`); the venv command is never overridden because the fixture always runs both. Skips with a reason when the frozen binary is absent, as the spec says.
7. **The packaged e2e runs the AppImage file itself** (its own runtime mounts it through FUSE, which this machine has) instead of the extracted tree: an extracted tree is owned by the extracting user and would not prove finding 2's path. It passes `--manage-service --data-dir <tmp> --server http://127.0.0.1:<free port> --profile <tmp>` with `DHARA_ELECTRON_TEST=1`, so the bare-argument packaged defaults are proved by Task 1's unit tests and by the owner's manual run of the §1 success lines (Task 6, Step 7).
8. **`release/AppRun`** is a committed file (with an `$APPDIR` fallback for an extracted tree) rather than a heredoc in the script; `dhara.desktop` uses `Categories=Office;` (`desktop-file-validate` warns on two main categories).
9. **Tool downloads happen first** in `build.sh` (before the npm and PyInstaller steps) so a hash mismatch fails in seconds; `pyinstaller-hooks-contrib` is pinned next to PyInstaller; `--workpath release/out/build` keeps PyInstaller from creating `build/` at the repository root.
10. **The gate with the Phase 5 rule needs the artifact present.** With `release/out` empty, pytest reports 10 skipped `[packaged]` cases and Playwright 1 skipped spec: green, as spec §8 asks, but the Phase 5 rule treats a skipped count as FAIL. Task 7 therefore runs the gate right after Task 6's build, and `docs/DESKTOP.md` says so.
11. **Rule-4 line** (finding 5): the spec's `sudo install -o root -g root -m 4755 "<AppDir>/usr/lib/dhara/…/chrome-sandbox" …` names a `/tmp/.mount_*` path that no longer exists once the launcher has exited 3. The launcher therefore copies the bundled helper to `<dataHome>/dhara/chrome-sandbox` (user-owned, 0755: rule 3 ignores it until it is root-owned and setuid) and prints `sudo chown root:root <path> && sudo chmod 4755 <path>`, the two commands `electron/scripts/link-sandbox.mjs` already prints for the dev tree; a fourth line names `/opt/google/chrome/chrome-sandbox` as the alternative for a `nosuid` home, which spec §10 requires of the message. The first and third lines are the spec's. Test: Task 3 `rule 4`.

## Review Focus (five failure modes; each has a test in the owning task)

1. **A development launch gets packaged defaults, or an explicit flag is overridden.** Owner: Task 1 — `null facts keep today's defaults` (the existing `uses the main.rs defaults` test is untouched), `--server switches to external mode exactly as today`, `--python and --entry-point still win`, `lets --data-dir alone choose the workspace`.
2. **An empty entry point reaches the service as `''`.** Owner: Task 2 — `spawns [python, ...args] when the entry point is empty, as for a frozen service` (the fake service dumps its argv).
3. **Dhara runs without Chromium's sandbox, or dies with Chromium's misleading abort.** Owner: Task 3 — `refuses --no-sandbox before anything else`, `rule 3 ignores a helper that is not root-owned or not setuid`, `rule 4: copies the bundled helper … and prints the one-time line …`, `rule 0: …` ; Task 6 — the e2e asserts the mounted image started without a `SUID sandbox helper` complaint.
4. **The frozen service breaks protocol 2 (pid, lock, port, lease) or misses a module or `web/dist`.** Owner: Task 4 — the ten `[packaged]` cases of `tests/test_managed_service.py`; Task 5 — the self-check's manifest and `--help`; Task 6 — the e2e's identity, lock and exit checks against the real artifact.
5. **A tampered or drifted tool download, or a version mismatch between the two manifests.** Owner: Task 5 — `fetch` deletes and fails on a hash mismatch (Task 6 Step 4 proves it by corrupting the cache), `test_versions_match_between_pyproject_and_electron`, `test_release_extra_pins_pyinstaller_exactly`.

## Files (every file this plan creates or modifies)

```
electron/src/cli.ts                       Task 1  modify (PackagedFacts, parseArgs fifth argument)
electron/src/profile.ts                   Task 1  modify (export dataHome)
electron/src/main.ts                      Task 1  modify (packaged facts)
electron/test/cli.test.ts                 Task 1  modify (append describe)
electron/src/lifecycle.ts                 Task 2  modify (spawn args)
electron/test/service-start.test.ts       Task 2  modify (append test, import PYTHON)
release/launch.cjs                        Task 3  create
electron/test/launch.test.ts              Task 3  create
pyproject.toml                            Task 4  modify (release extra)
release/dhara-service.spec                Task 4  create
dhara/server.py                           Task 4  modify (409 clause)
tests/test_core.py                        Task 4  modify (one more needle in the existing 409 test)
tests/test_managed_service.py             Task 4  modify (service_cmd fixture, launch(cmd, …))
tests/test_release.py                     Task 4  create, Task 5 append
release/build.sh, release/AppRun, release/dhara.desktop   Task 5  create
.gitignore, electron/package.json         Task 5  modify
electron/e2e/packaged.spec.ts             Task 6  create
docs/DESKTOP.md, README.md, docs/PROGRESS.md, docs/TEST_REPORT.md, SHA256SUMS   Task 7  modify
```

---

### Task 1: `parseArgs` packaged defaults and the `main.ts` wiring

**Files:**
- Modify: `electron/src/cli.ts`, `electron/src/profile.ts`, `electron/src/main.ts`, `electron/test/cli.test.ts`

**Interfaces:**
- Consumes: `parseArgs(argv, cwd, repoRoot, env)` and `CliOptions` as they are; `absolutePath('', cwd)` returns `''` (`paths.ts`); `profile.ts` `dataHome(env)` (XDG_DATA_HOME when absolute, else `$HOME/.local/share`, else throws `PROFILE_MESSAGES.noHome`).
- Produces: `export type PackagedFacts = { resourcesPath: string; dataHome: string }`; `parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv, packaged: PackagedFacts | null = null): CliOptions | 'help'` — with non-null facts and neither `--server` nor `--manage-service`: `manageService = true`, `dataDir = <dataHome>/dhara/workspace`; with non-null facts always: `python` defaults to `<resourcesPath>/service/dhara-service/dhara-service` and `entryPoint` to `''`; `export function dataHome(env)` from `profile.ts`; `main.ts` passes `app.isPackaged ? { resourcesPath: process.resourcesPath, dataHome: dataHome(process.env) } : null`.

- [ ] **Step 1: Failing tests**

Append to `electron/test/cli.test.ts`:
```ts

describe('parseArgs in a packaged build (packaging spec §4)', () => {
  const FACTS = { resourcesPath: '/app/usr/lib/dhara/resources', dataHome: '/home/user/.local/share' };
  const SERVICE = '/app/usr/lib/dhara/resources/service/dhara-service/dhara-service';
  const packaged = (argv: string[], env: NodeJS.ProcessEnv = {}) => parseArgs(argv, CWD, REPO, env, FACTS);

  it('defaults to managed mode on a private workspace with the bundled service', () => {
    expect(packaged([])).toEqual({
      server: DEFAULT_SERVER,
      profile: null,
      manageService: true,
      dataDir: '/home/user/.local/share/dhara/workspace',
      python: SERVICE,
      entryPoint: '',
      startupTimeoutMs: 15_000,
    });
  });

  it('lets --data-dir alone choose the workspace', () => {
    expect(packaged(['--data-dir', '/notes'])).toMatchObject({ manageService: true, dataDir: '/notes', python: SERVICE, entryPoint: '' });
    expect(packaged(['--data-dir', 'notes'])).toMatchObject({ dataDir: '/home/user/launch/notes' });
  });

  it('--server switches to external mode exactly as today', () => {
    expect(packaged(['--server', 'http://127.0.0.1:9000'])).toMatchObject({ server: 'http://127.0.0.1:9000', manageService: false, dataDir: null });
    expect(cliError(() => packaged(['--server', 'http://127.0.0.1:9000', '--data-dir', 'x'])))
      .toBe('--data-dir requires explicit --manage-service; external mode never owns a service');
  });

  it('an explicit --manage-service keeps every managed rule and still runs the bundled service', () => {
    expect(cliError(() => packaged(['--manage-service']))).toBe('Managed mode requires an explicit --data-dir; no implicit real notebook');
    expect(cliError(() => packaged(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100']))).toBe('Managed mode uses http://127.0.0.1:8765 only');
    expect(packaged(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'], { DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: '9100' }))
      .toMatchObject({ server: 'http://127.0.0.1:9100', manageService: true, dataDir: '/home/user/launch/ws', python: SERVICE, entryPoint: '' });
  });

  it('--python and --entry-point still win', () => {
    expect(packaged(['--python', 'py', '--entry-point', 'run.py'])).toMatchObject({ python: '/home/user/launch/py', entryPoint: '/home/user/launch/run.py' });
  });

  it('null facts keep today\'s defaults', () => {
    expect(parseArgs([], CWD, REPO, {}, null)).toEqual(parse([]));
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run unit -- test/cli.test.ts 2>&1 | tail -25
```
Expected: 3 failed (`defaults to managed mode …`, `lets --data-dir alone …`, `an explicit --manage-service …`), everything else passed. `parseArgs` ignores a fifth argument today, so those three see `manageService: false`, `dataDir: null` or `python: '/repo/.venv/bin/python'`; the other three new tests assert behaviour that must not change and pass already (they are the regression guards of Review Focus 1).

- [ ] **Step 3: `cli.ts`**

```bash
cd /home/p4nic/code/noema
grep -n "^export function parseArgs\|^  const dataDir = values.get('--data-dir');\|^    python: absolutePath\|^    entryPoint: absolutePath" electron/src/cli.ts
```
Expected: exactly four lines. Replace each as follows.

The `export function parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv): CliOptions | 'help' {` line becomes:
```ts
/** What an AppImage knows (packaging spec §4): where the bundled service lives and where the default workspace goes. */
export type PackagedFacts = { resourcesPath: string; dataHome: string };

export function parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv, packaged: PackagedFacts | null = null): CliOptions | 'help' {
```

The `  const dataDir = values.get('--data-dir');` line becomes:
```ts
  // Packaged build (packaging spec §4): managed mode on a private workspace unless --server or --manage-service was given.
  const packagedDefaults = packaged !== null && !values.has('--server') && !manageService ? packaged : null;
  if (packagedDefaults !== null) manageService = true;
  const dataDir = values.get('--data-dir') ?? (packagedDefaults === null ? undefined : path.join(packagedDefaults.dataHome, 'dhara', 'workspace'));
```

The two lines `    python: absolutePath(values.get('--python') ?? path.join(repoRoot, '.venv/bin/python'), cwd),` and `    entryPoint: absolutePath(values.get('--entry-point') ?? path.join(repoRoot, 'run.py'), cwd),` become:
```ts
    // An AppImage has no venv: the bundled service is its own entry point whenever the shell is packaged.
    python: absolutePath(values.get('--python') ?? (packaged === null ? path.join(repoRoot, '.venv/bin/python') : path.join(packaged.resourcesPath, 'service/dhara-service/dhara-service')), cwd),
    entryPoint: absolutePath(values.get('--entry-point') ?? (packaged === null ? path.join(repoRoot, 'run.py') : ''), cwd),
```

- [ ] **Step 4: `profile.ts` and `main.ts`**

```bash
cd /home/p4nic/code/noema
grep -n "^function dataHome(env: NodeJS.ProcessEnv): string {" electron/src/profile.ts          # 1 line
grep -n "import { adoptLegacyProfile, legacyProfile, prepareProfile, resolveProfile } from './profile.js';" electron/src/main.ts   # 1 line
grep -n "    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env);" electron/src/main.ts   # 1 line
```
In `profile.ts` replace `function dataHome(env: NodeJS.ProcessEnv): string {` with:
```ts
/** $XDG_DATA_HOME when absolute, else ~/.local/share; the profile and the packaged default workspace both live under it. */
export function dataHome(env: NodeJS.ProcessEnv): string {
```
In `main.ts` replace the import line with:
```ts
import { adoptLegacyProfile, dataHome, legacyProfile, prepareProfile, resolveProfile } from './profile.js';
```
and the `const options = parseArgs(…)` line with:
```ts
    // Packaged (the AppImage): managed by default on a workspace under the data home, with the bundled service (packaging spec §4).
    const packaged = app.isPackaged ? { resourcesPath: process.resourcesPath, dataHome: dataHome(process.env) } : null;
    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env, packaged);
```
(`dataHome` throws `PROFILE_MESSAGES.noHome` without `$HOME`; the surrounding `try` turns that into `Dhara: Cannot locate profile; supply --profile PATH`, exit 2. In a packaged build that now happens even with `--profile` or `--help`; a desktop session always sets `$HOME`, and the launcher already needs a home directory for rule 4, so no lazier wiring is added.)

- [ ] **Step 5: GREEN**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run build && npm --prefix electron run unit -- test/cli.test.ts test/profile.test.ts
```
Expected: `tsc` clean; all tests pass (the existing `uses the main.rs defaults` and the new six).

- [ ] **Step 6: Commit**

```bash
cd /home/p4nic/code/noema
git add electron/src/cli.ts electron/src/profile.ts electron/src/main.ts electron/test/cli.test.ts
git commit -m "feat(electron): packaged-build defaults for parseArgs: managed workspace under the data home and the bundled service"
```

---

### Task 2: `ManagedService` spawns `[python, ...args]` when the entry point is empty

**Files:**
- Modify: `electron/src/lifecycle.ts`, `electron/test/service-start.test.ts`

**Interfaces:**
- Consumes: `ManagedConfig.entryPoint: string` (unchanged type); `electron/test/fixtures/fake_service.py` `env-dump` mode writes `{argv, env, lease, pid, pgid, sid, ppid}`; `electron/test/helpers.ts` `PYTHON`, `FAKE`, `fakeEnv`, `serviceFactory`, `freePort`, `tempDir`, `workspace`.
- Produces: the spawn `args` are `['--desktop-managed', '--host', '127.0.0.1', '--port', port, '--data-dir', workspace, '--owner-pid', pid]`, prefixed with `entryPoint` only when it is not `''`. Messages, exit codes and the stripped environment are unchanged.

- [ ] **Step 1: Failing test**

In `electron/test/service-start.test.ts` the import line `import { FAKE, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, workspace } from './helpers.js';` (grep `from './helpers.js'` → 1 line) becomes:
```ts
import { FAKE, PYTHON, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, workspace } from './helpers.js';
```
Append inside the `describe('ManagedService.start (spec §6.4.2-6.4.4)', …)` block, directly after the first test (the one ending with `expect(managed.state).toBe('running');\n  });`; grep `-n "expect(managed.state).toBe('running');"` → 1 line, the `});` that follows it closes that test):
```ts

  it('spawns [python, ...args] when the entry point is empty, as for a frozen service (packaging spec §4)', async () => {
    const dir = tempDir();
    const frozen = path.join(dir, 'dhara-service');   // a stand-in for the PyInstaller binary: its own entry point
    fs.writeFileSync(frozen, `#!/bin/sh\nexec ${JSON.stringify(PYTHON)} ${JSON.stringify(FAKE)} "$@"\n`, { mode: 0o755 });
    const envfile = path.join(dir, 'env.json');
    const port = await freePort();
    const ws = workspace();
    const managed = service({ port, workspace: ws, python: frozen, entryPoint: '', env: fakeEnv('env-dump', { DHARA_FAKE_ENVFILE: envfile }) });
    await managed.start();
    const dump = JSON.parse(fs.readFileSync(envfile, 'utf8')) as { argv: string[] };
    expect(dump.argv).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', ws, '--owner-pid', String(process.pid)]);
  });
```

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run build && npm --prefix electron run unit -- test/service-start.test.ts 2>&1 | tail -20
```
Expected: 1 failed — `expected [ '', '--desktop-managed', … ] to deeply equal [ '--desktop-managed', … ]`: today the empty entry point is passed through as the first argument.

- [ ] **Step 3: `lifecycle.ts`**

```bash
cd /home/p4nic/code/noema
grep -n "      child = spawn(python, \[entryPoint, '--desktop-managed'," electron/src/lifecycle.ts    # 1 line
```
Replace the two lines
```ts
      child = spawn(python, [entryPoint, '--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', workspace, '--owner-pid', String(process.pid)],
        { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env });
```
with
```ts
      const args = ['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', workspace, '--owner-pid', String(process.pid)];
      if (entryPoint !== '') args.unshift(entryPoint);   // a frozen service is its own entry point (packaging spec §4)
      child = spawn(python, args, { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env });
```

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run build && npm --prefix electron run unit -- test/service-start.test.ts test/service-stop.test.ts test/service-parity.test.ts
git add electron/src/lifecycle.ts electron/test/service-start.test.ts
git commit -m "feat(electron): spawn the managed service without an entry point when the service is its own binary"
```
Expected before the commit: all green, including the existing `spawns the exact protocol-2 command …` test (argv unchanged when an entry point is given).

---

### Task 3: `release/launch.cjs` and its unit test

**Files:**
- Create: `release/launch.cjs`, `electron/test/launch.test.ts`

**Interfaces:**
- Consumes: nothing from `electron/src` (the file runs inside the bundled Electron in Node mode, outside `resources/app`); `electron/test/proc.ts` `tempDir`.
- Produces (CommonJS exports): `EXIT_REFUSED = 3`; `NO_SANDBOX = 'Dhara: --no-sandbox is not supported.'`; `SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox'`; `dataHome(env) → string`; `helperMessage(target) → string` (the spec §5 rule-4 text for the user-owned copy at `target`, deviation 11); `ownerMessage(builtFor, uid) → string` (deviation 2); `decide({ env, argv, exe, dataHome, bundledHelper, facts: { stat(file) → {uid, mode} | null, userns() → boolean, uid } }) → { env } | { message }`. `main()` runs when the file is the entry: prints a message to stderr and exits 3, or spawns `<dir>/../dhara` with the user arguments, `stdio: 'inherit'`, the decided env (never `ELECTRON_RUN_AS_NODE`), forwards SIGTERM, and exits with the child's code.

- [ ] **Step 1: Failing test**

Create `electron/test/launch.test.ts`:
```ts
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from './proc.js';

// Plain CommonJS, loaded the way the bundled Electron loads it in Node mode (no Vite transform, no TypeScript).
const require = createRequire(import.meta.url);
type Stat = { uid: number; mode: number };
type Facts = { stat(file: string): Stat | null; userns(): boolean; uid: number };
type Input = { env: NodeJS.ProcessEnv; argv: string[]; exe: string; dataHome: string; bundledHelper: string; facts: Facts };
type Decision = { env: NodeJS.ProcessEnv; message?: undefined } | { message: string; env?: undefined };
const launch = require('../../release/launch.cjs') as {
  EXIT_REFUSED: number; NO_SANDBOX: string; SYSTEM_HELPER: string;
  dataHome(env: NodeJS.ProcessEnv): string;
  helperMessage(target: string): string;
  ownerMessage(builtFor: number, uid: number): string;
  decide(input: Input): Decision;
};

const EXE = '/mnt/usr/lib/dhara/dhara';
const BUNDLED = '/mnt/usr/lib/dhara/resources/chrome-sandbox';
const SETUID_ROOT: Stat = { uid: 0, mode: 0o104755 };
const OWN_EXE: Record<string, Stat> = { [EXE]: { uid: 1000, mode: 0o100755 } };
const BASE = { HOME: '/h', PATH: '/bin', ELECTRON_RUN_AS_NODE: '1' };
const facts = (files: Record<string, Stat>, userns = false, uid = 1000): Facts => ({ stat: (file) => files[file] ?? null, userns: () => userns, uid });
const decide = (overrides: Partial<Input>) => launch.decide({ env: BASE, argv: [], exe: EXE, dataHome: '/h/.local/share', bundledHelper: BUNDLED, facts: facts(OWN_EXE), ...overrides });

describe('release/launch.cjs decide (packaging spec §5)', () => {
  it('refuses --no-sandbox before anything else', () => {
    expect(decide({ argv: ['--data-dir', 'x', '--no-sandbox'], facts: facts(OWN_EXE, true) })).toEqual({ message: 'Dhara: --no-sandbox is not supported.' });
    expect(launch.NO_SANDBOX).toBe('Dhara: --no-sandbox is not supported.');
    expect(launch.EXIT_REFUSED).toBe(3);
  });

  it('rule 1: keeps an explicit CHROME_DEVEL_SANDBOX and drops ELECTRON_RUN_AS_NODE', () => {
    expect(decide({ env: { ...BASE, CHROME_DEVEL_SANDBOX: '/x' } })).toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/x' } });
  });

  it('rule 2: needs no helper when unprivileged user namespaces work, whoever owns the binary', () => {
    expect(decide({ facts: facts({ [EXE]: { uid: 0, mode: 0o100755 } }, true) })).toEqual({ env: { HOME: '/h', PATH: '/bin' } });
  });

  it('rule 3: exports the first root-owned setuid helper, the user one before the system one', () => {
    const both = { ...OWN_EXE, '/h/.local/share/dhara/chrome-sandbox': SETUID_ROOT, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT };
    expect(decide({ facts: facts(both) })).toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/h/.local/share/dhara/chrome-sandbox' } });
    expect(decide({ facts: facts({ ...OWN_EXE, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT }) }))
      .toEqual({ env: { HOME: '/h', PATH: '/bin', CHROME_DEVEL_SANDBOX: '/opt/google/chrome/chrome-sandbox' } });
    expect(launch.SYSTEM_HELPER).toBe('/opt/google/chrome/chrome-sandbox');
  });

  it('rule 3 ignores a helper that is not root-owned or not setuid', () => {
    const home = tempDir('dhara-launch-');
    const wrong = { ...OWN_EXE, [path.join(home, 'dhara', 'chrome-sandbox')]: { uid: 1000, mode: 0o104755 }, '/opt/google/chrome/chrome-sandbox': { uid: 0, mode: 0o100755 } };
    expect(decide({ dataHome: home, facts: facts(wrong) })).toEqual({ message: launch.helperMessage(path.join(home, 'dhara', 'chrome-sandbox')) });
  });

  it('rule 4: copies the bundled helper under <dataHome>/dhara (0700) and prints the one-time line for that copy', () => {
    const root = tempDir('dhara-launch-');
    const bundled = path.join(root, 'chrome-sandbox');
    fs.writeFileSync(bundled, 'helper bytes');
    const home = path.join(root, 'share');
    const target = path.join(home, 'dhara', 'chrome-sandbox');
    expect(decide({ dataHome: home, bundledHelper: bundled })).toEqual({ message: [
      "Dhara: Chromium's sandbox helper must be owned by root on this system. Run once:",
      `  sudo chown root:root ${target} && sudo chmod 4755 ${target}`,
      'then start Dhara again. (Dhara never runs without the sandbox.)',
      'If your home directory is mounted nosuid, install that file as /opt/google/chrome/chrome-sandbox instead.',
    ].join('\n') });
    expect(fs.statSync(path.join(home, 'dhara')).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(target, 'utf8')).toBe('helper bytes');   // user-owned and not setuid: rule 3 ignores it until the line above has run
    expect(fs.statSync(target).mode & 0o777).toBe(0o755);
  });

  it('rule 0: a helper is unusable when the mounted binary belongs to another user id', () => {
    const foreign = { [EXE]: { uid: 0, mode: 0o100755 }, '/opt/google/chrome/chrome-sandbox': SETUID_ROOT };
    const message = 'Dhara: this AppImage was built for user id 0 and you are user id 1000, so Chromium would ignore the sandbox helper. Extract it once (--appimage-extract) and start squashfs-root/AppRun.';
    expect(launch.ownerMessage(0, 1000)).toBe(message);
    expect(decide({ facts: facts(foreign) })).toEqual({ message });
    expect(decide({ env: { ...BASE, CHROME_DEVEL_SANDBOX: '/x' }, facts: facts(foreign) })).toEqual({ message });
  });

  it('dataHome mirrors profile.ts without throwing', () => {
    expect(launch.dataHome({ XDG_DATA_HOME: '/xdg', HOME: '/h' })).toBe('/xdg');
    expect(launch.dataHome({ XDG_DATA_HOME: 'rel', HOME: '/h' })).toBe('/h/.local/share');
    expect(launch.dataHome({ HOME: '/h' })).toBe('/h/.local/share');
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run unit -- test/launch.test.ts 2>&1 | tail -8
```
Expected: FAIL — `Cannot find module '../../release/launch.cjs'`.

- [ ] **Step 3: The launcher**

```bash
mkdir -p /home/p4nic/code/noema/release
```
Create `release/launch.cjs`:
```js
'use strict';
// Dhara's AppImage launcher (packaging spec §5). AppRun runs this file as plain Node inside the bundled Electron
// (ELECTRON_RUN_AS_NODE=1), before Chromium starts: it decides the sandbox helper once, then starts the real app
// and exits with its code. decide() is unit-tested with injected facts (electron/test/launch.test.ts).
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXIT_REFUSED = 3;
const NO_SANDBOX = 'Dhara: --no-sandbox is not supported.';
const SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox';   // the same fallback as electron/scripts/link-sandbox.mjs

/** $XDG_DATA_HOME when absolute, else ~/.local/share (electron/src/profile.ts dataHome, but this one must still print a line). */
function dataHome(env) {
  const xdg = env.XDG_DATA_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(env.HOME || os.homedir(), '.local/share');
}

/** Spec §5 rule 4 for the user-owned copy decide() makes: the two commands electron/scripts/link-sandbox.mjs prints; the last line is spec §10's nosuid alternative. */
function helperMessage(target) {
  return [
    "Dhara: Chromium's sandbox helper must be owned by root on this system. Run once:",
    `  sudo chown root:root ${target} && sudo chmod 4755 ${target}`,
    'then start Dhara again. (Dhara never runs without the sandbox.)',
    `If your home directory is mounted nosuid, install that file as ${SYSTEM_HELPER} instead.`,
  ].join('\n');
}

function ownerMessage(builtFor, uid) {
  return `Dhara: this AppImage was built for user id ${builtFor} and you are user id ${uid}, so Chromium would ignore the sandbox helper. Extract it once (--appimage-extract) and start squashfs-root/AppRun.`;
}

/**
 * Spec §5 rules 1–4 with injected facts: { stat(file) → { uid, mode } | null, userns() → boolean, uid }; exe is the running binary.
 * Returns { env } for the real process (ELECTRON_RUN_AS_NODE removed) or { message } to print before exiting EXIT_REFUSED.
 * Chromium reads CHROME_DEVEL_SANDBOX only when no chrome-sandbox sits beside the binary and the binary belongs to the
 * running user (sandbox/linux/suid/client/setuid_sandbox_host.cc), so a helper is usable only for the uid the image was built for.
 */
function decide({ env, argv, exe, dataHome: home, bundledHelper, facts }) {
  if (argv.includes('--no-sandbox')) return { message: NO_SANDBOX };
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;                                     // otherwise the child would also run as Node
  const builtFor = facts.stat(exe)?.uid;
  const usable = (helperEnv) => (builtFor === facts.uid ? { env: helperEnv } : { message: ownerMessage(builtFor, facts.uid) });
  if (next.CHROME_DEVEL_SANDBOX) return usable(next);                   // 1: an explicit helper is used as is
  if (facts.userns()) return { env: next };                             // 2: the namespace sandbox needs no helper
  const user = path.join(home, 'dhara', 'chrome-sandbox');
  for (const file of [user, SYSTEM_HELPER]) {                           // 3: the first root-owned setuid file wins
    const info = facts.stat(file);
    if (info !== null && info.uid === 0 && (info.mode & 0o4000) !== 0) return usable({ ...next, CHROME_DEVEL_SANDBOX: file });
  }
  try {
    fs.mkdirSync(path.dirname(user), { recursive: true, mode: 0o700 }); // 4: a user-owned copy for the one-time line
    fs.copyFileSync(bundledHelper, user);                               // the image is unmounted once this process exits, so the line must not name it
    fs.chmodSync(user, 0o755);
  } catch {
    // the message still names the path (a root-owned copy from an earlier run refuses the overwrite: only the chmod is missing)
  }
  return { message: helperMessage(user) };
}

const facts = {
  stat(file) {
    try {
      const info = fs.statSync(file);
      return { uid: info.uid, mode: info.mode };
    } catch {
      return null;
    }
  },
  // A missing unshare gives status null, which counts as "no namespaces" and falls through to the helper search (spec §10).
  userns: () => spawnSync('unshare', ['-Ur', 'true'], { stdio: 'ignore' }).status === 0,
  uid: process.getuid(),
};

function main() {
  const here = __dirname;                                               // <AppDir>/usr/lib/dhara/resources
  const argv = process.argv.slice(2);                                   // [dhara, launch.cjs, ...user arguments]
  const decision = decide({ env: process.env, argv, exe: process.execPath, dataHome: dataHome(process.env), bundledHelper: path.join(here, 'chrome-sandbox'), facts });
  if (decision.message !== undefined) {
    process.stderr.write(`${decision.message}\n`);
    process.exit(EXIT_REFUSED);
  }
  // No app path argument: with default_app.asar gone Electron loads resources/app itself, so every argument reaches cli.ts.
  const child = spawn(path.join(here, '..', 'dhara'), argv, { stdio: 'inherit', env: decision.env });
  process.on('SIGTERM', () => child.kill('SIGTERM'));                   // a desktop "quit" reaches this pid; Electron then runs its close checkpoint
  child.on('error', (error) => {
    process.stderr.write(`Dhara: ${error.message}\n`);
    process.exit(EXIT_REFUSED);
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

module.exports = { EXIT_REFUSED, NO_SANDBOX, SYSTEM_HELPER, dataHome, decide, helperMessage, ownerMessage };
if (require.main === module) main();
```

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run unit -- test/launch.test.ts
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
node -e 'const l=require("./release/launch.cjs"); console.log(Object.keys(l).sort().join(","))'
git add release/launch.cjs electron/test/launch.test.ts
git commit -m "feat(release): AppImage launcher that picks Chromium's sandbox helper and never runs without the sandbox"
```
Expected: 8 passed; `EXIT_REFUSED,NO_SANDBOX,SYSTEM_HELPER,dataHome,decide,helperMessage,ownerMessage`.

---

### Task 4: Service freeze — the `release` extra, `release/dhara-service.spec`, the speech 409 clause, the frozen-service pytest run

**Files:**
- Create: `release/dhara-service.spec`, `tests/test_release.py`
- Modify: `pyproject.toml`, `dhara/server.py`, `tests/test_core.py`, `tests/test_managed_service.py`

**Interfaces:**
- Consumes: `run.py` (entry; `--desktop-managed` → `dhara.desktop_service.managed`), `dhara/server.py` `ROOT = Path(__file__).resolve().parents[1]` and `ROOT/'web'/'dist'` (in the frozen build `__file__` is `<_internal>/dhara/server.py`, so `ROOT` is `_internal` and the data lands at `_internal/web/dist`), the 409 line `if not worker.speech_model: raise Problem(409,'Transcription is off. It runs locally on the CPU: … set to the printed path. Your recording is saved.')` (rewritten by the owner's `feat(speech)` commit) and its needle test `tests/test_core.py` `test_transcribe_off_names_the_setup_commands`, `tests/test_managed_service.py` `launch(data, port, owner, host, cwd)` and its two callers.
- Produces: pyproject extra `release = ["pyinstaller==6.22.3", "pyinstaller-hooks-contrib==2026.8"]`; a one-directory, console PyInstaller spec named `dhara-service` with `datas=[(<root>/web/dist, 'web/dist')]`, the four uvicorn hidden imports plus `python_multipart`, and `faster_whisper` excluded; the 409 detail unchanged except for the parenthesis `(the packaged build does not include speech)` before `Your recording is saved.`, and that clause as one more needle of the existing test; `tests/test_managed_service.py` fixture `service_cmd` (params `venv`, `packaged`), `FROZEN_DEFAULT = ROOT/'release/out/service/dhara-service/dhara-service'`, `DHARA_SERVICE_CMD` (shell-split) overriding the packaged command, `launch(cmd, data, port, owner=None, host='127.0.0.1', cwd=None)`.

- [ ] **Step 1: Failing tests**

The existing 409 test in `tests/test_core.py`, `test_transcribe_off_names_the_setup_commands`, checks the message by needles; the clause becomes one more needle (spec §6: one string, one test):
```bash
cd /home/p4nic/code/noema
grep -n "^    for needle in ('pip install -e" tests/test_core.py    # 1 line
```
Replace that line (keep its four-space indentation) with:
```python
    for needle in ('pip install -e ".[speech]"','tools/download_speech_model.py base.en','DHARA_SPEECH_MODEL','CPU','the packaged build does not include speech','Your recording is saved'):assert needle in detail,detail
```

Create `tests/test_release.py`:
```python
"""Release inputs (packaging spec §3, §6): what release/build.sh consumes is valid before any build runs."""
import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'release'
PYPROJECT = tomllib.loads((ROOT / 'pyproject.toml').read_text())


def test_versions_match_between_pyproject_and_electron():
    # build.sh refuses to build on a mismatch (spec §3 step 6); this keeps the two manifests equal between builds.
    assert json.loads((ROOT / 'electron/package.json').read_text())['version'] == PYPROJECT['project']['version']


def test_release_extra_pins_pyinstaller_exactly():
    assert PYPROJECT['project']['optional-dependencies']['release'] == ['pyinstaller==6.22.3', 'pyinstaller-hooks-contrib==2026.8']


def test_service_spec_is_one_directory_console_with_the_web_bundle():
    spec = (RELEASE / 'dhara-service.spec').read_text()
    compile(spec, 'dhara-service.spec', 'exec')
    assert "name='dhara-service'" in spec and 'console=True' in spec and 'COLLECT(' in spec
    assert "os.path.join('web', 'dist')" in spec and 'uvicorn.lifespan.on' in spec and "excludes=['faster_whisper']" in spec
```

In `tests/test_managed_service.py`, the block from `def launch(data, port, owner=None, host='127.0.0.1', cwd=None):` to the end of its `return subprocess.Popen(...)` call (grep `-n "^def launch\|start_new_session=True)"` → the two lines that bound it) is replaced by:
```python
# The service as the venv runs it and as the AppImage ships it (packaging spec §6); DHARA_SERVICE_CMD overrides the frozen command.
FROZEN_DEFAULT = ROOT / 'release/out/service/dhara-service/dhara-service'
SERVICE_CMDS = {'venv': [sys.executable, str(ROOT / 'run.py')],
                'packaged': shlex.split(os.environ.get('DHARA_SERVICE_CMD', '')) or [str(FROZEN_DEFAULT)]}


@pytest.fixture(params=['venv', 'packaged'])
def service_cmd(request):
    cmd = SERVICE_CMDS[request.param]
    if request.param == 'packaged' and not Path(cmd[0]).exists():
        pytest.skip(f'{cmd[0]} is absent: run release/build.sh (or set DHARA_SERVICE_CMD) to test the frozen service')
    return cmd


def launch(cmd, data, port, owner=None, host='127.0.0.1', cwd=None):
    # Own session: on lease EOF Python signals its own process group, never pytest's.
    return subprocess.Popen(
        [*cmd, '--desktop-managed', '--host', host, '--port', str(port),
         '--data-dir', str(data), '--owner-pid', str(os.getpid() if owner is None else owner)],
        cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env=managed_env(), start_new_session=True)
```
Then add `import shlex` after `import select` in the import block, and change the two tests that spawn (grep `-n "launch(" tests/test_managed_service.py` → the `def launch` line plus exactly two call sites):
- `def test_managed_exit_codes_never_write_the_workspace(tmp_path, case, expected):` → `def test_managed_exit_codes_never_write_the_workspace(tmp_path, service_cmd, case, expected):` and its call `launch(data, port, owner=owner, host=host, cwd=tmp_path)` → `launch(service_cmd, data, port, owner=owner, host=host, cwd=tmp_path)`;
- `def test_managed_acknowledges_protocol_2_and_stops_on_lease_eof(tmp_path):` → `def test_managed_acknowledges_protocol_2_and_stops_on_lease_eof(tmp_path, service_cmd):` and `launch(root, port)` → `launch(service_cmd, root, port)`.

- [ ] **Step 2: RED**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_core.py -q -k transcribe_off 2>&1 | tail -3
.venv/bin/python -m pytest tests/test_release.py -q 2>&1 | tail -3
.venv/bin/python -m pytest tests/test_managed_service.py --collect-only -q | grep -c packaged   # the fixture id shares one bracket with the case id; the order inside it is not asserted
.venv/bin/python -m pytest tests/test_managed_service.py -q -rs -k packaged 2>&1 | tail -3
```
Expected: `1 failed` (the detail lacks the new needle); `2 failed, 1 passed` (`KeyError: 'release'`, `FileNotFoundError` for the spec; the two versions already match); `10` (the fixture collects already); `10 skipped` with the reason `release/out/service/dhara-service/dhara-service is absent …`.

- [ ] **Step 3: The extra, the spec file, the clause**

In `pyproject.toml`, directly after the `speech = […]` extra line (grep `-n '^speech = '` → exactly 1 line; the owner edits that line, so match the prefix, not its text) add:
```toml
release = ["pyinstaller==6.22.3", "pyinstaller-hooks-contrib==2026.8"]
```

Create `release/dhara-service.spec`:
```python
# -*- mode: python ; coding: utf-8 -*-
"""Frozen Dhara service for the AppImage (packaging spec §6): entry run.py, one directory, console.

One directory on purpose: the bootloader runs Python in this same process, so the pid in the protocol-2
acknowledgement is the pid Electron spawned; a one-file build would fork a child and break the lease.
"""
import os

ROOT = os.path.dirname(SPECPATH)   # SPECPATH is release/; every input path is spelled from the repository root

a = Analysis(
    [os.path.join(ROOT, 'run.py')],
    pathex=[ROOT],
    binaries=[],
    # dhara/server.py resolves ROOT/'web'/'dist' from its own __file__, which is <_internal>/dhara/server.py once frozen.
    datas=[(os.path.join(ROOT, 'web', 'dist'), os.path.join('web', 'dist'))],
    # uvicorn loads these by name at run time (Config(loop='auto', http='auto', ws='auto', lifespan='auto')); hooks-contrib's
    # hook-uvicorn collects every submodule too, this list is the floor. FastAPI imports python_multipart only when a
    # Form/File route is registered. pydantic is covered by hooks-contrib.
    hiddenimports=['uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on', 'python_multipart'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['faster_whisper'],   # the speech extra is not bundled (spec §1)
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='dhara-service', console=True, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='dhara-service')
```

In `dhara/server.py`:
```bash
cd /home/p4nic/code/noema
grep -n "if not worker.speech_model: raise Problem(409," dhara/server.py    # 1 line
```
Replace that line (keep its eight-space indentation; only the parenthesis is new, the rest is the owner's current text) with:
```python
        if not worker.speech_model: raise Problem(409,'Transcription is off. It runs locally on the CPU: run pip install -e ".[speech]" and python tools/download_speech_model.py base.en once, then start the service with DHARA_SPEECH_MODEL set to the printed path (the packaged build does not include speech). Your recording is saved.')
```
(`web/e2e/notes.spec.ts` matches the alert on the substring `Transcription is off.`, and the existing needles all survive, so both keep passing.)

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_core.py tests/test_release.py tests/test_managed_service.py -q -rs 2>&1 | tail -4
git add pyproject.toml release/dhara-service.spec dhara/server.py tests/test_core.py tests/test_release.py tests/test_managed_service.py
git commit -m "feat(release): PyInstaller spec and release extra for the frozen service; packaged speech clause; frozen-service pytest cases"
```
Expected before the commit: everything passes except `10 skipped` `[packaged]` cases with the reason above (they run in Task 6 once the binary exists).

---

### Task 5: `release/build.sh`, `AppRun`, `dhara.desktop`, ignores and the `package` alias

**Files:**
- Create: `release/build.sh`, `release/AppRun`, `release/dhara.desktop`
- Modify: `.gitignore`, `electron/package.json`, `tests/test_release.py`

**Interfaces:**
- Consumes: `electron/node_modules/electron/dist` (binary `electron`, `resources/default_app.asar`, `chrome-sandbox` as the `npm ci` of step 4 leaves it, `version`), `electron/dist/*.js` and `*.cjs` (not `dist/test-results`), `electron/static/`, `electron/package.json`, `web/public/icon.svg`, `release/dhara-service.spec`, `release/launch.cjs`, the pins from the pre-flight record.
- Produces: `release/out/Dhara-<version>-x86_64.AppImage` (the version from `electron/package.json`, equal to `pyproject.toml`'s), `release/out/AppDir/` with the spec §3 layout except the helper at `usr/lib/dhara/resources/chrome-sandbox`, `release/out/service/`, `release/cache/{appimagetool-x86_64.AppImage,runtime-x86_64}`; a non-zero exit with a `release/build.sh: …` line on any miss; `npm --prefix electron run package` as the alias.

- [ ] **Step 1: Failing tests**

In `tests/test_release.py` add `import configparser` above `import json` and `import subprocess` below it, then append:
```python


def test_desktop_entry_names_the_icon_and_one_category():
    entry = configparser.ConfigParser(interpolation=None)
    entry.read(RELEASE / 'dhara.desktop')
    e = entry['Desktop Entry']
    assert (e['Type'], e['Name'], e['Exec'], e['Icon'], e['Categories'], e['Terminal']) == ('Application', 'Dhara', 'dhara', 'dhara', 'Office;', 'false')


def test_build_script_parses_and_its_outputs_are_ignored():
    subprocess.run(['bash', '-n', RELEASE / 'build.sh'], check=True)
    subprocess.run(['sh', '-n', RELEASE / 'AppRun'], check=True)
    ignored = (ROOT / '.gitignore').read_text().splitlines()
    assert 'release/out/' in ignored and 'release/cache/' in ignored
    assert json.loads((ROOT / 'electron/package.json').read_text())['scripts']['package'] == 'bash ../release/build.sh'
```

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_release.py -q 2>&1 | tail -3
```
Expected: `2 failed, 3 passed` (`KeyError: 'Desktop Entry'`, `FileNotFoundError: … release/build.sh`).

- [ ] **Step 2: The three release files**

Create `release/AppRun`:
```sh
#!/bin/sh
# The launcher runs as plain Node inside the bundled Electron and starts the real process itself (packaging spec §3, §5).
# $APPDIR is set by the AppImage runtime; an extracted tree (--appimage-extract) runs this file directly, hence the fallback.
APPDIR="${APPDIR:-$(dirname "$(readlink -f "$0")")}"
export ELECTRON_RUN_AS_NODE=1
exec "$APPDIR/usr/lib/dhara/dhara" "$APPDIR/usr/lib/dhara/resources/launch.cjs" "$@"
```

Create `release/dhara.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=Dhara
Comment=Local-first learning notes and an attention queue for parallel agent work
Exec=dhara
Icon=dhara
Terminal=false
Categories=Office;
```

Create `release/build.sh`:
```bash
#!/usr/bin/env bash
# Builds release/out/Dhara-<version>-x86_64.AppImage (packaging spec §3): the Electron shell, the PyInstaller-frozen
# service and the launcher in one file. Idempotent; run from any directory; needs Node 22 on PATH and the repo .venv.
# Not part of the test gate: it downloads two pinned tools once (release/cache/) and takes minutes.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
OUT=release/out
CACHE=release/cache
APPDIR=$OUT/AppDir
LIB=$APPDIR/usr/lib/dhara
ELECTRON_DIST=electron/node_modules/electron/dist

# Pinned tools (spec §3 steps 2 and 6). Hashes computed from these exact downloads on 2026-10-13; a mismatch fails the build.
APPIMAGETOOL_URL=https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage
APPIMAGETOOL_SHA256=ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0
RUNTIME_URL=https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64
RUNTIME_SHA256=2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d

fail() { echo "release/build.sh: $*" >&2; exit 1; }

# Downloads once, verifies every time; a wrong hash deletes the file so the next run downloads again.
fetch() {   # fetch URL SHA256 FILE
  if [ ! -f "$3" ]; then
    echo "downloading $1"
    curl -fsSL --retry 3 -o "$3.part" "$1" || fail "download failed: $1"
    mv "$3.part" "$3"
  fi
  if ! echo "$2  $3" | sha256sum -c --quiet -; then
    rm -f "$3"
    fail "SHA-256 mismatch for $3 (expected $2); the file was deleted"
  fi
}

case "$(node --version 2>/dev/null)" in v22.*) ;; *) fail 'Node 22 is required: export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH' ;; esac
[ -x .venv/bin/python ] || fail '.venv/bin/python is missing; create the venv as the README says'
[ "$(uname -m)" = x86_64 ] || fail 'this build targets x86_64 only'
VERSION=$(node -p "require('./electron/package.json').version")
PY_VERSION=$(.venv/bin/python -c "import tomllib; print(tomllib.load(open('pyproject.toml', 'rb'))['project']['version'])")
[ "$VERSION" = "$PY_VERSION" ] || fail "version mismatch: electron/package.json $VERSION, pyproject.toml $PY_VERSION"
APPIMAGE=$OUT/Dhara-$VERSION-x86_64.AppImage

echo "== tools (pinned, verified)"
mkdir -p "$CACHE"
fetch "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$CACHE/appimagetool-x86_64.AppImage"
fetch "$RUNTIME_URL" "$RUNTIME_SHA256" "$CACHE/runtime-x86_64"
chmod 755 "$CACHE/appimagetool-x86_64.AppImage"

echo "== 1/7 web bundle"
npm --prefix web ci          # one command per line: set -e ignores a failure inside an && list
npm --prefix web run build

echo "== 2/7 PyInstaller from the release extra"
.venv/bin/pip install -q -e '.[release]'

echo "== 3/7 frozen service"
rm -rf "$OUT/service" "$OUT/build"
.venv/bin/pyinstaller release/dhara-service.spec --noconfirm --distpath "$OUT/service" --workpath "$OUT/build" --log-level WARN

echo "== 4/7 Electron shell"
npm --prefix electron ci     # a fresh dist: its chrome-sandbox is the original helper, and the dev tree's link-sandbox.mjs symlink is gone (rerun it before the Electron e2e)
npm --prefix electron run build

echo "== 5/7 AppDir"
rm -rf "$APPDIR"
mkdir -p "$LIB/resources/app/dist" "$LIB/resources/service"
cp -a "$ELECTRON_DIST/." "$LIB/"
mv "$LIB/electron" "$LIB/dhara"                             # app.isPackaged is true once the binary is not named electron
rm -f "$LIB/resources/default_app.asar"                     # Electron then loads resources/app itself
rm -f "$LIB/chrome-sandbox"                                 # never beside the binary: Chromium would prefer it to CHROME_DEVEL_SANDBOX (spec §5)
install -m 755 "$ELECTRON_DIST/chrome-sandbox" "$LIB/resources/chrome-sandbox"   # the launcher copies this one out for the one-time line (spec §5 rule 4)
cp electron/package.json "$LIB/resources/app/"
cp electron/dist/*.js electron/dist/*.cjs "$LIB/resources/app/dist/"   # not dist/test-results
cp -a electron/static "$LIB/resources/app/static"
cp -a "$OUT/service/dhara-service" "$LIB/resources/service/dhara-service"
install -m 644 release/launch.cjs "$LIB/resources/launch.cjs"
install -m 755 release/AppRun "$APPDIR/AppRun"
install -m 644 release/dhara.desktop "$APPDIR/dhara.desktop"
install -m 644 web/public/icon.svg "$APPDIR/dhara.svg"
cp "$APPDIR/dhara.svg" "$APPDIR/.DirIcon"

echo "== 6/7 appimagetool"
rm -f "$APPIMAGE"
# Extract-and-run: appimagetool is itself an AppImage and the build host may lack FUSE. -n: no AppStream metadata is shipped.
# -force-uid/-force-gid: Chromium honours CHROME_DEVEL_SANDBOX only when the binary belongs to the running user, and
# appimagetool would otherwise store root ownership (spec §5; decision 29C: built for its builder).
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$CACHE/appimagetool-x86_64.AppImage" -n \
  --mksquashfs-opt -force-uid --mksquashfs-opt "$(id -u)" --mksquashfs-opt -force-gid --mksquashfs-opt "$(id -g)" \
  --runtime-file "$CACHE/runtime-x86_64" "$APPDIR" "$APPIMAGE"

echo "== 7/7 self-check"
APPIMAGE_ABS=$PWD/$APPIMAGE
check=$(mktemp -d "${TMPDIR:-/tmp}/dhara-appimage-check-XXXXXX")
trap 'rm -rf "$check"' EXIT
(cd "$check" && "$APPIMAGE_ABS" --appimage-extract >/dev/null)   # no FUSE needed
for p in AppRun dhara.desktop dhara.svg .DirIcon usr/lib/dhara/dhara usr/lib/dhara/resources/chrome-sandbox usr/lib/dhara/resources/launch.cjs \
         usr/lib/dhara/resources/app/package.json usr/lib/dhara/resources/app/dist/main.js usr/lib/dhara/resources/app/dist/preload.cjs \
         usr/lib/dhara/resources/app/static/startup.html usr/lib/dhara/resources/service/dhara-service/dhara-service \
         usr/lib/dhara/resources/service/dhara-service/_internal/web/dist/index.html; do
  [ -e "$check/squashfs-root/$p" ] || fail "missing from the AppImage: $p"
done
[ ! -e "$check/squashfs-root/usr/lib/dhara/chrome-sandbox" ] || fail 'chrome-sandbox must not sit beside the binary'
[ ! -e "$check/squashfs-root/usr/lib/dhara/resources/default_app.asar" ] || fail 'default_app.asar must not be shipped'
"$check/squashfs-root/usr/lib/dhara/resources/service/dhara-service/dhara-service" --help >/dev/null || fail 'dhara-service --help failed'
# Node mode needs neither a display nor a sandbox helper; a packaged `dhara --version` would start Chromium and reach cli.ts as an unknown argument.
electron_version=$(ELECTRON_RUN_AS_NODE=1 "$check/squashfs-root/usr/lib/dhara/dhara" -p 'process.versions.electron') || fail 'the bundled Electron does not run in Node mode'
[ "$electron_version" = "$(cat "$ELECTRON_DIST/version")" ] || fail "the bundled Electron reports $electron_version"
echo "Electron $electron_version · service $(du -sh "$LIB/resources/service/dhara-service" | cut -f1) · AppDir $(du -sh "$APPDIR" | cut -f1) · AppImage $(du -h "$APPIMAGE" | cut -f1) ($(stat -c %s "$APPIMAGE") bytes)"
echo "$APPIMAGE"
```

```bash
cd /home/p4nic/code/noema
chmod 755 release/build.sh release/AppRun
```

- [ ] **Step 3: Ignores and the alias**

Append to `.gitignore` (its last line is `electron/dist/`):
```
release/out/
release/cache/
```
In `electron/package.json` replace the line `    "test": "npm run build && npm run unit && npm run e2e"` (grep `"test":` → 1 line) with:
```json
    "test": "npm run build && npm run unit && npm run e2e",
    "package": "bash ../release/build.sh"
```
(`npm run` puts the `node` devDependency, 22.23.3, on PATH, which the script checks; run directly, the script needs the nvm export from the owner rules.)

- [ ] **Step 4: GREEN and commit**

```bash
cd /home/p4nic/code/noema
git status --porcelain --untracked-files=all -- release .gitignore electron/package.json tests/test_release.py
git add release/build.sh release/AppRun release/dhara.desktop .gitignore electron/package.json tests/test_release.py
.venv/bin/python -m pytest tests/test_release.py tests/test_rename_gate.py tests/test_cutover.py -q
git commit -m "feat(release): build.sh assembles the AppDir and the AppImage with pinned, verified tools; package npm alias"
```
Expected: the status lists exactly those six paths (`release/launch.cjs` and the spec are already tracked); after the `git add`, all green (the rename gate reads `git ls-files`, so it scans the new files only once they are staged: none says the old name).

---

### Task 6: The packaged e2e under the private Sway, and one real build

**Files:**
- Create: `electron/e2e/packaged.spec.ts`

**Interfaces:**
- Consumes: `electron/e2e/fixtures.ts` `REPO_ROOT`, `tempDir`; `electron/test/proc.ts` `live`, `until`; `web/e2e/server.ts` `getFreePort`; `release/out/Dhara-*-x86_64.AppImage` (FUSE mounts it); `DHARA_ELECTRON_TEST`/`DHARA_ELECTRON_TEST_PORT` (`lifecycle.ts` `managedPort`); `/proc/<pid>/cmdline` and `/proc/<pid>/stat`.
- Produces: one Playwright test, skipped with the reason `release/out/Dhara-<version>-x86_64.AppImage is absent: run npm --prefix electron run package first` when there is no artifact; otherwise it proves: identity protocol 2 served; the service process is the frozen binary with no interpreter and no entry point and the spec §4 arguments; its `--owner-pid` is the packaged shell (`usr/lib/dhara/dhara`), itself the launcher's child; workspace 0700; no `SUID sandbox helper` complaint; SIGTERM to the launcher → exit 0, service gone, `.dhara-service.lock` free.

- [ ] **Step 1: The spec (RED = skipped with the reason, since nothing is built yet)**

Create `electron/e2e/packaged.spec.ts`:
```ts
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getFreePort } from '../../web/e2e/server.js';
import { live, until } from '../test/proc.js';
import { REPO_ROOT, tempDir } from './fixtures.js';

const OUT = path.join(REPO_ROOT, 'release/out');
const APPIMAGE = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((name) => /^Dhara-.+-x86_64\.AppImage$/.test(name)).map((name) => path.join(OUT, name))[0] : undefined;
const SHELL = 'usr/lib/dhara/dhara';
const SERVICE = 'usr/lib/dhara/resources/service/dhara-service/dhara-service';

const cmdline = (pid: number) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
const parentPid = (pid: number) => Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]);

// The real artifact, mounted by its own runtime (FUSE), exactly as a user runs it: an extracted tree would be owned by the
// extracting user and could not prove the mounted-ownership rule the launcher depends on (packaging plan, pre-flight finding 2).
test.skip(APPIMAGE === undefined, 'release/out/Dhara-<version>-x86_64.AppImage is absent: run npm --prefix electron run package first');

test('the AppImage runs the bundled service sandboxed on a private workspace, and SIGTERM stops both with exit 0', async () => {
  const root = tempDir('dhara-packaged-');
  const dataDir = path.join(root, 'workspace');
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  // The owner may be using 8765 right now: the test port needs DHARA_ELECTRON_TEST and therefore --server, and --server
  // switches off the packaged managed default, so --manage-service is spelled out (cli.ts); the bundled service stays the default.
  const child = spawn(APPIMAGE!, ['--manage-service', '--data-dir', dataDir, '--server', origin, '--profile', path.join(root, 'profile')], {
    env: { ...process.env, DHARA_ELECTRON_TEST: '1', DHARA_ELECTRON_TEST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  const seen: { identity?: { protocol: number; pid: number } } = {};   // filled inside the closure, which TypeScript's narrowing cannot see
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`the AppImage exited early with ${child.exitCode}:\n${output}`);
    try {
      seen.identity = (await (await fetch(`${origin}/api/desktop-instance`)).json()) as { protocol: number; pid: number };
      return true;
    } catch {
      return false;
    }
  }, 60_000);
  const identity = seen.identity!;
  expect(identity.protocol).toBe(2);
  const service = cmdline(identity.pid);
  const ownerAt = service.indexOf('--owner-pid');
  expect(service[0].endsWith(`/${SERVICE}`)).toBe(true);   // the frozen service: no interpreter, no entry point
  expect(service.slice(1, ownerAt)).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', fs.realpathSync(dataDir)]);
  const shellPid = Number(service[ownerAt + 1]);
  expect(cmdline(shellPid)[0].endsWith(`/${SHELL}`)).toBe(true);   // owned by the packaged shell (app.isPackaged, resources/app)
  expect(parentPid(shellPid)).toBe(child.pid);                     // which the launcher spawned (the runtime execs AppRun in the launched pid: pre-flight finding 5)
  expect(fs.statSync(dataDir).mode & 0o777).toBe(0o700);
  expect(output).not.toContain('SUID sandbox helper');             // Chromium's sandbox abort never happened, and --no-sandbox was never used
  child.kill('SIGTERM');                                           // forwarded by the launcher; the shell runs its close checkpoint and quits
  expect(await exited).toBe(0);
  await expect.poll(() => live(identity.pid), { timeout: 10_000 }).toBe(false);
  expect(spawnSync('flock', ['--nonblock', path.join(dataDir, '.dhara-service.lock'), 'true']).status).toBe(0);   // the lock is released
});
```

```bash
cd /home/p4nic/code/noema
npm --prefix electron run build && npm --prefix electron run e2e -- e2e/packaged.spec.ts 2>&1 | tail -4
```
Expected: `1 skipped` — the listed reason is `release/out/Dhara-<version>-x86_64.AppImage is absent: run npm --prefix electron run package first`.

- [ ] **Step 2: The real build (recorded)**

```bash
cd /home/p4nic/code/noema
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
time npm --prefix electron run package 2>&1 | tee /tmp/dhara-package-build.log | tail -6
ls -l release/out/*.AppImage release/cache/
sha256sum release/cache/appimagetool-x86_64.AppImage release/cache/runtime-x86_64
node electron/scripts/link-sandbox.mjs      # the build's npm ci replaced the Electron dist; the dev e2e needs the root-owned helper again
git status --porcelain --untracked-files=no ; echo "(expect nothing above: release/out and release/cache are ignored, nothing tracked changed)"
```
Expected: the log ends with `Electron 44.7.0 · service 34M · AppDir 317M · AppImage 126M (<bytes> bytes)` (the pre-flight gave 131,172,856 bytes; a few hundred bytes of drift from the `run.py --desktop` commit is fine) and the artifact path; both hashes equal the pins; `link-sandbox.mjs` prints its one line; `git status` prints nothing. Keep the three summary lines and the wall time for Task 7. On any `release/build.sh: …` failure, fix the script in this task and rerun; the cache is reused.

- [ ] **Step 3: The frozen service through the pytest suite (GREEN for Task 4's `[packaged]` cases)**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_managed_service.py -v -rs 2>&1 | grep -E 'packaged|passed|skipped' | tail -14
```
Expected: ten `PASSED` lines whose ids contain `packaged` (nine exit-code cases and the acknowledgement test) and a summary with no `skipped`.

- [ ] **Step 4: GREEN for the e2e, and the loud-failure check of `fetch`**

```bash
cd /home/p4nic/code/noema
npm --prefix electron run e2e -- e2e/packaged.spec.ts 2>&1 | tail -4
cp release/cache/runtime-x86_64 /tmp/dhara-runtime-good && echo corrupt >> release/cache/runtime-x86_64
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH; release/build.sh; echo "rc=$?"
test ! -e release/cache/runtime-x86_64 && echo deleted-ok
mv /tmp/dhara-runtime-good release/cache/runtime-x86_64 && sha256sum -c --quiet <(echo "2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d  release/cache/runtime-x86_64") && echo cache-restored
```
Expected: `1 passed`; then, within seconds (the tools step runs before npm and PyInstaller), `release/build.sh: SHA-256 mismatch for release/cache/runtime-x86_64 (expected 2fca8b44…); the file was deleted` and `rc=1`; `deleted-ok`; `cache-restored` (the restored file is the verified download, so the next build does not download again).

- [ ] **Step 5: Commit**

```bash
cd /home/p4nic/code/noema
git add electron/e2e/packaged.spec.ts
git commit -m "test(electron): packaged AppImage e2e under the private Sway, skipped with a reason without the artifact"
```

- [ ] **Step 6: Nothing else is skipped now**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest -q 2>&1 | tail -2
```
Expected: all passed, no `skipped` in the summary (the artifact is present).

- [ ] **Step 7: Owner step — the two §1 success lines (opens windows on the owner's desktop; ask first, port 8765 must be free)**

```bash
cd /home/p4nic/code/noema
./release/out/Dhara-0.1.0-x86_64.AppImage                                     # empty workspace at ~/.local/share/dhara/workspace
./release/out/Dhara-0.1.0-x86_64.AppImage --data-dir /home/p4nic/code/noema/.data   # the owner's notes
ls -ld ~/.local/share/dhara/workspace                                          # drwx------ … (0700)
```
Expected: the first opens Dhara on an empty workspace (first start: the usual unlock through the loopback session); the second opens the existing notes (a `noema.sqlite3` there is moved by the guarded rename spec §4.9 on a clean close). If the owner's own service holds 8765, the window shows "Endpoint is occupied or unavailable…" with Retry: that is spec §7's unchanged behaviour, and the line is rerun once the port is free. Record the outcome in Task 7's report.

---

### Task 7: Docs, gate, tag, test report, manifest

**Files:**
- Modify: `docs/DESKTOP.md`, `README.md`, `docs/PROGRESS.md`, `docs/TEST_REPORT.md`, `SHA256SUMS`

**Interfaces:**
- Consumes: the eight gate commands of `docs/TEST_REPORT.md` "### Final gate run" and the README Verification block (`tests/test_cutover_docs.py` `GATE_COMMANDS`: contract §0's six plus `npm --prefix electron ci && node electron/scripts/link-sandbox.mjs` between the web and Electron segments; unchanged), the Phase 5 flake rule (a run counts only when all eight commands pass and no log reports a skipped/flaky/todo count), Task 6's recorded numbers, `tests/test_cutover_docs.py` `REQUIRED` strings (all kept), `tests/test_rename_gate.py` docs case rules (no bare `DHARA`, no sentence-initial `dhara`).
- Produces: a `## Packaged build (AppImage)` section in `docs/DESKTOP.md` before `## Close checkpoint`, one sentence in its `## Tests` section, an `### Install (Linux x86_64 AppImage)` subsection in the README before `### Linux / macOS`, two roadmap rows after the second `| After the merge |` row in `docs/PROGRESS.md`, one gate paragraph in `docs/TEST_REPORT.md` before `### Handbook §21 main-app memory · measured 2026-10-12`, tag `cutover-gate` moved to the gate commit, `SHA256SUMS` regenerated last.

- [ ] **Step 1: `docs/DESKTOP.md`**

```bash
cd /home/p4nic/code/noema
grep -n '^## Close checkpoint$' docs/DESKTOP.md                   # 1 line
grep -n '^\[TEST_REPORT.md\](TEST_REPORT.md)\.$' docs/DESKTOP.md   # 1 line, inside ## Tests
```
Insert the following block immediately before the `## Close checkpoint` line (keep one blank line on each side):
````markdown
## Packaged build (AppImage)

`release/build.sh` (alias `npm --prefix electron run package`) produces
`release/out/Dhara-<version>-x86_64.AppImage`: the Electron shell, the Python
service frozen with PyInstaller (one directory, `web/dist` inside it) and the
launcher in one file. It needs Node 22.23.3 on PATH
(`export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`), the repository `.venv`
and, the first time, internet access: it downloads `appimagetool` 1.9.1 and the
static AppImage runtime 20251108 into `release/cache/` and verifies both against
the SHA-256 values in the script. The version comes from `electron/package.json`
and must equal `pyproject.toml`'s; the build fails otherwise. Nothing is installed
system-wide, and the build is not part of the test gate. Its `npm ci` replaces
`electron/node_modules`, so run `node electron/scripts/link-sandbox.mjs` again
before `npm --prefix electron test`.

```bash
release/build.sh
./release/out/Dhara-0.1.0-x86_64.AppImage
```

Defaults inside the AppImage (every flag in the table above still wins): managed
mode on the workspace `$XDG_DATA_HOME/dhara/workspace` (default
`~/.local/share/dhara/workspace`, created with mode 0700), the bundled service
instead of `.venv/bin/python run.py`, and the usual profile directory.
`--data-dir PATH` opens another workspace; `--server URL` switches to external
mode exactly as in a development build. Deleting the AppImage never touches
notes. A second instance on the same workspace is refused by the lock as usual.

Chromium's sandbox: the rule from [SECURITY.md](SECURITY.md) holds, the shell
is never run with `--no-sandbox`, and the launcher refuses that flag (exit 3).
Ubuntu 24.04 restricts unprivileged user namespaces, so Electron needs its
root-owned setuid helper, which cannot live inside the AppImage (FUSE mounts
ignore setuid). On start the launcher uses `CHROME_DEVEL_SANDBOX` when it is
set, needs nothing when `unshare -Ur true` works, and otherwise uses the first
root-owned setuid file among `~/.local/share/dhara/chrome-sandbox` and
`/opt/google/chrome/chrome-sandbox`. When none exists it copies the bundled
helper to `~/.local/share/dhara/chrome-sandbox` (the image is unmounted when
the launcher exits, so the line names that copy, not a path inside the
AppImage), prints the one-time line with the real path and exits 3:

```
sudo chown root:root ~/.local/share/dhara/chrome-sandbox && sudo chmod 4755 ~/.local/share/dhara/chrome-sandbox
```

If your home directory is mounted `nosuid`, install that file as
`/opt/google/chrome/chrome-sandbox` instead.

Chromium honours that helper only when the binary belongs to the running user,
so the image is built with the builder's user id inside it and runs sandboxed
for that user; another user id gets one line telling them to extract it once
(`--appimage-extract`) and start `squashfs-root/AppRun`. The `.deb` follow-on
installs a root-owned helper beside the binary and needs none of this.

Not included: the speech extra (`capabilities.speech` is false and
`POST /api/notes/<id>/transcribe` answers 409 saying so) and the Sway kitten
companion; Ollama stays an external service. The AppImage runtime is static, so
`libfuse2` is not required; without FUSE, start it with
`APPIMAGE_EXTRACT_AND_RUN=1` or extract it once with `--appimage-extract`.

````
Then append this sentence to the `## Tests` paragraph, directly after its line `[TEST_REPORT.md](TEST_REPORT.md).`:
```markdown
`electron/e2e/packaged.spec.ts` runs the AppImage from `release/out/` when one
exists, and the `[packaged]` cases of `tests/test_managed_service.py` run the
frozen service; both are skipped with a reason otherwise, so a gate run that
must show no skipped count (TEST_REPORT.md) builds the package first.
```

- [ ] **Step 2: `README.md` and `docs/PROGRESS.md`**

```bash
cd /home/p4nic/code/noema
grep -n '^### Linux / macOS$' README.md          # 1 line
grep -n '^| After the merge | Speech in managed mode' docs/PROGRESS.md   # 1 line: the second and last `After the merge` row
```
Insert before `### Linux / macOS` (blank line on each side):
```markdown
### Install (Linux x86_64 AppImage)

Users: download or build `Dhara-<version>-x86_64.AppImage` (`release/build.sh`;
see [docs/DESKTOP.md](docs/DESKTOP.md), "Packaged build"), make it executable and
run it. It starts the bundled service on `~/.local/share/dhara/workspace`
(`$XDG_DATA_HOME` is respected); `--data-dir PATH` opens another workspace. On a
system that restricts user namespaces it prints a one-time `sudo chown`/`chmod`
line for a copy of Chromium's sandbox helper under `~/.local/share/dhara/`, then
runs sandboxed; it never runs without the sandbox. Contributors: the development flow below (a browser, or
`npm --prefix electron start`) is unchanged and needs no AppImage.
```
Insert after that row (the second `| After the merge |` row of the roadmap table):
```markdown
| Packaging follow-on | `.deb` from the same `release/out/AppDir`: `usr/lib/dhara` with a root-owned 4755 `chrome-sandbox` beside the binary (so neither the one-time line nor the builder-uid limit of the AppImage applies), `dhara.desktop` and the icon under `usr/share`. | `dpkg -i` on a clean Ubuntu 24.04 starts Dhara sandboxed on the default workspace; `dpkg -r` leaves `~/.local/share/dhara` untouched. |
| Release checklist | Bump `pyproject.toml` and `electron/package.json` together (`tests/test_release.py` holds them equal), full gate, `npm --prefix electron run package`, `npm --prefix electron run e2e -- e2e/packaged.spec.ts`, record sizes and versions in TEST_REPORT.md, regenerate `SHA256SUMS`, tag. | Every item is a command or a file in this repository; signing and auto-update stay out of scope. |
```

- [ ] **Step 3: Docs tests, then commit the docs**

```bash
cd /home/p4nic/code/noema
.venv/bin/python -m pytest tests/test_cutover_docs.py tests/test_rename_gate.py -q
git add docs/DESKTOP.md README.md docs/PROGRESS.md
git commit -m "docs: packaged build (AppImage) in DESKTOP, README install paragraph, roadmap rows for the .deb and the release checklist"
```
Expected: green (the `REQUIRED` strings are intact; no bare `DHARA`, no sentence-initial `dhara`).

- [ ] **Step 4: The full gate once, with the artifact present (Phase 5 rule)**

```bash
cd /home/p4nic/code/noema
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
ls release/out/*.AppImage release/out/service/dhara-service/dhara-service     # both exist (Task 6); otherwise rerun npm --prefix electron run package first
G=/tmp/dhara-gate-pkg; rm -rf "$G" && mkdir -p "$G"
gate() { local name="$1"; shift; local t0=$SECONDS; if "$@" >"$G/$name.log" 2>&1; then echo PASS >"$G/$name.status"; else echo FAIL >"$G/$name.status"; fi; echo "$name: $(cat "$G/$name.status") $((SECONDS - t0)) s"; }
gate web-ci npm --prefix web ci
gate web-build npm --prefix web run build
gate web-test npm --prefix web test
gate web-e2e npm --prefix web run e2e
gate electron-ci npm --prefix electron ci                 # replaces the Electron dist (as the package build's npm ci did) …
gate link-sandbox node electron/scripts/link-sandbox.mjs  # … and the e2e needs the root-owned helper back before electron test
gate electron-test npm --prefix electron test
gate pytest .venv/bin/python -m pytest
grep -Eil '[0-9]+ (skipped|xfailed|xpassed|flaky|todo)' "$G"/*.log && echo "a log reports skipped/flaky/todo — treat as FAIL"
grep -l FAIL "$G"/*.status ; echo "(expect nothing above)"
grep -E 'Tests .* passed|^ *[0-9]+ passed' "$G"/web-test.log "$G"/web-e2e.log "$G"/electron-test.log "$G"/pytest.log | tail -6
```
Expected: eight `PASS` lines (the same eight commands, in order, as the gate line recorded in TEST_REPORT.md and the README Verification block), no skipped/flaky/todo match (the packaged spec and the `[packaged]` pytest cases ran), nothing from the FAIL grep. On a FAIL: read the log; a `net::ERR_NETWORK_CHANGED` page load under the wifi churn recorded in TEST_REPORT.md is an infrastructure attempt and the segment is rerun; a code fault is fixed in the owning task's files with a one-line `fix: …` commit, and the whole gate restarts.

- [ ] **Step 5: Tag, test report, manifest, hand-off**

```bash
cd /home/p4nic/code/noema
git status --porcelain --untracked-files=no          # empty
git tag -f cutover-gate
grep -c '^### Handbook §21 main-app memory · measured 2026-10-12$' docs/TEST_REPORT.md     # 1
```
Insert the paragraph below immediately before the `### Handbook §21 main-app memory · measured 2026-10-12` heading (blank line on each side), filling the bracketed values from Task 6 Step 2 and Step 4 of this task (the tool summary lines, as the Phase 6 paragraph above it does):
```markdown
Packaging (the AppImage): one run of the same eight commands as separate segments (`npm --prefix electron ci` replaced the Electron dist the package build had installed and `link-sandbox.mjs` restored the root-owned helper) on `<git rev-parse --short HEAD>`, where `cutover-gate` now points, 2026-10-13, with `release/out/Dhara-0.1.0-x86_64.AppImage` present, so `electron/e2e/packaged.spec.ts` and the ten `[packaged]` cases of `tests/test_managed_service.py` ran instead of skipping; no log has a skipped count. Environment: Node v22.23.3, Python 3.12.3, Electron 44.7.0, PyInstaller 6.22.3 + hooks-contrib 2026.8, appimagetool 1.9.1, type2-runtime 20251108. Results: web ci + build <added N packages, built in Ns · s>; web test <Tests N passed (N) · s>; web e2e <N passed (m) · s>; electron ci + link-sandbox <added N packages, installed root-owned sandbox helper used · s>; electron test <Tests N passed (N); N passed (m) · s>; pytest <N passed, 1 warning · s>. Build: `npm --prefix electron run package` in <wall time>; frozen service <size>, AppDir <size>, AppImage <size> (<bytes> bytes); self-check passed; the corrupted-cache check failed loudly as designed. Sandbox on this host: user namespaces are restricted (`unshare -Ur true` fails), so the launcher used `/opt/google/chrome/chrome-sandbox` through `CHROME_DEVEL_SANDBOX`. Owner run of the §1 success lines: <outcome>.
```
```bash
grep -c '^Packaging (the AppImage): one run of the same eight commands' docs/TEST_REPORT.md     # 1
.venv/bin/python -m pytest tests/test_cutover_docs.py tests/test_rename_gate.py -q
git add docs/TEST_REPORT.md
git commit -m "docs(test-report): record the packaging gate run"
git ls-files -z | grep -zvx 'SHA256SUMS' | xargs -0 sha256sum > SHA256SUMS
sha256sum -c --quiet SHA256SUMS && echo hashes-ok
test "$(wc -l < SHA256SUMS)" -eq "$(git ls-files | grep -vxc 'SHA256SUMS')" && echo count-ok
grep -c '  release/build.sh$' SHA256SUMS; grep -c '  release/launch.cjs$' SHA256SUMS
git add SHA256SUMS
git commit -m "chore: regenerate SHA256SUMS after the packaging gate"
git diff --name-only cutover-gate..HEAD              # docs/TEST_REPORT.md and SHA256SUMS only
git log --oneline e2a8e9e..HEAD
git merge-base --is-ancestor HEAD master && echo MERGED-STOP || echo unmerged
```
Expected: `1`, green, `hashes-ok`, `count-ok`, `1`, `1`, exactly the two file names, the commit list (the owner's `feat(run)` and `feat(speech)` commits plus this plan's nine), `unmerged`. Report to the owner: the commit list, the artifact path and sizes, the pinned versions and hashes, the eleven deviations above (1–4 and 11 come from the pre-flight findings), and that the gate rule now needs `release/out` populated. Do not merge.

---

## Spec coverage

| Spec item | Task |
|---|---|
| §1 Goal: one file, no npm/venv/build/sandbox steps; dev flows unchanged | 5 (build), 1 (defaults; `null` facts untouched), 7 (docs) |
| §1 Success: `build.sh` produces the AppImage; no-argument start on an empty workspace; `--data-dir …/.data` opens the notes; gate green; packaged e2e under the private Sway | 6 Steps 2, 7 (owner), 7 Step 4, 6 Step 4 |
| §1 Out of scope (`.deb`, macOS/Windows, auto-update, signing, speech, kitten, system-wide) | untouched; `.deb` and release checklist rows in 7 Step 2 |
| §2 Electron 44.7.0 runtime copied as-is, `default_app.asar` removed | 5 (`cp -a`, `rm -f …default_app.asar`, self-check) |
| §2 Shell app at `resources/app` (`package.json`, `dist`, `static`), no asar | 5 |
| §2 Frozen service, one directory, at `resources/service/dhara-service/` | 4 (spec file), 5 (copy) |
| §2 Web bundle as data at `web/dist`, `ROOT/'web'/'dist'` unchanged | 4 (`datas`), pre-flight (served `/`), 5 self-check (`_internal/web/dist/index.html`) |
| §2 Sandbox helper shipped as the source for the install line | 5 (`resources/chrome-sandbox`, deviation 1), 3 (`bundledHelper`) |
| §2 Launcher `resources/launch.cjs` | 3, 5 |
| §2 Desktop entry and icon (`release/dhara.desktop`, `web/public/icon.svg`) | 5 |
| §2 Compressed size ≈ 110–130 MB; AI external; speech absent | pre-flight 131,172,856 bytes; 7 docs |
| §3 step 1 web build (unchanged commands) | 5 |
| §3 step 2 `pip install -e '.[release]'`, exact 6.x pin recorded in `pyproject.toml`; `appimagetool` pin + SHA-256 | 4 (extra), 5 (pins), pre-flight record |
| §3 step 3 `pyinstaller release/dhara-service.spec --noconfirm --distpath release/out/service`, name, datas, hidden imports, pydantic by hooks | 4, 5 (plus `--workpath`, deviation 9) |
| §3 step 4 Electron ci + build | 5 |
| §3 step 5 AppDir layout, binary renamed `dhara`, `AppRun`, `dhara.desktop`, `dhara.svg`, `.DirIcon` | 5 (helper path per deviation 1; `AppRun` file per deviation 8) |
| §3 step 6 pinned `appimagetool` into `release/cache/`, SHA-256 verified, static type-2 runtime via `--runtime-file`, version from `electron/package.json` equal to `pyproject.toml` or fail | 5 (`fetch`, version check), 4 (`test_versions_match…`), 6 Step 4 (loud failure) |
| §3 step 7 self-check: extract, manifest, `dhara-service --help`, Electron version, sizes, non-zero on a miss | 5 (deviation 3 for the version read) |
| §3 `release/out/`, `release/cache/` ignored; not in the gate; `npm --prefix electron run package` alias; docs name it | 5, 7 |
| §4 `PackagedFacts`, fifth `parseArgs` argument, `main.ts` passes `app.isPackaged ? … : null` with XDG data home | 1 |
| §4 defaults table (`manageService`, `dataDir`, `python`, `entryPoint`) | 1 (deviation 4 for the last two) |
| §4 every explicit flag wins | 1 tests |
| §4 `ManagedService` spawns `[python, ...args]` when `entryPoint` is empty; arguments, protocol, exit codes, messages unchanged | 2 |
| §4 workspace 0700 by `prepareWorkspace`; `app.isPackaged` true because the binary is `dhara`; `devTools` off; `userArgv` non-default form | 5 (`mv … dhara`), 6 (0700 assertion, `--manage-service` reaching cli.ts) |
| §4 README states the default workspace path and `--data-dir` | 7 Step 2 |
| §5 launcher runs under `ELECTRON_RUN_AS_NODE=1` before Chromium | 5 (`AppRun`), 3 |
| §5 rule 1 `CHROME_DEVEL_SANDBOX` | 3 (`rule 1`) |
| §5 rule 2 `unshare -Ur true`; missing `unshare` = no namespaces (§10) | 3 (`rule 2`, `facts.userns` comment) |
| §5 rule 3 first root-owned setuid file among the user and system helpers | 3 (`rule 3`, `ignores a helper that is not root-owned or not setuid`) |
| §5 rule 4 exact message, exit 3, `~/.local/share/dhara/` created 0700 | 3 (`rule 4`; the first and third lines verbatim, the command line for the user-owned copy per deviation 11) |
| §5 spawn with `ELECTRON_RUN_AS_NODE` removed, no app path argument, exit with the child's code | 3 (`decide` drops the variable; `main`), 6 (exit 0) |
| §5 injected facts, unit-tested without root | 3 (deviation 5) |
| §5 `--no-sandbox` refused with the exact message, exit 3 | 3 (`refuses --no-sandbox`), 6 (no sandbox complaint) |
| §6 entry `run.py`, `console=True`, one directory; stdlib/ctypes guarantees kept; `web/dist` found via `ROOT`; env reads unchanged | 4, pre-flight, 6 Step 3 |
| §6 speech absent: `capabilities.speech` false; 409 clause, one string, one test | 4 (`test_transcribe_off_names_the_setup_commands`, one more needle), pre-flight |
| §6 frozen binary through the managed-service suite a second time; `DHARA_SERVICE_CMD`; skipped with a reason when absent | 4 (deviation 6), 6 Step 3 |
| §7 startup failures keep messages and overlay; the launcher adds exactly its messages | 2 (unchanged `MESSAGES`), 3 (deviation 2 adds the ownership line), 6 Step 7 |
| §7 `noema.sqlite3` guarded move; shims unchanged; origin `http://127.0.0.1:8765` | untouched code; 6 Step 7 |
| §7 default workspace 0700 outside the AppImage; deleting the AppImage never touches notes | 1 (`dataHome`), 6, 7 docs |
| §7 second instance refused by the existing lock | untouched; 7 docs |
| §8 `cli.test.ts` rows | 1 |
| §8 `lifecycle*.test.ts` row (argv dump via the fake service) | 2 (`service-start.test.ts`, the file that already dumps argv) |
| §8 `launch.test.ts` row | 3 |
| §8 `test_managed_service.py` row | 4, 6 |
| §8 `test_core.py` row | 4 |
| §8 `packaged.spec.ts` row (identity protocol 2, SIGTERM, exit 0, lock released, 0700, skipped with a reason) | 6 (deviation 7: the AppImage itself, `--server` test port) |
| §8 script self-check row | 5 |
| §8 gate unchanged; e2e part of `npm --prefix electron test`; skips without the artifact | 6, 7 Step 4 (deviation 10) |
| §9 `docs/DESKTOP.md` section: build command, defaults, helper line, `--data-dir`, not included, FUSE note | 7 Step 1 |
| §9 README Install paragraph | 7 Step 2 |
| §9 `docs/PROGRESS.md` rows: `.deb` follow-on, release checklist | 7 Step 2 |
| §9 handbook conformance: no behaviour change; local-first placement documented; SECURITY sandbox rule restated | 7 Step 1 |
| §10 PyInstaller misses a dynamic import | pre-flight build and run; 4 hidden imports; 6 Step 3 |
| §10 download unavailable or changed | 5 `fetch` (pinned URL + hash, loud failure, cached copy reused); 6 Step 4 |
| §10 home mounted `nosuid` | 3 (system helper candidate; the rule-4 message's last line names it), 7 docs (`.deb`) |
| §10 version drift | 5 (build fails), 4 (`test_versions_match_between_pyproject_and_electron`) |
| §10 `unshare` absent | 3 |
