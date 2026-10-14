# Security and privacy boundary

This is a personal local development app, not a production security audit or multi-user isolation system.

## Defaults and implemented protections

- Loopback bind by default. No microphone or window observation starts automatically.
- An installation admin token is generated locally with a restrictive file mode. Do not distribute `.data` or publish `admin.token`.
- Loopback browser session bootstrap requires a loopback peer/Host and rejects forwarded-header attempts. A same-origin custom header is required for cookie-authenticated mutations.
- Host and Origin checks reject unexpected origins; scoped bearer tokens separate selected agent tasks from observer capabilities. Token strings are not returned after creation.
- Agent credentials cannot read the full note library or other tasks. Observer credentials can read the small companion summary and report current window metadata. Screen credentials are a distinct scope: they can manage an explicit screen session and submit images, but cannot read the general note library, export data or accept focus suggestions.
- Requests/attachments/input fields are bounded. File formats are checked using magic bytes, not filenames alone. Original file names are display metadata, not storage paths.
- Model output must conform to a bounded schema. It is stored as untrusted text and never allowed to execute commands, set priorities, grant permissions or create obligations.
- Browser rendering escapes HTML. The application does not load third-party scripts/fonts/CDNs or send telemetry.
- Export excludes credentials and latest raw observed context. Backups remain sensitive.

## Important limits

Loopback is not isolation from other processes running as you. Any process that can read your data directory or act as your local browser may access your notes. File-mode behavior differs across operating systems. SQLite, attachment files and browser drafts are not application-encrypted; use disk encryption and appropriate OS/profile permissions for private data.

A personal server is not automatically an approved place for employer code or confidential work notes. The first release does not implement per-project employer routing or enterprise policy enforcement. Do not upload material you are not authorized to store/process on that machine.

Window metadata can contain sensitive document titles, file paths or URLs. Metadata observation is off by default and stores the latest sample rather than a history. Version 0.2 adds a separately permitted screen observer, also off by default. It requires explicit helper launch, exact allowed application IDs and task projects, a dedicated screen capability and a temporary session. Starting the ordinary app or cat does not capture screenshots.

Screen frames and model explanations stay in process memory, not SQLite, attachment directories, logs or exports. The browser omits observed context and screen interpretations from its offline snapshot. This is a retention policy, not secure memory erasure: OS swap/crash dumps, local inference-server logging and an administrator on the machine are outside that guarantee. Derived focus (the chosen task ID/source/time) and the latest permitted window metadata may be stored. Saved notes/audio/images intentionally supplied through Capture follow normal persistent storage, not the ephemeral screen policy.

A Sway/`grim` crop is a visible screen region, **not an isolated application texture**. Other windows, notifications or overlays can enter it. Allowlisting an app authorizes that app's visible region, not just one harmless tab. Private-title exclusions are heuristics; they do not reliably identify secrets, authentication screens or all private/locked sessions. This release has no OS-verified lock-state or full occlusion detection. Pause before sensitive work. The companion corner mask is not a comprehensive redaction system.

Screen interpretation is advisory and untrusted. A JSON schema and candidate-ID checks restrict the result, not its truth. The model has no tools and cannot create/complete tasks, save notes or execute commands. Optional automatic mode can change unpinned focus; an incorrect screen interpretation can still cause a wrong focus suggestion. Pinned focus, fresh-context/task-version checks and permission revocation guard against stale application. Acceptance pins the task explicitly.

The server restricts screen inference to a loopback model URL and requests no persistent model residency. Pause/revoke removes queued images and rejects late results; it does not instantly cancel an already executing model request. Its computation can continue until it returns or times out. Reading allowed pixels necessarily discloses them to the configured local inference process.

Opaque external links are opened as links; they are not proof of agent status or a safe website. Do not put secrets into task/session URLs. Uploaded media decoders and AI dependencies have their own security surface. Magic-byte validation is not a malware scanner or image-decoder sandbox.

No public multi-user login system, rate-limit/abuse service, remote deployment security audit, encryption key management, secure mobile pairing or private network service is included. The non-loopback launcher guard does not make public hosting safe. Reverse-proxy HTTPS/origin/session handling needs its own implementation and integration tests before deployment.

External model service use is optional. When configured, saved note content is sent to that service. Remote hosts require explicit enablement, but users remain responsible for service authentication and transport. There is no claim of cryptographic protection from the machine performing inference.

The supplied tests cover specific intended boundaries; passing them does not prove the absence of security bugs.
