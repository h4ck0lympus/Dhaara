# Security and privacy boundary

Explicit task capture adds no new authority: `/api/task-captures` has the same
admin/session, origin, host, size and request-marker guards as task creation.
Originals are immutable service records, escaped on display and included in
export; local task drafts remain unencrypted site data, separate from the note
outbox. No model/window/recording/notification is triggered by task creation.
Versioned corrections, manual priority and pins are not overwritten by retries.

This is a personal local development app, not a production security audit or multi-user isolation system.

## Opt-in Linux managed service boundary (protocol 2)

External mode is still the default and never stops the user's backend. Explicit
`--manage-service --data-dir PATH` owns only the child it spawns, in that
child's own process group. Electron creates the workspace with mode 0700 and
canonicalises it. Python takes the `.noema-service.lock` flock, binds
127.0.0.1:8765 itself (`SO_REUSEADDR`, never `SO_REUSEPORT`) and, once serving,
prints one acknowledgement line with exactly `protocol` (2), `instance`, `pid`,
`workspace` and `port`. Electron accepts it only with exactly those keys and
values, then requires `GET /api/desktop-instance` to return exactly
`{protocol: 2, instance, pid}` before it loads the origin. The identity grants
no authority. A port occupant is
never contacted, authenticated to or killed (exit 11). The instance id is a
fresh 64-hex value sent on stdin, which stays open as the lifetime lease.
Manual Linux `run.py` launches use the same workspace lock; arbitrary custom
ASGI embeddings are not claimed to participate in launcher exclusion.

`GET /api/desktop-instance` exposes only protocol, the public non-authorizing
instance id and PID in managed mode (404 in external mode); never the workspace
path or a token. Host/Origin checks and no-store apply. The child environment is
stripped of `NOEMA_MODEL`, `NOEMA_SPEECH_MODEL`, `NOEMA_TOKEN`,
`NOEMA_ACCESS_TOKEN`, `NOEMA_ALLOWED_HOSTS`, `NOEMA_ALLOW_REMOTE_MODEL` and
`NOEMA_DATA_DIR`; child stderr is discarded and user messages are fixed text.

Python sets `PR_SET_PDEATHSIG(SIGTERM)` and exits if its parent is not
`--owner-pid` before it reads the lease, so it cannot outlive an owner that died
during startup. Stdin EOF, including after an owner SIGKILL, triggers group
shutdown. Normal close runs the page checkpoint, closes stdin, waits 5 s, then
sends SIGTERM and SIGKILL to the group; cleanup also runs after any observed
exit. This is not a sandbox against hostile same-user processes or deliberately
detached descendants, and an abrupt close cannot checkpoint the newest edits.
Physical launch/quit/relaunch on Sway remains pending.

The native Sway continuation adds no token scope or observation authority.
Local pause gates only that explicitly launched helper's future polls; another
observer and an in-flight request are unaffected. Global Settings pause remains
the service authority and clears stored context. Appearance controls do not
write server settings or require an admin token. Permission and recent metadata
reports remain distinct, and disconnected task suggestions are suppressed.
Server Hidden wins over local overrides. The native surface never requests
keyboard focus, including when controls open. Popovers are non-modal, without
a full-screen input grab or desktop dimming. Visibility, task links and local
appearance changes do not start observation or grant its permission.

The observer-readable summary now also exposes available tasks' user-saved
`next_action` (bounded to 1000 characters), alongside existing ID/title/priority.
Treat that text as visible to holders of an observer token. No full task detail,
note body, original capture or general task endpoint access is added. Existing
scopes and write permission gates are unchanged and covered by API tests.

Native QA starts a private headless Sway with synthetic windows and disposable
service/profile data, not the user's Sway config, desktop, clipboard or notebook.
The screenshot probe requires the fixture runtime/socket/compositor identity.
Models/workers are not run. These tests do not validate physical permission
delivery, microphone recording, target-device performance or installation.

Now/kitten refinement adds no observation authority or native bridge. Kitten
controls edit existing mode/size/window-metadata permission preferences only;
allowing metadata does not start a helper or establish active capture. Fresh
reports are labeled as recent evidence, not continuous observation. Stale or
disconnected integrations are not described as live. The existing token flow
remains task-scoped; UI fixtures never use production credentials/data. Explicit
replacement/clearing of pinned focus asks confirmation; inferred metadata
still obeys the backend's existing pinned-focus protection.

## Electron desktop shell boundary

