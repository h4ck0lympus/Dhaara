# Phase 4 — Electron shell and managed lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `electron/` desktop shell. It runs the same React bundle against the real FastAPI origin in a sandboxed, origin-locked window. In external mode it only loads `--server`. In managed mode (Linux) it owns one Python service through launch protocol 2. That mode covers spawn, lease, readiness, identity, a fixed port, the starting/loaded/crashed/stopping state machine, process-group cleanup, the checkpoint close contract and a local startup/crash page. This phase also replaces protocol 1 in `noema/desktop_service.py` and `run.py`.

**Architecture:** `electron/src` is split into small modules:
- pure modules: `cli`, `paths`, `origin`, `profile`, `permissions`, `protocol` and the helpers in `lifecycle`;
- one process owner: `ManagedService` in `lifecycle.ts`, which uses Node `child_process` with `detached: true`; the leader's pid is the process-group id;
- Electron wiring: `navigation`, `close` and `main`.

`main.ts` holds the window state machine and is the only module that touches `app` or `WebContentsView` (`close.ts` listens on `ipcMain` for the close approval only). Python's `desktop_service.managed()` returns exit codes 10, 11 and 12 and prints one protocol-2 acknowledgement after uvicorn is serving. The tests are layered:
- Vitest covers the pure modules and the owner. It uses a Python fake service plus the real `run.py`.
- pytest covers the Python side.
- Playwright `_electron` covers the shell end to end against the real service.

**Tech Stack:** Electron 44.7.0, TypeScript 5.9.3 (`module NodeNext`), Vitest 5.0.3 (Node environment, `forks` pool), @playwright/test 1.64.0 (`_electron`), Node 22.23.3, Python 3.12, uvicorn 0.48 and pytest.

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §2 rows 1A, 5A/15B; §3 Toolchain and Gate commands; §6.3; §6.4; §8 "Electron", "Lifecycle" and "Python"; §10 rows "Another process takes 8765" and "Permission decisions are not persisted") · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

## Prerequisites (which earlier phase files must be complete)

The sibling plans are named by spec phase, not by contract id (the same note as `04-terrain.md`): `01-foundation.md` = contract P1 (+ the P2 data layer), `02-screens-core.md` = contract P3 shell + Overview/Tasks, `03-screens-capture-notes.md` = contract P4 Capture/Notes/Settings, `04-terrain.md` = contract P5. This plan is the Electron half of contract P6; `06-cutover.md` is the other half.

- `01-foundation.md` (P1 + P2) complete. This phase needs:
  - the `feat/react-electron` branch;
  - the `.gitignore` entries for `electron/node_modules` and `electron/dist`;
  - `create_app(data_dir=None, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None)`;
  - `web/e2e/server.ts` (`startNoema`, `getFreePort`, `NoemaServer`; it imports only Node built-ins, so the Electron Playwright runner can import it);
  - `web/src/events.ts` (contract §1.3);
  - the P2 draft stores, outbox and `connection` (`noema:service-down` sets connected false; `noema:service-up` refetches the snapshot);
  - a built `web/dist` (`npm --prefix web ci && npm --prefix web run build`). The managed service and every Electron e2e test serve it.
- `02-screens-core.md` (P3) complete: `StatusLine` labels "Server connected" and "Offline · local drafts", toasts, Tasks at `#/plan` with the `.page-heading` "Add task" button and the "Add task" dialog whose textarea is `#task-input`.
- `03-screens-capture-notes.md` (P4) complete: the Capture screen at `#/capture` with one `<textarea>` writing surface, a "Save note" button and image paste.
- **The page-side close checkpoint must exist before Task 12.** Contract §6.3/§6.5 define `web/src/shell/checkpoint.ts` (`installCheckpointClose()`, which sets `window.__noemaCheckpointCloseReady = true`) and `main.tsx` §6.6 step 4 calls it after both draft stores loaded. `02-screens-core.md` defers it to Phase 2b, and `03-screens-capture-notes.md` Task 14 creates it and adds the call to `main.tsx`. Check before Task 12:
  ```bash
  grep -n "export function installCheckpointClose" web/src/shell/checkpoint.ts && grep -n "installCheckpointClose()" web/src/main.tsx
  ```
  Expected: two matching lines. If either is missing, `03-screens-capture-notes.md` Task 14 has not been executed: stop and run it first. This phase does not own `web/src/**` (contract §10) and must not create it.
- The terrain plan is **not** required. Nothing here depends on `BackgroundField`. (`04-terrain.md` Task 9 runs after this plan and launches `electron/` with `--server` and `--profile`.)
- Machine setup, done once by the executor:
  - `.venv` exists, with `.venv/bin/python -m pytest` working.
  - **Electron e2e needs a display.** Never use the user's own session config. Use a private headless Sway, from the repo root:
    ```bash
    WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 sway -c qa/sway.config >/dev/null 2>&1 &
    sleep 1; export WAYLAND_DISPLAY=$(ls -t "$XDG_RUNTIME_DIR" | grep -m1 -E '^wayland-[0-9]+$'); unset DISPLAY
    ```
  - **Chromium sandbox:** Electron needs a root-owned `4755` `chrome-sandbox`, and `--no-sandbox` is never used. Task 1 adds `electron/scripts/link-sandbox.mjs`, a port of `experiments/ui-ab/scripts/launch.py:20-31`. If the script cannot fix the helper, it prints the exact `sudo` command; ask the owner to run it.
- Commands below run from the repo root `/home/p4nic/code/noema`. Every `git commit` message must end with the attribution trailer that the executing session supplies (contract §0).

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- Exact versions with lockfiles in `electron/`: `electron` 44.7.0, `typescript` 5.9.3, `@types/node` 22.18.10, `vitest` 5.0.3, `@playwright/test` 1.64.0, `node` 22.23.3; `"engines": {"node": "^22.22.2"}`.
- CLI: `--server` (default `http://127.0.0.1:8765`), `--profile DIR`, `--manage-service`, `--data-dir PATH`, `--python PATH`, `--entry-point PATH`, `--startup-timeout S` (0.1–60, default 15).
- `--server` must be a loopback IP literal over http, with no credentials, path, query or fragment. This is a port of `validate_server` with its unit tests.
- With `--manage-service`, `--server` must be exactly `http://127.0.0.1:8765`. `--data-dir` without `--manage-service` is rejected.
- Paths are resolved to absolute paths against the current directory, as in `desktop/src/main.rs:79-91`.
- Profile: `--profile`, or `$XDG_DATA_HOME/noema/electron` (default `~/.local/share/noema/electron`). Mode 0700.
- `app.setPath('userData', …)` runs **before** `requestSingleInstanceLock()`, and both run before `ready`. Chromium's ProcessSingleton is the profile lock.
- A second instance focuses the existing window, ignores its own arguments and exits 0. Tests always use a throwaway `--profile`.
- webPreferences: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, devtools off in packaged builds; never `--no-sandbox`.
- `will-navigate`, `will-redirect` and `will-frame-navigate` allow same-origin only. URL parse errors are denied.
- `setWindowOpenHandler` always denies. http(s) links with a host and no credentials go to `shell.openExternal`.
- `will-attach-webview` is denied. Downloads are allowed only for same-origin or `blob:<origin>`.
- `'media'` is granted only when `mediaTypes` is exactly `['audio']`, from the main frame, at the trusted origin. Anything that includes `'video'` is denied. `'notifications'` follows the same main-frame and origin rule.
- Each of those two shows a `dialog.showMessageBox` prompt. Everything else is denied.
- **Decisions are remembered for the app session only** (in memory). The check handler returns the remembered decision for those two and `false` for everything else.
- The main window preload exposes only `window.ipc.postMessage(msg)` and accepts only `'noema:close-approved'` from the main frame at the trusted origin. The startup page preload exposes `retry()` and `cancel()`.
- Close: if `did-finish-load` has not happened, `__noemaCheckpointCloseReady` is not set, or the renderer is gone, the window closes without touching storage.
- Close: after approval, main calls `win.destroy()`. If there is no answer within 10 s (an unresponsive renderer), a native dialog offers "Force close" or "Keep open".
- Spawn: `<python> <entry-point> --desktop-managed --host 127.0.0.1 --port <p> --data-dir <canonical> --owner-pid <electron pid>`, with `detached: true` and `stdio: ['pipe','pipe','ignore']`.
- The environment is stripped of `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`, `NOEMA_TOKEN`, `NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`, `NOEMA_ALLOW_REMOTE_MODEL` and `NOEMA_DATA_DIR`.
- Lease: `{"instance":"<64 hex>"}\n`, written to stdin; stdin stays open as the lifetime lease. Python reads ≤ 2048 bytes.
- `<p>` is always 8765. A test-only override exists only when `NOEMA_ELECTRON_TEST=1`; it is not reachable from the CLI.
- Python order: `prctl(PR_SET_PDEATHSIG, SIGTERM)` → `getppid() != --owner-pid` exit → lease → `.noema-service.lock` flock (`O_NOFOLLOW`, 0600) → `SO_REUSEADDR=1` (never `SO_REUSEPORT`) bind+`listen()` → stdin-EOF watcher → import and `uvicorn.Server.run(sockets=[sock])` → one line `{"protocol":2,"instance","pid","workspace","port"}`.
- Exit codes: 10 workspace locked, 11 port in use, 12 invalid lease or arguments, other → generic startup failure.
- Readiness: Electron reads stdout as raw bytes up to the first `\n` or 4096 bytes within `--startup-timeout`, then destroys the stream. No extra keys are allowed.
- `GET /api/desktop-instance` must return exactly `{protocol:2, instance, pid}` (never the workspace). Only then is the origin loaded.
- If the port is in use, the result is exit 11 with Retry. The occupant is never contacted or killed.
- States: `starting` → `loaded` → `crashed` → `stopping`. Retries are serialised, and Retry never spawns while a service process is alive.
- Crash: main dispatches `noema:service-down` (not `offline`). A `WebContentsView` overlay loading `startup.html` shows Retry/Quit. A successful Retry dispatches `noema:service-up` with no reload. Quit runs the checkpoint first.
- Stopping: close stdin → wait 5 s → SIGTERM `-pgid` → wait 1 s → SIGKILL `-pgid` → reap. ESRCH counts as success. Group cleanup always runs after `exit` is observed.
- Removed: protocol 1 in Python (the fd 3 socket, the fstat(4) lock check and the protocol 1 identity). `test_public_handshake_does_not_authorize_api` is updated to protocol 2.
- Gate (contract §0, full gate from this phase on): `npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && npm --prefix electron test && .venv/bin/python -m pytest`. `npm --prefix electron test` runs the build, Vitest (lifecycle) and Playwright `_electron`.

## Review Focus (the five input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Hostile or look-alike URLs and web-content requests.** The cases are:
   - off-origin, `localhost`-for-`127.0.0.1` and credentialed navigations;
   - redirects and subframes;
   - `data:`/`file:`/`javascript:` popups;
   - credentialed external links;
   - non-origin downloads;
   - video or subframe permission requests.

   Owners: Task 1 (`origin.test.ts`), Task 5 (`permissions.test.ts`), Task 10 (`isolation.spec.ts`) and Task 11 (`permissions.spec.ts`).
2. **A forged or wrong managed service.** The cases are:
   - an acknowledgement with extra keys, a wrong instance, pid or workspace, or an oversized line;
   - an HTTP identity mismatch;
   - an impostor occupying the port;
   - an external `run.py` already on the workspace.

   In every case the origin is never loaded, the occupant is never contacted and the owned process is stopped. Owners: Task 2 (`ackMatches`/`identityMatches`), Task 7 (`service-start.test.ts`), Task 8 (`service-parity.test.ts`) and Task 13 (`managed.spec.ts`).
3. **Process death at awkward moments.** The cases are:
   - owner SIGKILL before and after the lease watcher;
   - Python SIGKILL with a live grandchild;
   - rapid repeated Retry clicks during crash cleanup;
   - Cancel during startup;
   - an Electron SIGKILL.

   No orphans may remain, and nothing may restart without an explicit Retry. Owners: Task 6, Task 7 (`service-stop.test.ts`), Task 8 and Task 14 (`scenario.spec.ts`).
4. **Closing with unsaved or in-flight work.** The cases are:
   - a draft typed less than 350 ms before close;
   - a capture save in flight;
   - a failed draft write;
   - an unresponsive renderer (and a responsive page that refuses must never get the not-responding dialog);
   - a close during boot;
   - Quit from the crash overlay.

   Owners: Task 12 (`close.spec.ts`), Task 13 and Task 14.
5. **Command-line and path input.** The cases are:
   - non-loopback, `localhost`, `::ffff:` or empty-query `--server` values;
   - `--data-dir` of `''`, `/`, `x/..`, a file, a symlink, or an unwritable parent;
   - an out-of-range or non-numeric timeout;
   - unknown flags and missing values;
   - a test port override without the flag.

   Owners: Task 2, Task 3 (`cli.test.ts`), Task 4 (`profile.test.ts`), Task 6 (pytest exit codes) and Task 13 (CLI exit-2 e2e).

---

### Task 1: Electron package scaffold and origin checks (port of `desktop/src/lib.rs:12-56`)

**Files:**
- Create: `electron/package.json`, `electron/package-lock.json` (generated by npm), `electron/tsconfig.json`, `electron/vitest.config.ts`
- Create: `electron/scripts/link-sandbox.mjs` (port of `experiments/ui-ab/scripts/launch.py:20-31`)
- Create: `electron/src/origin.ts`
- Test: `electron/test/origin.test.ts` (port of `desktop/src/lib.rs:127-163`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sameOrigin(server: string, target: string): boolean`
  - `downloadAllowed(server: string, target: string): boolean`
  - `externalLinkAllowed(target: string): boolean`
  - npm scripts `build`, `start`, `unit`, `e2e` and `test` (contract §8.1)

- [ ] **Step 1: Write the package manifest, TypeScript and Vitest config**

`electron/package.json`:
```json
{
  "name": "noema-electron",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "engines": { "node": "^22.22.2" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "npm run build && electron .",
    "unit": "vitest run",
    "e2e": "playwright test",
    "test": "npm run build && npm run unit && npm run e2e"
  },
  "devDependencies": {
    "@playwright/test": "1.64.0",
    "@types/node": "22.18.10",
    "electron": "44.7.0",
    "node": "22.23.3",
    "typescript": "5.9.3",
    "vitest": "5.0.3"
  }
}
```

`electron/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`electron/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Child processes: PR_SET_PDEATHSIG follows the spawning *thread*, so tests spawn from a forked
    // worker's main thread, never from a worker_threads pool.
    pool: 'forks',
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
```

- [ ] **Step 2: Install with exact versions and commit the lockfile**

Run: `npm --prefix electron install --no-audit --no-fund`
Expected: `added … packages`; `electron/package-lock.json` exists; `electron/node_modules/electron/dist/electron` exists.

- [ ] **Step 3: Add the sandbox-helper script and run it**

`electron/scripts/link-sandbox.mjs`:
```js
// Linux: Chromium's setuid sandbox helper must be root-owned 4755; Noema never uses --no-sandbox (spec §6.3).
// Port of experiments/ui-ab/scripts/launch.py:20-31: reuse an installed root-owned helper if one exists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/electron/dist/chrome-sandbox');
const SYSTEM_HELPER = '/opt/google/chrome/chrome-sandbox';
const configured = (file) => {
  try {
    const info = fs.statSync(file);
    return info.isFile() && info.uid === 0 && (info.mode & 0o4777) === 0o4755;
  } catch {
    return false;
  }
};

if (process.platform !== 'linux' || configured(helper)) process.exit(0);
if (!configured(SYSTEM_HELPER)) {
  console.error(`Electron needs a root-owned 4755 sandbox helper. Run: sudo chown root:root ${helper} && sudo chmod 4755 ${helper}`);
  process.exit(1);
}
const backup = `${helper}.bundled`;
if (fs.existsSync(backup)) fs.rmSync(helper, { force: true });
else fs.renameSync(helper, backup);
fs.symlinkSync(SYSTEM_HELPER, helper);
console.log('Using the installed root-owned Chromium sandbox helper; the bundled helper is preserved.');
```

Run: `node electron/scripts/link-sandbox.mjs`
Expected: exit 0. It prints either nothing (the helper is already configured) or "Using the installed root-owned Chromium sandbox helper…". If it exits 1, ask the owner to run the printed `sudo` command, then rerun the script.

- [ ] **Step 4: Write the failing origin test**

`electron/test/origin.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { downloadAllowed, externalLinkAllowed, sameOrigin } from '../src/origin.js';

const BASE = 'http://127.0.0.1:8765';

describe('sameOrigin (lib.rs:127-142)', () => {
  it('allows the service origin, including hash routes', () => {
    expect(sameOrigin(BASE, 'http://127.0.0.1:8765/#capture')).toBe(true);
    expect(sameOrigin(BASE, 'http://127.0.0.1:8765/#/note/abc')).toBe(true);
  });

  it.each([
    'http://127.0.0.1:9000/',
    'http://localhost:8765/',
    'http://127.0.0.1.evil.com:8765',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,x',
    'http://user@127.0.0.1:8765',
    'http://:secret@127.0.0.1:8765/',
    'https://127.0.0.1:8765/',
    'not a url',
    '',
  ])('denies %j', (target) => {
    expect(sameOrigin(BASE, target)).toBe(false);
  });

  it('denies everything when the server itself does not parse', () => {
    expect(sameOrigin('nope', 'http://127.0.0.1:8765/')).toBe(false);
  });
});

describe('downloadAllowed (lib.rs:143-150)', () => {
  it('allows service URLs and service blobs', () => {
    expect(downloadAllowed(BASE, 'blob:http://127.0.0.1:8765/abcd')).toBe(true);
    expect(downloadAllowed(BASE, 'http://127.0.0.1:8765/api/export')).toBe(true);
  });

  it.each([
    'blob:https://example.com/abcd',
    'file:///etc/passwd',
    'data:text/plain,x',
    'blob:null/abcd',
    'http://127.0.0.1:9000/api/export',
  ])('denies %j', (target) => {
    expect(downloadAllowed(BASE, target)).toBe(false);
  });
});

describe('externalLinkAllowed (lib.rs:151-163)', () => {
  it.each(['https://example.com/session', 'http://example.com/'])('allows %j', (target) => {
    expect(externalLinkAllowed(target)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'file:///tmp/file',
    'mailto:a@b.c',
    'https://token@example.com',
    'https://:pw@example.com/',
    'data:text/html,x',
    'ftp://example.com/',
    'not a url',
  ])('denies %j', (target) => {
    expect(externalLinkAllowed(target)).toBe(false);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm --prefix electron run unit -- test/origin.test.ts`
Expected: FAIL — `Failed to load url ../src/origin.js`.

- [ ] **Step 6: Implement `origin.ts`**

`electron/src/origin.ts`:
```ts
// Ports of desktop/src/lib.rs:31-56. Node's WHATWG URL parser matches the Rust url crate used there.

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function sameOrigin(server: string, target: string): boolean {
  const base = parse(server);
  const url = parse(target);
  return base !== null && url !== null && url.username === '' && url.password === ''
    && base.origin !== 'null' && url.origin === base.origin;
}

export function downloadAllowed(server: string, target: string): boolean {
  return sameOrigin(server, target) || (target.startsWith('blob:') && sameOrigin(server, target.slice('blob:'.length)));
}

export function externalLinkAllowed(target: string): boolean {
  const url = parse(target);
  return url !== null && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
    && url.username === '' && url.password === '';
}
```

- [ ] **Step 7: Run the test and the build**

Run: `npm --prefix electron run unit -- test/origin.test.ts && npm --prefix electron run build`
Expected: PASS (all origin cases). The build exits 0 and writes `electron/dist/origin.js`.

- [ ] **Step 8: Commit**

```bash
git add electron/package.json electron/package-lock.json electron/tsconfig.json electron/vitest.config.ts electron/scripts/link-sandbox.mjs electron/src/origin.ts electron/test/origin.test.ts
git commit -m "chore(electron): scaffold the Electron package and port origin checks"
```

---

### Task 2: Path helpers and pure lifecycle helpers

**Files:**
- Create: `electron/src/paths.ts`. This is a local module (contract gap): profile and workspace share these rules.
- Create: `electron/src/lifecycle.ts`. This task writes the helpers only; Task 7 appends `ManagedService`.
- Test: `electron/test/paths.test.ts`, `electron/test/lifecycle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`paths.ts`):
  - `absolutePath(value: string, cwd: string): string`. It joins without normalising. `''` stays `''`.
  - `hasFinalComponent(value: string): boolean`. It is false for `''`, `/`, and a final segment of `.` or `..`.
  - `ensurePrivateDir(dir: string): 'create' | 'protect' | null`. It runs `mkdir -p` with 0700, chmods only when the directory is new, and returns the failing step or `null`.
- Produces (`lifecycle.ts`), with names from contract §8.2:
  - `DEFAULT_MANAGED_PORT`, `STOP_GRACE_MS`, `TERM_GRACE_MS`, `ACK_MAX_BYTES`, `STRIPPED_ENV`
  - `LifecycleCode`. It adds `'crashed'` to the contract union; this is a local gap.
  - `class LifecycleError(code, message)`
  - `MESSAGES`. It adds `cancelled: 'Managed startup was cancelled.'`; this is a local gap.
  - `managedPort(env)`
  - `prepareWorkspace(dataDir, cwd): string`
  - `exitCodeError(code)`
  - `ackMatches(line, expected)`
  - `identityMatches(body, expected)`

- [ ] **Step 1: Write the failing path tests**

`electron/test/paths.test.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from '../src/paths.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noema-paths-'));
const mode = (file: string) => fs.statSync(file).mode & 0o777;

describe('absolutePath (main.rs:79-86)', () => {
  it('joins relative paths to cwd without normalising', () => {
    expect(absolutePath('ws/..', '/home/u')).toBe('/home/u/ws/..');
    expect(absolutePath('ws', '/')).toBe('/ws');
    expect(absolutePath('ws', '/home/u/')).toBe('/home/u/ws');
    expect(absolutePath('/abs/ws', '/home/u')).toBe('/abs/ws');
  });

  it('keeps an empty value empty so it is still rejected later', () => {
    expect(absolutePath('', '/home/u')).toBe('');
  });
});

describe('hasFinalComponent (Rust Path::file_name)', () => {
  it.each(['/a/b', 'b', '/a/b/'])('accepts %j', (value) => {
    expect(hasFinalComponent(value)).toBe(true);
  });

  it.each(['', '/', '/a/..', '..', '.', '/a/.'])('rejects %j', (value) => {
    expect(hasFinalComponent(value)).toBe(false);
  });
});

describe('ensurePrivateDir (lib.rs:79-87, service.rs:57-64)', () => {
  it('creates a missing directory with mode 0700', () => {
    const dir = path.join(temp(), 'new');
    expect(ensurePrivateDir(dir)).toBeNull();
    expect(mode(dir)).toBe(0o700);
  });

  it('never chmods an existing directory', () => {
    const dir = temp();
    fs.chmodSync(dir, 0o755);
    expect(ensurePrivateDir(dir)).toBeNull();
    expect(mode(dir)).toBe(0o755);
  });

  it('reports create for a path that is a file', () => {
    const file = path.join(temp(), 'file');
    fs.writeFileSync(file, 'x');
    expect(ensurePrivateDir(file)).toBe('create');
  });

  it.skipIf(process.getuid?.() === 0)('reports create under an unwritable parent', () => {
    const parent = temp();
    fs.chmodSync(parent, 0o500);
    try {
      expect(ensurePrivateDir(path.join(parent, 'child'))).toBe('create');
    } finally {
      fs.chmodSync(parent, 0o700);
    }
  });
});
```

- [ ] **Step 2: Write the failing lifecycle-helper tests**

`electron/test/lifecycle.test.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANAGED_PORT, LifecycleError, MESSAGES, ackMatches, exitCodeError, identityMatches, managedPort, prepareWorkspace,
} from '../src/lifecycle.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noema-workspace-'));
const INSTANCE = 'a'.repeat(64);
const EXPECTED = { instance: INSTANCE, pid: 4242, workspace: '/data/ws', port: 8765 };
const ack = (changes: Record<string, unknown> = {}) => JSON.stringify({ protocol: 2, ...EXPECTED, ...changes });

function thrown(run: () => unknown): LifecycleError {
  try {
    run();
  } catch (error) {
    if (error instanceof LifecycleError) return error;
    throw error;
  }
  throw new Error('Expected a LifecycleError');
}

describe('managedPort', () => {
  it('is 8765 unless the explicit test flag is set', () => {
    expect(managedPort({})).toBe(DEFAULT_MANAGED_PORT);
    expect(managedPort({ NOEMA_ELECTRON_TEST_PORT: '9100' })).toBe(8765);
    expect(managedPort({ NOEMA_ELECTRON_TEST: 'yes', NOEMA_ELECTRON_TEST_PORT: '9100' })).toBe(8765);
    expect(managedPort({ NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: '9100' })).toBe(9100);
  });

  it('accepts the bounds 1024 and 65535', () => {
    expect(managedPort({ NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: '1024' })).toBe(1024);
    expect(managedPort({ NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: '65535' })).toBe(65535);
  });

  it.each(['', '80', '1023', '65536', '9100x', ' 9100', '9.5', '-9100'])('ignores the invalid test port %j', (value) => {
    expect(managedPort({ NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: value })).toBe(8765);
  });
});

describe('prepareWorkspace (service.rs:53-66, spec §6.4.1)', () => {
  it('resolves against cwd, creates the directory 0700 and returns the canonical path', () => {
    const cwd = temp();
    const workspace = prepareWorkspace('ws', cwd);
    expect(workspace).toBe(fs.realpathSync(path.join(cwd, 'ws')));
    expect(fs.statSync(workspace).mode & 0o777).toBe(0o700);
  });

  it('leaves an existing directory mode alone', () => {
    const cwd = temp();
    fs.mkdirSync(path.join(cwd, 'ws'), { mode: 0o755 });
    fs.chmodSync(path.join(cwd, 'ws'), 0o755);
    prepareWorkspace('ws', cwd);
    expect(fs.statSync(path.join(cwd, 'ws')).mode & 0o777).toBe(0o755);
  });

  it('canonicalises a symlinked workspace', () => {
    const cwd = temp();
    fs.mkdirSync(path.join(cwd, 'real'));
    fs.symlinkSync(path.join(cwd, 'real'), path.join(cwd, 'link'));
    expect(prepareWorkspace('link', cwd)).toBe(fs.realpathSync(path.join(cwd, 'real')));
  });

  it.each(['', '/', 'ws/..', '.', '..'])('refuses %j: no final component', (value) => {
    const error = thrown(() => prepareWorkspace(value, temp()));
    expect([error.code, error.message]).toEqual(['workspace', MESSAGES.noDir]);
  });

  it('refuses a path that is a regular file', () => {
    const cwd = temp();
    fs.writeFileSync(path.join(cwd, 'file'), 'not a directory');
    const error = thrown(() => prepareWorkspace('file', cwd));
    expect([error.code, error.message]).toEqual(['workspace', MESSAGES.createDir]);
  });
});

