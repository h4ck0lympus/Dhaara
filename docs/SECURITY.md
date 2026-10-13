# Security and privacy boundary

Explicit task capture adds no new authority: `/api/task-captures` has the same
admin/session, origin, host, size and request-marker guards as task creation.
Originals are immutable service records, escaped on display and included in
export; local task drafts remain unencrypted site data, separate from the note
outbox. No model/window/recording/notification is triggered by task creation.
Versioned corrections, manual priority and pins are not overwritten by retries.

This is a personal local development app, not a production security audit or multi-user isolation system.

## Opt-in Linux managed service boundary

External mode is still the default and never stops the user's backend. Explicit
`--manage-service --data-dir PATH` owns only a newly spawned child group. Rust
holds both the profile lock and a canonical-workspace service lock, prebinds the
stable literal-loopback listener, and passes it plus the same locked file to
Python via private descriptors. Python acknowledges workspace/public random
instance/PID after Uvicorn startup; Rust verifies both that bounded pipe response
and the HTTP identity on its own listener before navigating the webview. A port
occupant is not contacted, authenticated to, killed or reused. Manual Linux
`run.py` launches use the same workspace lock; arbitrary custom ASGI embeddings
are not claimed to participate in launcher exclusion.

`GET /api/desktop-instance` exposes only protocol, public non-authorizing
instance ID and PID in managed mode (404 in external mode). It grants no API
access and exposes no workspace path/admin token. Host/Origin checks and
no-store apply. Rust does not read admin credentials; private pipe contents are
not forwarded to logs or frontend. Child stderr is discarded and error text is
fixed/bounded rather than dumping exception text. This is a diagnostics tradeoff;
run the existing external launcher explicitly for local dependency diagnostics.
Inherited model/speech/remote-model and integration/admin-token configuration is
removed in managed mode. Existing local workspace token/session handling remains.

Normal close checkpoints before lease closure and bounded owned-group signals/
reaping. Linux shell death closes the lease independently of Rust destructors.
Before exec, a Linux parent-death TERM signal and parent-PID race check also
cover startup before Python can install its lease watcher (real process test).
SIGTERM/SIGKILL cleanup is tested with actual processes; abrupt close cannot
checkpoint the newest edits. No sandbox against hostile same-user processes,
detached descendants, power-loss guarantee, external-agent termination, login
service or daemon is introduced. [Desktop policy](DESKTOP.md) records exact
limits; physical launch/quit/relaunch remains pending.

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

The Rust webview shell accepts only literal loopback HTTP base URLs and blocks
top-level navigation away from that exact origin. It uses the web app's existing
loopback session bootstrap, not a native token-file reader. Native IPC only
permits that origin to approve window closing (an additional report message
and a programmatic Retry-button message exist only in explicit QA builds);
no production command/filesystem bridge is exposed.
Explicit frontend new-window HTTP(S) links open in the user's browser; URL
credentials and non-web schemes are rejected. Downloads are restricted to
the service origin and its Blob URLs. Webview network/proxy behavior is that
of the system engine, not the retired Rust HTTP client's proxy-disabled policy.

A dedicated persistent profile contains sensitive, unencrypted local drafts,
cookies and cache. New Linux profiles/lock files use restrictive modes; existing
profile permissions are not rewritten, and Windows ACLs are not validated.
An OS file lock prevents two shells sharing the profile simultaneously. Linux
microphone/camera/notification requests prompt; geolocation and display capture
are denied. Device permission flows and non-Linux behavior need physical testing.
Close checkpoints do not guarantee recovery of active recordings, unsaved note
edits, abrupt crashes or browser storage eviction. No observation, model
authority, public hosting, installer or OS keychain integration was added.

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
