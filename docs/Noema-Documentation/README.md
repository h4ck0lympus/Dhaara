# Noema documentation package

Start with **Noema-Handbook.pdf** for reading or **Noema-Handbook.docx** for editing. **Noema-Handbook.md** is the source-friendly text version with relative image links.

The handbook records the agreed product and interface, current code, compute/privacy boundaries, release gates and future plans. It does not change or deploy application code.

## Included

- `Noema-Handbook.pdf`, `.docx`, `.md`: matching 32-page handbook formats.
- `prompts/Noema-Build-Prompt.md` / `.txt`: standalone, complete coding-agent specification; usable in a new workspace or with existing source.
- `prompts/Noema-Continue-Prompt.md` / `.txt`: focused continuation prompt for an existing repository; protects working code, data, and verified behavior.
- `prompts/README.md`: how to hand the brief, source, and UI references to a coding agent.
- `assets/desktop-approved.png`, `mobile-approved.png`, `tablet-approved.png`: the exact agreed concept images, not regenerated.
- `assets/cat-reference.png`: the user-supplied tiny cat reference. Public redistribution rights are not established.
- `assets/implemented-*.png`: actual frontend screenshots from archived QA with synthetic tasks, not live user work.
- `assets/manifest.json`: image roles and SHA-256 hashes.
- `evidence/v0.1.0/`, `evidence/v0.2.0/`: archived source documentation and recorded QA.
- `evidence/documentation-qa-rerun.txt`: new 125-test rerun in this container while preparing documentation.
- `evidence/documentation-source-verification.json`: archive manifest verification.

## Important version reconciliation

The prior status message referred to v0.1.0. A v0.2.0 source archive was also recovered from the Library during this documentation work. It adds experimental scoped Sway screen-awareness code. That code's real compositor/model/device behavior remains unvalidated. The handbook documents both versions rather than silently conflating them.

No GPU/model is required for the base app. Native device behavior, real speech/vision quality, cloud sync and production deployment are not established by the archived screenshots or test counts. See the handbook and the source test report.

## Editing

Keep the handbook status matrix and citations updated when source changes. The evidence folder is historical; do not rewrite historical test results to match later work. Do not treat concept sample names, dates, slogans, estimates or native window controls as exact product requirements.

Application source ZIPs are not duplicated in this documentation bundle. No font files are included.

## Using the LLM-friendly prompts

For a new implementation, paste `prompts/Noema-Build-Prompt.md` into a coding agent and supply the three agreed UI images. With the existing Noema repository, use `prompts/Noema-Continue-Prompt.md` and give the agent this documentation directory plus the actual source. The continuation prompt references the full build brief instead of duplicating every requirement.

Both prompts require inspection of the real workspace, small implemented milestones, data preservation, regression tests, a clear built/experimental/planned inventory, and honest device/model/resource boundaries. The standalone prompt contains the product requirements even when the rest of the handbook is unavailable. The reference image files still need to be supplied for visual fidelity.

The prompt files are additions to this documentation package, not newly implemented Noema features. The main handbook remains documentation revision 1.0.