The renderer runs with `sandbox: true`, `contextIsolation: true` and
`nodeIntegration: false`; devtools are off in packaged builds. Linux needs the
setuid `chrome-sandbox`; the shell is never run with `--no-sandbox`. `--server`
accepts only a literal loopback IP over http with no credentials, path, query
or fragment. Navigation, redirects and frame navigation are allowed only to that
exact origin, and URL parse errors deny. New windows are always denied; http(s)
links with a host and no credentials open in the user's browser. `<webview>` is
denied. Downloads are allowed only from the origin and its `blob:` URLs. The page
preload exposes one call, `window.ipc.postMessage`, and main accepts only
`noema:close-approved` from the main frame at the origin. No command, filesystem
or token bridge exists; the page uses the same loopback session bootstrap as a
browser.

Audio-only microphone requests and notification requests from the main frame at
the origin show a native prompt; video, display capture, geolocation and
everything else are denied. Decisions are remembered for the app session
only and cleared on restart, by design.

The profile (`$XDG_DATA_HOME/noema/electron` or `~/.local/share/noema/electron`,
mode 0700) holds the session cookie, IndexedDB drafts and outbox, and cache; it is
treated as credential storage and is not encrypted. Chromium's single-instance
lock guards it; a second launch focuses the first window and exits. Old
Rust/WebKit profiles are left untouched, and their unsent captures are not
readable by Chromium (accepted). Close checkpoints do not recover active
recordings, abrupt crashes or storage eviction.

## Defaults and implemented protections

- Loopback bind by default. No microphone or window observation starts automatically.
- An installation admin token is generated locally with a restrictive file mode. Do not distribute `.data` or publish `admin.token`.
- Loopback browser session bootstrap requires a loopback peer/Host and rejects forwarded-header attempts. A same-origin custom header is required for cookie-authenticated mutations.
- Host and Origin checks reject unexpected origins; scoped bearer tokens separate selected agent tasks from observer capabilities. Token strings are not returned after creation.
- Agent credentials cannot read the full note library or other tasks. Observer credentials can read the small companion summary and report current window metadata.
- Requests/attachments/input fields are bounded. File formats are checked using magic bytes, not filenames alone. Original file names are display metadata, not storage paths.
- Model output must conform to a bounded schema. It is stored as untrusted text and never allowed to execute commands, set priorities, grant permissions or create obligations.
- Browser rendering escapes HTML. The application does not load third-party scripts/fonts/CDNs or send telemetry.
- Explicit Save commits queue insertion and draft reset atomically in native
  IndexedDB. A failed local commit does not authorize upload or clear the
  editor. Draft recovery remains local and distinct from notebook ingestion.
- Export excludes credentials and latest raw observed context. Backups remain sensitive.

## Important limits

Loopback is not isolation from other processes running as you. Any process that can read your data directory or act as your local browser may access your notes. File-mode behavior differs across operating systems. SQLite, attachment files and browser drafts are not application-encrypted; use disk encryption and appropriate OS/profile permissions for private data.

A personal server is not automatically an approved place for employer code or confidential work notes. The first release does not implement per-project employer routing or enterprise policy enforcement. Do not upload material you are not authorized to store/process on that machine.

Window metadata can contain sensitive document titles, file paths or URLs. Current observation is off by default, metadata-only, and stores the latest sample rather than a history. Screenshot capture and exclusions are not implemented, so the cat is not silently photographing the screen.

Opaque external links are opened as links; they are not proof of agent status or a safe website. Do not put secrets into task/session URLs. Uploaded media decoders and AI dependencies have their own security surface. Magic-byte validation is not a malware scanner or image-decoder sandbox.

No public multi-user login system, rate-limit/abuse service, remote deployment security audit, encryption key management, secure mobile pairing or private network service is included. The non-loopback launcher guard does not make public hosting safe. Reverse-proxy HTTPS/origin/session handling needs its own implementation and integration tests before deployment.

External model service use is optional. When configured, saved note content is sent to that service. Remote hosts require explicit enablement, but users remain responsible for service authentication and transport. There is no claim of cryptographic protection from the machine performing inference.

The supplied tests cover specific intended boundaries; passing them does not prove the absence of security bugs.

Continuation validation covers headless Chrome's native storage and offline
shell with disposable profiles. Injected abort/quota/open failures do not
establish recovery after physical disk damage, power loss or browser eviction.
Private site data remains unencrypted, and clearing it still removes unsent
captures. Multiple tabs still share an unsaved draft. No new remote access,
screen observation or model authority was added.
