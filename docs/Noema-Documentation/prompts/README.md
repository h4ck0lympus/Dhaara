# Coding-agent handoff

## Start a new implementation

Paste `Noema-Build-Prompt.md` (or its identical plain-text version) into the coding agent. Give it the approved desktop, mobile and tablet images from `../assets/`. The brief is self-contained: it covers the product, UI, interactions, architecture, resource limits, privacy, milestones, tests and delivery. It tells the agent to inspect and preserve any source it discovers rather than overwrite it.

## Continue the existing implementation

Open the actual Noema source repository in the coding environment. Make the `Noema-Documentation` directory available beside or inside the workspace, without replacing the repository's existing `docs/`. Paste `Noema-Continue-Prompt.md`. The agent should read the repository's own status and tests plus the full build brief and handbook. It must inspect the source revision rather than assume the historical v0.2.0 snapshot is latest.

No fixed local path is assumed. Do not paste credentials or private screenshots into the prompt. Provide only source and data the agent is authorized to access. Never use your live database as a disposable test fixture.

## Small launcher prompt

```text
Use the supplied Noema documentation and actual source as the starting point.
Read Noema-Documentation/prompts/Noema-Build-Prompt.md and
Noema-Documentation/prompts/Noema-Continue-Prompt.md, then inspect the
repository and run its baseline tests with disposable data. Preserve the
agreed minimal UI, original notes, priority overrides, focus pins, and
CPU-first privacy limits. Implement the next unmet milestone rather than
redesigning the app or returning only a plan. Report changed files, exact
commands and tests, current gaps, and the next concrete step. Do not claim
hardware/model/cloud validation you have not performed.
```

Adjust the documentation-directory path only when its actual location differs. For a new workspace without source, use the full standalone prompt rather than the short launcher alone.

## Which material wins?

Latest explicit user instructions take precedence. The written product/UI requirements clarify what is essential; approved images show direction but contain illustrative names, dates, estimates, and decorative copy. Inspected source and executed tests establish implementation status. Do not treat an old screenshot, report, or narrative as proof that a feature is deployed or ready.

## Progress record

At the end of each session, keep a small continuation note with the source revision, files changed, tests actually run, remaining failures, hardware-only checks, and next milestone. Keep archived test reports unchanged. No application changes were made in preparing these prompts.