describe('exitCodeError (spec §6.4.3 exit codes)', () => {
  it.each([
    [10, 'workspace-locked', MESSAGES.workspaceLocked],
    [11, 'port-in-use', MESSAGES.portInUse],
    [12, 'invalid-lease', MESSAGES.startupExit],
    [1, 'startup-exit', MESSAGES.startupExit],
    [null, 'startup-exit', MESSAGES.startupExit],
  ] as const)('maps %j', (code, expectedCode, message) => {
    const error = exitCodeError(code);
    expect([error.code, error.message]).toEqual([expectedCode, message]);
  });
});

describe('ackMatches (spec §6.4.4)', () => {
  it('accepts exactly the five expected keys and values', () => {
    expect(ackMatches(ack(), EXPECTED)).toBe(true);
  });

  it.each([
    ['an extra key', ack({ extra: true })],
    ['protocol 1', ack({ protocol: 1 })],
    ['another instance', ack({ instance: 'b'.repeat(64) })],
    ['another pid', ack({ pid: 1 })],
    ['a string pid', ack({ pid: '4242' })],
    ['another workspace', ack({ workspace: '/data/other' })],
    ['another port', ack({ port: 8766 })],
    ['a missing key', JSON.stringify({ protocol: 2, instance: INSTANCE, pid: 4242, workspace: '/data/ws' })],
    ['an array', '[]'],
    ['null', 'null'],
    ['not JSON', 'ready'],
  ])('rejects %s', (_label, line) => {
    expect(ackMatches(line, EXPECTED)).toBe(false);
  });
});

describe('identityMatches (spec §6.4.4)', () => {
  const expected = { instance: INSTANCE, pid: 4242 };

  it('accepts exactly {protocol:2, instance, pid}', () => {
    expect(identityMatches({ protocol: 2, instance: INSTANCE, pid: 4242 }, expected)).toBe(true);
  });

  it.each([
    ['the workspace', { protocol: 2, instance: INSTANCE, pid: 4242, workspace: '/data/ws' }],
    ['protocol 1', { protocol: 1, instance: INSTANCE, pid: 4242 }],
    ['another pid', { protocol: 2, instance: INSTANCE, pid: 1 }],
    ['another instance', { protocol: 2, instance: 'f'.repeat(64), pid: 4242 }],
    ['null', null],
  ])('rejects a body with %s', (_label, body) => {
    expect(identityMatches(body, expected)).toBe(false);
  });
});
```

- [ ] **Step 3: Run both test files and watch them fail**

Run: `npm --prefix electron run unit -- test/paths.test.ts test/lifecycle.test.ts`
Expected: FAIL — `Failed to load url ../src/paths.js` and `Failed to load url ../src/lifecycle.js`.

- [ ] **Step 4: Implement `paths.ts`**

`electron/src/paths.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';

/** Joins without normalising, so a trailing '..' still has no final component (main.rs:80-86). */
export function absolutePath(value: string, cwd: string): string {
  if (value === '' || path.isAbsolute(value)) return value;   // '' stays empty and is rejected by hasFinalComponent
  return `${cwd.replace(/\/+$/, '')}/${value}`;
}

/** Rust Path::file_name() is None for '', '/', and a final '.' or '..' (lib.rs:76, service.rs:54). */
export function hasFinalComponent(value: string): boolean {
  const last = path.basename(value);
  return last !== '' && last !== '.' && last !== '..';
}

/** mkdir -p with 0700; chmod only when newly created. Returns the failing step, or null. */
export function ensurePrivateDir(dir: string): 'create' | 'protect' | null {
  const existed = fs.existsSync(dir);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return 'create';
  }
  if (existed) return null;
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    return 'protect';
  }
  return null;
}
```

- [ ] **Step 5: Implement the lifecycle helpers**

`electron/src/lifecycle.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir, hasFinalComponent } from './paths.js';

export const DEFAULT_MANAGED_PORT = 8765, STOP_GRACE_MS = 5_000, TERM_GRACE_MS = 1_000, ACK_MAX_BYTES = 4_096;
export const STRIPPED_ENV = [
  'NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN', 'NOEMA_ALLOWED_HOSTS', 'NOEMA_ALLOW_REMOTE_MODEL', 'NOEMA_DATA_DIR',
] as const;

export type LifecycleCode = 'workspace' | 'workspace-locked' | 'port-in-use' | 'invalid-lease' | 'python-missing' | 'early-exit'
  | 'startup-exit' | 'timeout' | 'identity' | 'cancelled' | 'crashed';

export class LifecycleError extends Error {
  constructor(readonly code: LifecycleCode, message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

// Existing wording from desktop/src/service.rs (line numbers in contract §8.2).
export const MESSAGES = {
  workspaceLocked: 'This workspace already has a service. Use external mode or stop it deliberately.',
  portInUse: 'Endpoint is occupied or unavailable. Do not stop its occupant; choose external mode or a deliberate stable endpoint.',
  pythonMissing: 'Python not found. Check --python and installed dependencies; no installation is automatic.',
  earlyExit: 'Python exited before accepting the desktop lease.',
  startupExit: 'Service exited during startup. Check Python dependencies, entry point and data permissions.',
  timeout: 'Service readiness timed out. Check Python dependencies and data permissions, then Retry.',
  identity: 'Service identity verification failed. No workspace credentials were sent.',
  crashed: 'Managed service stopped unexpectedly. Your local draft stays in this window; Retry explicitly.',
  noDir: 'Choose a dedicated data directory.',
  createDir: 'Cannot create the data directory. Check its permissions.',
  protectDir: 'Cannot protect the data directory.',
  accessDir: 'Cannot access the data directory.',
  cancelled: 'Managed startup was cancelled.',
} as const;

/** 8765 always; a test-only override needs NOEMA_ELECTRON_TEST=1 and is unreachable from the CLI (spec §6.4.2). */
export function managedPort(env: NodeJS.ProcessEnv): number {
  if (env.NOEMA_ELECTRON_TEST !== '1') return DEFAULT_MANAGED_PORT;
  const raw = env.NOEMA_ELECTRON_TEST_PORT ?? '';
  const port = Number(raw);
  return /^[0-9]+$/.test(raw) && port >= 1024 && port <= 65535 ? port : DEFAULT_MANAGED_PORT;
}

/** Spec §6.4.1: resolve, refuse a path with no final component, create 0700, canonicalise. */
export function prepareWorkspace(dataDir: string, cwd: string): string {
  if (!hasFinalComponent(dataDir)) throw new LifecycleError('workspace', MESSAGES.noDir);
  const resolved = path.resolve(cwd, dataDir);
  const failed = ensurePrivateDir(resolved);
  if (failed === 'create') throw new LifecycleError('workspace', MESSAGES.createDir);
  if (failed === 'protect') throw new LifecycleError('workspace', MESSAGES.protectDir);
  try {
    return fs.realpathSync(resolved);
  } catch {
    throw new LifecycleError('workspace', MESSAGES.accessDir);
  }
}

export function exitCodeError(code: number | null): LifecycleError {
  if (code === 10) return new LifecycleError('workspace-locked', MESSAGES.workspaceLocked);
  if (code === 11) return new LifecycleError('port-in-use', MESSAGES.portInUse);
  if (code === 12) return new LifecycleError('invalid-lease', MESSAGES.startupExit);
  return new LifecycleError('startup-exit', MESSAGES.startupExit);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

export function ackMatches(line: string, expected: { instance: string; pid: number; workspace: string; port: number }): boolean {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return false;
  }
  return hasExactKeys(value, ['protocol', 'instance', 'pid', 'workspace', 'port']) && value.protocol === 2
    && value.instance === expected.instance && value.pid === expected.pid
    && value.workspace === expected.workspace && value.port === expected.port;
}

export function identityMatches(body: unknown, expected: { instance: string; pid: number }): boolean {
  return hasExactKeys(body, ['protocol', 'instance', 'pid']) && body.protocol === 2
    && body.instance === expected.instance && body.pid === expected.pid;
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm --prefix electron run unit -- test/paths.test.ts test/lifecycle.test.ts && npm --prefix electron run build`
Expected: PASS; the build exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/src/paths.ts electron/src/lifecycle.ts electron/test/paths.test.ts electron/test/lifecycle.test.ts
git commit -m "feat(electron): add workspace and protocol-2 identity helpers"
```

---

### Task 3: Command line (port of `desktop/src/main.rs:12-108` and `validate_server`)

**Files:**
- Create: `electron/src/cli.ts`
- Test: `electron/test/cli.test.ts` (port of `desktop/src/lib.rs:107-126` plus the `main.rs` rules)

**Interfaces:**
- Consumes: `managedPort` (Task 2) and `absolutePath` (Task 2).
- Produces:
  - `type CliOptions`
  - `class CliError`
  - `validateServer(value: string): string`
  - `parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv): CliOptions | 'help'`
- Produces (local gaps):
  - `userArgv(argv: readonly string[], defaultApp: boolean): string[]`. It returns the arguments after the app path, so Chromium and Playwright switches before that path are never parsed as Noema arguments.
  - `HELP_TEXT: string`
  - `DEFAULT_SERVER = 'http://127.0.0.1:8765'`

- [ ] **Step 1: Write the failing CLI test**

`electron/test/cli.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { CliError, DEFAULT_SERVER, HELP_TEXT, parseArgs, userArgv, validateServer } from '../src/cli.js';

const CWD = '/home/user/launch';
const REPO = '/repo';
const parse = (argv: string[], env: NodeJS.ProcessEnv = {}) => parseArgs(argv, CWD, REPO, env);
const realPlatform = process.platform;

function cliError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CliError) return error.message;
    throw error;
  }
  throw new Error('Expected a CliError');
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

describe('validateServer (lib.rs:12-29, tests 107-126)', () => {
  it('returns the origin of a literal loopback http URL', () => {
    expect(validateServer('http://127.0.0.1:8765/')).toBe('http://127.0.0.1:8765');
    expect(validateServer('http://[::1]:8765')).toBe('http://[::1]:8765');
    expect(validateServer('http://127.0.0.2:8765')).toBe('http://127.0.0.2:8765');
  });

  it.each([
    'http://localhost:8765',
    'https://127.0.0.1',
    'http://example.com',
    'http://192.168.1.1',
    'http://0.0.0.0:8765',
    'http://[::ffff:127.0.0.1]:8765',
    'http://[::2]:8765',
    'http://user:secret@127.0.0.1',
    'http://user@127.0.0.1',
    'http://127.0.0.1/api',
    'http://127.0.0.1?x',
    'http://127.0.0.1/?',
    'http://127.0.0.1#x',
    'http://127.0.0.1/#',
  ])('rejects %j', (value) => {
    expect(cliError(() => validateServer(value))).toBe('Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765');
  });

  it('keeps the Rust wording for an unparsable URL', () => {
    expect(cliError(() => validateServer('not a url'))).toBe('Invalid service URL');
  });
});

describe('userArgv', () => {
  it('drops Chromium/Node switches before the app path and the app path itself', () => {
    expect(userArgv(['/e', '--inspect=0', '--remote-debugging-port=0', '/x/dist/main.js', '--profile', 'p'], true)).toEqual(['--profile', 'p']);
    expect(userArgv(['/e', '.', '--manage-service'], true)).toEqual(['--manage-service']);
    expect(userArgv(['/e'], true)).toEqual([]);
  });

  it('keeps everything after the binary in a packaged app', () => {
    expect(userArgv(['/opt/noema', '--server', 'http://127.0.0.1:8765'], false)).toEqual(['--server', 'http://127.0.0.1:8765']);
  });
});

describe('parseArgs (main.rs:12-108)', () => {
  it('uses the main.rs defaults', () => {
    expect(parse([])).toEqual({
      server: DEFAULT_SERVER,
      profile: null,
      manageService: false,
      dataDir: null,
      python: '/repo/.venv/bin/python',
      entryPoint: '/repo/run.py',
      startupTimeoutMs: 15_000,
    });
  });

  it('returns help, but only after earlier arguments parsed', () => {
    expect(parse(['--help'])).toBe('help');
    expect(HELP_TEXT).toContain('--manage-service --data-dir');
    expect(cliError(() => parse(['--bogus', '--help']))).toBe('Unknown argument; use --help. No token file is needed by the webview.');
  });

  it.each([
    ['--server', '--server needs a URL'],
    ['--profile', '--profile needs a path'],
    ['--data-dir', '--data-dir needs a path'],
    ['--python', '--python needs a path'],
    ['--entry-point', '--entry-point needs a path'],
    ['--startup-timeout', '--startup-timeout needs seconds'],
  ])('%s without a value fails with the main.rs wording', (flag, message) => {
    expect(cliError(() => parse([flag]))).toBe(message);
  });

  it.each(['constructor', '__proto__', '--Server', '-server'])('rejects the unknown argument %j', (arg) => {
    expect(cliError(() => parse([arg]))).toBe('Unknown argument; use --help. No token file is needed by the webview.');
  });

  // Rust f64::from_str grammar (main.rs:38-42): no whitespace, hex or digit separators, which Number() would accept.
  it.each(['abc', '', ' ', ' 5', '5 ', '0x10', '1_0', '1e'])('rejects the non-numeric timeout %j', (value) => {
    expect(cliError(() => parse(['--startup-timeout', value]))).toBe('Invalid startup timeout');
  });

  // Rust parses inf/infinity/nan, then the range check rejects them (main.rs:62-64).
  it.each(['0.05', '61', 'Infinity', 'inf', 'NaN', '-1', '0'])('rejects the out-of-range timeout %j', (value) => {
    expect(cliError(() => parse(['--startup-timeout', value]))).toBe('Use a startup timeout from 0.1 to 60 seconds');
  });

  it('accepts the timeout bounds and the other Rust float forms', () => {
    const ms = (value: string) => (parse(['--startup-timeout', value]) as { startupTimeoutMs: number }).startupTimeoutMs;
    expect([ms('0.1'), ms('60'), ms('+.5'), ms('5.'), ms('1e1')]).toEqual([100, 60_000, 500, 5_000, 10_000]);
  });

  it('validates --server before the managed rules', () => {
    expect(cliError(() => parse(['--server', 'http://localhost:8765']))).toBe('Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765');
  });

  it('rejects --data-dir without --manage-service', () => {
    expect(cliError(() => parse(['--data-dir', 'ws']))).toBe('--data-dir requires explicit --manage-service; external mode never owns a service');
  });

  it('requires --data-dir in managed mode', () => {
    expect(cliError(() => parse(['--manage-service']))).toBe('Managed mode requires an explicit --data-dir; no implicit real notebook');
  });

  it('pins managed mode to http://127.0.0.1:8765', () => {
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'])))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://[::1]:8765'])))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST_PORT: '9100' })))
      .toBe('Managed mode uses http://127.0.0.1:8765 only');
  });

  it('accepts the test port only with the explicit test flag', () => {
    const options = parse(['--manage-service', '--data-dir', 'ws', '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: '9100' });
    expect(options).toMatchObject({ server: 'http://127.0.0.1:9100', manageService: true });
  });

  it('is Linux-only in managed mode', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(cliError(() => parse(['--manage-service', '--data-dir', 'ws']))).toBe('Managed development mode is supported only on Linux');
  });

  it('resolves relative python, entry and data paths against cwd without normalising', () => {
    expect(parse(['--manage-service', '--data-dir', 'ws/..', '--python', 'py', '--entry-point', 'tools/run.py', '--profile', 'prof'])).toEqual({
      server: DEFAULT_SERVER,
      profile: 'prof',
      manageService: true,
      dataDir: '/home/user/launch/ws/..',
      python: '/home/user/launch/py',
      entryPoint: '/home/user/launch/tools/run.py',
      startupTimeoutMs: 15_000,
    });
  });

  it('lets the last repeated flag win, as main.rs did', () => {
    expect((parse(['--server', 'http://127.0.0.1:1', '--server', 'http://127.0.0.1:2']) as { server: string }).server).toBe('http://127.0.0.1:2');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix electron run unit -- test/cli.test.ts`
Expected: FAIL — `Failed to load url ../src/cli.js`.

- [ ] **Step 3: Implement `cli.ts`**

`electron/src/cli.ts`:
```ts
import net from 'node:net';
import path from 'node:path';
import { managedPort } from './lifecycle.js';
import { absolutePath } from './paths.js';

export type CliOptions = {
  server: string;            // validated origin
  profile: string | null;    // raw; resolveProfile() makes it absolute
  manageService: boolean;
  dataDir: string | null;
  python: string;
  entryPoint: string;
  startupTimeoutMs: number;
};

export class CliError extends Error {}

export const DEFAULT_SERVER = 'http://127.0.0.1:8765';
const LOOPBACK_ONLY = 'Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765';
const UNKNOWN = 'Unknown argument; use --help. No token file is needed by the webview.';
// What Rust f64::from_str accepts (main.rs:38-42); inf/nan parse but fail the range check later.
const RUST_F64 = /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|inf|infinity|nan)$/i;
const VALUE_FLAGS: Record<string, string> = {
  '--server': '--server needs a URL',
  '--profile': '--profile needs a path',
  '--data-dir': '--data-dir needs a path',
  '--python': '--python needs a path',
  '--entry-point': '--entry-point needs a path',
  '--startup-timeout': '--startup-timeout needs seconds',
};

export const HELP_TEXT = [
  'Noema Electron desktop',
  'Default: external service; start Python separately.',
  '--server http://127.0.0.1:8765 --profile /path/to/private/profile',
  'Opt-in Linux development mode: --manage-service --data-dir /path/to/workspace',
  'Optional: --python /path/to/python --entry-point /path/to/run.py --startup-timeout 15',
  'Relative paths resolve against the launch directory (electron/ under npm --prefix).',
  'Close checkpoints your drafts, then quits and stops an owned service. Retry is explicit.',
  'Browser and old webview drafts are NOT migrated into this separate Electron profile.',
].join('\n');

/** Arguments after the app path: Chromium/Node switches placed before it are never Noema's. */
export function userArgv(argv: readonly string[], defaultApp: boolean): string[] {
  if (!defaultApp) return argv.slice(1);
  const appPath = argv.findIndex((arg, index) => index > 0 && !arg.startsWith('-'));
  return appPath < 0 ? [] : argv.slice(appPath + 1);
}

function isLoopbackLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIPv4(host)) return host.split('.')[0] === '127';   // Rust Ipv4Addr::is_loopback: 127/8
  return net.isIPv6(host) && host === '::1';                  // WHATWG already compressed the address
}

export function validateServer(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('Invalid service URL');
  }
  // href === origin + '/' rules out credentials, any path and even an empty query or fragment (lib.rs:18-25).
  if (url.protocol !== 'http:' || !isLoopbackLiteral(url.hostname) || url.href !== `${url.origin}/`) throw new CliError(LOOPBACK_ONLY);
  return url.origin;
}

export function parseArgs(argv: readonly string[], cwd: string, repoRoot: string, env: NodeJS.ProcessEnv): CliOptions | 'help' {
  const values = new Map<string, string>();
  let manageService = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return 'help';
    if (arg === '--manage-service') {
      manageService = true;
      continue;
    }
    if (!Object.hasOwn(VALUE_FLAGS, arg)) throw new CliError(UNKNOWN);
    const value = argv[index + 1];
    if (value === undefined) throw new CliError(VALUE_FLAGS[arg]);
    index += 1;
    if (arg === '--startup-timeout' && !RUST_F64.test(value)) throw new CliError('Invalid startup timeout');
    values.set(arg, value);
  }
  const server = validateServer(values.get('--server') ?? DEFAULT_SERVER);
  const seconds = Number(values.get('--startup-timeout') ?? '15');
  if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 60) throw new CliError('Use a startup timeout from 0.1 to 60 seconds');
  const dataDir = values.get('--data-dir');
  if (!manageService && dataDir !== undefined) {
    throw new CliError('--data-dir requires explicit --manage-service; external mode never owns a service');
  }
  if (manageService) {
    if (process.platform !== 'linux') throw new CliError('Managed development mode is supported only on Linux');
    if (dataDir === undefined) throw new CliError('Managed mode requires an explicit --data-dir; no implicit real notebook');
    if (server !== `http://127.0.0.1:${managedPort(env)}`) throw new CliError('Managed mode uses http://127.0.0.1:8765 only');
  }
  return {
    server,
    profile: values.get('--profile') ?? null,
    manageService,
    dataDir: dataDir === undefined ? null : absolutePath(dataDir, cwd),
    python: absolutePath(values.get('--python') ?? path.join(repoRoot, '.venv/bin/python'), cwd),
    entryPoint: absolutePath(values.get('--entry-point') ?? path.join(repoRoot, 'run.py'), cwd),
    startupTimeoutMs: Math.round(seconds * 1000),
  };
}
```

- [ ] **Step 4: Run the test and the build**

Run: `npm --prefix electron run unit -- test/cli.test.ts && npm --prefix electron run build`
Expected: PASS; the build exits 0.

- [ ] **Step 5: Commit**

```bash
git add electron/src/cli.ts electron/test/cli.test.ts
git commit -m "feat(electron): parse and validate the desktop command line"
```

---

### Task 4: Profile resolution and protection

**Files:**
- Create: `electron/src/profile.ts`
- Test: `electron/test/profile.test.ts` (port of `desktop/src/lib.rs:58-102,164-182` without the flock; spec §6.3 says Chromium's ProcessSingleton is the lock)

**Interfaces:**
- Consumes: `absolutePath`, `hasFinalComponent`, `ensurePrivateDir` (Task 2).
- Produces:
  - `resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string`
  - `prepareProfile(path: string): void`
  - `PROFILE_MESSAGES` (local)

- [ ] **Step 1: Write the failing profile test**

`electron/test/profile.test.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILE_MESSAGES, prepareProfile, resolveProfile } from '../src/profile.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'noema-profile-'));

describe('resolveProfile (lib.rs:58-71)', () => {
  it('uses --profile, resolved against cwd', () => {
    expect(resolveProfile('prof', {}, '/home/u')).toBe('/home/u/prof');
    expect(resolveProfile('/abs/prof', {}, '/home/u')).toBe('/abs/prof');
  });

  it('defaults to an absolute $XDG_DATA_HOME/noema/electron', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: '/xdg', HOME: '/h' }, '/c')).toBe('/xdg/noema/electron');
  });

  it('ignores a relative XDG_DATA_HOME and falls back to ~/.local/share', () => {
    expect(resolveProfile(null, { XDG_DATA_HOME: 'rel', HOME: '/h' }, '/c')).toBe('/h/.local/share/noema/electron');
    expect(resolveProfile(null, { HOME: '/h' }, '/c')).toBe('/h/.local/share/noema/electron');
  });

  it('fails without any base directory', () => {
    expect(() => resolveProfile(null, {}, '/c')).toThrow(PROFILE_MESSAGES.noHome);
  });
});

