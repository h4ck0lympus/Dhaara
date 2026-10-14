# Security and privacy boundary

This is a personal local development app, not a production security audit or multi-user isolation system.

## Defaults and implemented protections

- Loopback bind by default. No microphone or window observation starts automatically.
- An installation admin token is generated locally with a restrictive file mode. Do not distribute `.data` or publish `admin.token`.
- Loopback browser session bootstrap requires a loopback peer/Host and rejects forwarded-header attempts. A same-origin custom header is required for cookie-authenticated mutations.
- Host and Origin checks reject unexpected origins; scoped bearer tokens separate selected agent tasks from observer capabilities. Token strings are not returned after creation.
- Agent credentials cannot read the full note library or other tasks. Observer credentials can read the small companion summary and report current window metadata.
- Requests/attachments/input fields are bounded. File formats are checked using magic bytes, not filenames alone. Original file names are display metadata, not storage paths.
- Model output must conform to a bounded schema. It is stored as untrusted text and never allowed to execute commands, set priorities, grant permissions or create obligations.
- Browser rendering escapes HTML. The application does not load third-party scripts/fonts/CDNs or send telemetry.
- Export excludes credentials and latest raw observed context. Backups remain sensitive.

## Important limits

Loopback is not isolation from other processes running as you. Any process that can read your data directory or act as your local browser may access your notes. File-mode behavior differs across operating systems. SQLite, attachment files and browser drafts are not application-encrypted; use disk encryption and appropriate OS/profile permissions for private data.

A personal server is not automatically an approved place for employer code or confidential work notes. The first release does not implement per-project employer routing or enterprise policy enforcement. Do not upload material you are not authorized to store/process on that machine.

Window metadata can contain sensitive document titles, file paths or URLs. Current observation is off by default, metadata-only, and stores the latest sample rather than a history. Screenshot capture and exclusions are not implemented, so the cat is not silently photographing the screen.

Opaque external links are opened as links; they are not proof of agent status or a safe website. Do not put secrets into task/session URLs. Uploaded media decoders and AI dependencies have their own security surface. Magic-byte validation is not a malware scanner or image-decoder sandbox.

No public multi-user login system, rate-limit/abuse service, remote deployment security audit, encryption key management, secure mobile pairing or private network service is included. The non-loopback launcher guard does not make public hosting safe. Reverse-proxy HTTPS/origin/session handling needs its own implementation and integration tests before deployment.

External model service use is optional. When configured, saved note content is sent to that service. Remote hosts require explicit enablement, but users remain responsible for service authentication and transport. There is no claim of cryptographic protection from the machine performing inference.

The supplied tests cover specific intended boundaries; passing them does not prove the absence of security bugs.