describe('prepareProfile (lib.rs:75-87, 164-182)', () => {
  it('creates a new profile with mode 0700', () => {
    const profile = path.join(temp(), 'electron');
    prepareProfile(profile);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o700);
  });

  it('keeps an existing profile, its mode and its data', () => {
    const profile = temp();
    fs.chmodSync(profile, 0o750);
    fs.writeFileSync(path.join(profile, 'retained'), 'draft');
    prepareProfile(profile);
    expect(fs.statSync(profile).mode & 0o777).toBe(0o750);
    expect(fs.readFileSync(path.join(profile, 'retained'), 'utf8')).toBe('draft');
  });

  it.each(['', '/', '/tmp/x/..', '.'])('refuses %j: not a dedicated directory', (value) => {
    expect(() => prepareProfile(value)).toThrow(PROFILE_MESSAGES.dedicated);
  });

  it('reports a profile path that is a file', () => {
    const file = path.join(temp(), 'file');
    fs.writeFileSync(file, 'x');
    expect(() => prepareProfile(file)).toThrow(PROFILE_MESSAGES.create);
  });

  it('rejects an empty --profile instead of using the launch directory', () => {
    expect(() => prepareProfile(resolveProfile('', {}, temp()))).toThrow(PROFILE_MESSAGES.dedicated);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix electron run unit -- test/profile.test.ts`
Expected: FAIL — `Failed to load url ../src/profile.js`.

- [ ] **Step 3: Implement `profile.ts`**

`electron/src/profile.ts`:
```ts
import path from 'node:path';
import { absolutePath, ensurePrivateDir, hasFinalComponent } from './paths.js';

// The profile holds the session cookie: it is credential storage (spec §6.3).
export const PROFILE_MESSAGES = {
  noHome: 'Cannot locate profile; supply --profile PATH',
  dedicated: 'Choose a dedicated profile directory',
  create: 'Cannot create the Electron profile',
  protect: 'Cannot protect profile',
} as const;

export function resolveProfile(option: string | null, env: NodeJS.ProcessEnv, cwd: string): string {
  if (option !== null) return absolutePath(option, cwd);
  const xdg = env.XDG_DATA_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : env.HOME ? path.join(env.HOME, '.local/share') : null;
  if (base === null) throw new Error(PROFILE_MESSAGES.noHome);
  return path.join(base, 'noema', 'electron');
}

export function prepareProfile(profile: string): void {
  if (!hasFinalComponent(profile)) throw new Error(PROFILE_MESSAGES.dedicated);
  const failed = ensurePrivateDir(profile);
  if (failed === 'create') throw new Error(PROFILE_MESSAGES.create);
  if (failed === 'protect') throw new Error(PROFILE_MESSAGES.protect);
}
```

- [ ] **Step 4: Run the test and the build**

Run: `npm --prefix electron run unit -- test/profile.test.ts && npm --prefix electron run build`
Expected: PASS; the build exits 0.

- [ ] **Step 5: Commit**

```bash
git add electron/src/profile.ts electron/test/profile.test.ts
git commit -m "feat(electron): resolve and protect the Electron profile"
```

---

### Task 5: Session-scoped permission decisions

**Files:**
- Create: `electron/src/permissions.ts`
- Test: `electron/test/permissions.test.ts`

**Interfaces:**
- Consumes: `sameOrigin` (Task 1).
- Produces:
  - `type PermissionKind = 'media-audio' | 'notifications'`
  - `classifyPermission(permission, details, origin): PermissionKind | null`
  - `installPermissions(session: Electron.Session, origin: string, prompt: (kind: PermissionKind) => Promise<boolean>): void`
  - `PERMISSION_PROMPTS`

- [ ] **Step 1: Write the failing permissions test**

`electron/test/permissions.test.ts`:
```ts
import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import { PERMISSION_PROMPTS, classifyPermission, installPermissions, type PermissionKind } from '../src/permissions.js';

const ORIGIN = 'http://127.0.0.1:8765';
const PAGE = `${ORIGIN}/#/capture`;
type RequestHandler = (contents: unknown, permission: string, callback: (granted: boolean) => void, details: Record<string, unknown>) => void;
type CheckHandler = (contents: unknown, permission: string, requestingOrigin: string, details: Record<string, unknown>) => boolean;

function fakeSession() {
  const handlers: { request?: RequestHandler; check?: CheckHandler } = {};
  const session = {
    setPermissionRequestHandler(handler: RequestHandler) { handlers.request = handler; },
    setPermissionCheckHandler(handler: CheckHandler) { handlers.check = handler; },
  } as unknown as Session;
  const request = (permission: string, details: Record<string, unknown>) =>
    new Promise<boolean>((resolve) => handlers.request!(null, permission, resolve, details));
  const check = (permission: string, details: Record<string, unknown>) => handlers.check!(null, permission, ORIGIN, details);
  return { session, request, check };
}

function install(answers: boolean[]) {
  const fake = fakeSession();
  const prompts: PermissionKind[] = [];
  installPermissions(fake.session, ORIGIN, async (kind) => {
    prompts.push(kind);
    return answers.shift() ?? false;
  });
  return { ...fake, prompts };
}

describe('classifyPermission (spec §6.3 Permissions)', () => {
  const main = { isMainFrame: true, requestingUrl: PAGE };

  it('recognises audio-only media and notifications from the main frame at the origin', () => {
    expect(classifyPermission('media', { ...main, mediaTypes: ['audio'] }, ORIGIN)).toBe('media-audio');
    expect(classifyPermission('notifications', main, ORIGIN)).toBe('notifications');
  });

  it.each([
    ['video', 'media', { ...main, mediaTypes: ['video'] }],
    ['audio and video', 'media', { ...main, mediaTypes: ['audio', 'video'] }],
    ['no media types', 'media', { ...main, mediaTypes: [] }],
    ['missing media types', 'media', main],
    ['a subframe', 'media', { isMainFrame: false, requestingUrl: PAGE, mediaTypes: ['audio'] }],
    ['another origin', 'notifications', { isMainFrame: true, requestingUrl: 'http://127.0.0.1:9000/' }],
    ['credentials', 'notifications', { isMainFrame: true, requestingUrl: 'http://u@127.0.0.1:8765/' }],
    ['an unparsable URL', 'notifications', { isMainFrame: true, requestingUrl: 'nope' }],
    ['geolocation', 'geolocation', main],
    ['clipboard', 'clipboard-read', main],
    ['display capture', 'display-capture', main],
    ['openExternal', 'openExternal', main],
  ])('denies %s', (_label, permission, details) => {
    expect(classifyPermission(permission, details as { isMainFrame: boolean; requestingUrl: string; mediaTypes?: string[] }, ORIGIN)).toBeNull();
  });
});

describe('installPermissions', () => {
  it('prompts once for audio, remembers the answer and reports it to the check handler', async () => {
    const { request, check, prompts } = install([true]);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'audio' })).toBe(false);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['audio'] })).toBe(true);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['audio'] })).toBe(true);
    expect(prompts).toEqual(['media-audio']);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'audio' })).toBe(true);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'video' })).toBe(false);
  });

  it('remembers a denial too, and never prompts for video', async () => {
    const { request, check, prompts } = install([false]);
    expect(await request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['video'] })).toBe(false);
    expect(prompts).toEqual(['notifications']);
    expect(check('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
  });

  it('shares one prompt between concurrent requests', async () => {
    const { request, prompts } = install([true]);
    const details = { isMainFrame: true, requestingUrl: PAGE };
    expect(await Promise.all([request('notifications', details), request('notifications', details)])).toEqual([true, true]);
    expect(prompts).toEqual(['notifications']);
  });

  it('treats a failed prompt as a denial', async () => {
    const fake = fakeSession();
    installPermissions(fake.session, ORIGIN, async () => { throw new Error('dialog failed'); });
    expect(await fake.request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
  });

  it('forgets decisions on a new install (app restart)', async () => {
    const first = install([true]);
    await first.request('notifications', { isMainFrame: true, requestingUrl: PAGE });
    const second = install([false]);
    expect(second.check('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await second.request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(second.prompts).toEqual(['notifications']);
  });

  it('uses the main.rs prompt wording', () => {
    expect(PERMISSION_PROMPTS).toEqual({
      'media-audio': 'Allow Noema to use your microphone for a recording?',
      notifications: 'Allow Noema to show notifications?',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix electron run unit -- test/permissions.test.ts`
Expected: FAIL — `Failed to load url ../src/permissions.js`.

- [ ] **Step 3: Implement `permissions.ts`**

`electron/src/permissions.ts`:
```ts
import type { Session } from 'electron';
import { sameOrigin } from './origin.js';

export type PermissionKind = 'media-audio' | 'notifications';

// Wording from desktop/src/main.rs:263-276.
export const PERMISSION_PROMPTS: Record<PermissionKind, string> = {
  'media-audio': 'Allow Noema to use your microphone for a recording?',
  notifications: 'Allow Noema to show notifications?',
};

export function classifyPermission(
  permission: string,
  details: { mediaTypes?: string[]; isMainFrame: boolean; requestingUrl: string },
  origin: string,
): PermissionKind | null {
  if (!details.isMainFrame || !sameOrigin(origin, details.requestingUrl)) return null;
  if (permission === 'media') {
    const types = details.mediaTypes ?? [];
    return types.length === 1 && types[0] === 'audio' ? 'media-audio' : null;
  }
  return permission === 'notifications' ? 'notifications' : null;
}

/** Decisions live in memory for this app session only; a restart prompts again (spec §6.3, §10). */
export function installPermissions(session: Session, origin: string, prompt: (kind: PermissionKind) => Promise<boolean>): void {
  const decisions = new Map<PermissionKind, boolean>();
  const pending = new Map<PermissionKind, Promise<boolean>>();
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes as string[] | undefined) : undefined;
    const kind = classifyPermission(permission, { mediaTypes, isMainFrame: details.isMainFrame, requestingUrl: details.requestingUrl }, origin);
    if (kind === null) return callback(false);
    const known = decisions.get(kind);
    if (known !== undefined) return callback(known);
    let answer = pending.get(kind);
    if (!answer) {
      answer = prompt(kind).catch(() => false).then((granted) => {
        decisions.set(kind, granted);
        pending.delete(kind);
        return granted;
      });
      pending.set(kind, answer);
    }
    void answer.then(callback);
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    const kind = classifyPermission(permission, {
      mediaTypes: details.mediaType ? [details.mediaType] : undefined,
      isMainFrame: details.isMainFrame,
      requestingUrl: details.requestingUrl ?? details.securityOrigin ?? requestingOrigin,
    }, origin);
    return kind !== null && decisions.get(kind) === true;
  });
}
```

- [ ] **Step 4: Run the test and the build**

Run: `npm --prefix electron run unit -- test/permissions.test.ts && npm --prefix electron run build`
Expected: PASS; the build exits 0.

- [ ] **Step 5: Commit**

```bash
git add electron/src/permissions.ts electron/test/permissions.test.ts
git commit -m "feat(electron): session-scoped audio and notification decisions"
```

---

### Task 6: Python managed protocol 2; remove protocol 1

**Files:**
- Modify: `noema/desktop_service.py`. Replace the whole file (lines 1-88). `workspace_lock` (lines 11-24) is kept unchanged; `managed` (lines 27-88, protocol 1) is replaced.
- Modify: `run.py:14-19` (`--owner-pid`; `raise SystemExit(managed(args))`)
- Test: `tests/test_managed_service.py`. Replace the whole file (lines 1-321). The Rust `service_probe` owner cases move to the Node lifecycle tests in Tasks 7–8; this file keeps the Python side and the protocol-2 handshake test.

**Interfaces:**
- Consumes: `create_app(data_dir, start_worker=True, admin_token=None, desktop_identity=None, dist_dir=None)` (P1).
- Produces (contract §8.3):
  - `EXIT_LOCKED = 10`, `EXIT_PORT = 11`, `EXIT_LEASE = 12`
  - `STRIPPED_ENV`
  - `set_parent_death_signal() -> None`
  - `read_lease(stream) -> str`
  - `bind_listener(host: str, port: int) -> socket.socket`
  - `managed(args) -> int`
  - `workspace_lock(root)`
  - `run.py --owner-pid`
  - stdout line `{"protocol":2,"instance":…,"pid":…,"workspace":…,"port":…}`
  - `GET /api/desktop-instance` → `{"protocol":2,"instance":…,"pid":…}`

- [ ] **Step 1: Write the failing Python tests**

`tests/test_managed_service.py` (whole file):
```python
"""Python side of desktop launch protocol 2 (spec §6.4.3).

Owner-side cases (lock, port, crash/Retry, owner death, agents, environment and identity) run
against this same run.py from electron/test/service-*.test.ts. No real notebook, profile or
production port is used.
"""
import io
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

from noema.desktop_service import (EXIT_LEASE, EXIT_LOCKED, EXIT_PORT, STRIPPED_ENV, bind_listener,
                                   read_lease, workspace_lock)
from noema.server import create_app

ROOT = Path(__file__).resolve().parents[1]
INSTANCE = 'a' * 64
LEASE = json.dumps({'instance': INSTANCE}).encode() + b'\n'
linux = pytest.mark.skipif(sys.platform != 'linux', reason='Managed mode is Linux-only')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def managed_env():
    env = os.environ.copy()
    for key in STRIPPED_ENV:
        env.pop(key, None)
    return env


def launch(data, port, owner=None, host='127.0.0.1', cwd=None):
    # Own session: on lease EOF Python signals its own process group, never pytest's.
    return subprocess.Popen(
        [sys.executable, str(ROOT / 'run.py'), '--desktop-managed', '--host', host, '--port', str(port),
         '--data-dir', str(data), '--owner-pid', str(os.getpid() if owner is None else owner)],
        cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env=managed_env(), start_new_session=True)


def test_public_handshake_does_not_authorize_api(tmp_path, monkeypatch):
    for key in ('NOEMA_ACCESS_TOKEN', 'NOEMA_MODEL', 'NOEMA_SPEECH_MODEL'):
        monkeypatch.delenv(key, raising=False)
    identity = {'protocol': 2, 'instance': 'b' * 64, 'pid': 123}
    app = create_app(tmp_path, start_worker=False, desktop_identity=identity)
    with TestClient(app) as web:
        assert web.get('/api/desktop-instance').json() == identity
        assert web.get('/api/state').status_code == 401
        assert web.get('/api/state', headers={'Authorization': 'Bearer ' + identity['instance']}).status_code == 401
        assert web.get('/api/desktop-instance', headers={'Host': 'evil.test'}).status_code == 400
        assert web.get('/api/desktop-instance', headers={'Origin': 'https://evil.test'}).status_code == 403


def test_read_lease_accepts_up_to_2048_bytes_and_leaves_the_rest():
    prefix = b'{"instance":"' + INSTANCE.encode() + b'","pad":"'
    line = prefix + b'x' * (2048 - len(prefix) - 3) + b'"}\n'
    assert len(line) == 2048
    stream = io.BytesIO(line + b'rest')
    assert read_lease(stream) == INSTANCE
    assert stream.read() == b'rest'


@pytest.mark.parametrize('line', [
    b'',
    b'not json\n',
    b'[]\n',
    b'{}\n',
    b'{"instance":5}\n',
    b'{"instance":"' + b'A' * 64 + b'"}\n',
    b'{"instance":"' + b'a' * 63 + b'"}\n',
    b'{"instance":"' + b'a' * 65 + b'"}\n',
    b'{"instance":"' + b'g' * 64 + b'"}\n',
    b'\xff\xfe\n',
    b'{"instance":"' + b'a' * 64 + b'","pad":"' + b'x' * 2048 + b'"}\n',
])
def test_read_lease_rejects(line):
    with pytest.raises(ValueError, match='Invalid desktop lease'):
        read_lease(io.BytesIO(line))


@linux
def test_bind_listener_sets_reuseaddr_never_reuseport():
    sock = bind_listener('127.0.0.1', 0)
    try:
        assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR) == 1
        assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT) == 0
        with socket.create_connection(sock.getsockname(), timeout=2):
            pass  # listen() already ran
    finally:
        sock.close()


@linux
def test_bind_listener_refuses_a_live_listener():
    with socket.socket() as occupant:
        occupant.bind(('127.0.0.1', 0))
        occupant.listen()
        with pytest.raises(OSError):
            bind_listener('127.0.0.1', occupant.getsockname()[1])


@linux
def test_set_parent_death_signal_requests_sigterm():
    code = ('import ctypes; from noema.desktop_service import set_parent_death_signal; set_parent_death_signal(); '
            'value = ctypes.c_int(); ctypes.CDLL(None).prctl(2, ctypes.byref(value), 0, 0, 0); print(value.value)')
    result = subprocess.run([sys.executable, '-c', code], cwd=ROOT, capture_output=True, text=True, check=True, timeout=30)
    assert int(result.stdout) == signal.SIGTERM  # PR_GET_PDEATHSIG


@linux
@pytest.mark.parametrize('case, expected', [
    ('owner', EXIT_LEASE), ('lease', EXIT_LEASE), ('relative', EXIT_LEASE), ('symlink', EXIT_LEASE),
    ('missing', EXIT_LEASE), ('file', EXIT_LEASE), ('host', EXIT_LEASE),
    ('locked', EXIT_LOCKED), ('port', EXIT_PORT),
])
def test_managed_exit_codes_never_write_the_workspace(tmp_path, case, expected):
    root = tmp_path / 'data'
    root.mkdir(mode=0o700)
    data, owner, host, lease, held, occupant = root.resolve(), None, '127.0.0.1', LEASE, None, None
    port = free_port()
    if case == 'owner':
        owner = 1
    elif case == 'lease':
        lease = b'{"instance":"short"}\n'
    elif case == 'relative':
        data = 'data'
    elif case == 'symlink':
        (tmp_path / 'link').symlink_to(root)
        data = tmp_path / 'link'
    elif case == 'missing':
        data = tmp_path / 'missing'
    elif case == 'file':
        (tmp_path / 'file').write_text('not a directory')
        data = tmp_path / 'file'
    elif case == 'host':
        host = '0.0.0.0'
    elif case == 'locked':
        held = workspace_lock(root)
    else:
        occupant = socket.socket()
        occupant.bind(('127.0.0.1', port))
        occupant.listen()
        occupant.settimeout(.2)
    try:
        process = launch(data, port, owner=owner, host=host, cwd=tmp_path)
        out, _ = process.communicate(lease, timeout=30)
        assert process.returncode == expected
        assert out == b''  # no readiness line
        if case == 'port':
            with pytest.raises(TimeoutError):
                occupant.accept()  # the occupant is never contacted
        if expected == EXIT_LEASE:
            assert list(root.iterdir()) == []  # nothing, not even the lock, before a valid lease
        assert not (root / 'admin.token').exists()
        assert not (tmp_path / 'missing').exists()
    finally:
        if held:
            held.close()
        if occupant:
            occupant.close()


@linux
def test_managed_acknowledges_protocol_2_and_stops_on_lease_eof(tmp_path):
    root = tmp_path / 'data'
    root.mkdir(mode=0o700)
    root = root.resolve()
    port = free_port()
    process = launch(root, port)
    try:
        process.stdin.write(LEASE)
        process.stdin.flush()
        ready, _, _ = select.select([process.stdout], [], [], 30)
        assert ready, 'no readiness line'
        ack = json.loads(process.stdout.readline(4097))
        assert ack == {'protocol': 2, 'instance': INSTANCE, 'pid': process.pid, 'workspace': str(root), 'port': port}
        with httpx.Client(trust_env=False, timeout=3) as web:
            identity = web.get(f'http://127.0.0.1:{port}/api/desktop-instance').json()
        assert identity == {'protocol': 2, 'instance': INSTANCE, 'pid': process.pid}
        assert (root / 'admin.token').exists()
        process.stdin.close()
        # uvicorn re-raises the SIGTERM it captured after a graceful shutdown (uvicorn/server.py:335-339).
        assert process.wait(timeout=15) in (0, -signal.SIGTERM)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/python -m pytest tests/test_managed_service.py -q`
Expected: FAIL — `ImportError: cannot import name 'EXIT_LEASE' from 'noema.desktop_service'`.

- [ ] **Step 3: Replace `noema/desktop_service.py` with protocol 2**

`noema/desktop_service.py` (whole file):
```python
"""Linux desktop lease protocol 2, not a daemon or an admin-token transport."""
import ctypes
import json
import os
from pathlib import Path
import signal
import socket
import sys
import threading

EXIT_LOCKED = 10
EXIT_PORT = 11
EXIT_LEASE = 12
PR_SET_PDEATHSIG = 1
# Managed development mode never enables optional models, remote access or another data dir.
STRIPPED_ENV = ('NOEMA_MODEL', 'NOEMA_SPEECH_MODEL', 'NOEMA_TOKEN', 'NOEMA_ACCESS_TOKEN',
                'NOEMA_ALLOWED_HOSTS', 'NOEMA_ALLOW_REMOTE_MODEL', 'NOEMA_DATA_DIR')


def workspace_lock(root):
    """Manual Linux launch shares the same workspace exclusion as managed launch."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if sys.platform != 'linux':
        return None
    import fcntl
    fd = os.open(root / '.noema-service.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise ValueError('This workspace already has a service; stop it deliberately or use external mode.') from None
    return os.fdopen(fd, 'r+')


def set_parent_death_signal():
    """SIGTERM this process when the thread that spawned it (Electron's main thread) dies."""
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_PDEATHSIG, int(signal.SIGTERM), 0, 0, 0) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def read_lease(stream):
    """One line of at most 2048 bytes: {"instance": "<64 lowercase hex>"}."""
    line = stream.readline(2049)
    if len(line) > 2048:
        raise ValueError('Invalid desktop lease')
    try:
        config = json.loads(line)
    except ValueError:  # includes UnicodeDecodeError
        raise ValueError('Invalid desktop lease') from None
    instance = config.get('instance') if isinstance(config, dict) else None
    if (not isinstance(instance, str) or len(instance) != 64
            or any(c not in '0123456789abcdef' for c in instance)):
        raise ValueError('Invalid desktop lease')
    return instance


def bind_listener(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # Rebind at once after a crash (TIME_WAIT); never SO_REUSEPORT, which would share a live port.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(2048)
    except OSError:
        sock.close()
        raise
    return sock


def managed(args):
    """Protocol 2. stdin = lifetime lease; stdout = one private readiness line. Returns the exit code.

    The public instance ID grants no API authority and no admin token is transported. Nothing in
    the workspace is created or modified before the lease is valid.
    """
    if sys.platform != 'linux':
        return EXIT_LEASE
    set_parent_death_signal()
    if os.getppid() != args.owner_pid:
        return EXIT_LEASE  # the owner died before prctl took effect
    if not args.data_dir or args.open or args.host != '127.0.0.1':
        return EXIT_LEASE
    root = Path(args.data_dir)
    try:
        if root != root.resolve(strict=True) or not root.is_dir():
            return EXIT_LEASE
    except OSError:
        return EXIT_LEASE
    try:
        instance = read_lease(sys.stdin.buffer)
    except ValueError:
        return EXIT_LEASE
    try:
        lock = workspace_lock(root)
    except ValueError:
        return EXIT_LOCKED
    try:
        listener = bind_listener(args.host, args.port)
    except OSError:
        return EXIT_PORT
    os.set_inheritable(0, False)
    running = {'server': None}
    finished = threading.Event()

    def lease():
        # Owner crash/SIGKILL or a deliberate stop closes the pipe.
        sys.stdin.buffer.read()
        if running['server'] is not None:
            running['server'].should_exit = True
        # Signal only this dedicated group. Separately wrapped agents are not in it.
        os.killpg(os.getpgrp(), signal.SIGTERM)
        if not finished.wait(8):
            os.killpg(os.getpgrp(), signal.SIGKILL)

    threading.Thread(target=lease, name='desktop-lease', daemon=True).start()
    for key in STRIPPED_ENV:
        os.environ.pop(key, None)
    from .server import create_app
    import uvicorn
    identity = {'protocol': 2, 'instance': instance, 'pid': os.getpid()}
    app = create_app(root, desktop_identity=identity)
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, log_level='critical',
                                          proxy_headers=False, access_log=False))
    running['server'] = server

    def acknowledge():
        while not server.started and not finished.wait(.02):
            pass
        if server.started and not finished.is_set():
            print(json.dumps(identity | {'workspace': str(root), 'port': args.port}), flush=True)

    threading.Thread(target=acknowledge, name='desktop-ready', daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        finished.set()
        listener.close()
        lock.close()
    return 0
```

Note: the platform check runs before `prctl`, because `prctl` exists only on Linux. This is the only reordering of contract §8.3, and its result is the same exit code 12.

- [ ] **Step 4: Update `run.py`**

Replace `run.py` lines 14-19:
```python
    parser.add_argument('--desktop-managed',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.desktop_managed:
        from noema.desktop_service import managed
        managed(args)
        raise SystemExit(0)
```
with:
```python
    parser.add_argument('--desktop-managed',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--owner-pid',type=int,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.desktop_managed:
        from noema.desktop_service import managed
        raise SystemExit(managed(args))
```

- [ ] **Step 5: Run the managed tests, then the whole Python suite**

Run: `.venv/bin/python -m pytest tests/test_managed_service.py -q && .venv/bin/python -m pytest -q`
Expected: PASS for every test. Nothing in `tests/` references protocol 1 any more; check with `grep -rn "'protocol': 1" tests noema`, which should print nothing.

- [ ] **Step 6: Commit**

```bash
git add noema/desktop_service.py run.py tests/test_managed_service.py
git commit -m "feat(service): managed launch protocol 2 with PDEATHSIG, lock, bind and exit codes"
```

---

### Task 7: `ManagedService` — spawn, lease, readiness, identity, stop, cancel, crash

**Files:**
- Modify: `electron/src/lifecycle.ts`. Replace the import block (lines 1-3) and append the owner after `identityMatches`.
- Create: `electron/test/fixtures/fake_service.py`. These are the contract §8.3 modes plus the local modes `ok`, `long-ack` and `pdeathsig`, the env var `NOEMA_FAKE_ACK`, and the optional `NOEMA_FAKE_PIDFILE` for every mode.
- Create: `electron/test/proc.ts` (process and HTTP helpers with no Vitest import; the e2e specs reuse them) and `electron/test/helpers.ts` (Vitest helpers). Both are local to this phase.
- Test: `electron/test/service-start.test.ts`, `electron/test/service-stop.test.ts`.

**Interfaces:**
- Consumes: the Task 2 helpers and `run.py`/`fake_service.py` speaking protocol 2 (Task 6).
- Produces (contract §8.2):
  - `type ManagedConfig`
  - `type ServiceHandle`
  - `class ManagedService extends EventEmitter<{ crashed: [LifecycleError]; exit: [number | null] }>`, with `state`, `start(): Promise<ServiceHandle>`, `cancel(): Promise<void>` and `stop(): Promise<void>`
  - `type ManagedState = 'idle' | 'starting' | 'running' | 'crashed' | 'stopping' | 'stopped'`

  `cancel()` also stops a service that is not starting.

- [ ] **Step 1: Write the fake service**

`electron/test/fixtures/fake_service.py`:
```python
"""Managed-service double for electron/test (protocol 2). NOEMA_FAKE_MODE selects the behaviour."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

MODES = {'ok', 'locked', 'port', 'lease', 'hang', 'early-exit', 'bad-ack', 'extra-key', 'long-ack',
         'bad-http', 'grandchild', 'env-dump', 'pdeathsig'}
mode = os.environ.get('NOEMA_FAKE_MODE', '')
if mode not in MODES:
    sys.exit(99)
args = sys.argv[1:]
port = int(args[args.index('--port') + 1])
workspace = args[args.index('--data-dir') + 1]
pidfile = os.environ.get('NOEMA_FAKE_PIDFILE')


def write_pids(*pids):
    if pidfile:
        Path(pidfile).write_text(json.dumps(list(pids)))


if mode == 'pdeathsig':
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from noema.desktop_service import set_parent_death_signal
    set_parent_death_signal()
    write_pids(os.getpid())  # only after prctl, so a test never kills the owner too early
    time.sleep(60)
    sys.exit(0)
write_pids(os.getpid())
if mode == 'early-exit':
    sys.exit(3)
line = sys.stdin.buffer.readline(2049)
if mode in ('locked', 'port', 'lease'):
    sys.exit({'locked': 10, 'port': 11, 'lease': 12}[mode])
if mode == 'hang':
    time.sleep(60)  # ignores the lease entirely: the owner must escalate to signals
    sys.exit(0)
instance = json.loads(line)['instance']


def watch_lease():
    sys.stdin.buffer.read()
    os._exit(0)  # like the real service, stop on lease EOF; descendants are the owner's to clean


threading.Thread(target=watch_lease, daemon=True).start()
if mode == 'grandchild':
    child = subprocess.Popen(['/bin/sleep', '60'])
    write_pids(os.getpid(), child.pid)
    if os.environ.get('NOEMA_FAKE_ACK') != '1':
        time.sleep(60)
        sys.exit(0)
if mode == 'env-dump':
    Path(os.environ['NOEMA_FAKE_ENVFILE']).write_text(json.dumps({
        'env': sorted(os.environ), 'argv': args, 'lease': line.decode(), 'pid': os.getpid(),
        'pgid': os.getpgrp(), 'sid': os.getsid(0), 'ppid': os.getppid()}))
identity = {'protocol': 2, 'instance': instance, 'pid': os.getpid()}
ack = dict(identity, workspace=workspace, port=port)
if mode == 'bad-ack':
    ack['instance'] = '0' * 64
if mode == 'extra-key':
    ack['extra'] = True
served = dict(identity, instance='f' * 64) if mode == 'bad-http' else identity


class Identity(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(served).encode()
        self.send_response(200 if self.path == '/api/desktop-instance' else 404)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


server = http.server.HTTPServer(('127.0.0.1', port), Identity)
if mode == 'long-ack':
    sys.stdout.write('x' * 5000)
    sys.stdout.flush()
else:
    print(json.dumps(ack), flush=True)
server.serve_forever()
```

- [ ] **Step 2: Write the test helpers**

`electron/test/proc.ts` has no Vitest import, so the Playwright e2e specs (Tasks 13–14) reuse it:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function tempDir(prefix = 'noema-lifecycle-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Alive and not a zombie (tests/test_managed_service.py:37-41 `live`). */
export function live(pid: number): boolean {
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').pop()!.trim().split(' ')[0] !== 'Z';
  } catch {
    return false;
  }
}

export function readPids(file: string): number[] {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as number[];
  } catch {
    return [];   // not written yet, or mid-write
  }
}

export async function until(predicate: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(40);
  }
  throw new Error('Condition did not become true');
}

/** The managed service strips NOEMA_ACCESS_TOKEN, so the admin token is the workspace's admin.token (test_managed_service.py:99-101). */
export async function admin<T = any>(workspaceDir: string, port: number, apiPath: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = fs.readFileSync(path.join(workspaceDir, 'admin.token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${port}/api${apiPath}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`${apiPath}: ${response.status}`);
  return (await response.json()) as T;
}
```

`electron/test/helpers.ts`:
```ts
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { LifecycleError, ManagedService, prepareWorkspace, type ManagedConfig } from '../src/lifecycle.js';
import { tempDir } from './proc.js';

export { admin, live, readPids, tempDir, until } from './proc.js';
export const ELECTRON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(ELECTRON_ROOT, '..');
export const PYTHON = path.join(REPO_ROOT, '.venv/bin/python');
export const RUN_PY = path.join(REPO_ROOT, 'run.py');
export const FAKE = path.join(ELECTRON_ROOT, 'test/fixtures/fake_service.py');

export function workspace(): string {
  return prepareWorkspace(path.join(tempDir(), 'data'), '/');
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export async function rejection(promise: Promise<unknown>): Promise<LifecycleError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LifecycleError) return error;
    throw error;
  }
  throw new Error('Expected a LifecycleError');
}

export function fakeEnv(mode: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, NOEMA_FAKE_MODE: mode, ...extra };
}

/** Creates services that are always cancelled (and their groups cleaned) after each test. */
export function serviceFactory(): (config: Partial<ManagedConfig> & Pick<ManagedConfig, 'port' | 'workspace'>) => ManagedService {
  const services: ManagedService[] = [];
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.cancel()));
  });
  return (config) => {
    const service = new ManagedService({ python: PYTHON, entryPoint: RUN_PY, timeoutMs: 30_000, env: process.env, ...config });
    services.push(service);
    return service;
  };
}
```

- [ ] **Step 3: Write the failing start tests**

`electron/test/service-start.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES, STRIPPED_ENV } from '../src/lifecycle.js';
import { FAKE, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, workspace } from './helpers.js';

const service = serviceFactory();

async function fakeService(mode: string, extra: Record<string, string> = {}, timeoutMs = 15_000) {
  const port = await freePort();
  const ws = workspace();
  return { port, ws, managed: service({ port, workspace: ws, entryPoint: FAKE, timeoutMs, env: fakeEnv(mode, extra) }) };
}

describe('ManagedService.start (spec §6.4.2-6.4.4)', () => {
  it('spawns the exact protocol-2 command in its own session, with a 64-hex lease and a stripped environment', async () => {
    const envfile = path.join(tempDir(), 'env.json');
    const inherited = Object.fromEntries(STRIPPED_ENV.map((key) => [key, 'must-not-reach-python']));
    const { port, ws, managed } = await fakeService('env-dump', { ...inherited, NOEMA_FAKE_ENVFILE: envfile, NOEMA_KEEP_ME: 'yes' });
    const handle = await managed.start();
    const dump = JSON.parse(fs.readFileSync(envfile, 'utf8')) as { env: string[]; argv: string[]; lease: string; pid: number; pgid: number; sid: number; ppid: number };
    expect(dump.argv).toEqual(['--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', ws, '--owner-pid', String(process.pid)]);
    expect(handle.instance).toMatch(/^[0-9a-f]{64}$/);
    expect(dump.lease).toBe(`{"instance":"${handle.instance}"}\n`);
    expect([dump.pgid, dump.sid, dump.ppid]).toEqual([dump.pid, dump.pid, process.pid]);
    for (const key of STRIPPED_ENV) expect(dump.env).not.toContain(key);
    expect(dump.env).toEqual(expect.arrayContaining(['PATH', 'NOEMA_KEEP_ME', 'NOEMA_FAKE_MODE']));
    expect(handle).toEqual({ pid: dump.pid, instance: handle.instance, origin: `http://127.0.0.1:${port}` });
    expect(managed.state).toBe('running');
  });

  it('shares one attempt between concurrent calls and returns the running handle on Retry', async () => {
    const { managed } = await fakeService('ok');
    const first = managed.start();
    expect(managed.start()).toBe(first);
    const handle = await first;
    expect(await managed.start()).toEqual(handle);
  });

  it.each([
    ['locked', 'workspace-locked', MESSAGES.workspaceLocked],
    ['port', 'port-in-use', MESSAGES.portInUse],
    ['lease', 'invalid-lease', MESSAGES.startupExit],
  ])('maps the %s exit to %s', async (mode, code, message) => {
    const { managed } = await fakeService(mode);
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual([code, message]);
    expect(managed.state).toBe('crashed');
  });

  it('reports a missing or empty interpreter as python-missing', async () => {
    for (const python of [path.join(tempDir(), 'missing-python'), '']) {
      const managed = service({ port: await freePort(), workspace: workspace(), python, entryPoint: FAKE, env: fakeEnv('ok') });
      const error = await rejection(managed.start());
      expect([error.code, error.message]).toEqual(['python-missing', MESSAGES.pythonMissing]);
    }
  });

  it('turns an exit before the lease into a bounded startup error, never an unhandled EPIPE', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { managed } = await fakeService('early-exit', { NOEMA_FAKE_PIDFILE: pidfile });
    const error = await rejection(managed.start());
    // The lease line normally fits in the pipe buffer before Python exits; both wordings are correct guidance.
    expect([['early-exit', MESSAGES.earlyExit], ['startup-exit', MESSAGES.startupExit]]).toContainEqual([error.code, error.message]);
    expect(readPids(pidfile).some(live)).toBe(false);
  });

  it('times out without an acknowledgement, then escalates to signals and stops the service', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { managed } = await fakeService('hang', { NOEMA_FAKE_PIDFILE: pidfile }, 400);
    const started = Date.now();
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual(['timeout', MESSAGES.timeout]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    expect(readPids(pidfile).some(live)).toBe(false);
  });

  it.each(['bad-ack', 'extra-key', 'long-ack', 'bad-http'])('%s fails identity, stops the service and never writes the workspace', async (mode) => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const { ws, managed } = await fakeService(mode, { NOEMA_FAKE_PIDFILE: pidfile });
    const error = await rejection(managed.start());
    expect([error.code, error.message]).toEqual(['identity', MESSAGES.identity]);
    expect(readPids(pidfile).some(live)).toBe(false);
    expect(fs.readdirSync(ws)).toEqual([]);
  });
});
```

- [ ] **Step 4: Write the failing stop, cancel and crash tests**

`electron/test/service-stop.test.ts`:
```ts
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { LifecycleError, MESSAGES, STOP_GRACE_MS } from '../src/lifecycle.js';
import { FAKE, fakeEnv, freePort, live, readPids, rejection, serviceFactory, tempDir, until, workspace } from './helpers.js';

const service = serviceFactory();
const fake = async (mode: string, extra: Record<string, string> = {}, timeoutMs = 15_000) =>
  service({ port: await freePort(), workspace: workspace(), entryPoint: FAKE, timeoutMs, env: fakeEnv(mode, extra) });

describe('ManagedService stop, cancel and crash (spec §6.4.6-6.4.7)', () => {
  it('stop closes the lease; the service exits well inside the grace period', async () => {
    const managed = await fake('ok');
    const { pid } = await managed.start();
    const started = Date.now();
    await managed.stop();
    expect(Date.now() - started).toBeLessThan(STOP_GRACE_MS);
    expect(live(pid)).toBe(false);
    expect(managed.state).toBe('stopped');
    await managed.stop();
    expect(managed.state).toBe('stopped');
  });

  it('stop before any start is a no-op', async () => {
    const managed = await fake('ok');
    await managed.stop();
    expect(managed.state).toBe('stopped');
  });

  it('cancel during startup rejects with cancelled and removes the whole owned group', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { NOEMA_FAKE_PIDFILE: pidfile }, 30_000);
    const attempt = managed.start();
    await until(() => readPids(pidfile).length === 2);
    const pids = readPids(pidfile);
    await managed.cancel();
    const error = await rejection(attempt);
    expect([error.code, error.message]).toEqual(['cancelled', MESSAGES.cancelled]);
    expect(managed.state).toBe('stopped');
    await until(() => !pids.some(live));
  });

  it('a startup timeout also removes an owned descendant', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { NOEMA_FAKE_PIDFILE: pidfile }, 400);
    const error = await rejection(managed.start());
    expect(error.code).toBe('timeout');
    const pids = readPids(pidfile);
    expect(pids).toHaveLength(2);
    await until(() => !pids.some(live));
  });

  it('reports a crash once, cleans the group, never restarts by itself; Retry is exactly one new spawn', async () => {
    const pidfile = path.join(tempDir(), 'pids.json');
    const managed = await fake('grandchild', { NOEMA_FAKE_PIDFILE: pidfile, NOEMA_FAKE_ACK: '1' });
    const first = await managed.start();
    const pids = readPids(pidfile);
    expect(pids[0]).toBe(first.pid);
    const crashes: LifecycleError[] = [];
    managed.on('crashed', (error) => crashes.push(error));
    process.kill(first.pid, 'SIGKILL');
    await until(() => crashes.length === 1);
    expect([crashes[0].code, crashes[0].message]).toEqual(['crashed', MESSAGES.crashed]);
    await until(() => !pids.some(live));   // the grandchild is gone too (spec §6.4.7)
    await delay(300);
    expect(managed.state).toBe('crashed');
    expect(readPids(pidfile)).toEqual(pids);   // nothing was spawned meanwhile
    const retries = [managed.start(), managed.start(), managed.start()];
    expect(new Set(retries).size).toBe(1);
    const second = await retries[0];
    expect(second.pid).not.toBe(first.pid);
    expect(readPids(pidfile)[0]).toBe(second.pid);
    expect(crashes).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run both files and watch them fail**

Run: `npm --prefix electron run unit -- test/service-start.test.ts test/service-stop.test.ts`
Expected: FAIL — `SyntaxError: The requested module '../src/lifecycle.js' does not provide an export named 'ManagedService'`. Vitest may instead report `ManagedService is not a constructor`.

- [ ] **Step 6: Implement the owner**

Replace the import block at the top of `electron/src/lifecycle.ts` (lines 1-3):
```ts
import fs from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir, hasFinalComponent } from './paths.js';
```
with:
```ts
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { ensurePrivateDir, hasFinalComponent } from './paths.js';
```

Append to the end of `electron/src/lifecycle.ts`:
```ts
export type ManagedConfig = { python: string; entryPoint: string; workspace: string /* canonical */; port: number; timeoutMs: number; env: NodeJS.ProcessEnv };
export type ServiceHandle = { pid: number; instance: string; origin: string };
export type ManagedState = 'idle' | 'starting' | 'running' | 'crashed' | 'stopping' | 'stopped';
type Child = ChildProcessByStdio<Writable, Readable, null>;

const IDENTITY_MAX_BYTES = 8_192;   // service.rs:256
const POLL_MS = 40;                 // service.rs:106
const cancelledError = () => new LifecycleError('cancelled', MESSAGES.cancelled);

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH' && code !== 'EPERM') throw error;   // ESRCH: group already gone (success); EPERM: never ours
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/** GET /api/desktop-instance with no proxy and no credentials; anything but a 200 JSON body is null. */
function readIdentity(port: number, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/desktop-instance', agent: false, timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > IDENTITY_MAX_BYTES) request.destroy();
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
    request.on('close', () => resolve(null));   // a destroyed or truncated response is never an identity
  });
}

/** Owns at most one Python service process group (spec §6.4). */
export class ManagedService extends EventEmitter<{ crashed: [LifecycleError]; exit: [number | null] }> {
  readonly #config: ManagedConfig;
  #state: ManagedState = 'idle';
  #child: Child | null = null;
  #handle: ServiceHandle | null = null;
  #starting: Promise<ServiceHandle> | null = null;
  #cancelled = false;
  #abort: ((error: LifecycleError) => void) | null = null;
  readonly #exits = new WeakMap<Child, Promise<number | null>>();
  readonly #stops = new WeakMap<Child, Promise<void>>();

  constructor(config: ManagedConfig) {
    super();
    this.#config = config;
  }

  get state(): ManagedState {
    return this.#state;
  }

  /** Serialised: concurrent calls share one attempt; a running service is returned as is. */
  start(): Promise<ServiceHandle> {
    if (this.#starting) return this.#starting;
    if (this.#state === 'running' && this.#handle) return Promise.resolve(this.#handle);
    const attempt = this.#launch();
    this.#starting = attempt;
    const settle = () => {
      if (this.#starting === attempt) this.#starting = null;
    };
    attempt.then(settle, settle);
    return attempt;
  }

  /** During starting: abort the attempt so start() rejects with 'cancelled'. Then stop whatever is left. */
  async cancel(): Promise<void> {
    const attempt = this.#starting;
    if (attempt) {
      this.#cancelled = true;
      this.#abort?.(cancelledError());
      await attempt.catch(() => undefined);
    }
    await this.stop();
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (child === null) {
      this.#state = 'stopped';
      return;
    }
    if (this.#state === 'running' || this.#state === 'crashed') this.#state = 'stopping';
    await this.#stopChild(child);
    if (this.#child === child && this.#state !== 'starting') {
      this.#state = 'stopped';
      this.#handle = null;
    }
  }

  async #launch(): Promise<ServiceHandle> {
    this.#cancelled = false;
    const previous = this.#child;
    if (previous) await this.#stopChild(previous);   // Retry never spawns while an owned group is alive
    if (this.#cancelled) {
      this.#state = 'stopped';
      throw cancelledError();
    }
    this.#state = 'starting';
    this.#handle = null;
    const { python, entryPoint, workspace, port, timeoutMs } = this.#config;
    const deadline = Date.now() + timeoutMs;
    const instance = randomBytes(32).toString('hex');
    const env: NodeJS.ProcessEnv = { ...this.#config.env };
    for (const key of STRIPPED_ENV) delete env[key];
    let child: Child;
    try {
      child = spawn(python, [entryPoint, '--desktop-managed', '--host', '127.0.0.1', '--port', String(port), '--data-dir', workspace, '--owner-pid', String(process.pid)],
        { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env });
    } catch {
      this.#state = 'crashed';   // e.g. an empty --python is rejected synchronously
      throw new LifecycleError('python-missing', MESSAGES.pythonMissing);
    }
    this.#child = child;
    this.#exits.set(child, new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      child.on('error', () => {
        if (child.pid === undefined) resolve(null);   // spawn failure: no 'exit' follows
      });
    }));
    child.on('exit', (code) => this.#onExit(child, code));
    // Attached before any early return: an unhandled stream 'error' would crash Electron main (spec §6.4.2).
    let leaseFailed = false;
    child.stdin.on('error', () => {
      leaseFailed = true;   // EPIPE: Python is already gone
    });
    child.stdout.on('error', () => undefined);
    if (child.pid === undefined) {
      await this.#exits.get(child);
      this.#state = 'crashed';
      throw new LifecycleError('python-missing', MESSAGES.pythonMissing);
    }
    const pid: number = child.pid;
    child.stdin.write(`${JSON.stringify({ instance })}\n`);   // stdin stays open: it is the lifetime lease
    try {
      const line = await this.#readAck(child, deadline, () => leaseFailed);
      if (!ackMatches(line, { instance, pid, workspace, port })) throw new LifecycleError('identity', MESSAGES.identity);
      const body = await readIdentity(port, Math.max(250, deadline - Date.now()));
      if (this.#cancelled) throw cancelledError();
      if (!identityMatches(body, { instance, pid })) throw new LifecycleError('identity', MESSAGES.identity);
      if (child.exitCode !== null || child.signalCode !== null) throw exitCodeError(child.exitCode);
      this.#state = 'running';
      this.#handle = { pid, instance, origin: `http://127.0.0.1:${port}` };
      return this.#handle;
    } catch (error) {
      await this.#stopChild(child);   // an identity or startup failure stops the service (spec §6.4.4)
      if (this.#cancelled) {
        this.#state = 'stopped';
        throw cancelledError();
      }
      this.#state = 'crashed';
      throw error;
    }
  }

  /** Raw bytes up to the first '\n' or ACK_MAX_BYTES within the deadline; the stream is destroyed afterwards. */
  #readAck(child: Child, deadline: number, leaseFailed: () => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stdout.destroy();   // later output is never read or logged
        this.#abort = null;
        settle();
      };
      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        const newline = buffer.indexOf(0x0a);
        if (newline >= 0 && newline < ACK_MAX_BYTES) finish(() => resolve(buffer.subarray(0, newline).toString('utf8')));
        else if (buffer.length >= ACK_MAX_BYTES) finish(() => reject(new LifecycleError('identity', MESSAGES.identity)));
      };
      const timer = setTimeout(() => finish(() => reject(new LifecycleError('timeout', MESSAGES.timeout))), Math.max(0, deadline - Date.now()));
      this.#abort = (error) => finish(() => reject(error));
      child.stdout.on('data', onData);
      void this.#exits.get(child)!.then((code) => finish(() => reject(leaseFailed() ? new LifecycleError('early-exit', MESSAGES.earlyExit) : exitCodeError(code))));
      if (this.#cancelled) this.#abort(cancelledError());
    });
  }

  #onExit(child: Child, code: number | null): void {
    this.emit('exit', code);
    if (this.#child !== child || this.#state !== 'running') return;
    this.#state = 'crashed';
    this.#handle = null;
    void this.#stopChild(child);   // group cleanup always runs after an observed exit (spec §6.4.7)
    this.emit('crashed', new LifecycleError('crashed', MESSAGES.crashed));
  }

  #stopChild(child: Child): Promise<void> {
    let stopping = this.#stops.get(child);
    if (!stopping) {
      stopping = this.#terminate(child);
      this.#stops.set(child, stopping);
    }
    return stopping;
  }

  /** Close stdin → ≤5 s → SIGTERM -pgid → ≤1 s → SIGKILL -pgid → reap. ESRCH counts as success. */
  async #terminate(child: Child): Promise<void> {
    const exited = this.#exits.get(child) ?? Promise.resolve(null);
    const pgid = child.pid;
    if (pgid === undefined) {
      await exited;
      return;
    }
    if (!child.stdin.destroyed) child.stdin.end();   // closing the lease asks Python to stop its own group
    const grace = new AbortController();
    await Promise.race([exited, delay(STOP_GRACE_MS, undefined, { signal: grace.signal }).catch(() => undefined)]);
    grace.abort();
    // The group id stays reserved while any member lives, so this reaches only our group or returns ESRCH.
    signalGroup(pgid, 'SIGTERM');
    const termDeadline = Date.now() + TERM_GRACE_MS;
    while (groupAlive(pgid) && Date.now() < termDeadline) await delay(POLL_MS);
    signalGroup(pgid, 'SIGKILL');
    await exited;   // Node reaps the leader
  }
}
```

- [ ] **Step 7: Run the owner tests, all unit tests and the build**

Run: `npm --prefix electron run unit -- test/service-start.test.ts test/service-stop.test.ts && npm --prefix electron run unit && npm --prefix electron run build`
Expected: PASS. The `hang` and timeout cases each take about 5.5 s, which covers the stop grace plus SIGTERM. The build exits 0.

- [ ] **Step 8: Commit**

```bash
git add electron/src/lifecycle.ts electron/test/fixtures/fake_service.py electron/test/proc.ts electron/test/helpers.ts electron/test/service-start.test.ts electron/test/service-stop.test.ts
git commit -m "feat(electron): own the managed service process group (spawn, lease, identity, stop)"
```

---

### Task 8: Port every `tests/test_managed_service.py` owner case to the real `run.py`

**Files:**
- Create: `electron/test/fixtures/owner.mjs`. This is a separate owner process for the owner-death cases; it imports the compiled `dist/lifecycle.js`.
- Test: `electron/test/service-parity.test.ts`. It ports the `tests/test_managed_service.py` cases at the old lines 104-133, 135-145, 148-161, 183-191, 194-203, 206-227, 244-278, 292-304 and 307-321. Lines 164-180 and 281-289 are already covered in Task 7.

**Interfaces:**
- Consumes: `ManagedService`, `prepareWorkspace`, `MESSAGES` (Task 7), `run.py` protocol 2 (Task 6) and the `fake_service.py` `pdeathsig` mode (Task 7).
- Produces: tests only. They are parity ports of behaviour built in Tasks 6–7, so they are expected to pass on first run. A failure is a defect in Task 6 or Task 7 code: fix it there and keep the test.

- [ ] **Step 1: Write the owner fixture**

`electron/test/fixtures/owner.mjs`:
```js
// A separate owner process for owner-death tests: the compiled ManagedService, exactly as Electron main uses it.
import { ManagedService } from '../../dist/lifecycle.js';

const [python, entryPoint, workspace, port, timeoutMs] = process.argv.slice(2);
const service = new ManagedService({ python, entryPoint, workspace, port: Number(port), timeoutMs: Number(timeoutMs), env: process.env });
service.start().then(
  (handle) => process.stdout.write(`${JSON.stringify({ ready: handle.pid })}\n`),
  (error) => process.stdout.write(`${JSON.stringify({ error: error.code })}\n`),
);
setInterval(() => undefined, 60_000);   // stay alive until the test kills this owner
```

- [ ] **Step 2: Write the parity tests**

`electron/test/service-parity.test.ts`:
```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { LifecycleError, MESSAGES, prepareWorkspace } from '../src/lifecycle.js';
import { ELECTRON_ROOT, FAKE, PYTHON, REPO_ROOT, RUN_PY, admin, freePort, live, readPids, rejection, serviceFactory, tempDir, until, workspace } from './helpers.js';

const service = serviceFactory();
const strays: ChildProcess[] = [];
afterEach(() => {
  for (const child of strays.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
});

function withoutSecrets(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NOEMA_ACCESS_TOKEN;
  delete env.NOEMA_DATA_DIR;
  return env;
}

function startOwner(args: string[], env: NodeJS.ProcessEnv = process.env) {
  if (!fs.existsSync(path.join(ELECTRON_ROOT, 'dist/lifecycle.js'))) throw new Error('Run npm --prefix electron run build first');
  const owner = spawn(process.execPath, [path.join(ELECTRON_ROOT, 'test/fixtures/owner.mjs'), ...args], { stdio: ['ignore', 'pipe', 'ignore'], env });
  strays.push(owner);
  const first = new Promise<{ ready?: number; error?: string }>((resolve) => {
    let text = '';
    owner.stdout.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
      const newline = text.indexOf('\n');
      if (newline >= 0) resolve(JSON.parse(text.slice(0, newline)));
    });
  });
  return { owner, first };
}

describe('managed service parity (ported from tests/test_managed_service.py)', () => {
  it('cold reopen, retries while running and a competing owner keep one service and its state (:104)', async () => {
    const port = await freePort();
    const ws = workspace();
    const owner = service({ port, workspace: ws });
    const { pid } = await owner.start();
    const identity = await (await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).json() as Record<string, unknown>;
    expect(identity.pid).toBe(pid);
    expect(Object.keys(identity).sort()).toEqual(['instance', 'pid', 'protocol']);
    const task = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic task', priority: 'low' } });
    const dependent = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic dependent', dependencies: [task.id] } });
    await admin(ws, port, '/focus', { method: 'POST', body: { task_id: task.id, pinned: true } });
    const retries = await Promise.all(Array.from({ length: 8 }, () => owner.start()));
    expect(new Set(retries.map((handle) => handle.pid))).toEqual(new Set([pid]));
    const competitor = service({ port, workspace: ws });
    expect((await rejection(competitor.start())).code).toBe('workspace-locked');
    expect((await admin(ws, port, '/health')).ok).toBe(true);
    await owner.stop();
    expect(live(pid)).toBe(false);
    const reopened = service({ port, workspace: ws });
    expect((await reopened.start()).pid).not.toBe(pid);
    const state = await admin(ws, port, '/state');
    const tasks = new Map<string, any>(state.tasks.map((item: any) => [item.id, item]));
    expect(tasks.size).toBe(2);
    expect(tasks.get(task.id).priority).toBe('low');
    expect(tasks.get(dependent.id).dependencies).toEqual([task.id]);
    expect(state.focus).toMatchObject({ pinned: true, task_id: task.id });
  });

  it('never contacts or kills a port occupant (:135)', async () => {
    let contacts = 0;
    const occupant = net.createServer((socket) => {
      contacts += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => occupant.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = occupant.address() as net.AddressInfo;
      const error = await rejection(service({ port, workspace: workspace() }).start());
      expect([error.code, error.message]).toEqual(['port-in-use', MESSAGES.portInUse]);
      expect(contacts).toBe(0);
      expect(occupant.listening).toBe(true);
    } finally {
      occupant.close();
    }
  });

  it.each(['entry', 'dependency'])('bounds a %s failure as a startup error (:148)', async (failure) => {
    const dir = tempDir();
    const entry = path.join(dir, failure === 'entry' ? 'missing-entry.py' : 'missing-dependency.py');
    if (failure === 'dependency') fs.writeFileSync(entry, 'raise ModuleNotFoundError("synthetic dependency")\n');
    const error = await rejection(service({ port: await freePort(), workspace: workspace(), entryPoint: entry }).start());
    expect([error.code, error.message]).toEqual(['startup-exit', MESSAGES.startupExit]);
  });

  it('refuses a data directory that is a file before spawning (:148 permissions)', () => {
    const file = path.join(tempDir(), 'file');
    fs.writeFileSync(file, 'not a directory');
    expect(() => prepareWorkspace(file, '/')).toThrow(MESSAGES.createDir);
  });

  it('needs an explicit Retry after a crash, and Retry rebinds the fixed port at once (:183, SO_REUSEADDR)', async () => {
    const port = await freePort();
    const owner = service({ port, workspace: workspace() });
    const first = await owner.start();
    const agent = new http.Agent({ keepAlive: true });   // a live connection leaves TIME_WAIT/FIN_WAIT on the port
    await new Promise<void>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/api/health', agent }, (response) => {
        response.resume();
        response.on('end', resolve);
      }).on('error', reject);
    });
    const crashed = once(owner, 'crashed') as Promise<[LifecycleError]>;
    process.kill(first.pid, 'SIGKILL');
    const [error] = await crashed;
    expect(error.message).toBe(MESSAGES.crashed);
    await delay(300);
    expect(owner.state).toBe('crashed');   // no automatic restart loop
    const second = await owner.start();
    expect(second.pid).not.toBe(first.pid);
    expect(((await (await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).json()) as { pid: number }).pid).toBe(second.pid);
    agent.destroy();
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)('owner %s closes the lease and frees the lock and port (:194)', async (signal) => {
    const port = await freePort();
    const ws = workspace();
    const { owner, first } = startOwner([PYTHON, RUN_PY, ws, String(port), '30000']);
    const { ready } = await first;
    expect(typeof ready).toBe('number');
    owner.kill(signal);
    await until(() => !live(ready!));
    expect((await service({ port, workspace: ws }).start()).pid).not.toBe(ready);
  });

  it('owner SIGKILL before the lease watcher still stops Python through PDEATHSIG (:307)', async () => {
    const port = await freePort();
    const ws = workspace();
    const pidfile = path.join(tempDir(), 'pids.json');
    const { owner } = startOwner([PYTHON, FAKE, ws, String(port), '30000'], { ...process.env, NOEMA_FAKE_MODE: 'pdeathsig', NOEMA_FAKE_PIDFILE: pidfile });
    await until(() => readPids(pidfile).length === 1);
    const [pid] = readPids(pidfile);
    owner.kill('SIGKILL');
    await until(() => !live(pid));
    await service({ port, workspace: ws }).start();
  });

  it('never owns an external service on the same workspace (:206)', async () => {
    const port = await freePort();
    const ws = workspace();
    const external = spawn(PYTHON, [RUN_PY, '--data-dir', ws, '--port', String(port)], { stdio: 'ignore', env: withoutSecrets() });
    strays.push(external);
    await until(() => fs.existsSync(path.join(ws, 'admin.token')));
    await until(async () => {
      try {
        return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
      } catch {
        return false;
      }
    });
    expect((await fetch(`http://127.0.0.1:${port}/api/desktop-instance`)).status).toBe(404);
    const error = await rejection(service({ port, workspace: ws }).start());
    expect(error.code).toBe('workspace-locked');
    expect(external.exitCode).toBeNull();
    expect((await admin(ws, port, '/state')).tasks).toEqual([]);
  });

  it('lets a separately wrapped agent survive an owned quit (:244)', async () => {
    const port = await freePort();
    const ws = workspace();
    const owner = service({ port, workspace: ws });
    await owner.start();
    const task = await admin(ws, port, '/tasks', { method: 'POST', body: { title: 'Synthetic agent task' } });
    const { token } = await admin(ws, port, '/tokens', { method: 'POST', body: { name: 'Fixture agent', scope: 'agent', task_ids: [task.id] } });
    const release = path.join(tempDir(), 'release');
    const code = `from pathlib import Path; import time\np=Path(${JSON.stringify(release)})\nwhile not p.exists(): time.sleep(.05)`;
    const agent = spawn(PYTHON, [path.join(REPO_ROOT, 'tools/agent.py'), '--url', `http://127.0.0.1:${port}`, '--task', task.id,
      '--outbox', path.join(tempDir(), 'agent-outbox.sqlite3'), '--', PYTHON, '-c', code], { stdio: 'ignore', env: { ...process.env, NOEMA_TOKEN: token } });
    strays.push(agent);
    const agentExit = once(agent, 'exit');
    try {
      await until(async () => (await admin(ws, port, '/state')).runs.length === 1);
      await owner.stop();
      expect(agent.exitCode).toBeNull();
      await service({ port, workspace: ws }).start();
      fs.writeFileSync(release, '');
      const [exitCode] = await agentExit;
      expect(exitCode).toBe(0);
      const state = await admin(ws, port, '/state');
      expect(state.tasks[0].status).toBe('todo');
      expect(state.runs[0].effective_status).toBe('review');
    } finally {
      fs.writeFileSync(release, '');
    }
  });

  it('disables inherited optional features and never uses NOEMA_DATA_DIR (:292)', async () => {
    const root = tempDir();
    const ws = prepareWorkspace(path.join(root, 'selected'), '/');
    const port = await freePort();
    const env = {
      ...process.env,
      NOEMA_MODEL: 'must-not-start',
      NOEMA_SPEECH_MODEL: 'must-not-download',
      NOEMA_ACCESS_TOKEN: 'inherited-secret-not-used-'.repeat(2),
      NOEMA_DATA_DIR: path.join(root, 'not-selected'),
    };
    await service({ port, workspace: ws, env }).start();
    const state = await admin(ws, port, '/state');
    expect(state.capabilities.organizer).toBe(false);
    expect(state.capabilities.speech).toBe(false);
    expect(state.settings.observation_enabled).toBe(false);
    expect(fs.existsSync(path.join(root, 'not-selected'))).toBe(false);
  });

  it('serves a symlinked workspace through its canonical path', async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'real'), { mode: 0o700 });
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'link'));
    const ws = prepareWorkspace(path.join(root, 'link'), '/');
    expect(ws).toBe(fs.realpathSync(path.join(root, 'real')));
    await service({ port: await freePort(), workspace: ws }).start();
    expect(fs.existsSync(path.join(root, 'real', 'admin.token'))).toBe(true);
  });
});
```

- [ ] **Step 3: Build and run the parity tests**

Run: `npm --prefix electron run build && npm --prefix electron run unit -- test/service-parity.test.ts`
Expected: PASS, about 14 cases. If `dist/lifecycle.js` is missing, the owner cases fail with `Run npm --prefix electron run build first`.

- [ ] **Step 4: Commit**

```bash
git add electron/test/fixtures/owner.mjs electron/test/service-parity.test.ts
git commit -m "test(electron): port the managed-service owner cases to the Node lifecycle"
```

---

### Task 9: Protocol names, preloads and the local startup page

**Files:**
- Create: `electron/src/protocol.ts`, `electron/src/preload.cts` (→ `dist/preload.cjs`), `electron/src/startup-preload.cts` (→ `dist/startup-preload.cjs`)
- Create: `electron/static/startup.html`, `electron/static/startup.js`, `electron/static/startup.css`
- Test: `electron/test/preload.test.ts`. Sandboxed preloads cannot import `protocol.ts`, so this test pins their literals. It also pins the page event names to `web/src/events.ts`.

**Interfaces:**
- Consumes: `web/src/events.ts` (contract §1.3, created by `01-foundation.md`): `CHECKPOINT_CLOSE`, `SERVICE_DOWN`, `SERVICE_UP`, `CLOSE_APPROVED`.
- Produces (contract §8.2):
  - `IPC_PAGE`, `IPC_STARTUP_RETRY`, `IPC_STARTUP_CANCEL`, `IPC_STARTUP_STATUS`
  - `type StartupStatus`
  - `CHECKPOINT_CLOSE`, `SERVICE_DOWN`, `SERVICE_UP`, `CLOSE_APPROVED`
  - `STARTUP_TEXT` (local). It holds the two texts this shell shows; the contract's "Stopping the owned local service…" is never visible, because the window is destroyed before the stop.
  - `window.ipc.postMessage(msg)`
  - `window.noemaStartup = { retry(), cancel(), onStatus(cb) }`
  - DOM ids `#status`, `#retry` and `#cancel`

- [ ] **Step 1: Write the failing preload test**

`electron/test/preload.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as protocol from '../src/protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => fs.readFileSync(path.resolve(here, file), 'utf8');
const literal = (source: string, name: string) => source.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];

describe('sandboxed preloads cannot import protocol.ts, so their literals are pinned here', () => {
  it('main preload sends only close approval on the page channel', () => {
    const source = read('../src/preload.cts');
    expect(literal(source, 'IPC_PAGE')).toBe(protocol.IPC_PAGE);
    expect(literal(source, 'CLOSE_APPROVED')).toBe(protocol.CLOSE_APPROVED);
    expect(source).toContain("exposeInMainWorld('ipc'");
  });

  it('startup preload uses the startup channels', () => {
    const source = read('../src/startup-preload.cts');
    expect(literal(source, 'IPC_STARTUP_RETRY')).toBe(protocol.IPC_STARTUP_RETRY);
    expect(literal(source, 'IPC_STARTUP_CANCEL')).toBe(protocol.IPC_STARTUP_CANCEL);
    expect(literal(source, 'IPC_STARTUP_STATUS')).toBe(protocol.IPC_STARTUP_STATUS);
    expect(source).toContain("exposeInMainWorld('noemaStartup'");
  });

  it('page event names equal web/src/events.ts', () => {
    const events = read('../../web/src/events.ts');
    for (const name of ['CHECKPOINT_CLOSE', 'SERVICE_DOWN', 'SERVICE_UP', 'CLOSE_APPROVED'] as const) {
      expect(events.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]).toBe(protocol[name]);
    }
  });

  it('the startup page is local-only, has no inline script and renders text safely', () => {
    const html = read('../static/startup.html');
    const script = read('../static/startup.js');
    expect(html).toContain(`content="default-src 'self'"`);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    for (const fragment of ['id="status"', 'role="status"', 'id="retry"', 'Retry service', 'id="cancel"', 'Cancel / Quit']) expect(html).toContain(fragment);
    expect(script).not.toContain('innerHTML');
    expect(script).toContain('textContent');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix electron run unit -- test/preload.test.ts`
Expected: FAIL — `Failed to load url ../src/protocol.js`.

- [ ] **Step 3: Implement the protocol module and the preloads**

`electron/src/protocol.ts`:
```ts
// IPC channel names, page event names and startup texts shared by main, the preloads and the tests.
export const IPC_PAGE = 'noema:ipc';
export const IPC_STARTUP_RETRY = 'noema:startup-retry';
export const IPC_STARTUP_CANCEL = 'noema:startup-cancel';
export const IPC_STARTUP_STATUS = 'noema:startup-status';
export type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };
// Must equal web/src/events.ts (test/preload.test.ts).
export const CHECKPOINT_CLOSE = 'noema:checkpoint-close', SERVICE_DOWN = 'noema:service-down', SERVICE_UP = 'noema:service-up', CLOSE_APPROVED = 'noema:close-approved';
// desktop/src/main.rs:229 and :366.
export const STARTUP_TEXT = { starting: 'Starting the managed local service…', cancelling: 'Cancelling managed startup…' } as const;
```

`electron/src/preload.cts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';

// Sandboxed preloads cannot import ./protocol.js; test/preload.test.ts keeps these equal to protocol.ts.
const IPC_PAGE = 'noema:ipc';
const CLOSE_APPROVED = 'noema:close-approved';

contextBridge.exposeInMainWorld('ipc', Object.freeze({
  postMessage(message: unknown): void {
    if (message === CLOSE_APPROVED) ipcRenderer.send(IPC_PAGE, message);
  },
}));
```

`electron/src/startup-preload.cts`:
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Sandboxed preloads cannot import ./protocol.js; test/preload.test.ts keeps these equal to protocol.ts.
const IPC_STARTUP_RETRY = 'noema:startup-retry';
const IPC_STARTUP_CANCEL = 'noema:startup-cancel';
const IPC_STARTUP_STATUS = 'noema:startup-status';
type StartupStatus = { text: string; busy: boolean; mode: 'startup' | 'overlay' };

contextBridge.exposeInMainWorld('noemaStartup', Object.freeze({
  retry(): void {
    ipcRenderer.send(IPC_STARTUP_RETRY);
  },
  cancel(): void {
    ipcRenderer.send(IPC_STARTUP_CANCEL);
  },
  onStatus(callback: (status: StartupStatus) => void): void {
    ipcRenderer.on(IPC_STARTUP_STATUS, (_event: IpcRendererEvent, status: StartupStatus) => callback(status));
  },
}));
```

- [ ] **Step 4: Write the startup page**

`electron/static/startup.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Noema</title>
  <link rel="stylesheet" href="startup.css">
</head>
<body>
  <main>
    <p id="status" role="status" aria-live="polite">Starting the managed local service…</p>
    <div class="actions">
      <button id="retry" type="button" disabled>Retry service</button>
      <button id="cancel" type="button">Cancel / Quit</button>
    </div>
  </main>
  <script src="startup.js"></script>
</body>
</html>
```

`electron/static/startup.js`:
```js
// Local startup/crash page (spec §6.4.6). Talks only to its own preload; text is never parsed as HTML.
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const cancel = document.getElementById('cancel');
retry.addEventListener('click', () => window.noemaStartup.retry());
cancel.addEventListener('click', () => window.noemaStartup.cancel());
window.noemaStartup.onStatus((next) => {
  status.textContent = next.text;
  retry.disabled = next.busy;
  cancel.textContent = next.mode === 'overlay' ? 'Quit' : 'Cancel / Quit';
});
```

`electron/static/startup.css`:
```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101110; color: #e8e6e1; font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 34rem; padding: 24px; }
#status { margin: 0 0 16px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button { min-height: 44px; padding: 0 16px; border: 1px solid #4a4d48; border-radius: 8px; background: #1c1e1b; color: inherit; font: inherit; cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible { outline: 2px solid #c9d4c3; outline-offset: 2px; }
```

- [ ] **Step 5: Run the test and the build**

Run: `npm --prefix electron run unit -- test/preload.test.ts && npm --prefix electron run build && ls electron/dist/preload.cjs electron/dist/startup-preload.cjs`
Expected: PASS. Both `.cjs` files are listed.

- [ ] **Step 6: Commit**

```bash
git add electron/src/protocol.ts electron/src/preload.cts electron/src/startup-preload.cts electron/static/startup.html electron/static/startup.js electron/static/startup.css electron/test/preload.test.ts
git commit -m "feat(electron): preloads and the local startup page"
```

---

### Task 10: Main window, navigation isolation and single instance (external mode)

**Files:**
- Create: `electron/src/navigation.ts`, `electron/src/main.ts`. This task writes external mode only; Tasks 11–13 extend it.
- Create: `electron/playwright.config.ts`. Its `outputDir` is `dist/test-results`, so no `.gitignore` change is needed.
- Create: `electron/e2e/fixtures.ts`. This task writes the base; Tasks 11–12 append to it (Task 13 adds its managed-mode helpers in `electron/e2e/managed.ts`).
- Test: `electron/e2e/isolation.spec.ts`, `electron/e2e/single-instance.spec.ts`

**Interfaces:**
- Consumes:
  - `parseArgs`, `userArgv`, `HELP_TEXT`, `CliOptions` (Task 3)
  - `resolveProfile`, `prepareProfile` (Task 4)
  - `sameOrigin`, `downloadAllowed`, `externalLinkAllowed` (Task 1)
  - `dist/preload.cjs` (Task 9)
  - `tempDir` from `electron/test/proc.ts` (Task 7)
  - `startNoema`/`NoemaServer` from `web/e2e/server.ts` (01-foundation)
- Produces:
  - `installNavigationGuards(contents: Electron.WebContents, origin: string): void`
  - `launchNoema(args, options?): Promise<{ app; window; profile }>` (contract §9.4)
  - fixtures `killAll()`, `tempDir()`, `waitConnected()`, `windowCount()`, `stubOpenExternal()`, `openedExternal()`, `MAIN`, `ELECTRON_BIN`
  - main exit codes: 0 for `--help` and for a second instance; 2 with `Noema: <message>` on stderr for a CLI or profile error

- [ ] **Step 1: Write the Playwright config and the base fixtures**

`electron/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'dist/test-results',   // dist/ is already gitignored (contract §10)
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
```

`electron/e2e/fixtures.ts`:
```ts
import { _electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

export { expect };
export type { Locator };
export const ELECTRON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(ELECTRON_ROOT, '..');
export const MAIN = path.join(ELECTRON_ROOT, 'dist/main.js');
export const ELECTRON_BIN = electronPath as unknown as string;

import { tempDir } from '../test/proc.js';

export { tempDir };   // one temp-dir helper for unit and e2e tests (Task 7)

const launched: ElectronApplication[] = [];

/** Always a throwaway --profile unless one is passed back in to test a restart. */
export async function launchNoema(args: string[], options: { env?: Record<string, string>; profile?: string } = {}): Promise<{ app: ElectronApplication; window: Page; profile: string }> {
  if (!fs.existsSync(MAIN)) throw new Error('Run npm --prefix electron run build first');
  const profile = options.profile ?? tempDir('noema-electron-profile-');
  const env = Object.fromEntries(Object.entries({ ...process.env, ...options.env }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // Chromium switches go before the app path; Noema's own arguments follow it (cli.ts userArgv).
  const app = await _electron.launch({ args: ['--use-fake-device-for-media-stream', MAIN, '--profile', profile, ...args], env });
  launched.push(app);
  const window = await app.firstWindow();
  return { app, window, profile };
}

/** After each test: any app still running is killed; an owned service then stops through its lease. */
export async function killAll(): Promise<void> {
  for (const app of launched.splice(0)) {
    const child = app.process();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

export async function waitConnected(page: Page): Promise<void> {
  await page.getByText('Server connected', { exact: true }).first().waitFor({ timeout: 45_000 });
}

export function windowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

export async function stubOpenExternal(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as typeof globalThis & { __opened?: string[] };
    g.__opened = [];
    shell.openExternal = async (url: string) => {
      g.__opened!.push(url);
    };
  });
}

export function openedExternal(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as typeof globalThis & { __opened?: string[] }).__opened ?? []);
}
```

- [ ] **Step 2: Write the failing isolation and single-instance specs**

`electron/e2e/isolation.spec.ts`:
```ts
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { killAll, launchNoema, openedExternal, stubOpenExternal, tempDir, waitConnected, windowCount } from './fixtures.js';

let noema: NoemaServer;
let app: ElectronApplication;
let window: Page;
let offServer: http.Server;
let offOrigin = '';
let offHits = 0;

test.beforeAll(async () => {
  // A reachable foreign origin: if a guard failed, the navigation would really load and count a hit.
  offServer = http.createServer((_request, response) => {
    offHits += 1;
    response.setHeader('Content-Type', 'text/html');
    response.end('<p>off-origin</p>');
  });
  await new Promise<void>((resolve) => offServer.listen(0, '127.0.0.1', resolve));
  offOrigin = `http://127.0.0.1:${(offServer.address() as AddressInfo).port}`;
  noema = await startNoema();
  ({ app, window } = await launchNoema(['--server', noema.origin]));
  await waitConnected(window);
});

test.afterAll(async () => {
  await killAll();
  await noema?.stop();
  offServer?.close();
});

test.beforeEach(() => {
  offHits = 0;
});

async function backHome(): Promise<void> {
  await window.goto(`${noema.origin}/#/overview`);
  await waitConnected(window);
}

test('off-origin, look-alike and credentialed navigations are blocked before any request', async () => {
  const lookAlike = noema.origin.replace('127.0.0.1', 'localhost');
  const credentialed = noema.origin.replace('http://', 'http://user@');
  for (const target of [`${offOrigin}/`, `${lookAlike}/`, `${credentialed}/`]) {
    await window.evaluate((url) => { location.href = url; }, target);
    await window.waitForTimeout(600);
    expect(new URL(window.url()).origin).toBe(noema.origin);
  }
  expect(offHits).toBe(0);
});

test('a same-origin redirect to another origin is blocked', async () => {
  await app.context().route(`${noema.origin}/redirect-probe`, (route) => route.fulfill({ status: 302, headers: { location: `${offOrigin}/` } }));
  await window.evaluate(() => { location.href = '/redirect-probe'; });
  await window.waitForTimeout(800);
  expect(offHits).toBe(0);
  expect(window.url().startsWith(offOrigin)).toBe(false);
  await app.context().unroute(`${noema.origin}/redirect-probe`);
  await backHome();
});

test('subframe navigation off-origin and <webview> attach are blocked', async () => {
  const before = await app.evaluate(({ webContents }) => webContents.getAllWebContents().length);
  // A same-origin page without the server CSP, so only the Electron guards stand in the way.
  await app.context().route(`${noema.origin}/frame-probe`, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<iframe src="${offOrigin}/frame"></iframe><webview src="${offOrigin}/webview"></webview>`,
  }));
  await window.evaluate(() => { location.href = '/frame-probe'; });
  await window.waitForURL(`${noema.origin}/frame-probe`);
  await window.waitForTimeout(800);
  expect(offHits).toBe(0);
  expect(window.frames().some((frame) => frame.url().startsWith(offOrigin))).toBe(false);
  expect(await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)).toBe(before);
  await app.context().unroute(`${noema.origin}/frame-probe`);
  await backHome();
});

test('popups never open in-app; only plain http(s) links reach the system browser', async () => {
  await stubOpenExternal(app);
  const targets = [`${offOrigin}/`, 'https://example.com/session', 'https://token@example.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c'];
  const results = await window.evaluate((urls) => urls.map((url) => window.open(url) === null), targets);
  expect(results.every(Boolean)).toBe(true);
  expect(await windowCount(app)).toBe(1);
  await expect.poll(() => openedExternal(app)).toEqual([`${offOrigin}/`, 'https://example.com/session']);
  expect(offHits).toBe(0);
});

test('export and same-origin blobs download; other schemes do not', async () => {
  const dir = tempDir('noema-downloads-');
  await app.evaluate(({ session }, saveDir) => {
    const g = globalThis as typeof globalThis & { __downloads?: { url: string; state: string }[] };
    g.__downloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const record = { url: item.getURL(), state: 'pending' };
      g.__downloads!.push(record);
      item.setSavePath(`${saveDir}/${g.__downloads!.length}-${item.getFilename()}`);
      item.once('done', (_done, state) => { record.state = state; });
    });
  }, dir);
  const records = () => app.evaluate(() => (globalThis as typeof globalThis & { __downloads?: { url: string; state: string }[] }).__downloads ?? []);
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = '/api/export';
    anchor.download = '';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob(['note'], { type: 'text/markdown' }));
    anchor.download = 'note.md';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await window.evaluate(() => {
    const anchor = document.createElement('a');
    anchor.href = 'data:text/plain,blocked';
    anchor.download = 'blocked.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  await expect.poll(async () => (await records()).find((item) => item.url.endsWith('/api/export'))?.state).toBe('completed');
  await expect.poll(async () => (await records()).find((item) => item.url.startsWith('blob:'))?.state).toBe('completed');
  await window.waitForTimeout(1500);
  expect((await records()).find((item) => item.url.startsWith('data:'))?.state ?? 'never-started').not.toBe('completed');
  expect(fs.readdirSync(dir).some((name) => name.endsWith('blocked.txt'))).toBe(false);
});
```

`electron/e2e/single-instance.spec.ts`:
```ts
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { startNoema } from '../../web/e2e/server.js';
import { ELECTRON_BIN, MAIN, killAll, launchNoema, waitConnected, windowCount } from './fixtures.js';

test.afterEach(killAll);

test('a second instance focuses the first and exits 0 without using its own arguments', async () => {
  const noema = await startNoema();
  try {
    const first = await launchNoema(['--server', noema.origin]);
    await waitConnected(first.window);
    await first.app.evaluate(({ app }) => {
      const g = globalThis as typeof globalThis & { __secondInstances?: number };
      g.__secondInstances = 0;
      app.on('second-instance', () => { g.__secondInstances! += 1; });
    });
    const second = spawn(ELECTRON_BIN, [MAIN, '--profile', first.profile, '--server', 'http://127.0.0.1:9'], { stdio: 'ignore' });
    const [code] = await once(second, 'exit');
    expect(code).toBe(0);
    await expect.poll(() => first.app.evaluate(() => (globalThis as typeof globalThis & { __secondInstances?: number }).__secondInstances)).toBe(1);
    expect(await windowCount(first.app)).toBe(1);
    expect(new URL(first.window.url()).origin).toBe(noema.origin);
  } finally {
    await noema.stop();
  }
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npm --prefix electron run build; npm --prefix electron run e2e -- e2e/isolation.spec.ts e2e/single-instance.spec.ts`
Expected: FAIL — `Error: Run npm --prefix electron run build first` (`dist/main.js` does not exist yet).

- [ ] **Step 4: Implement the navigation guards**

`electron/src/navigation.ts`:
```ts
import { shell, type WebContents } from 'electron';
import { downloadAllowed, externalLinkAllowed, sameOrigin } from './origin.js';

/** Spec §6.3 Navigation: same-origin only; everything else denied, plain web links to the system browser. */
export function installNavigationGuards(contents: WebContents, origin: string): void {
  const sameOriginOnly = (event: { url: string; preventDefault(): void }) => {
    if (!sameOrigin(origin, event.url)) event.preventDefault();   // parse errors are denied by sameOrigin
  };
  contents.on('will-navigate', sameOriginOnly);
  contents.on('will-redirect', sameOriginOnly);
  contents.on('will-frame-navigate', sameOriginOnly);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (externalLinkAllowed(url)) void shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  contents.session.on('will-download', (event, item) => {
    if (!downloadAllowed(origin, item.getURL())) event.preventDefault();
  });
}
```

- [ ] **Step 5: Implement `main.ts` (external mode)**

`electron/src/main.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_TEXT, parseArgs, userArgv, type CliOptions } from './cli.js';
import { installNavigationGuards } from './navigation.js';
import { prepareProfile, resolveProfile } from './profile.js';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DIST, '../..');

function exitWith(code: 0 | 2, message: string): never {
  (code === 0 ? process.stdout : process.stderr).write(`${message}\n`);
  process.exit(code);
}

function readOptions(): { options: CliOptions; profile: string } {
  try {
    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env);
    if (options === 'help') exitWith(0, HELP_TEXT);
    const profile = resolveProfile(options.profile, process.env, process.cwd());
    prepareProfile(profile);
    return { options, profile };
  } catch (error) {
    exitWith(2, `Noema: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createWindow(): BrowserWindow {
  return new BrowserWindow({
    title: 'Noema',
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 540,               // main.rs:160-164
    backgroundColor: '#101110',   // main.rs:173
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(DIST, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
}

function run(options: CliOptions): void {
  const origin = options.server;
  let win: BrowserWindow | null = null;
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void app.whenReady().then(() => {
    const window = createWindow();
    win = window;
    installNavigationGuards(window.webContents, origin);
    void window.loadURL(origin).catch(() => undefined);
  });
}

const { options, profile } = readOptions();
app.setPath('userData', profile);   // before the lock: Chromium's ProcessSingleton lives in userData (spec §6.3)
if (app.requestSingleInstanceLock()) run(options);
else app.exit(0);   // the first instance receives 'second-instance'; this one exits 0 without using its arguments
```

- [ ] **Step 6: Build and run both specs**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/isolation.spec.ts e2e/single-instance.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add electron/src/navigation.ts electron/src/main.ts electron/playwright.config.ts electron/e2e/fixtures.ts electron/e2e/isolation.spec.ts electron/e2e/single-instance.spec.ts
git commit -m "feat(electron): origin-locked main window and single instance"
```

---

### Task 11: Wire the permission prompts

**Files:**
- Modify: `electron/src/main.ts`. Change the `electron` import on line 1, add one import, and add the permission wiring in `run()` after `installNavigationGuards`.
- Modify: `electron/e2e/fixtures.ts` (append `stubMessageBox` and `messageBoxes`).
- Test: `electron/e2e/permissions.spec.ts`

**Interfaces:**
- Consumes: `installPermissions`, `PERMISSION_PROMPTS` (Task 5).
- Produces:
  - `stubMessageBox(app: ElectronApplication, responses: number[]): Promise<void>` (contract §9.4). Messages accumulate across stubs; when the queue is empty, each box answers its `cancelId`.
  - `messageBoxes(app): Promise<string[]>`

- [ ] **Step 1: Append the dialog stubs to the fixtures**

Append to `electron/e2e/fixtures.ts`:
```ts
/** Replaces dialog.showMessageBox in the main process; answers are consumed in order (spec §6.3: tests stub it). */
export async function stubMessageBox(app: ElectronApplication, responses: number[]): Promise<void> {
  await app.evaluate(({ dialog }, queue) => {
    const g = globalThis as typeof globalThis & { __messageBoxes?: string[] };
    g.__messageBoxes = g.__messageBoxes ?? [];
    const answers = [...queue];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { message: string; cancelId?: number };
      g.__messageBoxes!.push(options.message);
      return { response: answers.length > 0 ? answers.shift()! : options.cancelId ?? 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  }, responses);
}

export function messageBoxes(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as typeof globalThis & { __messageBoxes?: string[] }).__messageBoxes ?? []);
}
```

- [ ] **Step 2: Write the failing permissions spec**

`electron/e2e/permissions.spec.ts`:
```ts
import { test, expect, type Page } from '@playwright/test';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { killAll, launchNoema, messageBoxes, stubMessageBox, waitConnected } from './fixtures.js';

// Verbatim PERMISSION_PROMPTS (src/permissions.ts; main.rs:263-276).
const MICROPHONE = 'Allow Noema to use your microphone for a recording?';
const NOTIFICATIONS = 'Allow Noema to show notifications?';

let noema: NoemaServer;
test.beforeEach(async () => { noema = await startNoema(); });
test.afterEach(async () => { await killAll(); await noema.stop(); });

const getUserMedia = (page: Page, constraints: MediaStreamConstraints) => page.evaluate(async (wanted) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(wanted);
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return (error as DOMException).name;
  }
}, constraints);

test('audio-only media is prompted once per app session; video is always denied', async () => {
  const first = await launchNoema(['--server', noema.origin]);
  await waitConnected(first.window);
  await stubMessageBox(first.app, [0]);
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { audio: true })).toBe('granted');
  expect(await getUserMedia(first.window, { video: true })).toBe('NotAllowedError');
  expect(await getUserMedia(first.window, { audio: true, video: true })).toBe('NotAllowedError');
  expect(await messageBoxes(first.app)).toEqual([MICROPHONE]);
  await first.app.close();
  // Decisions are not persisted: a restart prompts again.
  const second = await launchNoema(['--server', noema.origin], { profile: first.profile });
  await waitConnected(second.window);
  await stubMessageBox(second.app, [1]);
  expect(await getUserMedia(second.window, { audio: true })).toBe('NotAllowedError');
  expect(await messageBoxes(second.app)).toEqual([MICROPHONE]);
});

test('Notification.permission is correct before and after a decision', async () => {
  const { app, window } = await launchNoema(['--server', noema.origin]);
  await waitConnected(window);
  expect(await window.evaluate(() => Notification.permission)).not.toBe('granted');
  await stubMessageBox(app, [0]);
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await window.evaluate(() => Notification.permission)).toBe('granted');
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
  expect(await messageBoxes(app)).toEqual([NOTIFICATIONS]);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/permissions.spec.ts`
Expected: FAIL. Electron's default grants every permission silently, so the first test fails with `Expected: ["Allow Noema to use your microphone for a recording?"]  Received: []` (or `NotAllowedError` is not received for video). The second fails because `Notification.permission` is already `"granted"`.

- [ ] **Step 4: Wire the handlers in `main.ts`**

In `electron/src/main.ts`, replace line 1:
```ts
import { app, BrowserWindow } from 'electron';
```
with:
```ts
import { app, BrowserWindow, dialog, session } from 'electron';
```
After the line `import { installNavigationGuards } from './navigation.js';`, add:
```ts
import { installPermissions, PERMISSION_PROMPTS } from './permissions.js';
```
In `run()`, replace:
```ts
    installNavigationGuards(window.webContents, origin);
    void window.loadURL(origin).catch(() => undefined);
```
with:
```ts
    installNavigationGuards(window.webContents, origin);
    installPermissions(session.defaultSession, origin, async (kind) => (await dialog.showMessageBox(window, {
      type: 'question', message: PERMISSION_PROMPTS[kind], buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1,
    })).response === 0);
    void window.loadURL(origin).catch(() => undefined);
```

- [ ] **Step 5: Build and run**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/permissions.spec.ts e2e/isolation.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/src/main.ts electron/e2e/fixtures.ts electron/e2e/permissions.spec.ts
git commit -m "feat(electron): prompt for audio and notifications once per app session"
```

---

### Task 12: Checkpoint close contract

**Files:**
- Create: `electron/src/close.ts` (port of `desktop/src/close.js:1-8` and `desktop/src/main.rs:324-342`)
- Modify: `electron/src/main.ts` (one import, plus the `installCloseHandler` call in `run()`)
- Modify: `electron/e2e/fixtures.ts` (append `closeWindow`, `openCapture`, `readDraft` and `outboxIds`)
- Test: `electron/e2e/close.spec.ts`

**Interfaces:**
- Consumes:
  - `sameOrigin` (Task 1)
  - `IPC_PAGE`, `CHECKPOINT_CLOSE`, `CLOSE_APPROVED` (Task 9)
  - `stubMessageBox`, `messageBoxes` (Task 11)
  - the page-side checkpoint (contract §6.5: `installCheckpointClose`, `__noemaCheckpointCloseReady`, `S.closeSaveInFlight`, `S.closeDraftFailed`); see Prerequisites
- Produces:
  - `CLOSE_TIMEOUT_MS = 10_000`
  - `NOT_RESPONDING` (local)
  - `installCloseHandler(win: Electron.BrowserWindow, origin: string, onApproved: () => void): void`
  - fixtures `closeWindow(app)`, `openCapture(page): Promise<Locator>`, `readDraft(page)` and `outboxIds(page)`

**Contract note (gap filled here).** Contract §8.2 gives the request script with a synchronous `dispatchEvent`. This task dispatches the event from a `setTimeout` inside the same script. The page's checkpoint may open `confirm()` (contract §6.5), and a synchronous dispatch would keep `executeJavaScript` pending while the user reads it, so the 10 s timer would fire "Noema is not responding" over a perfectly responsive page. With the deferred dispatch, `executeJavaScript` settling is the renderer's answer that it is alive. The timer then only fires for what spec §6.3 names: "no answer within 10 s (an unresponsive renderer)". A page that refuses (save in flight, declined confirm) keeps the window open with no native dialog. Everything else in the contract string is unchanged.

- [ ] **Step 1: Append the capture/IndexedDB helpers to the fixtures**

Append to `electron/e2e/fixtures.ts`:
```ts
export async function closeWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close(); }).catch(() => undefined);
}

export async function openCapture(page: Page): Promise<Locator> {
  await page.evaluate(() => { location.hash = '#/capture'; });
  // Capture has exactly one writing surface and no title or folder field (spec §4.7).
  const editor = page.locator('textarea').first();
  await editor.waitFor();
  return editor;
}

export type LocalDraft = { raw: string; files: { name: string; bytes: number[] }[] } | null;

/** Reads kv['draft'] from the page's real IndexedDB (desktop/qa/scenario.js:6-14). The app must have opened it first. */
export function readDraft(page: Page): Promise<LocalDraft> {
  return page.evaluate(() => new Promise<LocalDraft>((resolve, reject) => {
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let tx: IDBTransaction;
      try {
        tx = db.transaction('kv', 'readonly');
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      const request = tx.objectStore('kv').get('draft');
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => {
        db.close();
        const draft = request.result as { raw: string; files: { name: string; blob: Blob }[] } | undefined;
        if (!draft) {
          resolve(null);
          return;
        }
        Promise.all(draft.files.map(async (file) => ({ name: file.name, bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())) })))
          .then((files) => resolve({ raw: draft.raw, files }), reject);
      };
    };
  }));
}

export function outboxIds(page: Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let tx: IDBTransaction;
      try {
        tx = db.transaction('outbox', 'readonly');
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      const request = tx.objectStore('outbox').getAllKeys();
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve(request.result.map(String)); };
    };
  }));
}
```

- [ ] **Step 2: Write the failing close spec**

`electron/e2e/close.spec.ts`:
```ts
import net from 'node:net';
import { test, expect, type Page } from '@playwright/test';
import { startNoema, type NoemaServer } from '../../web/e2e/server.js';
import { closeWindow, killAll, launchNoema, messageBoxes, openCapture, readDraft, stubMessageBox, waitConnected, windowCount } from './fixtures.js';

// Verbatim from web/src/strings.ts (contract §5): S.closeSaveInFlight and S.closeDraftFailed.
const CLOSE_SAVE_IN_FLIGHT = 'A capture save is still finishing. Try closing again shortly.';
const CLOSE_DRAFT_FAILED = 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.';
// src/close.ts NOT_RESPONDING and CLOSE_TIMEOUT_MS (close.ts imports electron, so the e2e process cannot import it).
const NOT_RESPONDING = 'Noema is not responding to the close request.';
const CLOSE_TIMEOUT_MS = 10_000;

let noema: NoemaServer;
test.beforeEach(async () => { noema = await startNoema(); });
test.afterEach(async () => { await killAll(); await noema.stop(); });

async function openApp(profile?: string) {
  const launched = await launchNoema(['--server', noema.origin], { profile });
  await waitConnected(launched.window);
  return launched;
}

async function stubConfirm(page: Page, answer: boolean): Promise<void> {
  await page.evaluate((value) => {
    const w = window as typeof window & { __confirms?: string[] };
    w.__confirms = [];
    window.confirm = (message?: string) => {
      w.__confirms!.push(String(message));
      return value;
    };
  }, answer);
}

const confirms = (page: Page) => page.evaluate(() => (window as typeof window & { __confirms?: string[] }).__confirms ?? []);

test('the checkpoint persists a draft typed just before closing (scenario.js draft stage)', async () => {
  const first = await openApp();
  const editor = await openCapture(first.window);
  await editor.fill('Typed right before close.');   // inside the 350 ms debounce
  const closed = first.app.waitForEvent('close');
  await closeWindow(first.app);
  await closed;
  const second = await openApp(first.profile);
  expect((await readDraft(second.window))?.raw).toBe('Typed right before close.');
  await expect(await openCapture(second.window)).toHaveValue('Typed right before close.');
});

test('a capture save in flight keeps the window open with a toast and no not-responding dialog', async () => {
  const { app, window } = await openApp();
  await stubMessageBox(app, []);
  const editor = await openCapture(window);
  await editor.fill('Save in flight');
  await expect.poll(async () => (await readDraft(window))?.raw).toBe('Save in flight');
  // A second connection holds a readwrite transaction on 'outbox', so Save's ['kv','outbox'] transaction waits.
  await window.evaluate(() => new Promise<void>((resolve, reject) => {
    const w = window as typeof window & { __holdOutbox?: boolean };
    w.__holdOutbox = true;
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const store = open.result.transaction('outbox', 'readwrite').objectStore('outbox');
      const spin = () => {
        if (w.__holdOutbox) store.count().onsuccess = spin;
        else open.result.close();
      };
      spin();
      resolve();
    };
  }));
  await window.getByRole('button', { name: 'Save note' }).click();
  await closeWindow(app);
  await expect(window.getByText(CLOSE_SAVE_IN_FLIGHT)).toBeVisible();
  // The page answered (by refusing): the renderer is responsive, so no native dialog may follow.
  await window.waitForTimeout(CLOSE_TIMEOUT_MS + 1_000);
  expect(await messageBoxes(app)).toEqual([]);
  expect(await windowCount(app)).toBe(1);
  await window.evaluate(() => { (window as typeof window & { __holdOutbox?: boolean }).__holdOutbox = false; });
  await expect.poll(async () => (await readDraft(window))?.raw).toBe('');   // the save committed
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
});

test('a failed draft write asks before closing and keeps the window when declined', async () => {
  const { app, window } = await openApp();
  const editor = await openCapture(window);
  await window.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'draft') throw new DOMException('Injected draft failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await editor.fill('Draft that cannot be stored');
  await stubConfirm(window, false);
  await closeWindow(app);
  await expect.poll(() => confirms(window)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  await expect(editor).toHaveValue('Draft that cannot be stored');
  await stubConfirm(window, true);
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
});

test('a hung renderer gets Force close / Keep open after 10 s', async () => {
  const { app, window } = await openApp();
  await stubMessageBox(app, [1, 0]);   // first Keep open, then Force close
  // Hang the renderer for 30 s; the request script cannot run, so executeJavaScript never settles.
  await window.evaluate(() => {
    setTimeout(() => {
      const end = Date.now() + 30_000;
      while (Date.now() < end) { /* an unresponsive renderer */ }
    }, 0);
  });
  await closeWindow(app);
  await expect.poll(() => messageBoxes(app), { timeout: 20_000 }).toEqual([NOT_RESPONDING]);
  expect(await windowCount(app)).toBe(1);   // Keep open
  const closed = app.waitForEvent('close');
  await closeWindow(app);   // still hung: 10 s later the second prompt answers Force close
  await closed;
});

test('closing before the page finished loading closes at once without a checkpoint', async () => {
  const sockets: net.Socket[] = [];
  const silent = net.createServer((socket) => { sockets.push(socket); });   // accepts and never answers: the page never loads
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = silent.address() as net.AddressInfo;
    const { app } = await launchNoema(['--server', `http://127.0.0.1:${port}`]);
    await stubMessageBox(app, []);
    await expect.poll(() => sockets.length).toBeGreaterThan(0);   // the load is in flight
    const closed = app.waitForEvent('close');
    const started = Date.now();
    await closeWindow(app);
    await closed;
    expect(Date.now() - started).toBeLessThan(5_000);   // no checkpoint request and no 10 s wait
  } finally {
    for (const socket of sockets) socket.destroy();
    silent.close();
  }
});

test('a loaded page that never set the ready flag closes without a checkpoint request', async () => {
  const first = await openApp();
  await first.window.evaluate(() => {
    delete (window as typeof window & { __noemaCheckpointCloseReady?: true }).__noemaCheckpointCloseReady;
    window.addEventListener('noema:checkpoint-close', () => localStorage.setItem('noema-test-checkpoint', 'dispatched'), { capture: true });
  });
  const closed = first.app.waitForEvent('close');
  await closeWindow(first.app);
  await closed;
  const second = await openApp(first.profile);
  expect(await second.window.evaluate(() => localStorage.getItem('noema-test-checkpoint'))).toBeNull();
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/close.spec.ts`
Expected: FAIL. Without a close handler the window closes at once:
- the draft test gets `Expected: "Typed right before close."  Received: ""`;
- the in-flight test finds no toast;
- the draft-failure test sees `[]` confirms;
- the hung-renderer test sees no message box.

The two "closes at once" tests already pass; they guard against a regression in Step 4.

- [ ] **Step 4: Implement `close.ts`**

`electron/src/close.ts`:
```ts
import { dialog, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import { sameOrigin } from './origin.js';
import { CHECKPOINT_CLOSE, CLOSE_APPROVED, IPC_PAGE } from './protocol.js';

export const CLOSE_TIMEOUT_MS = 10_000;
export const NOT_RESPONDING = 'Noema is not responding to the close request.';
// desktop/src/close.js:3-8: only a page that finished recovery may checkpoint. The event fires on a later task,
// so a page-side confirm() never holds this script open: the script settling means the renderer is responsive.
const REQUEST_CHECKPOINT = `window.__noemaCheckpointCloseReady===true ? (setTimeout(() => window.dispatchEvent(new Event('${CHECKPOINT_CLOSE}'))), true) : false`;

export function installCloseHandler(win: BrowserWindow, origin: string, onApproved: () => void): void {
  const contents = win.webContents;
  let loaded = false;
  let gone = false;
  let requested = false;
  let approved = false;
  let asking = false;
  let timer: NodeJS.Timeout | undefined;

  const approve = () => {
    if (approved) return;
    approved = true;
    clearTimeout(timer);
    onApproved();
  };
  const notResponding = async () => {
    if (approved || asking || win.isDestroyed()) return;
    asking = true;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning', message: NOT_RESPONDING, buttons: ['Force close', 'Keep open'], defaultId: 1, cancelId: 1,
      });
      if (response === 0) approve();   // Keep open leaves the request pending: a late approval still closes
    } finally {
      asking = false;
    }
  };
  const onPageMessage = (event: IpcMainEvent, message: unknown) => {
    // Only an answer to a close request, from this window's main frame, at the trusted origin (spec §6.3 Preloads).
    if (message !== CLOSE_APPROVED || !requested || event.sender !== contents) return;
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || !sameOrigin(origin, frame.url)) return;
    approve();
  };

  contents.on('did-finish-load', () => { loaded = true; });
  contents.on('render-process-gone', () => {
    gone = true;
    if (requested) approve();   // the renderer is gone: close without touching storage
  });
  ipcMain.on(IPC_PAGE, onPageMessage);
  win.once('closed', () => {
    clearTimeout(timer);
    ipcMain.removeListener(IPC_PAGE, onPageMessage);
  });
  win.on('close', (event) => {
    if (approved) return;
    event.preventDefault();
    // Not finished loading (Electron's executeJavaScript would wait for the load), or no renderer: close at once.
    if (!loaded || gone || contents.isCrashed() || contents.isLoadingMainFrame()) {
      approve();
      return;
    }
    requested = true;
    clearTimeout(timer);
    timer = setTimeout(() => void notResponding(), CLOSE_TIMEOUT_MS);
    contents.executeJavaScript(REQUEST_CHECKPOINT).then((ready: unknown) => {
      // shortcut: a responsive page whose checkpoint never settles stays open until the next close; add a page 'refused' message if users hit it.
      clearTimeout(timer);   // the renderer answered; the page now decides
      if (ready !== true) approve();   // no ready flag: the app never recovered its drafts, so do not touch storage
    }, () => approve());
  });
}
```

- [ ] **Step 5: Wire it in `main.ts`**

In `electron/src/main.ts`, after the line `import { HELP_TEXT, parseArgs, userArgv, type CliOptions } from './cli.js';`, add:
```ts
import { installCloseHandler } from './close.js';
```
In `run()`, replace:
```ts
    void window.loadURL(origin).catch(() => undefined);
```
with:
```ts
    // win.destroy() after approval, so beforeunload cannot cancel the close silently (spec §6.3).
    installCloseHandler(window, origin, () => {
      window.destroy();
      app.quit();
    });
    void window.loadURL(origin).catch(() => undefined);
```

- [ ] **Step 6: Build and run**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/close.spec.ts e2e/permissions.spec.ts`
Expected: PASS (6 + 2 tests). The in-flight case takes about 12 s and the hung-renderer case about 21 s.

- [ ] **Step 7: Commit**

```bash
git add electron/src/close.ts electron/src/main.ts electron/e2e/fixtures.ts electron/e2e/close.spec.ts
git commit -m "feat(electron): checkpoint close contract with a not-responding fallback"
```

---

### Task 13: Managed mode — startup page, state machine, crash overlay and Quit

**Files:**
- Modify: `electron/src/main.ts`. Replace the whole file (the external-mode version from Tasks 10–12). External mode keeps exactly the same behaviour.
- Create: `electron/e2e/managed.ts` (local e2e helpers for managed mode)
- Test: `electron/e2e/managed.spec.ts`

**Interfaces:**
- Consumes:
  - `ManagedService`, `managedPort`, `prepareWorkspace`, `LifecycleError`, `MESSAGES` (Tasks 2 and 7)
  - `IPC_STARTUP_RETRY`, `IPC_STARTUP_CANCEL`, `IPC_STARTUP_STATUS`, `SERVICE_DOWN`, `SERVICE_UP`, `STARTUP_TEXT`, `StartupStatus`, `dist/startup-preload.cjs`, `static/startup.html` (Task 9)
  - `installNavigationGuards` (Task 10), `installPermissions` (Tasks 5 and 11), `installCloseHandler` (Task 12)
  - `launchNoema`, `killAll`, `closeWindow`, `openCapture`, `readDraft`, `waitConnected`, `tempDir`, `ELECTRON_BIN`, `MAIN`, `REPO_ROOT` (`electron/e2e/fixtures.ts`); `live`, `readPids` (`electron/test/proc.ts`); `getFreePort` (`web/e2e/server.ts`)
- Produces:
  - `main.ts` window state machine `type ShellState = 'starting' | 'loaded' | 'crashed' | 'stopping'` (contract §8.1)
  - e2e helpers (local): `type Managed`, `managedSetup()`, `startupPage(app)`, `appPage(app, origin)`, `mainUrl(app)`, `servicePid(origin)`, `ownedServices(electronPid)`, `runElectron(args, env?)`, `FAKE`

Behaviour (spec §6.4.6):

| State | Window | Retry | Close / Cancel / Quit |
|---|---|---|---|
| `starting` | The startup overlay (a `WebContentsView` with its own preload) covers the window; the main page has not navigated anywhere. | Serialised; joins a running attempt. `ManagedService` never spawns while its group is alive. | Window close or Cancel: no checkpoint (no page loaded); `service.cancel()`, then quit. Cancel shows "Cancelling managed startup…" while it stops. |
| `loaded` | The overlay is removed; the origin was loaded only after `ackMatches` and `identityMatches`. | — | Close runs the §6.3 checkpoint, then `win.destroy()`, stop, quit. |
| `crashed` | The page stays loaded and receives `noema:service-down`; the overlay shows the crash text with Retry and Quit. | A success removes the overlay and dispatches `noema:service-up`, with no reload. | Quit = `win.close()`, so the checkpoint runs first. |
| `stopping` | Window destroyed (or showing the cancel text). | Ignored. | Ignored. |

- [ ] **Step 1: Write the managed-mode e2e helpers**

`electron/e2e/managed.ts`:
```ts
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { getFreePort } from '../../web/e2e/server.js';
import { live } from '../test/proc.js';
import { ELECTRON_BIN, MAIN, REPO_ROOT, tempDir } from './fixtures.js';

export const FAKE = path.join(REPO_ROOT, 'electron/test/fixtures/fake_service.py');

export type Managed = { dataDir: string; port: number; origin: string; args: string[]; env: Record<string, string> };

/** Managed mode on a free port. The override needs NOEMA_ELECTRON_TEST=1 and is unreachable from the CLI (spec §6.4.2). */
export async function managedSetup(): Promise<Managed> {
  const port = await getFreePort();
  const dataDir = path.join(tempDir('noema-managed-'), 'data');
  const origin = `http://127.0.0.1:${port}`;
  return {
    dataDir,
    port,
    origin,
    args: ['--manage-service', '--data-dir', dataDir, '--server', origin],
    env: { NOEMA_ELECTRON_TEST: '1', NOEMA_ELECTRON_TEST_PORT: String(port) },
  };
}

async function pageWhere(app: ElectronApplication, matches: (url: string) => boolean, timeout = 45_000): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => matches(candidate.url()));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No matching Electron page');
}

/** The startup/crash overlay: a WebContentsView, which Playwright lists with the windows. */
export const startupPage = (app: ElectronApplication) => pageWhere(app, (url) => url.startsWith('file://') && url.endsWith('/static/startup.html'));
export const appPage = (app: ElectronApplication, origin: string) => pageWhere(app, (url) => url.startsWith(`${origin}/`));

/** The main window's URL as Electron sees it. It stays non-http until the service identity is verified. */
export function mainUrl(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL() ?? '');
}

export async function servicePid(origin: string): Promise<number> {
  return ((await (await fetch(`${origin}/api/desktop-instance`)).json()) as { pid: number }).pid;
}

/** Live direct children of the Electron main process that are managed services (only our own fixture's children). */
export function ownedServices(electronPid: number): number[] {
  const children = fs.readdirSync(`/proc/${electronPid}/task`).flatMap((tid) => {
    try {
      return fs.readFileSync(`/proc/${electronPid}/task/${tid}/children`, 'utf8').split(' ').filter(Boolean).map(Number);
    } catch {
      return [];   // a thread that just exited
    }
  });
  return children.filter((pid) => {
    try {
      return live(pid) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes('--desktop-managed');
    } catch {
      return false;
    }
  });
}

/** Runs the Electron app without Playwright, for command-line exits that never open a window. */
export function runElectron(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ELECTRON_BIN, [MAIN, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
```

- [ ] **Step 2: Write the failing managed spec**

`electron/e2e/managed.spec.ts`:
```ts
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MESSAGES } from '../src/lifecycle.js';
import { STARTUP_TEXT } from '../src/protocol.js';
import { live, readPids } from '../test/proc.js';
import { closeWindow, killAll, launchNoema, openCapture, readDraft, tempDir, waitConnected } from './fixtures.js';
import { FAKE, appPage, mainUrl, managedSetup, ownedServices, runElectron, servicePid, startupPage } from './managed.js';

test.afterEach(killAll);

test('starts the owned service, loads only the verified origin, and stops the service after the close checkpoint', async () => {
  const m = await managedSetup();
  const { app } = await launchNoema(m.args, { env: m.env });
  const page = await appPage(app, m.origin);
  await waitConnected(page);
  const pid = await servicePid(m.origin);
  expect(ownedServices(app.process().pid!)).toEqual([pid]);   // Electron main owns exactly this one service
  expect(fs.statSync(m.dataDir).mode & 0o777).toBe(0o700);    // created 0700 (spec §6.4.1)
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
  await expect.poll(() => live(pid), { timeout: 10_000 }).toBe(false);
});

test('an occupied port shows the occupied message with Retry, never contacts the occupant, and Retry works once it is free', async () => {
  const m = await managedSetup();
  let contacts = 0;
  const occupant = net.createServer((socket) => {
    contacts += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => occupant.listen(m.port, '127.0.0.1', resolve));
  const { app } = await launchNoema(m.args, { env: m.env });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(MESSAGES.portInUse);
  await expect(startup.locator('#retry')).toBeEnabled();
  await expect(startup.locator('#cancel')).toHaveText('Cancel / Quit');
  expect(await mainUrl(app)).not.toMatch(/^http/);
  expect(contacts).toBe(0);
  await new Promise<void>((resolve) => occupant.close(() => resolve()));
  await startup.locator('#retry').click();
  await waitConnected(await appPage(app, m.origin));
  expect(contacts).toBe(0);
});

test('Cancel during startup stops the service and quits without a checkpoint', async () => {
  const m = await managedSetup();
  const pidfile = path.join(tempDir('noema-cancel-'), 'pids.json');
  const { app } = await launchNoema([...m.args, '--entry-point', FAKE, '--startup-timeout', '60'], {
    env: { ...m.env, NOEMA_FAKE_MODE: 'hang', NOEMA_FAKE_PIDFILE: pidfile },
  });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(STARTUP_TEXT.starting);
  await expect(startup.locator('#retry')).toBeDisabled();
  await expect.poll(() => readPids(pidfile).length).toBe(1);
  const [pid] = readPids(pidfile);
  const exited = new Promise<number | null>((resolve) => app.process().once('exit', (code) => resolve(code)));
  await startup.locator('#cancel').click();
  await expect(startup.locator('#status')).toHaveText(STARTUP_TEXT.cancelling);   // the 'hang' fake ignores the lease: ~5 s grace
  expect(await exited).toBe(0);
  expect(live(pid)).toBe(false);
});

test('an HTTP identity mismatch never loads the origin and stops the impostor', async () => {
  const m = await managedSetup();
  const pidfile = path.join(tempDir('noema-identity-'), 'pids.json');
  const { app } = await launchNoema([...m.args, '--entry-point', FAKE], {
    env: { ...m.env, NOEMA_FAKE_MODE: 'bad-http', NOEMA_FAKE_PIDFILE: pidfile },
  });
  const startup = await startupPage(app);
  await expect(startup.locator('#status')).toHaveText(MESSAGES.identity);
  await expect(startup.locator('#retry')).toBeEnabled();
  expect(await mainUrl(app)).not.toMatch(/^http/);
  const [pid] = readPids(pidfile);
  await expect.poll(() => live(pid)).toBe(false);
  expect(fs.readdirSync(m.dataDir)).toEqual([]);
});

test('a crash shows the overlay over the loaded page; Quit runs the checkpoint first', async () => {
  const m = await managedSetup();
  const first = await launchNoema(m.args, { env: m.env });
  const page = await appPage(first.app, m.origin);
  await waitConnected(page);
  const editor = await openCapture(page);
  process.kill(await servicePid(m.origin), 'SIGKILL');
  const overlay = await startupPage(first.app);
  await expect(overlay.locator('#status')).toHaveText(MESSAGES.crashed);
  await expect(overlay.locator('#retry')).toBeEnabled();
  await expect(overlay.locator('#cancel')).toHaveText('Quit');
  await expect(page.getByText('Offline · local drafts', { exact: true }).first()).toBeVisible();   // service-down, not a reload
  await editor.fill('Typed after the crash, right before Quit.');   // inside the debounce: only the checkpoint saves it
  const closed = first.app.waitForEvent('close');
  await overlay.locator('#cancel').click();
  await closed;
  const second = await launchNoema(m.args, { env: m.env, profile: first.profile });
  const reopened = await appPage(second.app, m.origin);
  await waitConnected(reopened);
  expect((await readDraft(reopened))?.raw).toBe('Typed after the crash, right before Quit.');
});

test('command-line errors exit 2 before any window or directory exists; --help exits 0', async () => {
  const profile = tempDir('noema-cli-profile-');
  const dataDir = path.join(tempDir('noema-cli-data-'), 'never-created');
  const LOOPBACK = 'Noema: Use a literal loopback HTTP URL, e.g. http://127.0.0.1:8765';
  const cases: [string[], Record<string, string>, string][] = [
    [['--server', 'http://localhost:8765'], {}, LOOPBACK],
    [['--server', 'http://[::ffff:127.0.0.1]:8765'], {}, LOOPBACK],
    [['--server', 'http://127.0.0.1:8765/?'], {}, LOOPBACK],
    [['--bogus'], {}, 'Noema: Unknown argument; use --help. No token file is needed by the webview.'],
    [['--server'], {}, 'Noema: --server needs a URL'],
    [['--startup-timeout', '61'], {}, 'Noema: Use a startup timeout from 0.1 to 60 seconds'],
    [['--startup-timeout', 'soon'], {}, 'Noema: Invalid startup timeout'],
    [['--data-dir', dataDir], {}, 'Noema: --data-dir requires explicit --manage-service; external mode never owns a service'],
    [['--manage-service'], {}, 'Noema: Managed mode requires an explicit --data-dir; no implicit real notebook'],
    // The test port is ignored without NOEMA_ELECTRON_TEST=1.
    [['--manage-service', '--data-dir', dataDir, '--server', 'http://127.0.0.1:9100'], { NOEMA_ELECTRON_TEST_PORT: '9100' }, 'Noema: Managed mode uses http://127.0.0.1:8765 only'],
  ];
  for (const [args, env, message] of cases) {
    const result = await runElectron(['--profile', profile, ...args], env);
    expect([result.code, result.stderr.includes(message)], `${args.join(' ')}\n${result.stderr}`).toEqual([2, true]);
  }
  expect(fs.existsSync(dataDir)).toBe(false);
  const badProfile = await runElectron(['--profile', '']);
  expect([badProfile.code, badProfile.stderr.includes('Noema: Choose a dedicated profile directory')]).toEqual([2, true]);
  const help = await runElectron(['--help']);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain('--manage-service --data-dir');
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/managed.spec.ts`
Expected: FAIL. The Task 10 `main.ts` ignores `--manage-service` and loads the origin directly, so no service starts. The first five tests fail with `Error: No matching Electron page` (or a `waitConnected` timeout). The command-line test already passes; it guards the rewrite in Step 4.

- [ ] **Step 4: Replace `main.ts`**

`electron/src/main.ts` (whole file):
```ts
import { app, BrowserWindow, dialog, ipcMain, session, WebContentsView, type IpcMainEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_TEXT, parseArgs, userArgv, type CliOptions } from './cli.js';
import { installCloseHandler } from './close.js';
import { ManagedService, managedPort, prepareWorkspace, type LifecycleError } from './lifecycle.js';
import { installNavigationGuards } from './navigation.js';
import { installPermissions, PERMISSION_PROMPTS } from './permissions.js';
import { prepareProfile, resolveProfile } from './profile.js';
import { IPC_STARTUP_CANCEL, IPC_STARTUP_RETRY, IPC_STARTUP_STATUS, SERVICE_DOWN, SERVICE_UP, STARTUP_TEXT, type StartupStatus } from './protocol.js';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DIST, '../..');
const STARTUP_PAGE = path.resolve(DIST, '../static/startup.html');
// spec §6.3 webPreferences; never --no-sandbox.
const SANDBOXED = { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged } as const;

type ShellState = 'starting' | 'loaded' | 'crashed' | 'stopping';

let mainWindow: BrowserWindow | null = null;

function exitWith(code: 0 | 2, message: string): never {
  (code === 0 ? process.stdout : process.stderr).write(`${message}\n`);
  process.exit(code);
}

function readOptions(): { options: CliOptions; profile: string } {
  try {
    const options = parseArgs(userArgv(process.argv, process.defaultApp === true), process.cwd(), REPO_ROOT, process.env);
    if (options === 'help') exitWith(0, HELP_TEXT);
    const profile = resolveProfile(options.profile, process.env, process.cwd());
    prepareProfile(profile);
    return { options, profile };
  } catch (error) {
    exitWith(2, `Noema: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createWindow(origin: string, onApproved: () => void): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Noema',
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 540,               // main.rs:160-164
    backgroundColor: '#101110',   // main.rs:173
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(DIST, 'preload.cjs'), webviewTag: false, ...SANDBOXED },
  });
  installNavigationGuards(win.webContents, origin);
  installPermissions(session.defaultSession, origin, async (kind) => (await dialog.showMessageBox(win, {
    type: 'question', message: PERMISSION_PROMPTS[kind], buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1,
  })).response === 0);
  // onApproved calls win.destroy(), so beforeunload cannot cancel the close silently (spec §6.3).
  installCloseHandler(win, origin, onApproved);
  return win;
}

function dispatchPageEvent(win: BrowserWindow, name: string): void {
  if (!win.isDestroyed()) void win.webContents.executeJavaScript(`window.dispatchEvent(new Event('${name}'))`).catch(() => undefined);
}

/** The local startup/crash page: its own sandboxed view and preload, laid over the whole window (spec §6.4.6). */
function createOverlay(win: BrowserWindow, current: () => StartupStatus): WebContentsView {
  const view = new WebContentsView({ webPreferences: { preload: path.join(DIST, 'startup-preload.cjs'), ...SANDBOXED } });
  view.setBackgroundColor('#101110');
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('did-finish-load', () => view.webContents.send(IPC_STARTUP_STATUS, current()));
  const fit = () => {
    const { width, height } = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  win.on('resize', fit);
  fit();
  void view.webContents.loadFile(STARTUP_PAGE).catch(() => undefined);
  return view;
}

function runExternal(options: CliOptions): void {
  void app.whenReady().then(() => {
    const win = createWindow(options.server, () => {
      win.destroy();
      app.quit();
    });
    mainWindow = win;
    void win.loadURL(options.server).catch(() => undefined);
  });
}

function runManaged(options: CliOptions, dataDir: string): void {
  const origin = options.server;
  let state: ShellState = 'starting';
  let status: StartupStatus = { text: STARTUP_TEXT.starting, busy: true, mode: 'startup' };
  let win: BrowserWindow | null = null;
  let overlay: WebContentsView | null = null;
  let service: ManagedService | null = null;
  let attempt: Promise<void> | null = null;

  const mode = (): StartupStatus['mode'] => (state === 'starting' ? 'startup' : 'overlay');
  const show = (next: StartupStatus) => {
    status = next;
    if (win === null || win.isDestroyed()) return;
    overlay ??= createOverlay(win, () => status);
    if (!win.contentView.children.includes(overlay)) win.contentView.addChildView(overlay);
    overlay.webContents.send(IPC_STARTUP_STATUS, status);
  };
  const hide = () => {
    if (win !== null && !win.isDestroyed() && overlay !== null && win.contentView.children.includes(overlay)) win.contentView.removeChildView(overlay);
  };

  const onCrashed = (error: LifecycleError) => {
    if (state !== 'loaded' || win === null) return;
    state = 'crashed';
    dispatchPageEvent(win, SERVICE_DOWN);   // not 'offline': the page keeps its drafts and stays loaded
    show({ text: error.message, busy: false, mode: 'overlay' });
  };

  const ownService = (): ManagedService => {
    if (service !== null) return service;
    // Throws LifecycleError('workspace', …) with the service.rs wording; the overlay shows it with Retry.
    const created = new ManagedService({
      python: options.python,
      entryPoint: options.entryPoint,
      workspace: prepareWorkspace(dataDir, process.cwd()),
      port: managedPort(process.env),
      timeoutMs: options.startupTimeoutMs,
      env: process.env,
    });
    created.on('crashed', onCrashed);
    service = created;
    return created;
  };

  /** Serialised: a Retry during an attempt joins it; ManagedService never spawns while its group is alive. */
  const retry = (): Promise<void> => {
    attempt ??= (async () => {
      show({ text: STARTUP_TEXT.starting, busy: true, mode: mode() });
      try {
        await ownService().start();
        if (state === 'stopping' || win === null || win.isDestroyed()) return;
        hide();
        if (state === 'starting') void win.loadURL(origin).catch(() => undefined);   // identity verified: only now is the origin loaded
        else dispatchPageEvent(win, SERVICE_UP);   // no reload
        state = 'loaded';
      } catch (error) {
        if (state !== 'stopping') show({ text: error instanceof Error ? error.message : String(error), busy: false, mode: mode() });
      }
    })().finally(() => {
      attempt = null;
    });
    return attempt;
  };

  const stopAndQuit = async () => {
    await service?.cancel();   // aborts a start in progress; otherwise stdin → 5 s → TERM → 1 s → KILL (spec §6.4.6)
    if (win !== null && !win.isDestroyed()) win.destroy();
    app.quit();
  };
  const onApproved = () => {
    state = 'stopping';
    if (win !== null && !win.isDestroyed()) win.destroy();
    void stopAndQuit();
  };

  const fromOverlay = (event: IpcMainEvent) => overlay !== null && event.sender === overlay.webContents;
  ipcMain.on(IPC_STARTUP_RETRY, (event) => {
    if (fromOverlay(event) && (state === 'starting' || state === 'crashed')) void retry();
  });
  ipcMain.on(IPC_STARTUP_CANCEL, (event) => {
    if (!fromOverlay(event)) return;
    if (state === 'starting') {
      state = 'stopping';
      show({ text: STARTUP_TEXT.cancelling, busy: true, mode: 'startup' });   // no page has loaded: no checkpoint
      void stopAndQuit();
    } else if (state === 'crashed') {
      win?.close();   // Quit runs the checkpoint first
    }
  });

  void app.whenReady().then(() => {
    const created = createWindow(origin, onApproved);
    win = created;
    mainWindow = created;
    void retry();
  });
}

const { options, profile } = readOptions();
app.setPath('userData', profile);   // before the lock: Chromium's ProcessSingleton lives in userData (spec §6.3)
if (!app.requestSingleInstanceLock()) {
  app.exit(0);   // the first instance receives 'second-instance'; this one exits 0 without using its arguments
} else {
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  // Quitting is explicit: after the window is destroyed an owned service may still be stopping.
  app.on('window-all-closed', () => undefined);
  if (options.manageService && options.dataDir !== null) runManaged(options, options.dataDir);
  else runExternal(options);
}
```

- [ ] **Step 5: Build and run the managed spec, then every Electron e2e spec**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/managed.spec.ts && npm --prefix electron run e2e`
Expected: PASS. The managed spec has 6 tests; the Cancel case takes about 6 s (the `hang` fake ignores the lease, so the stop waits the 5 s grace and then signals the group). `isolation`, `single-instance`, `permissions` and `close` still pass against the rewritten `main.ts`.

- [ ] **Step 6: Commit**

```bash
git add electron/src/main.ts electron/e2e/managed.ts electron/e2e/managed.spec.ts
git commit -m "feat(electron): managed mode with startup page, crash overlay and explicit Retry"
```

---

### Task 14: `scenario.js` stages on the real managed service (port of `desktop/qa/scenario.js` and `qa/webview_check.py --managed --task-capture`)

**Files:**
- Test: `electron/e2e/scenario.spec.ts`

Stage map. Each stage is one Electron launch on the same throwaway profile, data dir and test port, as `qa/webview_check.py:87-100` did:

| `scenario.js` stage (lines) | Test |
|---|---|
| `draft` (94-107, 172) | draft: text and a pasted image stay local; an edit made just before close is checkpointed |
| `recover` (108-120, 136-139) | recover: exact text and Blob bytes survive; Save commits once; manual priority and pin set |
| `verify` (161-168) | verify: no duplicate; focus, manual priority and the original survive |
| `checkpoint-failure` (141-157) | checkpoint-failure: a declined close-anyway prompt keeps the editor and the service |
| `checkpoint-recover` (158-160) | checkpoint-recover: the retained draft returns and is not ingested |
| `crash` (27-47; `webview_check.py:107-114`) | crash: service-down keeps the page; offline Save queues; repeated Retry → one service, service-up, no reload, one flush |
| `kill` (`webview_check.py:121-143`) | kill: SIGKILL of Electron closes the lease |
| `task-capture` (49-72) | task draft: an unfinished Add task input is checkpointed on close |
| `task-checkpoint-failure` (73-83) | task-checkpoint-failure: the window, the service and the committed task draft survive |
| `task-recover` (84-93) | task-recover: Add task reopens the exact input and never auto-submits |

Not ported here, by design:
- `recover` lines 121-135 (WebKit `execCommand` note editing and undo) test the old WebKit editor. Note editing, code rendering and the kept original are covered by `web/e2e/notes.spec.ts` (`03-screens-capture-notes.md`) in Chromium, the engine Electron uses.
- `task-capture` lines 50-67 (one-input add, the priority override, the unchanged pin) are covered by `web/e2e/task-capture.spec.ts` (`02-screens-core.md`).
- The duplicate-launch check (`webview_check.py:154-161`) is `single-instance.spec.ts` (Task 10).
- The `idle` process sample is the terrain budget run (`04-terrain.md` Task 9) and the cutover memory measurement.

**Interfaces:**
- Consumes: Task 12 fixtures (`closeWindow`, `openCapture`, `readDraft`, `outboxIds`, `windowCount`), Task 13 helpers (`managedSetup`, `appPage`, `startupPage`, `servicePid`, `ownedServices`), `admin` and `live` from `electron/test/proc.ts`, `MESSAGES` (Task 2).
- Produces: tests only. They cover behaviour built in Tasks 6–13 and are expected to pass on the first run. A failure is a defect in the task that owns that behaviour: fix it there and keep this test.

- [ ] **Step 1: Write the scenario spec**

`electron/e2e/scenario.spec.ts`:
```ts
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { MESSAGES } from '../src/lifecycle.js';
import { admin, live } from '../test/proc.js';
import { closeWindow, killAll, launchNoema, openCapture, outboxIds, readDraft, tempDir, waitConnected, windowCount } from './fixtures.js';
import { appPage, managedSetup, ownedServices, servicePid, startupPage, type Managed } from './managed.js';

// desktop/qa/scenario.js:20: a 1×1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=';
const PNG_BYTES = [...Buffer.from(PNG, 'base64')];
const DRAFT = 'Webview restart draft: original learning notes.';
const DRAFT_FINAL = `${DRAFT} Immediate close checkpoint.`;
const RETAINED = 'Synthetic retained draft after checkpoint failure';
const OFFLINE_CAPTURE = 'Synthetic explicitly queued offline capture';
const CRASH_DRAFT = 'Synthetic draft retained across backend crash';
const TASK_DRAFT = 'Unfinished native task draft';
// Verbatim from web/src/strings.ts (contract §5).
const CLOSE_DRAFT_FAILED = 'Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.';
const CLOSE_CHECKPOINT_FAILED = 'Could not checkpoint your draft. Keep Noema open and retry the local save.';
const CAPTURE_SAVED_OFFLINE = 'Capture saved on this device. It will upload when connected.';

type Note = { id: string; raw: string; attachments: unknown[] };
type State = { notes: { id: string }[]; tasks: { id: string; priority: string; original_input: string | null }[]; focus: { pinned: boolean; task_id: string } | null };

test.describe.configure({ mode: 'serial' });

let m: Managed;
let profile: string;
test.beforeAll(async () => {
  m = await managedSetup();
  profile = tempDir('noema-scenario-profile-');
});
test.afterEach(killAll);

const api = <T = any>(apiPath: string, init?: { method?: string; body?: unknown }) => admin<T>(m.dataDir, m.port, apiPath, init);

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app } = await launchNoema(m.args, { env: m.env, profile });
  const page = await appPage(app, m.origin);
  await waitConnected(page);
  return { app, page };
}

async function closeAndWait(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent('close');
  await closeWindow(app);
  await closed;
}

function taskDraftRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => new Promise<string | null>((resolve, reject) => {
    const open = indexedDB.open('noema-local-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', 'readonly');
      const request = tx.objectStore('kv').get('task-draft');
      tx.oncomplete = () => {
        open.result.close();
        resolve((request.result as { raw?: string } | undefined)?.raw ?? null);
      };
      tx.onabort = () => {
        open.result.close();
        reject(tx.error);
      };
    };
  }));
}

async function openAddTask(page: Page) {
  await page.evaluate(() => { location.hash = '#/plan'; });
  await page.locator('.page-heading').getByRole('button', { name: 'Add task' }).click();
  return page.getByRole('dialog', { name: 'Add task' }).locator('#task-input');
}

test('draft: text and a pasted image stay on this device; an edit made just before close is checkpointed', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await editor.fill(DRAFT);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(DRAFT);
  await editor.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'webview-qa.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, PNG);
  await expect.poll(async () => (await readDraft(page))?.files.length).toBe(1);
  expect((await readDraft(page))!.files[0].bytes).toEqual(PNG_BYTES);
  expect((await api<State>('/state')).notes).toEqual([]);   // nothing ingested before explicit Save
  await editor.fill(DRAFT_FINAL);   // no debounce wait: the close checkpoint must persist this edit
  await closeAndWait(app);
});

test('recover: the exact text and Blob bytes survive the restart; Save commits once', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await expect(editor).toHaveValue(DRAFT_FINAL);
  expect((await readDraft(page))?.files.map((file) => [file.name, file.bytes])).toEqual([['webview-qa.png', PNG_BYTES]]);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect.poll(async () => (await api<State>('/state')).notes.length).toBe(1);
  await expect.poll(() => outboxIds(page)).toEqual([]);
  expect((await readDraft(page))?.raw).toBe('');
  const [summary] = (await api<State>('/state')).notes;
  const note = await api<Note>(`/notes/${summary.id}`);
  expect(note.raw).toBe(DRAFT_FINAL);
  expect(note.attachments).toHaveLength(1);
  const task = await api<{ id: string }>('/tasks', { method: 'POST', body: { title: 'Webview QA task', priority: 'low' } });
  await api('/focus', { method: 'POST', body: { task_id: task.id, pinned: true } });
  await closeAndWait(app);
});

test('verify: a restart neither duplicates the capture nor loses focus, manual priority or the original', async () => {
  const { app, page } = await open();
  const draft = await readDraft(page);
  expect([draft?.raw, draft?.files.length]).toEqual(['', 0]);
  const state = await api<State>('/state');
  expect(state.notes).toHaveLength(1);
  expect(state.focus?.pinned).toBe(true);
  expect(state.tasks[0].priority).toBe('low');
  expect((await api<Note>(`/notes/${state.notes[0].id}`)).raw).toBe(DRAFT_FINAL);
  await closeAndWait(app);
});

test('checkpoint-failure: a declined close-anyway prompt keeps the editor and the service', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await editor.fill(RETAINED);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(RETAINED);
  // Explicit fault injection (scenario.js:145-151), not a claim of physical storage failure.
  await page.evaluate(() => {
    const w = window as typeof window & { __restore?: () => void; __confirms?: string[] };
    const transaction = IDBDatabase.prototype.transaction;
    const confirm = window.confirm;
    w.__confirms = [];
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, names: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (mode === 'readwrite') throw new DOMException('Synthetic write failure', 'QuotaExceededError');
      return transaction.call(this, names, mode, options);
    };
    window.confirm = (message?: string) => {
      w.__confirms!.push(String(message));
      return false;
    };
    w.__restore = () => {
      IDBDatabase.prototype.transaction = transaction;
      window.confirm = confirm;
    };
  });
  await closeWindow(app);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __confirms?: string[] }).__confirms)).toEqual([CLOSE_DRAFT_FAILED]);
  expect(await windowCount(app)).toBe(1);
  await expect(editor).toHaveValue(RETAINED);
  expect((await api<State>('/state')).notes).toHaveLength(1);   // no duplicate capture
  await page.evaluate(() => (window as typeof window & { __restore?: () => void }).__restore!());
  await closeAndWait(app);   // the real checkpoint now succeeds
});

test('checkpoint-recover: the retained draft returns and is not ingested', async () => {
  const { app, page } = await open();
  await expect(await openCapture(page)).toHaveValue(RETAINED);
  expect((await api<State>('/state')).notes).toHaveLength(1);
  await closeAndWait(app);
});

test('crash: service-down keeps the page; offline Save queues; repeated Retry gives one service, service-up without reload and one flush', async () => {
  const { app, page } = await open();
  const editor = await openCapture(page);
  await page.evaluate(() => { (window as typeof window & { __noReload?: number }).__noReload = 1; });
  const firstPid = await servicePid(m.origin);
  process.kill(firstPid, 'SIGKILL');   // the exact owned child, never a process-name match
  const overlay = await startupPage(app);
  await expect(overlay.locator('#status')).toHaveText(MESSAGES.crashed);
  await expect(page.getByText('Offline · local drafts', { exact: true }).first()).toBeVisible();
  await editor.fill(OFFLINE_CAPTURE);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText(CAPTURE_SAVED_OFFLINE)).toBeVisible();
  await expect.poll(async () => (await outboxIds(page)).length).toBe(1);
  await expect.poll(async () => (await readDraft(page))?.raw).toBe('');
  await editor.fill(CRASH_DRAFT);   // the editor stays usable while the backend is down
  await expect.poll(async () => (await readDraft(page))?.raw).toBe(CRASH_DRAFT);
  expect((await api<State>('/state').catch(() => null))).toBeNull();   // nothing restarted by itself
  await overlay.locator('#retry').click();
  // Bypass the disabled button: main itself must serialise these into the one attempt.
  await overlay.evaluate(() => {
    const startup = (window as unknown as { noemaStartup: { retry(): void } }).noemaStartup;
    for (let i = 0; i < 3; i += 1) startup.retry();
  });
  await waitConnected(page);
  expect(await page.evaluate(() => (window as typeof window & { __noReload?: number }).__noReload)).toBe(1);   // service-up, no reload
  await expect(editor).toHaveValue(CRASH_DRAFT);
  const secondPid = await servicePid(m.origin);
  expect(secondPid).not.toBe(firstPid);
  expect(live(firstPid)).toBe(false);
  expect(ownedServices(app.process().pid!)).toEqual([secondPid]);   // one spawn for four Retry requests
  await expect.poll(async () => (await outboxIds(page)).length).toBe(0);
  const notes = (await api<State>('/state')).notes;
  expect(notes).toHaveLength(2);   // the queued capture uploaded once; the unsaved draft was never ingested
  const raws = await Promise.all(notes.map(async (note) => (await api<Note>(`/notes/${note.id}`)).raw));
  expect(raws).toContain(OFFLINE_CAPTURE);
  expect(raws).not.toContain(CRASH_DRAFT);
  await closeAndWait(app);
});

test('kill: SIGKILL of Electron closes the lease and the owned service stops', async () => {
  const { app } = await open();
  const pid = await servicePid(m.origin);
  app.process().kill('SIGKILL');
  await expect.poll(() => live(pid), { timeout: 15_000 }).toBe(false);
});

test('task draft: an unfinished Add task input is checkpointed on close', async () => {
  const { app, page } = await open();
  const input = await openAddTask(page);
  await input.fill(TASK_DRAFT);   // no wait: Close must finish the pending task checkpoint (scenario.js:72)
  await closeAndWait(app);
});

test('task-checkpoint-failure: a failed task checkpoint keeps the window, the service and the committed task draft', async () => {
  const { app, page } = await open();
  expect(await taskDraftRaw(page)).toBe(TASK_DRAFT);
  await page.evaluate(() => {
    const w = window as typeof window & { __restorePut?: () => void };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === 'task-draft') throw new DOMException('Injected task checkpoint failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
    w.__restorePut = () => { IDBObjectStore.prototype.put = put; };
  });
  await closeWindow(app);
  await expect(page.getByText(CLOSE_CHECKPOINT_FAILED)).toBeVisible();
  expect(await windowCount(app)).toBe(1);
  expect(await taskDraftRaw(page)).toBe(TASK_DRAFT);
  expect((await api<State>('/state')).tasks.some((task) => task.original_input === TASK_DRAFT)).toBe(false);
  // scenario.js:83 restores the store; a normal close then stops the service, so the next launch never races its lock.
  await page.evaluate(() => (window as typeof window & { __restorePut?: () => void }).__restorePut!());
  await closeAndWait(app);
});

test('task-recover: Add task reopens the exact input and never auto-submits', async () => {
  const { app, page } = await open();
  await expect(await openAddTask(page)).toHaveValue(TASK_DRAFT);
  expect((await api<State>('/state')).tasks.some((task) => task.original_input === TASK_DRAFT)).toBe(false);
  await closeAndWait(app);
});
```

- [ ] **Step 2: Run the scenario spec**

Run: `npm --prefix electron run build && npm --prefix electron run e2e -- e2e/scenario.spec.ts`
Expected: PASS (10 tests, serial, about 1–2 minutes).

- [ ] **Step 3: Run the whole phase gate**

Run: `cd /home/p4nic/code/noema && npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && npm --prefix electron test && .venv/bin/python -m pytest` (the full gate, contract §0)
Expected: PASS. `npm --prefix electron test` builds, runs every Vitest file (`origin`, `paths`, `lifecycle`, `cli`, `profile`, `permissions`, `preload`, `service-start`, `service-stop`, `service-parity`) and then every Playwright spec (`isolation`, `single-instance`, `permissions`, `close`, `managed`, `scenario`).

- [ ] **Step 4: Commit**

```bash
git add electron/e2e/scenario.spec.ts
git commit -m "test(electron): port the scenario.js restart, crash and checkpoint stages"
```

---

### Task 15: Handbook traceability rows for the desktop shell

**Files:**
- Modify: `docs/superpowers/specs/handbook-trace.md` (created by `01-foundation.md` Task 1 Step 8). Append one section at the end of the file; existing rows (R1–R9, U1–U25, C1–C3, T1 and the `04-terrain.md` section) are not edited. Contract §10 gives P6 only the Status column of this file; this follows the `04-terrain.md` Task 8 precedent: the orchestrator assigned these rows, so the change is append-only.

**Interfaces:**
- Consumes: the test titles written in Tasks 8, 11 and 14 (verbatim); the foundation table format `| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |` with status `planned`; the `06-cutover.md` Task 11 parser (any table with a `Status` header; a row turns `green` when every repo path such as `electron/e2e/scenario.spec.ts` in it exists).
- Produces: section `## Electron detail (05-electron.md)` with rows `R1.E1`, `R3.E1`, `R6.E1`, `R9.E1`, `R9.E2`, `U17.E1`. They add desktop-shell evidence to existing §4.7 rows; no §4.7 bullet changes owner.

- [ ] **Step 1: Append the rows**

Append to `docs/superpowers/specs/handbook-trace.md`:
```markdown

## Electron detail (05-electron.md)

Desktop-shell evidence for existing §4.7 rows. Test titles are the ones Tasks 8, 11 and 14 of `05-electron.md` create.

| ID | Spec §4.7 bullet | Handbook | Owning plan task | Test (file › title) | Status |
|---|---|---|---|---|---|
| R1.E1 | A recovered task draft is never submitted by itself (no task appears without the user's action) | §06, §27 | 05-electron.md Task 14 | `electron/e2e/scenario.spec.ts` › "task-recover: Add task reopens the exact input and never auto-submits" | planned |
| R3.E1 | Explicit Save is the notebook boundary in the desktop shell: drafts and pasted images stay on the device, and a close checkpoint never ingests | §04, §19 | 05-electron.md Tasks 12, 14 | `electron/e2e/scenario.spec.ts` › "draft: text and a pasted image stay on this device; an edit made just before close is checkpointed"; "checkpoint-recover: the retained draft returns and is not ingested" | planned |
| R6.E1 | Pinned focus and manual priority survive shell and service restarts | §07, §08 | 05-electron.md Task 14 | `electron/e2e/scenario.spec.ts` › "verify: a restart neither duplicates the capture nor loses focus, manual priority or the original" | planned |
| R9.E1 | Capture is disabled by default in the desktop shell: the microphone is prompted only when the page asks, never pre-granted; video is denied; decisions are not persisted | §17, §28 | 05-electron.md Tasks 5, 11 | `electron/e2e/permissions.spec.ts` › "audio-only media is prompted once per app session; video is always denied" | planned |
| R9.E2 | Managed mode never starts a model or observation and never uses an inherited data dir | §17, §21 | 05-electron.md Tasks 6, 8 | `electron/test/service-parity.test.ts` › "disables inherited optional features and never uses NOEMA_DATA_DIR (:292)" | planned |
| U17.E1 | Offline in the desktop shell: a service crash keeps the page and drafts, Save queues on this device, and the queued capture uploads once only after an explicit Retry | §20 | 05-electron.md Tasks 13, 14 | `electron/e2e/scenario.spec.ts` › "crash: service-down keeps the page; offline Save queues; repeated Retry gives one service, service-up without reload and one flush" | planned |
```

- [ ] **Step 2: Verify the section is present exactly once with six rows**

Run:
```bash
grep -c '^## Electron detail (05-electron.md)$' docs/superpowers/specs/handbook-trace.md
sed -n '/^## Electron detail (05-electron.md)$/,$p' docs/superpowers/specs/handbook-trace.md | grep -c '^| [RU][0-9]*\.E[0-9] .*| planned |$'
```
Expected: `1`, then `6`.

- [ ] **Step 3: Check every quoted title exists in the tests**

Run:
```bash
sed -n '/^## Electron detail (05-electron.md)$/,$p' docs/superpowers/specs/handbook-trace.md \
 | grep -o '"[^"]*"' | tr -d '"' | sort -u | while read -r t; do grep -rqF -- "'${t}'" electron/e2e electron/test || echo "MISSING $t"; done
```
Expected: no output. Titles are matched with the single quotes the test files use, so a partial title cannot pass.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/handbook-trace.md
git commit -m "docs: trace desktop-shell handbook rules to Electron tests"
```

---

### Task 16: Point the Electron and lifecycle parity rows at their tests

`01-foundation.md` Task 1 wrote parity-map Section A rows 3–40 (`desktop/qa/scenario.js`), 165–168 (`qa/webview_check.py`) and 191–202 (`tests/test_managed_service.py`) with only a target file, on the rule that the target test's title is the label verbatim. This plan ports those checks per launch stage (Task 14, one Electron launch per `scenario.js` stage) and per behaviour (Tasks 7–8, 10, 13), so one test covers several labels. The parity map's own rule allows the move ("A phase that must move a row records the move in its own plan"): this task rewrites the Phase and Target cells of those rows to `file › "title"` for every test that covers the label, and proposes a drop, with its reason, for the three labels that only tested the old WebKit editor. `06-cutover.md` Task 11 then checks that every cited title exists verbatim in its file. Row 198 (`test_public_handshake_does_not_authorize_api`, Task 6) already names its own test and is unchanged. Status stays `planned` (P6 flips it); only the owner approves a drop.

**Files:**
- Modify: `docs/superpowers/specs/parity-map.md` (Section A rows 3–40, 165–168, 191–197, 199–202: Phase, Target and, for rows 28, 29, 40, Status cells)
- Scratch only (never committed): `${TMPDIR:-/tmp}/noema-electron-parity/retarget.py`, `${TMPDIR:-/tmp}/noema-electron-parity/check.py`

**Interfaces:**
- Consumes: the Section A row format of `01-foundation.md` Task 1 (`| # | Source | Label (verbatim) | Phase | Target test file | Status |`); the test titles of Tasks 7, 8, 10, 13 and 14 of this plan; the web titles `02-screens-core.md` Tasks 18, 21 (`web/e2e/task-capture.spec.ts`) and `03-screens-capture-notes.md` Tasks 9, 11 (`web/src/ui/Markdown.test.tsx`, `web/e2e/notes.spec.ts`) cover for the stages Task 14 does not port.
- Produces: Target cells of the form `<path> › "<title>"; <path> › "<title>"` (the format `06-cutover.md` Task 11 `cited_titles` parses); `drop (proposed): <reason>` for rows 28, 29 and 40.

- [ ] **Step 1: Write the check (scratch) and run it to verify it fails**

```bash
mkdir -p "${TMPDIR:-/tmp}/noema-electron-parity"
cat > "${TMPDIR:-/tmp}/noema-electron-parity/check.py" <<'EOF'
"""Every P6 parity row cites at least one test title, and each cited title is defined verbatim in its file."""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
TOKEN = re.compile(r'"([^"]+)"|\b((?:web|electron|tests)/[\w./-]+\.(?:ts|tsx|py))\b')
SOURCES = ('desktop/qa/scenario.js:', 'qa/webview_check.py:', 'tests/test_managed_service.py:')
problems, checked = [], 0
section = (root / 'docs/superpowers/specs/parity-map.md').read_text().split('## A. Check labels', 1)[1].split('## B. ', 1)[0]
for line in section.splitlines():
    cells = [cell.strip() for cell in re.split(r'(?<!\\)\|', line)[1:-1]]
    if len(cells) != 6 or not cells[1].startswith(SOURCES) or cells[5].startswith('drop'):
        continue
    if cells[2] == 'test_public_handshake_does_not_authorize_api':
        continue   # row 198 names its own pytest test (Task 6)
    current, titles = None, 0
    for match in TOKEN.finditer(cells[4]):
        quoted, path = match.groups()
        if path:
            current = path
            continue
        titles += 1
        checked += 1
        if current is None or f"'{quoted}'" not in (root / current).read_text():
            problems.append(f'row {cells[0]}: no test {quoted!r} in {current}')
    if titles == 0:
        problems.append(f'row {cells[0]}: target {cells[4]!r} cites no test title')
print(*problems, f'checked {checked} titles, {len(problems)} problems', sep='\n')
sys.exit(1 if problems else 0)
EOF
cd /home/p4nic/code/noema && python3 -I "${TMPDIR:-/tmp}/noema-electron-parity/check.py" .
```
Expected: FAIL (exit 1). It prints `row 3: target 'electron/e2e/scenario.spec.ts' cites no test title` and the same line for every one of the 53 rows 3–40, 165–168, 191–197 and 199–202, then `checked 0 titles, 53 problems`.

- [ ] **Step 2: Write the retarget script (scratch)**

```bash
cat > "${TMPDIR:-/tmp}/noema-electron-parity/retarget.py" <<'EOF'
"""Rewrite Phase/Target (and Status for proposed drops) of the P6 parity rows; each row must match exactly once."""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
SCN, MAN, SIN = 'electron/e2e/scenario.spec.ts', 'electron/e2e/managed.spec.ts', 'electron/e2e/single-instance.spec.ts'
START, STOP, PAR = 'electron/test/service-start.test.ts', 'electron/test/service-stop.test.ts', 'electron/test/service-parity.test.ts'
TASK, NOTES, MD = 'web/e2e/task-capture.spec.ts', 'web/e2e/notes.spec.ts', 'web/src/ui/Markdown.test.tsx'
D = 'draft: text and a pasted image stay on this device; an edit made just before close is checkpointed'
R = 'recover: the exact text and Blob bytes survive the restart; Save commits once'
V = 'verify: a restart neither duplicates the capture nor loses focus, manual priority or the original'
CF = 'checkpoint-failure: a declined close-anyway prompt keeps the editor and the service'
CRV = 'checkpoint-recover: the retained draft returns and is not ingested'
CR = 'crash: service-down keeps the page; offline Save queues; repeated Retry gives one service, service-up without reload and one flush'
K = 'kill: SIGKILL of Electron closes the lease and the owned service stops'
TD = 'task draft: an unfinished Add task input is checkpointed on close'
TCF = 'task-checkpoint-failure: a failed task checkpoint keeps the window, the service and the committed task draft'
TR = 'task-recover: Add task reopens the exact input and never auto-submits'
MS = 'starts the owned service, loads only the verified origin, and stops the service after the close checkpoint'

def cite(*pairs):
    return '; '.join(f'{path} › "{title}"' for path, title in pairs)

TARGET = {   # row → (phase, target cell)
    **{n: ('P6', cite((SCN, CR))) for n in (3, 4, 5, 6)},
    7: ('P4', cite((TASK, 'Task draft survives close and reload; initially focused; Enter inserts newline'))),
    8: ('P4', cite((TASK, 'One multiline input; no unsupported voice button or mandatory details'))),
    9: ('P4', cite((TASK, 'Keyboard submit durably creates one task without a model'))),
    10: ('P4', cite((TASK, 'Planned day is separate from deadline/reminder/availability'))),
    11: ('P4', cite((TASK, 'Task save never replaces pinned focus'))),
    12: ('P6', cite((SCN, TD), (SCN, TR))),
    13: ('P6', cite((SCN, TCF))), 14: ('P6', cite((SCN, TCF))),
    15: ('P6', cite((SCN, TR))), 16: ('P6', cite((SCN, TR))),
    **{n: ('P6', cite((SCN, D))) for n in (17, 18, 19)},
    **{n: ('P6', cite((SCN, R))) for n in (20, 21, 22, 23, 24, 25, 26)},
    27: ('P4', cite((NOTES, 'Note edits create revision and retain raw text'))),
    30: ('P4', cite((MD, 'keeps fenced code verbatim, including markup-looking text'))),
    31: ('P4', cite((NOTES, 'Original tab shows untouched capture'))),
    32: ('P6', cite((SCN, V))),
    33: ('P6', cite((SCN, CF))), 34: ('P6', cite((SCN, CF))),
    35: ('P6', cite((SCN, CRV))), 36: ('P6', cite((SCN, CRV))),
    **{n: ('P6', cite((SCN, V))) for n in (37, 38, 39)},
    165: ('P6', cite((MAN, MS), (SCN, K))),
    166: ('P6', cite((SIN, 'a second instance focuses the first and exits 0 without using its own arguments'))),
    167: ('P6', cite((MAN, MS))),
    168: ('P6', cite((SCN, V))),
    191: ('P6', cite((PAR, 'cold reopen, retries while running and a competing owner keep one service and its state (:104)'))),
    192: ('P6', cite((PAR, 'never contacts or kills a port occupant (:135)'))),
    193: ('P6', cite((PAR, 'bounds a %s failure as a startup error (:148)'), (PAR, 'refuses a data directory that is a file before spawning (:148 permissions)'),
                    (START, 'reports a missing or empty interpreter as python-missing'))),
    194: ('P6', cite((STOP, 'cancel during startup rejects with cancelled and removes the whole owned group'), (STOP, 'a startup timeout also removes an owned descendant'))),
    195: ('P6', cite((PAR, 'needs an explicit Retry after a crash, and Retry rebinds the fixed port at once (:183, SO_REUSEADDR)'))),
    196: ('P6', cite((PAR, 'owner %s closes the lease and frees the lock and port (:194)'))),
    197: ('P6', cite((PAR, 'never owns an external service on the same workspace (:206)'))),
    199: ('P6', cite((PAR, 'lets a separately wrapped agent survive an owned quit (:244)'))),
    200: ('P6', cite((START, '%s fails identity, stops the service and never writes the workspace'))),
    201: ('P6', cite((PAR, 'disables inherited optional features and never uses NOEMA_DATA_DIR (:292)'))),
    202: ('P6', cite((PAR, 'owner SIGKILL before the lease watcher still stops Python through PDEATHSIG (:307)'))),
}
DROP = {   # row → reason (owner approves in 06-cutover.md Task 11 Step 6)
    28: 'asserts WebKit `execCommand` editing in the deleted Rust shell (spec §3); multiline note editing in Chromium is covered by `web/e2e/notes.spec.ts` › "Note edits create revision and retain raw text"',
    29: 'asserts WebKit editor undo in the deleted Rust shell (spec §3); the React note editor is a plain textarea whose undo is the browser\'s own',
    40: 'the edited-code half depends on the WebKit edit stage (rows 28–29); the original surviving a restart is `electron/e2e/scenario.spec.ts` › "verify: a restart neither duplicates the capture nor loses focus, manual priority or the original" and revisions are server data covered by `tests/test_core.py`',
}
path = root / 'docs/superpowers/specs/parity-map.md'
head, rest = path.read_text().split('## A. Check labels', 1)
section, tail = rest.split('## B. ', 1)
lines = section.split('\n')
done = set()
for index, line in enumerate(lines):
    match = re.match(r'^\| (\d+) \|', line)
    if not match or int(match.group(1)) not in {**TARGET, **DROP}:
        continue
    n = int(match.group(1))
    cells = re.split(r'(?<!\\)\|', line)
    assert len(cells) == 8 and cells[6].strip() == 'planned', (n, line)
    if n in DROP:
        cells[4], cells[5], cells[6] = ' — ', ' — ', f' drop (proposed): {DROP[n]} '
    else:
        cells[4], cells[5] = f' {TARGET[n][0]} ', f' {TARGET[n][1]} '
    lines[index] = '|'.join(cells)
    done.add(n)
assert done == set(TARGET) | set(DROP), sorted(set(TARGET) | set(DROP) - done)
path.write_text(head + '## A. Check labels' + '\n'.join(lines) + '## B. ' + tail)
print(f'updated {len(done)} rows')
EOF
```

- [ ] **Step 3: Apply it**

Run: `cd /home/p4nic/code/noema && python3 -I "${TMPDIR:-/tmp}/noema-electron-parity/retarget.py" .`
Expected: `updated 53 rows`. An `AssertionError` names a row whose text or status differs from `01-foundation.md` Task 1 Step 7: stop and report it.

- [ ] **Step 4: Run the check to verify it passes**

Run: `cd /home/p4nic/code/noema && python3 -I "${TMPDIR:-/tmp}/noema-electron-parity/check.py" . && python3 -I "${TMPDIR:-/tmp}/noema-parity/check_section_a.py" "${TMPDIR:-/tmp}/noema-parity/labels.tsv" docs/superpowers/specs/parity-map.md`
Expected: `checked 55 titles, 0 problems`, then `Section A matches all 202 extracted labels` (source, line and label cells are untouched). If the `noema-parity` scratch files are gone, rerun `01-foundation.md` Task 1 Steps 2–3 and 6 to recreate them first.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/parity-map.md
git commit -m "docs: point the scenario, webview and managed-service parity rows at the Electron tests"
```

---

## Spec coverage

| Spec bullet (section) | Task |
|---|---|
| §2 1A Electron host; §3 `electron/` holds main, preloads, startup page, lifecycle module | 1, 9, 10, 13 |
| §3 Toolchain: Node 22 in `engines`; exact versions with lockfile in `electron/` (Electron 44.7.0 from `experiments/ui-ab/package.json`) | 1 |
| §3 Gate: `npm --prefix electron test` (Playwright `_electron` + lifecycle), `.venv/bin/python -m pytest` | 1 (scripts), 14 Step 3 |
| §6.3 CLI flags `--server`, `--profile`, `--manage-service`, `--data-dir`, `--python`, `--entry-point`, `--startup-timeout` (0.1–60, default 15) | 3, 13 (exit-2 e2e) |
| §6.3 `--server` loopback IP literal over http, no credentials/path/query/fragment; port of `validate_server` with its tests | 3 |
| §6.3 Managed requires exactly `http://127.0.0.1:8765`; `--data-dir` without `--manage-service` rejected | 3, 13 |
| §6.3 Paths resolved against the current directory (`main.rs:79-91`) | 2 (`absolutePath`), 3 |
| §6.3 Profile default `$XDG_DATA_HOME/noema/electron` / `~/.local/share/noema/electron`, mode 0700; profile is credential storage | 4 |
| §6.3 `setPath('userData')` before `requestSingleInstanceLock()`, both before `ready`; ProcessSingleton is the lock | 10, 13 |
| §6.3 Second instance focuses the first, ignores its arguments, exits 0 | 10 (`single-instance.spec.ts`) |
| §6.3 Tests always use a throwaway `--profile` | 10 (`launchNoema`) |
| §6.3 webPreferences sandbox/contextIsolation/no nodeIntegration, devtools off when packaged, setuid `chrome-sandbox`, never `--no-sandbox` | 1 (`link-sandbox.mjs`), 10, 13 |
| §6.3 `will-navigate`/`will-redirect`/`will-frame-navigate` same-origin only; parse errors denied | 1, 10 |
| §6.3 `setWindowOpenHandler` denies; plain http(s) links without credentials → `shell.openExternal` | 1, 10 |
| §6.3 `will-attach-webview` denied; downloads only same-origin or `blob:<origin>` | 1, 10 |
| §6.3 Permissions: audio-only media from the main frame at the origin; video denied; notifications same rule; prompts via `dialog.showMessageBox`; everything else denied | 5, 11 |
| §6.3 Decisions remembered for the app session only; check handler mirrors them | 5, 11 |
| §6.3 Tests stub `dialog.showMessageBox` through `electronApp.evaluate` | 11 (`stubMessageBox`) |
| §6.3 Main preload exposes only `window.ipc.postMessage`; only `noema:close-approved` from the main frame at the origin; startup preload `retry()`/`cancel()` | 9, 12 |
| §6.3 Close: not loaded / no ready flag / renderer gone → close without touching storage | 12 |
| §6.3 Close: `noema:checkpoint-close`; refuse while saving; confirm while recording/editing; save drafts; draft-write failure asks | 12 (page side: contract §6.5, see Prerequisites) |
| §6.3 After approval `win.destroy()`; 10 s without an answer → "Force close"/"Keep open" | 12 |
| §6.4.1 Workspace: resolve, reject no final component, create 0700 (chmod only if new), `realpathSync`, canonical compared later | 2, 8 (symlink), 13 |
| §6.4.2 Spawn command, `detached: true`, `stdio: ['pipe','pipe','ignore']`, stripped environment, 64-hex lease, stdin kept open | 7 |
| §6.4.2 Error handlers on spawn (`ENOENT` → "Python not found"), stdin (EPIPE), stdout | 7 |
| §6.4.2 Port always 8765; test override only with `NOEMA_ELECTRON_TEST=1`, unreachable from the CLI | 2, 3, 13 |
| §6.4.3 Python order: PDEATHSIG → owner-pid check → lease ≤ 2048 → lock → `SO_REUSEADDR` bind/listen → watcher → `uvicorn` `sockets=` → protocol-2 line | 6 |
| §6.4.3 Exit codes 10/11/12/other and their messages | 2 (`exitCodeError`), 6, 7, 13 |
| §6.4.3 PDEATHSIG fires on the spawning thread's death; `--owner-pid` closes the race | 6, 8 |
| §6.4.4 Readiness: raw bytes to `\n` or 4096 within the timeout, stream destroyed, exact keys | 2, 7 |
| §6.4.4 `GET /api/desktop-instance` exactly `{protocol:2, instance, pid}`; only then the origin loads; nothing in the workspace before a valid lease; identity failure stops the service | 2, 6, 7, 13 |
| §6.4.5 Fixed port; port in use → exit 11 with Retry; occupant never contacted or killed | 6, 8, 13 |
| §6.4.6 States `starting` → `loaded` → `crashed` → `stopping`; startup page with Retry/Cancel; serialised Retry; Cancel without checkpoint | 7, 13, 14 |
| §6.4.6 Loaded: close runs the checkpoint, then stops the service | 13 |
| §6.4.6 Crashed: `noema:service-down` (not `offline`); `WebContentsView` overlay with Retry/Quit; Retry → `noema:service-up` with no reload; Quit runs the checkpoint first | 13, 14 |
| §6.4.6 Stopping: close stdin → 5 s → SIGTERM `-pgid` → 1 s → SIGKILL `-pgid` → reap; ESRCH = success | 7 |
| §6.4.7 Group cleanup after every observed exit; grandchild gone after Python SIGKILL | 7 (`service-stop.test.ts`) |
| §6.4.8 Owner killed (incl. SIGKILL): stdin EOF stops the group; PDEATHSIG before the watcher | 8, 14 (`kill`) |
| §6.4 Removed: protocol 1 (fd 3 socket, fstat(4) lock check, protocol-1 identity); `test_public_handshake_does_not_authorize_api` on protocol 2 | 6 |
| §8 Electron: isolation (off-origin navigation, redirects, frame navigation, popups, webview attach) | 10 |
| §8 Electron: links go to `openExternal` | 10 |
| §8 Electron: downloads (export allowed; anything else blocked) | 10 |
| §8 Electron: permissions (audio prompted and remembered; video denied; `Notification.permission` before/after) | 11 |
| §8 Electron: close (checkpoint saves a draft; boot close needs no checkpoint; save in flight keeps the window; draft-write failure confirms; unresponsive renderer → Force close) | 12 |
| §8 Electron: single instance | 10 |
| §8 Electron: `scenario.js` stages (restart with draft; crash → service-down → Retry → service-up with no reload; offline queue → Retry → flush; Blob survives a restart) | 14 |
| §8 Lifecycle: workspace locked (10) | 7, 8 |
| §8 Lifecycle: port in use (11), occupant untouched | 7, 8, 13 |
| §8 Lifecycle: invalid lease (12) | 6, 7 |
| §8 Lifecycle: startup timeout and cancel cleanup | 7 |
| §8 Lifecycle: crash then Retry, no second spawn during Retry | 7, 8, 14 |
| §8 Lifecycle: owner SIGKILL before and after the lease watcher | 8 |
| §8 Lifecycle: identity mismatch (stdout and HTTP); extra keys rejected | 2, 7, 13 |
| §8 Lifecycle: environment stripping | 7, 8 |
| §8 Lifecycle: agent survival | 8 |
| §8 Lifecycle: missing interpreter; early exit before the lease | 7 |
| §8 Lifecycle: symlinked workspace | 2, 6, 8 |
| §8 Lifecycle: grandchild cleanup after Python SIGKILL | 7 |
| §8 Lifecycle: crash → Retry rebinds immediately (`SO_REUSEADDR`) | 6, 8 |
| §8 Lifecycle: port of every `tests/test_managed_service.py` case (lines 104, 135, 148, 164, 183, 194, 206, 230, 244, 281, 292, 307) | 6 (230), 7 (148 runtime, 164, 281), 8 (the rest), 16 (parity-map rows 191–202) |
| §8 Rule: every `desktop/qa/scenario.js`, `qa/webview_check.py` and `tests/test_managed_service.py` parity row names its test (or a proposed drop) | 16 |
| §8 Python: everything except the managed tests runs unchanged | 6 Step 5 |
| §10 "Another process takes 8765 between lock and bind" → exit 11, identity rejects impostors, nothing killed | 6, 7, 8, 13 |
| §10 "Permission decisions are not persisted" | 5, 11 |
| Handbook §17/§28 capture disabled by default (no mic without explicit user action): the microphone is only prompted on request, never pre-granted | 5, 11, 15 (trace R9.E1) |
| Handbook §04/§19 explicit Save boundary, §06/§27 no task without user action, §07/§08 pins and manual priority survive, §17 no inherited model, §20 offline states — desktop-shell rows in `handbook-trace.md` | 8, 14, 15 |
