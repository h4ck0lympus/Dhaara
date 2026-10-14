# Phase 2b — Capture, Notes, Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Capture screen (text, task link, validated attachments, sketch, MediaRecorder recorder, After-Save confirmation), the Outbox dialog, the Notes list, the Note view (Note/Original/History, versioned edit, restore, suggestions, organize/transcribe, attachments, Markdown export) and the Settings dialog (including the new `display_name` setting), plus the page-side close checkpoint and update-reload handler that Phase 2a hands to this phase, with the navigation guards and the refetch-never-clobbers-input guarantee, all ported from `public/app.js` with handbook conformance.

**Architecture:** React screens and dialogs consume the data layer (`local/drafts.ts` external store, `local/outbox.ts`, `state/queries.ts` hooks) and the Phase 2a shell (`routes/guards.ts`, `shell/dialogs.ts`, `ui/*`). Server data is copied into local form state only when a form opens. Every write is sent once per user action with `expected_version`; a 409 is shown with a Reopen action and never retried. Phone/tablet/desktop layout is CSS-only in one phase-owned stylesheet. Every E2E test name is the verbatim parity-map label or handbook-trace title it satisfies.

**Tech Stack:** React 19.3.0, TypeScript 5.9.3, TanStack Query 5.104.1 / Router 1.170.42, Vitest 5.0.3 + jsdom 30.1.2 + @testing-library/react 16.3.3 + fake-indexeddb 6.2.5, Playwright 1.64.0 against the real FastAPI service, Python 3 / pytest for the one backend change.

**Spec:** /home/p4nic/code/noema/docs/superpowers/specs/2026-10-10-react-electron-migration-design.md (sections §4.3 refetch + replay policy, §4.4 validation/labels, §4.5 guards + keyboard, §4.6 saving/a11y/safety, §4.7 Capture/After-Save/Storage states/Sketch/Notes/Greeting backend/Accessibility/Traceability, §5 rows Capture, Outbox dialog, Notes, Note view, Settings, §6.2 `vite:preloadError`, §6.3 close contract (page side), §8 E2E Refetch + Navigation guards + parity rows) · **Contract:** /home/p4nic/code/noema/docs/superpowers/plans/2026-10-10-react-electron/00-contract.md

## Prerequisites (which earlier phase files must be complete)

- `01-foundation.md` complete and green: `web/` scaffold, `web/src/strings.ts` (`S`), `web/src/events.ts`, `web/src/globals.d.ts`, `web/src/zod.ts`, FastAPI serving of `web/dist`, the `display_name` backend change (its Task 7; this plan's Task 1 only verifies it), `docs/superpowers/specs/parity-map.md` and `handbook-trace.md`, and the E2E harness: `web/e2e/server.ts` (`startNoema` without `NOEMA_MODEL`/`NOEMA_SPEECH_MODEL`, so Organize/Transcribe report "off" deterministically), `web/e2e/fixtures.ts` (`test` with the auto fixtures `csp` and `pageErrors`, `gotoApp`, `seedLocalDb`, `readLocalDb`), `web/e2e/faults.ts` (`failIdbWrite`, `delayIdbTransactions`, `blockIdbOpen`, `failFetch`, `stubIpc`).
- The contract P2 data layer exists and is green: `api/client.ts` (`ApiError`), `api/schemas.ts` (`Note`, `NoteSummary`, `Settings`, `SettingsPatch`, `TokenCreated`, `NoteUpdateBody`), `local/db.ts` (`outboxGet`, `isOutboxItem`, `StoredFile`, `OutboxItem`), `local/limits.ts` (`ACCEPT_ATTR`, `FileRejection`), `local/drafts.ts` (`captureDraftStore`, `useCaptureDraft`, `LocalSaveState`), `local/taskDraft.ts` (`taskDraftStore`), `local/outbox.ts` (`retryItem`, `discardItem`, `subscribeOutbox`, `useOutboxItems`), `domain/connection.ts` (`useConnected`), `domain/format.ts` (`age`, `dateLabel`, `noteMarkdownExport`), `state/queryClient.ts` (`createQueryClient`), `state/queries.ts` (all hooks and `queryKeys`), `test/fixtures.ts`. This plan relies on `captureDraftStore.save()` setting `saveState: 'error'` when its transaction fails (port of `public/app.js:414`) and cancelling the pending 350 ms debounce (`app.js:403`). `01-foundation.md` (contract P1 + P2) creates all of these files (its Tasks 11–19); `domain/nowState.ts` and the rest of `domain/tasks.ts` come from `02-screens-core.md` Tasks 2–3.
- `02-screens-core.md` (Phase 2a) complete: router with in-place modal links (`routes/legacy.ts` `installModalLinks`, so `#settings` / `#/settings` open the dialog without unmounting the screen), `routes/guards.ts` (`useNavigationGuard`, `isGuardActive`, `RouteGuards` mounted), `shell/dialogs.ts` (`openDialog`, `closeDialog`), `shell/DialogHost.tsx` (a `switch (request?.kind)` with the `task-capture` and `task` arms and `default: return null;`), `shell/OfflineNotice.tsx`, `shell/notifications.ts` (`NOTIFICATIONS_KEY`), `shell/Nav.tsx` (`<nav aria-label="Main navigation">` with the links Overview, Capture, Notes, Tasks and a Settings button), `shell/StatusLine.tsx` (outbox button named `S.outboxCount(n)` that opens `{kind:'outbox'}`), `shell/AppShell.tsx` (avatar `<span className="avatar">`), `ui/Dialog.tsx`, `ui/Toast.tsx` (`toast`, `toastError`), `ui/Icon.tsx`, `ui/PageHeading.tsx` (`PageHeading({ title, subtitle?, action? })`), `copy.ts` (`COPY`, `greeting`), `domain/nowState.ts` (`observationStatus`), `styles/ui.css` (`.primary`, `.secondary`, `.quiet-button`, `.text-button`, `.icon-button`, `.notice`, `.notice.error`, `.eyebrow`, `.sr-only`), `web/src/main.tsx` (the `start()` body that calls `installRefetchTriggers(qc);`), and the heading-only screen stubs `screens/Capture.tsx`, `Notes.tsx`, `NoteView.tsx`.
- Phase 2a explicitly leaves to this phase (its Prerequisites): `ui/Markdown.tsx` (Task 9), `dialogs/Outbox.tsx` and the `outbox` arm (Task 8), `shell/checkpoint.ts`, `shell/preloadError.ts` and their two calls in `main.tsx` (Task 14), the `sketch`, `note-history` and `settings` arms (Tasks 6, 12, 13), and the three guard registrations (Tasks 5, 7, 11).

## Global Constraints (one line each, exact values copied verbatim from the spec that apply to this phase)

- Attachments: "At most 12 files, each ≤ 32 MB." · "Total payload < 60 MB" · MIME "images: png, jpeg, webp; audio: wav, ogg, webm, mp4, mpeg" · "Each rejection has its own toast. The picker's `accept` attribute matches."
- Recorder: "MediaRecorder (webm/opus → webm → ogg/opus → mp4; 64 kbps; 1 s chunks; pause/resume; auto-stop over 30 MB)".
- Sketch: "DPR canvas, 12-step undo, `sketch.png`" · "pen, eraser, undo and a simple text tool. It is a lightweight tray, not a drawing app."
- Notes search: "search (300 ms debounce, local fallback)"; the server rejects `q` longer than 500 characters (`noema/server.py:215`).
- "Refetches never replace in-progress input. Capture, NoteView edit mode, TaskDetail, Settings and TaskCapture copy server data into local form state only when they open."
- "The UI never automatically retries a mutation." · "Every edit carries `expected_version`. A 409 shows a conflict prompt and never overwrites."
- Guards: "While recording: navigation away from Capture is blocked, with the existing toast." · "While a capture save is in flight: blocked with 'Finishing the local save.'" · "An unsaved note edit asks for confirmation." · "`beforeunload` is set while recording, while a save is in flight, and while editing a note."
- Keyboard: "Ctrl/Cmd+Enter submits Capture and Add task. Plain Enter inserts a newline." · "IME composition is respected."
- "Attachments are Blobs, and each object URL is revoked when its owner unmounts." · "no whole-document saves on every keystroke".
- "Markdown escapes all HTML, and no `dangerouslySetInnerHTML` is used with user content."
- "Toasts use `role=status aria-live=polite`; errors use `role=alert`." · "Status is never shown by colour alone; contrast is at least 4.5:1." · "touch targets ≥ 44×44 px at phone widths".
- Layout: Desktop "≥1000 px"; Phone "<650 px … Capture is full-screen"; Tablet "650–1000 px … optional, collapsible folder/recent-note pane in Notes"; Portrait "Collapses to the phone's single column".
- Backend: "`SettingsInput.display_name: str | None` (strip, max 60 chars)." · "`DEFAULT_SETTINGS['display_name'] = ''`." · "Tested in `tests/test_core.py`."
- Settings: "observation, motion, companion mode/size (24–72, for the Python helper), context rules, tokens (shown once), export".
- "Capture is disabled by default: no mic, observation or model without explicit user action."
- "'Saved to {folder}' appears only after a server acknowledgement for exactly one flushed item." · After Save "appears only after the server acknowledges; while queued, the confirmation states the local/queued state."
- "the labels for 'on this device / draft', 'queued' and 'saved on server' are distinct and never interchangeable".
- Close (page side): "refuses while a capture save is in flight, keeping the window open with a toast; asks for confirmation if recording or editing; saves both drafts; posts `noema:close-approved`." · "If the draft write fails, it asks 'Close without saving the draft?' and keeps the window open if the user declines." · "The React app sets `__noemaCheckpointCloseReady` only after its listener is installed **and** IndexedDB recovery has finished."
- "`vite:preloadError`: the page saves drafts, then offers a reload."
- Copy: "Capture a thought." / "A quiet place for the rough edges." and "A place to return to." / "Your notes, with their original thinking intact." come from `web/src/copy.ts` (owner decision 18B; kept).
- Every reading or editing surface carries `data-quiet` (contract §0). zod only via `web/src/zod.ts`; `fetch(` only in `api/client.ts` (contract §3.1).
- Parity rule (`01-foundation.md` Task 1): "a row's target test title is the source label verbatim".
- Each commit message ends with the attribution trailer the executing session supplies (contract §0). All commits go to branch `feat/react-electron`.

## Review Focus (the five input classes/failure modes most likely to bite a user that the spec implies; for each, the owning task must include a test for it)

1. **Local storage fails mid-thought** (quota error, aborted Save transaction, database unavailable at boot, a failed draft write at close): the text stays in the editor, the error label is truthful, Retry works without reload, an aborted Save rolls back both stores, and close asks before risking the draft. Owners: Task 5 (`capture.spec.ts` native-storage rows), Task 14 (checkpoint unit + E2E).
2. **A refetch or another device changes data under an open form** (note edit, Change folder, Settings name, Capture text): input is never replaced; a 409 is shown with Reopen and never retried or overwritten. Owners: Task 4 (unit), Task 5, Task 11, Task 13 (E2E + unit).
3. **Hostile or malformed content** (HTML/script in a note body, original, suggestion or history; an unreadable outbox record): rendered as text, never executed; malformed queue records are listed with Discard only. Owners: Task 9 (unit), Task 11, Task 12, Task 8.
4. **Files and recordings outside limits** (wrong type, > 32 MB, ≥ 60 MB total, > 12 files, a recording past 30 MB, an empty recording): rejected before queueing with a visible message; nothing doomed enters the outbox. Owners: Task 2 (unit), Task 3 (unit), Task 5 (E2E).
5. **Leaving mid-operation** (navigating or closing while recording, during a save, during a note edit; Capture unmounting while recording; the Python helper opening `#settings` over an edit): navigation is blocked or confirmed, `beforeunload` is armed, recorded audio still reaches the draft, and the open edit survives. Owners: Task 3 (unit), Task 5, Task 7, Task 11, Task 13, Task 14 (E2E).

---

### Task 1: Verify the `display_name` backend setting

`01-foundation.md` Task 7 owns this change (contract §2, §10). This task checks it landed exactly as the spec requires before Settings (Task 13) depends on it. If any check fails, apply the code below, which is identical to `01-foundation.md` Task 7, so both plans produce the same lines.

**Files:**
- Modify (only if Step 1 fails): `noema/models.py:130-134` (`SettingsInput`), `noema/store.py:100` (`DEFAULT_SETTINGS`), `noema/store.py:383` (`Store.settings`)
- Test: `tests/test_core.py` › `test_display_name_setting` (append only if absent)

**Interfaces:**
- Consumes: the `env` fixture (`tests/test_core.py:18-24`), `PATCH /api/settings`, `GET /api/state`, `Store.set_meta`.
- Produces: `PATCH /api/settings` accepts `display_name: str | None` (stripped, then `max_length=60`, 422 otherwise, non-strings rejected); every settings response → `display_name: str` (default `''`), including for stored settings rows that predate the key.

- [ ] **Step 1: Run the existing check**

Run: `grep -c "display_name" noema/models.py noema/store.py tests/test_core.py && .venv/bin/python -m pytest tests/test_core.py -k test_display_name_setting -q`
Expected: every file reports a count ≥ 1 and pytest prints `1 passed`. If so, this task is complete: no change and no commit. Otherwise continue with Step 2.

- [ ] **Step 2: Write the failing test (only if `test_display_name_setting` is absent)**

Append to `tests/test_core.py`:

```python
def test_display_name_setting(env):
    c,s,w=env
    assert c.get('/api/state').json()['settings']['display_name']==''
    r=c.patch('/api/settings',json={'display_name':'  Vishal  '})
    assert r.status_code==200,r.text
    assert r.json()['display_name']=='Vishal'
    assert c.get('/api/state').json()['settings']['display_name']=='Vishal'
    assert c.patch('/api/settings',json={'display_name':'x'*61}).status_code==422
    padded=c.patch('/api/settings',json={'display_name':' '*10+'y'*60})
    assert padded.status_code==200,padded.text
    assert padded.json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':5}).status_code==422
    assert c.patch('/api/settings',json={'motion':True}).json()['display_name']=='y'*60
    assert c.patch('/api/settings',json={'display_name':''}).json()['display_name']==''
    s.set_meta('settings',{'observation_enabled':False,'motion':False,'companion':'cat','companion_size':40})
    old=c.get('/api/state').json()['settings']
    assert old['display_name']==''
    assert old['observation_enabled'] is False and old['motion'] is False
```

Run: `.venv/bin/python -m pytest tests/test_core.py -k test_display_name_setting -q`
Expected: FAIL with `KeyError: 'display_name'` on the first assertion.

- [ ] **Step 3: Minimal implementation (only for the parts Step 1 found missing)**

In `noema/models.py` replace `SettingsInput` (lines 130-134) with:

```python
class SettingsInput(Input):
    observation_enabled: bool | None = None
    motion: bool | None = None
    companion: Literal['cat', 'dot', 'hidden'] | None = None
    companion_size: int | None = Field(default=None, ge=24, le=72)
    display_name: str | None = Field(default=None, max_length=60)

    @field_validator('display_name', mode='before')
    @classmethod
    def strip_display_name(cls, value):
        # Strip before the length check; non-strings fall through to the str check and are rejected, never coerced.
        return value.strip() if isinstance(value, str) else value
```

(`field_validator` is already imported at `noema/models.py:4`.)

In `noema/store.py` replace line 100 with:

```python
DEFAULT_SETTINGS = {'observation_enabled': False, 'motion': False, 'companion': 'cat', 'companion_size': 40, 'display_name': ''}
```

In `noema/store.py` `Store.settings` (line 383) replace `result = self.meta('settings')` with (the exact line of `01-foundation.md` Task 7):

```python
        result = {**DEFAULT_SETTINGS, **self.meta('settings')}  # rows written before a setting existed get its default
```

- [ ] **Step 4: Run the test and the whole Python suite**

Run: `.venv/bin/python -m pytest tests/test_core.py -k test_display_name_setting -q && .venv/bin/python -m pytest -q`
Expected: `1 passed`, then the whole suite passes.

- [ ] **Step 5: Commit (only if Steps 2–3 changed files)**

```bash
git add noema/models.py noema/store.py tests/test_core.py
git commit -m "feat(server): add display_name setting for the greeting"
```

---

### Task 2: Attachment previews with object-URL revocation

**Files:**
- Create: `web/src/capture/Attachments.tsx`
- Test: `web/src/capture/Attachments.test.tsx`

**Interfaces:**
- Consumes: `StoredFile` (`local/db.ts`), `FileRejection` (`local/limits.ts`), `toast` (`ui/Toast.tsx`), `Icon` (`ui/Icon.tsx`).
- Produces:
  - `export function Attachments(props: { files: StoredFile[]; onRemove: (index: number) => void }): JSX.Element | null` (contract §6.3).
  - `export function toastRejections(rejections: FileRejection[]): void` — one `role=alert` toast per rejection, in order (spec §4.4 "Each rejection has its own toast"; port of `app.js:398`, which toasts per file), nothing for an empty list. Used by Capture, Recorder and Sketch.

- [ ] **Step 1: Write the failing test**

Create `web/src/capture/Attachments.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { toast } from '../ui/Toast';
import { Attachments, toastRejections } from './Attachments';

let created: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  created = [];
  revoked = [];
  Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      const url = `blob:test/${created.length + 1}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const image = { name: 'diagram.png', blob: new Blob(['png'], { type: 'image/png' }) };
const audio = { name: 'voice.webm', blob: new Blob(['webm'], { type: 'audio/webm' }) };

describe('Attachments', () => {
  it('renders images and audio with their names and a labelled remove button', () => {
    const onRemove = vi.fn();
    const { container } = render(<Attachments files={[image, audio]} onRemove={onRemove} />);
    expect(screen.getByRole('img', { name: 'diagram.png' }).getAttribute('src')).toBe('blob:test/1');
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test/2');
    expect(screen.getByText('voice.webm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove voice.webm' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('revokes every object URL it created when it unmounts', () => {
    const { unmount } = render(<Attachments files={[image, audio]} onRemove={() => {}} />);
    expect(created).toHaveLength(2);
    unmount();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it('revokes the previous URLs when the file list changes', () => {
    const { rerender } = render(<Attachments files={[image]} onRemove={() => {}} />);
    rerender(<Attachments files={[image, audio]} onRemove={() => {}} />);
    expect(revoked).toEqual(['blob:test/1']);
    expect(screen.getByRole('img', { name: 'diagram.png' }).getAttribute('src')).toBe('blob:test/2');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<Attachments files={[]} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(created).toEqual([]);
  });
});

describe('toastRejections', () => {
  it('gives each rejection its own error toast, in order', () => {
    toastRejections([
      { code: 'too-large', name: 'a.png', message: 'a.png exceeds 32 MB.' },
      { code: 'unsupported-type', name: 'b.txt', message: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.' },
    ]);
    expect(vi.mocked(toast).mock.calls).toEqual([
      ['a.png exceeds 32 MB.', { tone: 'error' }],
      ['Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.', { tone: 'error' }],
    ]);
  });

  it('shows nothing for an empty list', () => {
    toastRejections([]);
    expect(toast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/capture/Attachments.test.tsx`
Expected: FAIL with `Failed to resolve import "./Attachments" from "src/capture/Attachments.test.tsx"`.

- [ ] **Step 3: Minimal implementation**

Create `web/src/capture/Attachments.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { StoredFile } from '../local/db';
import type { FileRejection } from '../local/limits';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/Toast';

export function toastRejections(rejections: FileRejection[]): void {
  for (const rejection of rejections) toast(rejection.message, { tone: 'error' });   // app.js:398: one toast per rejected file
}

type Preview = { blob: Blob; url: string };

export function Attachments({ files, onRemove }: { files: StoredFile[]; onRemove: (index: number) => void }) {
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    const created = files.map(file => ({ blob: file.blob, url: URL.createObjectURL(file.blob) }));
    setPreviews(created);
    return () => created.forEach(preview => URL.revokeObjectURL(preview.url));
  }, [files]);

  if (!files.length) return null;
  return (
    <ul className="attachment-list">
      {files.map((file, index) => {
        // Match by Blob identity so a stale (already revoked) URL is never rendered.
        const url = previews.find(preview => preview.blob === file.blob)?.url;
        const audio = file.blob.type.startsWith('audio/');
        return (
          <li key={`${index}-${file.name}`} className={audio ? 'attachment audio' : 'attachment'}>
            {url && (audio ? <audio src={url} controls preload="metadata" /> : <img src={url} alt={file.name} />)}
            <span className="attachment-name">{file.name}</span>
            <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(index)}>
              <Icon name="close" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/capture/Attachments.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/capture/Attachments.tsx web/src/capture/Attachments.test.tsx
git commit -m "feat(web): attachment previews that revoke their object URLs"
```

---

### Task 3: Recorder hook (`useRecorder`)

Port of `public/app.js:420-442`. Elapsed time counts recorded time only (paused time is excluded), so Pause visibly freezes it.

**Files:**
- Create: `web/src/capture/Recorder.ts`
- Test: `web/src/capture/Recorder.test.ts`

**Interfaces:**
- Consumes: `captureDraftStore.addFiles(files: File[]): Promise<FileRejection[]>` (`local/drafts.ts`), `toast`, `toastRejections` (Task 2).
- Produces (contract §6.3 names `useRecorder(): RecorderState`; the type is defined here):

```ts
export const RECORDER_MIME_TYPES: readonly ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
export const RECORD_BITS_PER_SECOND = 64_000;
export const RECORD_TIMESLICE_MS = 1_000;
export const RECORD_AUTO_STOP_BYTES = 30 * 1024 * 1024;
export const RECORDER_TEXT: { idle; added; unsupported; unavailable(message: string); failed; limit };
export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused';
export type RecorderState = { phase: RecorderPhase; elapsedMs: number; status: string; start(): Promise<void>; pause(): void; resume(): void; stop(): void };
export function pickMimeType(isSupported: (type: string) => boolean): string | undefined;
export function recordingExtension(type: string): 'ogg' | 'm4a' | 'webm';
export function recordingFileName(type: string, at: Date): string;
export function formatElapsed(ms: number): string;   // m:ss
export function useRecorder(): RecorderState;
```

- [ ] **Step 1: Write the failing test**

Create `web/src/capture/Recorder.test.ts`:

```ts
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../local/drafts', () => ({ captureDraftStore: { addFiles: vi.fn(async () => []) } }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { toast } from '../ui/Toast';
import {
  RECORDER_TEXT,
  RECORD_AUTO_STOP_BYTES,
  formatElapsed,
  pickMimeType,
  recordingFileName,
  useRecorder,
} from './Recorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm';
  }
  state: RecordingState = 'inactive';
  mimeType: string;
  timeslice = 0;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly stream: MediaStream, readonly options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
  start(timeslice: number) { this.timeslice = timeslice; this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
  emit(data: Blob) { this.ondataavailable?.({ data }); }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

beforeEach(() => {
  FakeRecorder.instances = [];
  getUserMedia = vi.fn(async () => stream);
  setMediaDevices({ getUserMedia });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('recorder helpers', () => {
  it('prefers webm/opus, then webm, then ogg/opus, then mp4 (app.js:425)', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(type => type === 'audio/webm')).toBe('audio/webm');
    expect(pickMimeType(type => type.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType(() => false)).toBeUndefined();
  });

  it('names recordings by time and container (app.js:432-434)', () => {
    const at = new Date('2026-10-10T12:34:56.789Z');
    expect(recordingFileName('audio/webm;codecs=opus', at)).toBe('voice-2026-10-10T12-34-56-789Z.webm');
    expect(recordingFileName('audio/ogg;codecs=opus', at)).toBe('voice-2026-10-10T12-34-56-789Z.ogg');
    expect(recordingFileName('audio/mp4', at)).toBe('voice-2026-10-10T12-34-56-789Z.m4a');
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(61_999)).toBe('1:01');
    expect(formatElapsed(3_600_000)).toBe('60:00');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('useRecorder', () => {
  it('never touches the microphone until start()', async () => {
    const { result } = renderHook(() => useRecorder());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const [recorder] = FakeRecorder.instances;
    expect(recorder.options).toEqual({ mimeType: 'audio/webm', audioBitsPerSecond: 64_000 });
    expect(recorder.timeslice).toBe(1_000);
    expect(result.current.phase).toBe('recording');
  });

  it('a second start while recording does not open a second stream', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  it('explains when recording is unsupported or the microphone is refused', async () => {
    setMediaDevices(undefined);
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    expect(toast).toHaveBeenCalledWith(RECORDER_TEXT.unsupported, { tone: 'error' });
    setMediaDevices({ getUserMedia: vi.fn(async () => { throw new Error('Permission denied'); }) });
    await act(() => result.current.start());
    expect(toast).toHaveBeenCalledWith('Microphone unavailable: Permission denied', { tone: 'error' });
    expect(result.current.phase).toBe('idle');
  });

  it('counts elapsed time only while recording, not while paused', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current.elapsedMs).toBe(3_000);
    expect(result.current.status).toBe('0:03 · recording locally');
    act(() => result.current.pause());
    expect(result.current.phase).toBe('paused');
    expect(FakeRecorder.instances[0].state).toBe('paused');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.elapsedMs).toBe(3_000);
    expect(result.current.status).toBe('0:03 · paused');
    act(() => result.current.resume());
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.elapsedMs).toBe(5_000);
    expect(result.current.phase).toBe('recording');
  });

  it('Stop adds one voice file to the capture draft and releases the microphone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:34:56.789Z'));
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.status).toBe(RECORDER_TEXT.added));
    expect(track.stop).toHaveBeenCalled();
    const [[files]] = vi.mocked(captureDraftStore.addFiles).mock.calls;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('voice-2026-10-10T12-34-56-789Z.webm');
    expect(files[0].type).toBe('audio/webm');
    expect(result.current.phase).toBe('idle');
    expect(result.current.elapsedMs).toBe(0);
  });

  it('an empty recording adds nothing', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(captureDraftStore.addFiles).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
  });

  it('auto-stops just over 30 MB and says so (app.js:428)', async () => {
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    const [recorder] = FakeRecorder.instances;
    act(() => recorder.emit({ size: RECORD_AUTO_STOP_BYTES } as Blob));
    expect(recorder.state).toBe('recording');
    act(() => recorder.emit({ size: 1 } as Blob));
    expect(recorder.state).toBe('inactive');
    expect(toast).toHaveBeenCalledWith(RECORDER_TEXT.limit);
    await waitFor(() => expect(captureDraftStore.addFiles).toHaveBeenCalledTimes(1));
  });

  it('reports a draft rejection instead of claiming the recording was added', async () => {
    vi.mocked(captureDraftStore.addFiles).mockResolvedValueOnce([
      { code: 'total-too-large', name: 'voice.webm', message: 'Keep each capture under 60 MB in total.' },
    ]);
    const { result } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    act(() => result.current.stop());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Keep each capture under 60 MB in total.', { tone: 'error' }));
    expect(result.current.status).toBe(RECORDER_TEXT.idle);
  });

  it('unmounting while recording stops the recorder so the audio still reaches the draft', async () => {
    const { result, unmount } = renderHook(() => useRecorder());
    await act(() => result.current.start());
    FakeRecorder.instances[0].emit(new Blob(['abc'], { type: 'audio/webm' }));
    unmount();
    expect(FakeRecorder.instances[0].state).toBe('inactive');
    await waitFor(() => expect(captureDraftStore.addFiles).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/capture/Recorder.test.ts`
Expected: FAIL with `Failed to resolve import "./Recorder" from "src/capture/Recorder.test.ts"`.

- [ ] **Step 3: Minimal implementation**

Create `web/src/capture/Recorder.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { captureDraftStore } from '../local/drafts';
import { toast } from '../ui/Toast';
import { toastRejections } from './Attachments';

export const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;   // app.js:425
export const RECORD_BITS_PER_SECOND = 64_000;
export const RECORD_TIMESLICE_MS = 1_000;
export const RECORD_AUTO_STOP_BYTES = 30 * 1024 * 1024;   // app.js:428

export const RECORDER_TEXT = {
  idle: 'Audio stays local until you save.',   // app.js:212
  added: 'Recording added. Save when ready.',   // app.js:435
  unsupported: 'Recording requires a supported browser on localhost or HTTPS. You can still attach an audio file.',   // app.js:422
  unavailable: (message: string) => `Microphone unavailable: ${message}`,   // app.js:440
  failed: 'Recording failed. Stop and check your microphone.',   // app.js:437
  limit: 'Recording stopped near the 32 MB limit. Save this part before continuing.',   // app.js:428
} as const;

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused';
export type RecorderState = {
  phase: RecorderPhase;
  elapsedMs: number;
  status: string;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
};

export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return RECORDER_MIME_TYPES.find(type => isSupported(type));
}

export function recordingExtension(type: string): 'ogg' | 'm4a' | 'webm' {
  return type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';   // app.js:432
}

export function recordingFileName(type: string, at: Date): string {
  return `voice-${at.toISOString().replace(/[:.]/g, '-')}.${recordingExtension(type)}`;   // app.js:434
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  total: number;
  accumulated: number;
  runStartedAt: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

export function useRecorder(): RecorderState {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState<string>(RECORDER_TEXT.idle);
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const current = session.current;
      if (current) setElapsedMs(current.accumulated + Date.now() - current.runStartedAt);
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Navigation away is blocked while recording; if Capture unmounts anyway, Stop still delivers the audio to the draft store.
      const current = session.current;
      if (current && current.recorder.state !== 'inactive') current.recorder.stop();
    };
  }, []);

  async function finish(current: Session): Promise<void> {
    stopTracks(current.stream);
    const type = current.recorder.mimeType || 'audio/webm';
    const blob = new Blob(current.chunks, { type });
    session.current = null;
    setPhase('idle');
    setElapsedMs(0);
    if (!blob.size) {
      setStatus(RECORDER_TEXT.idle);
      return;
    }
    const rejections = await captureDraftStore.addFiles([new File([blob], recordingFileName(type, new Date()), { type })]);
    toastRejections(rejections);
    setStatus(rejections.length ? RECORDER_TEXT.idle : RECORDER_TEXT.added);
  }

  async function start(): Promise<void> {
    if (starting.current || session.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(RECORDER_TEXT.unsupported, { tone: 'error' });
      return;
    }
    starting.current = true;
    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      starting.current = false;
      setPhase('idle');
      toast(RECORDER_TEXT.unavailable(errorMessage(error)), { tone: 'error' });
      return;
    }
    if (!mounted.current) {
      starting.current = false;
      stopTracks(stream);
      return;
    }
    const mimeType = pickMimeType(type => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: RECORD_BITS_PER_SECOND }
        : { audioBitsPerSecond: RECORD_BITS_PER_SECOND });
    } catch (error) {
      starting.current = false;
      stopTracks(stream);
      setPhase('idle');
      toast(RECORDER_TEXT.unavailable(errorMessage(error)), { tone: 'error' });
      return;
    }
    const current: Session = { recorder, stream, chunks: [], total: 0, accumulated: 0, runStartedAt: Date.now() };
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      current.chunks.push(event.data);
      current.total += event.data.size;
      if (current.total > RECORD_AUTO_STOP_BYTES && recorder.state !== 'inactive') {
        recorder.stop();
        toast(RECORDER_TEXT.limit);
      }
    };
    recorder.onstop = () => { void finish(current); };
    recorder.onerror = () => {
      toast(RECORDER_TEXT.failed, { tone: 'error' });
      stopTracks(stream);
    };
    recorder.start(RECORD_TIMESLICE_MS);
    session.current = current;
    starting.current = false;
    setElapsedMs(0);
    setPhase('recording');
  }

  function pause(): void {
    const current = session.current;
    if (!current || current.recorder.state !== 'recording') return;
    current.recorder.pause();
    current.accumulated += Date.now() - current.runStartedAt;
    setElapsedMs(current.accumulated);
    setPhase('paused');
  }

  function resume(): void {
    const current = session.current;
    if (!current || current.recorder.state !== 'paused') return;
    current.recorder.resume();
    current.runStartedAt = Date.now();
    setPhase('recording');
  }

  function stop(): void {
    const current = session.current;
    if (current && current.recorder.state !== 'inactive') current.recorder.stop();
  }

  const shownStatus = phase === 'recording'
    ? `${formatElapsed(elapsedMs)} · recording locally`   // app.js:439
    : phase === 'paused'
      ? `${formatElapsed(elapsedMs)} · paused`
      : status;
  return { phase, elapsedMs, status: shownStatus, start, pause, resume, stop };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/capture/Recorder.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/capture/Recorder.ts web/src/capture/Recorder.test.ts
git commit -m "feat(web): MediaRecorder hook with pause-aware elapsed time"
```

---

### Task 4: After-Save confirmation and storage-state labels (`SavedNotice`)

Handbook §06/§14 and spec §4.7 "After Save" / "Storage states". The server label appears only once `GET /api/notes/{id}` returns the note (a real acknowledgement); while queued no note actions are offered.

**Files:**
- Create: `web/src/capture/SavedNotice.tsx`
- Create: `web/src/test/harness.tsx` (component-test helpers shared by Tasks 4 and 13)
- Test: `web/src/capture/SavedNotice.test.tsx`

**Interfaces:**
- Consumes: `useNote(id)`, `useUpdateNote()` (`state/queries.ts`), `ApiError`, `NoteUpdateBody`, `S.draftSaved`, `S.outboxTitle`, `createQueryClient`, `makeNote`, `makeSnapshot`.
- Produces:

```ts
// capture/SavedNotice.tsx
export type SavedCapture = { id: string; state: 'queued' | 'rejected' | 'server' };
export const STORAGE_LABELS: { device: string; queued: string; rejected: string; server: string };
export function SavedNotice(props: { saved: SavedCapture; onOpenNote(id: string): void; onOpenQueue(): void; onDismiss(): void }): JSX.Element;
// test/harness.tsx (test-only; imports fake-indexeddb/auto)
export type StubCall = { url: string; method: string; body: unknown };
export function jsonResponse(status: number, body: unknown): Response;
export function stubFetch(route: (call: StubCall) => Response | undefined): StubCall[];   // unmatched → 404 {detail}
export function installDialogPolyfill(): void;   // showModal/close for jsdom when missing
export function renderWithClient(ui: ReactElement, seed?: (queryClient: QueryClient) => void): RenderResult & { queryClient: QueryClient };
```

- [ ] **Step 1: Write the test harness and the failing test**

Create `web/src/test/harness.tsx`:

```tsx
import 'fake-indexeddb/auto';
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';
import { createQueryClient } from '../state/queryClient';

export type StubCall = { url: string; method: string; body: unknown };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function stubFetch(route: (call: StubCall) => Response | undefined): StubCall[] {
  const calls: StubCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: StubCall = {
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return route(call) ?? jsonResponse(404, { detail: `Not stubbed: ${call.method} ${call.url}` });
  }));
  return calls;
}

export function installDialogPolyfill(): void {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.open = true; };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.open = false; };
  }
}

export function renderWithClient(ui: ReactElement, seed?: (queryClient: QueryClient) => void): RenderResult & { queryClient: QueryClient } {
  const queryClient = createQueryClient();
  seed?.(queryClient);
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}
```

Create `web/src/capture/SavedNotice.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, NoteUpdateBody } from '../api/schemas';
import { queryKeys } from '../state/queries';
import { S } from '../strings';
import { jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { makeNote } from '../test/fixtures';
import { STORAGE_LABELS, SavedNotice } from './SavedNotice';

const CONFLICT = 'This note changed on another screen. Your draft has not been overwritten. Reopen to compare.';   // store.py:268
let note: Note;
let putStatus: number;
let calls: StubCall[];

beforeEach(() => {
  note = makeNote('n1', { title: 'Two pointers', folder: 'Inbox', body: 'sorted input', version: 1 });
  putStatus = 200;
  calls = stubFetch(call => {
    if (call.url === '/api/notes/n1' && call.method === 'GET') return jsonResponse(200, note);
    if (call.url === '/api/notes/n1' && call.method === 'PUT') {
      if (putStatus !== 200) return jsonResponse(putStatus, { detail: CONFLICT });
      const { title, folder, body } = call.body as NoteUpdateBody;
      note = { ...note, title, folder, body, version: note.version + 1 };
      return jsonResponse(200, note);
    }
    return undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const handlers = () => ({ onOpenNote: vi.fn(), onOpenQueue: vi.fn(), onDismiss: vi.fn() });
const puts = () => calls.filter(call => call.method === 'PUT');

describe('STORAGE_LABELS', () => {
  it('keeps the draft, queued and server labels distinct (handbook §20)', () => {
    const labels = Object.values(STORAGE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(STORAGE_LABELS.device).toBe(S.draftSaved);
    for (const label of [STORAGE_LABELS.device, STORAGE_LABELS.queued, STORAGE_LABELS.rejected]) {
      expect(label).not.toContain('Saved on');
    }
  });
});

describe('SavedNotice', () => {
  it('while queued it states the local state and offers no note actions', () => {
    renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'queued' }} {...handlers()} />);
    expect(screen.getByText(STORAGE_LABELS.queued)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change folder' })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a rejected capture points to the capture queue', () => {
    const h = handlers();
    renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'rejected' }} {...h} />);
    expect(screen.getByText(STORAGE_LABELS.rejected)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: S.outboxTitle }));
    expect(h.onOpenQueue).toHaveBeenCalledTimes(1);
  });

  it('after the server returns the note it shows the title and folder with Open note', async () => {
    const h = handlers();
    renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'server' }} {...h} />);
    expect(await screen.findByText(STORAGE_LABELS.server)).toBeTruthy();
    expect(screen.getByText('Two pointers')).toBeTruthy();
    expect(screen.getByText('Inbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open note' }));
    expect(h.onOpenNote).toHaveBeenCalledWith('n1');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Change folder sends one PUT with expected_version and shows the new folder', async () => {
    renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'server' }} {...handlers()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change folder' }));
    const input = screen.getByLabelText('Folder') as HTMLInputElement;
    expect(input.value).toBe('Inbox');
    expect(input.maxLength).toBe(240);
    fireEvent.change(input, { target: { value: '  Programming / Algorithms ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByText('Programming / Algorithms')).toBeTruthy();
    expect(puts().map(call => call.body)).toEqual([
      { title: 'Two pointers', folder: 'Programming / Algorithms', body: 'sorted input', expected_version: 1 },
    ]);
  });

  it('refuses a blank folder without a request', async () => {
    renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'server' }} {...handlers()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change folder' }));
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Folder cannot be blank.');
    expect(puts()).toEqual([]);
  });

  it('a 409 shows the conflict with Reopen, never retries, and the next Move uses the fresh version', async () => {
    putStatus = 409;
    const { queryClient } = renderWithClient(<SavedNotice saved={{ id: 'n1', state: 'server' }} {...handlers()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change folder' }));
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'Security' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect((await screen.findByRole('alert')).textContent).toContain(CONFLICT);
    expect(puts()).toHaveLength(1);
    note = { ...note, version: 4 };
    putStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(queryClient.getQueryData<Note>(queryKeys.note('n1'))?.version).toBe(4));
    expect((screen.getByLabelText('Folder') as HTMLInputElement).value).toBe('Security');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect((puts()[1].body as NoteUpdateBody).expected_version).toBe(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/capture/SavedNotice.test.tsx`
Expected: FAIL with `Failed to resolve import "./SavedNotice" from "src/capture/SavedNotice.test.tsx"`.

- [ ] **Step 3: Minimal implementation**

Create `web/src/capture/SavedNotice.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { ApiError } from '../api/client';
import { useNote, useUpdateNote } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';

export type SavedCapture = { id: string; state: 'queued' | 'rejected' | 'server' };

export const STORAGE_LABELS = {
  device: S.draftSaved,                                       // 'Draft on this device · not uploaded' (app.js:66)
  queued: 'Queued on this device · not on your server yet',   // new (handbook §20)
  rejected: 'Not accepted by your server · kept on this device',   // new
  server: 'Saved on your server',                             // new
} as const;

export const FOLDER_MAX_LENGTH = 240;   // models.py NoteUpdate.folder

type Props = { saved: SavedCapture; onOpenNote: (id: string) => void; onOpenQueue: () => void; onDismiss: () => void };

export function SavedNotice({ saved, onOpenNote, onOpenQueue, onDismiss }: Props) {
  return (
    <div className="saved-notice" role="status" data-storage={saved.state}>
      <div className="saved-notice-body">
        {saved.state === 'server' ? (
          <ServerSaved id={saved.id} onOpenNote={onOpenNote} />
        ) : (
          <p>
            <span className="storage-label">{STORAGE_LABELS[saved.state]}</span>
            {saved.state === 'rejected' && (
              <> <button type="button" className="text-button" onClick={onOpenQueue}>{S.outboxTitle}</button></>
            )}
          </p>
        )}
      </div>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function ServerSaved({ id, onOpenNote }: { id: string; onOpenNote: (id: string) => void }) {
  const note = useNote(id);
  const update = useUpdateNote();
  const [changing, setChanging] = useState(false);
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  if (!note.data) {
    return <p>{note.isError ? note.error.message : 'Checking your server…'}</p>;
  }
  const current = note.data;

  async function move(event: FormEvent) {
    event.preventDefault();
    const next = folder.trim();
    if (!next) {
      setError({ message: 'Folder cannot be blank.', conflict: false });
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ id, body: { title: current.title, folder: next, body: current.body, expected_version: current.version } });
      setChanging(false);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError({ message: apiError.message, conflict: apiError.status === 409 });
    }
  }

  return (
    <>
      <p>
        <span className="storage-label">{STORAGE_LABELS.server}</span> · <strong>{current.title}</strong> · <span>{current.folder}</span>
      </p>
      <div className="inline-actions">
        <button type="button" className="text-button" onClick={() => onOpenNote(id)}>Open note</button>
        {!changing && (
          <button type="button" className="text-button" onClick={() => { setFolder(current.folder); setError(null); setChanging(true); }}>
            Change folder
          </button>
        )}
      </div>
      {changing && (
        <form className="folder-form" onSubmit={event => void move(event)}>
          <label>Folder<input value={folder} maxLength={FOLDER_MAX_LENGTH} onChange={event => setFolder(event.target.value)} /></label>
          <button type="submit" className="secondary" disabled={update.isPending}>Move</button>
          <button type="button" className="quiet-button" onClick={() => { setChanging(false); setError(null); }}>Cancel</button>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error.message}
          {error.conflict && (
            <> <button type="button" className="text-button" onClick={() => { setError(null); void note.refetch(); }}>Reopen</button></>
          )}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/capture/SavedNotice.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/capture/SavedNotice.tsx web/src/capture/SavedNotice.test.tsx web/src/test/harness.tsx
git commit -m "feat(web): quiet after-save confirmation with distinct storage labels"
```

---

### Task 5: Capture screen (writing surface, attachments, task link, Save, confirmation, storage faults)

Port of `public/app.js:211-227, 388-419` with spec §4.7 "Capture" and "After Save". The phase stylesheet and the shared E2E helpers are created here because this is the first screen that needs them. The microphone control is added in Task 7, so the handbook-trace row U13 test (toolbar with mic) lives there.

**Files:**
- Modify (replace the Phase 2a heading-only body): `web/src/screens/Capture.tsx`
- Create: `web/src/styles/capture-notes.css` (imported by Capture, Notes, NoteView and Settings; a phase-owned file, so it never collides with the Phase 2a `screens.css`)
- Create: `web/e2e/screenTest.ts` (E2E helpers for this phase)
- Test: `web/e2e/capture.spec.ts` (including the offline-Capture parity rows, so this phase never creates the shared `offline.spec.ts`/`layout.spec.ts` file names that Phase 2a may also use; Task 15 points those parity rows here)

**Interfaces:**
- Consumes: `useCaptureDraft()`, `captureDraftStore.{setRaw,setTaskId,addFiles,removeFile,persist,save,getSnapshot}`, `LocalSaveState`, `ACCEPT_ATTR`, `outboxGet`, `isOutboxItem`, `subscribeOutbox`, `runFlush(qc)`, `useSnapshot()`, `useConnected()`, `useNavigationGuard`, `NavigationGuard`, `openDialog`, `OfflineNotice`, `PageHeading`, `toast`, `Icon`, `COPY.capture`, `S.*`, `Attachments`, `toastRejections` (Task 2), `SavedNotice`, `SavedCapture` (Task 4); E2E: `test`, `expect`, `gotoApp`, `readLocalDb`, `seedLocalDb` (`web/e2e/fixtures.ts`), `failIdbWrite`, `blockIdbOpen`, `delayIdbTransactions` (`web/e2e/faults.ts`), `E2E_TOKEN`, `NoemaServer` (`web/e2e/server.ts`).
- Produces:

```ts
// screens/Capture.tsx
export function CaptureScreen(): JSX.Element;   // registers the 'capture-saving' guard while a save is in flight
// e2e/screenTest.ts
export const MB = 1024 * 1024;
export const PNG: Buffer;   // native_storage_check.py:24
export const WAV: Buffer;   // RIFF/WAVE header accepted by detect_mime (server.py:44)
export type CreatedNote = { id: string; title: string; folder: string; body: string; raw: string; version: number; task_id: string | null };
export type StateBody = { notes: { id: string; title: string; folder: string; task_id: string | null }[]; tasks: { id: string; title: string }[] };
export function serverJson<T>(noema: NoemaServer, method: string, path: `/api/${string}`, body?: unknown): Promise<T>;
export function serverState(noema: NoemaServer): Promise<StateBody>;
export function serverBytes(noema: NoemaServer, path: `/api/${string}`): Promise<Buffer>;
export function createNote(noema: NoemaServer, raw: string, files?: { name: string; type: string; bytes: Buffer }[]): Promise<CreatedNote>;
export function editNote(noema: NoemaServer, note: CreatedNote, changes: Partial<Pick<CreatedNote, 'title' | 'folder' | 'body'>>): Promise<CreatedNote>;
export function seedSuggestion(noema: NoemaServer, noteId: string, suggestion: { id: string; title: string; body: string; folder: string }): void;
export function persistentBrowser(browserType: BrowserType, launchOptions: LaunchOptions, dir: string, errors: string[]): Promise<BrowserContext>;   // collects page errors into `errors`; the caller asserts it is empty
export function fakeMicrophonePage(browserType: BrowserType, launchOptions: LaunchOptions, errors: string[]): Promise<{ page: Page; close(): Promise<void> }>;
export function waitForServiceWorker(page: Page): Promise<void>;
export function readDraftFileBytes(page: Page): Promise<Buffer>;
export function expectPhoneFriendly(page: Page, scope: string): Promise<void>;   // no horizontal overflow; every visible control in scope ≥ 44×44
export function navLink(page: Page, label: 'Overview' | 'Capture' | 'Notes' | 'Tasks'): Locator;   // a link inside <nav aria-label="Main navigation">
export function dispatchRefetch(page: Page): Promise<void>;   // SERVICE_UP → waits for the /api/state response
export function openRuntimeLink(page: Page, hash: string): Promise<void>;   // sets location.hash in the running page, as the Python helper's links do
export function beforeUnloadArmed(page: Page): Promise<boolean>;   // dispatches a cancelable beforeunload and reports defaultPrevented
```

- [ ] **Step 1: Write the E2E helpers**

Create `web/e2e/screenTest.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, BrowserType, LaunchOptions, Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const AUTH = { Authorization: `Bearer ${E2E_TOKEN}`, 'X-Noema-Request': '1' };

export const MB = 1024 * 1024;
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3l0AAAAASUVORK5CYII=', 'base64');   // native_storage_check.py:24
export const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.alloc(28)]);   // detect_mime, server.py:44

export type CreatedNote = { id: string; title: string; folder: string; body: string; raw: string; version: number; task_id: string | null };
export type StateBody = { notes: { id: string; title: string; folder: string; task_id: string | null }[]; tasks: { id: string; title: string }[] };

export async function serverJson<T>(noema: NoemaServer, method: string, path: `/api/${string}`, body?: unknown): Promise<T> {
  const response = await fetch(noema.origin + path, {
    method,
    headers: body === undefined ? AUTH : { ...AUTH, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
  return JSON.parse(text) as T;
}

export function serverState(noema: NoemaServer): Promise<StateBody> {
  return serverJson<StateBody>(noema, 'GET', '/api/state');
}

export async function serverBytes(noema: NoemaServer, path: `/api/${string}`): Promise<Buffer> {
  const response = await fetch(noema.origin + path, { headers: AUTH });
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function createNote(noema: NoemaServer, raw: string, files: { name: string; type: string; bytes: Buffer }[] = []): Promise<CreatedNote> {
  const form = new FormData();
  form.set('payload', JSON.stringify({ capture_id: randomUUID(), raw, project: '', task_id: null, organize: true }));
  for (const file of files) form.append('attachments', new Blob([file.bytes], { type: file.type }), file.name);
  const response = await fetch(`${noema.origin}/api/captures`, { method: 'POST', body: form, headers: AUTH });
  if (!response.ok) throw new Error(`createNote → ${response.status} ${await response.text()}`);
  return (await response.json()) as CreatedNote;
}

export function editNote(noema: NoemaServer, note: CreatedNote, changes: Partial<Pick<CreatedNote, 'title' | 'folder' | 'body'>>): Promise<CreatedNote> {
  return serverJson<CreatedNote>(noema, 'PUT', `/api/notes/${note.id}`, {
    title: note.title, folder: note.folder, body: note.body, ...changes, expected_version: note.version,
  });
}

// A late model result cannot be produced without a model, so the suggestion row is inserted directly (schema: store.py:62-65).
export function seedSuggestion(noema: NoemaServer, noteId: string, suggestion: { id: string; title: string; body: string; folder: string }): void {
  execFileSync(join(REPO, '.venv/bin/python'), [
    '-c',
    'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("INSERT INTO suggestions VALUES(?,?,?,?,?,?)",tuple(sys.argv[2:8]));c.commit()',
    join(noema.dataDir, 'noema.sqlite3'), suggestion.id, noteId, suggestion.title, suggestion.body, suggestion.folder, '2026-10-10T00:00:00+00:00',
  ]);
}

export async function persistentBrowser(browserType: BrowserType, launchOptions: LaunchOptions, dir: string, errors: string[]): Promise<BrowserContext> {
  const context = await browserType.launchPersistentContext(dir, { ...launchOptions, viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(12_000);
  context.on('page', page => page.on('pageerror', error => errors.push(String(error))));
  return context;
}

export async function fakeMicrophonePage(browserType: BrowserType, launchOptions: LaunchOptions, errors: string[]): Promise<{ page: Page; close(): Promise<void> }> {
  const browser = await browserType.launch({
    ...launchOptions,
    args: [...(launchOptions.args ?? []), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  return { page, close: () => browser.close() };
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export async function readDraftFileBytes(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const draft = await new Promise<{ files: { blob: Blob }[] }>((resolve, reject) => {
        const request = db.transaction('kv', 'readonly').objectStore('kv').get('draft');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return Array.from(new Uint8Array(await draft.files[0].blob.arrayBuffer()));
    } finally {
      db.close();
    }
  });
  return Buffer.from(bytes);
}

export async function expectPhoneFriendly(page: Page, scope: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow').toBe(true);
  const small = await page
    .locator(`${scope} :is(button, a, select, input:not([type=file]):not([type=checkbox]):not([type=range]))`)
    .evaluateAll(elements => elements
      .filter(element => element.getClientRects().length > 0)
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { control: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, width: rect.width, height: rect.height };
      })
      .filter(control => control.width < 44 || control.height < 44));
  expect(small, 'touch targets ≥ 44×44 px at phone width').toEqual([]);
}

export function navLink(page: Page, label: 'Overview' | 'Capture' | 'Notes' | 'Tasks'): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true });
}

export async function dispatchRefetch(page: Page): Promise<void> {
  const refetched = page.waitForResponse(response => response.url().includes('/api/state'));
  await page.evaluate(() => window.dispatchEvent(new Event('noema:service-up')));
  await refetched;
}

export async function openRuntimeLink(page: Page, hash: string): Promise<void> {
  await page.evaluate(value => { location.hash = value; }, hash);
}

export function beforeUnloadArmed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}
```

- [ ] **Step 2: Write the failing Capture E2E tests**

Create `web/e2e/capture.spec.ts` (test names are the verbatim parity-map labels and handbook-trace titles):

```ts
import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { blockIdbOpen, delayIdbTransactions, failIdbWrite } from './faults';
import { expect, gotoApp, readLocalDb, seedLocalDb, test } from './fixtures';
import {
  MB, PNG, beforeUnloadArmed, dispatchRefetch, expectPhoneFriendly, fakeMicrophonePage, navLink, persistentBrowser,
  readDraftFileBytes, serverJson, serverState, waitForServiceWorker,
} from './screenTest';

const RAW = 'free_slot(0x1234) may leave a pointer. Not confirmed; changing size did not help.';   // native_storage_check.py:25

const editor = (page: Page) => page.getByLabel('Rough learning note');
const draftStatus = (page: Page) => page.locator('#draft-status');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save note' });
const localError = (page: Page) => page.locator('#local-save-error');
const notice = (page: Page) => page.locator('.saved-notice');
const draftRaw = async (page: Page) => ((await readLocalDb(page)).draft as { raw: string }).raw;

test.describe('Capture', () => {
  test('Unsaved draft never ingested into server notebook', async ({ page, noema }) => {   // native_storage_check.py:166; handbook-trace R3
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill(RAW);
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    expect(await draftRaw(page)).toBe(RAW);
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Capture creates a learning note, never an automatic task', async ({ page, noema }) => {   // now_ui_check.py:163; handbook-trace R1
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Learning note: I am unsure about ownership. Not a commitment.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    expect((await serverState(noema)).tasks).toEqual([]);
  });

  test('Ordinary learning-note capture creates no task', async ({ page, noema }) => {   // task_capture_check.py:250
    await serverJson(noema, 'POST', '/api/tasks', { title: 'Existing commitment' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Learning note: review tomorrow is an example, not a task commitment.');
    await saveButton(page).click();
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    expect((await serverState(noema)).tasks.map(task => task.title)).toEqual(['Existing commitment']);
  });

  test('Text and uploaded image commit together', async ({ page, noema }) => {   // browser_check.py:118-127
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('LeetCode trick: sorted input. two pointers, move left if the sum is small. not sure about duplicates yet.');
    await page.locator('input[type=file]').setInputFiles({ name: 'example.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'example.png' })).toBeVisible();
    await saveButton(page).click();
    await expect(notice(page)).toHaveAttribute('data-storage', 'server');
    const [note] = (await serverState(noema)).notes;
    const full = await serverJson<{ attachments: unknown[]; raw: string }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full.attachments).toHaveLength(1);
    expect(full.raw).toContain('not sure');
  });

  test('After server acknowledgement Capture shows the title and folder with Open note and Change folder', async ({ page, noema }) => {   // handbook-trace U16
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('heap... maybe wrong\nfree_slot(0x1234);');
    await saveButton(page).click();
    await expect(notice(page)).toContainText('Saved on your server');
    const [note] = (await serverState(noema)).notes;
    await expect(notice(page)).toContainText(note.title);
    await expect(notice(page)).toContainText(note.folder);
    await notice(page).getByRole('button', { name: 'Change folder' }).click();
    await notice(page).getByLabel('Folder').fill('Security / Heap');
    await notice(page).getByRole('button', { name: 'Move' }).click();
    await expect(notice(page)).toContainText('Security / Heap');
    const full = await serverJson<{ version: number; raw: string; folder: string }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full.folder).toBe('Security / Heap');
    expect(full.version).toBe(2);
    expect(full.raw).toBe('heap... maybe wrong\nfree_slot(0x1234);');
    await notice(page).getByRole('button', { name: 'Open note' }).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
  });

  test('While queued, Capture says the capture is on this device', async ({ page, noema, context }) => {   // handbook-trace U16; browser_check.py:136-141
    await gotoApp(page, noema, '#/capture');
    await context.setOffline(true);
    await editor(page).fill('Offline learning note. Keep my original.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect(page.getByRole('status').filter({ hasText: S.captureSavedOffline })).toBeVisible();
    await expect(notice(page)).toContainText('Queued on this device · not on your server yet');
    await expect(notice(page).getByRole('button', { name: 'Open note' })).toHaveCount(0);
    await expect(notice(page).getByRole('button', { name: 'Change folder' })).toHaveCount(0);
    expect((await readLocalDb(page)).outbox).toHaveLength(1);
    await context.setOffline(false);
    await expect(notice(page)).toContainText('Saved on your server');
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('Draft, queued and saved-on-server labels are distinct', async ({ page, noema, context }) => {   // handbook-trace U17
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('label check');
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    const device = await draftStatus(page).textContent();
    await context.setOffline(true);
    await saveButton(page).click();
    await expect(notice(page)).toHaveAttribute('data-storage', 'queued');
    const queued = await notice(page).locator('.storage-label').textContent();
    await context.setOffline(false);
    await expect(notice(page)).toHaveAttribute('data-storage', 'server');
    const server = await notice(page).locator('.storage-label').textContent();
    expect(new Set([device, queued, server]).size).toBe(3);
    expect(device).toBe('Draft on this device · not uploaded');
    expect(queued).toBe('Queued on this device · not on your server yet');
    expect(server).toBe('Saved on your server');
  });

  test('Capture text never moves under the cursor', async ({ page, noema }) => {   // handbook-trace U15; spec §8 Refetch
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('alpha beta gamma');
    await editor(page).evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(6, 6));
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    await dispatchRefetch(page);
    await expect(editor(page)).toHaveValue('alpha beta gamma');
    await expect(editor(page)).toBeFocused();
    expect(await editor(page).evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([6, 6]);
    await page.keyboard.type('new ');
    await expect(editor(page)).toHaveValue('alpha new beta gamma');
    // No live preview copy of the text anywhere outside the editor (React mirrors a controlled textarea's value into its own text, so the editor and its ancestors are excluded).
    expect(await page.locator('.capture-screen').evaluate(root => {
      const writing = root.querySelector('textarea');
      return [...root.querySelectorAll('*')].some(element => !element.contains(writing) && (element.textContent ?? '').includes('alpha new beta gamma'));
    })).toBe(false);
  });

  test('Ctrl+Enter saves; plain Enter inserts a newline', async ({ page, noema }) => {   // spec §4.5 Keyboard
    await gotoApp(page, noema, '#/capture');
    await editor(page).click();
    await page.keyboard.type('line one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('line two');
    await expect(editor(page)).toHaveValue('line one\nline two');
    await page.keyboard.press('Control+Enter');
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
  });

  test('Ctrl+Enter during IME composition does not save', async ({ page, noema }) => {   // spec §4.5 "IME composition is respected"
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('かな');
    await editor(page).evaluate(element => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    await expect(editor(page)).toHaveValue('かな');
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('An empty Save is refused with the existing message and queues nothing', async ({ page, noema }) => {   // app.js:402
    await gotoApp(page, noema, '#/capture');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: S.writeSomething })).toBeVisible();
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('A save in flight blocks navigation', async ({ page, noema }) => {   // spec §8 Navigation guards
    await delayIdbTransactions(page, 1500);
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Saving slowly.');
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    await saveButton(page).click();
    await navLink(page, 'Notes').click();
    await expect(page.getByRole('status').filter({ hasText: S.finishingLocalSave })).toBeVisible();
    await expect(page).toHaveURL(/#\/capture$/);
    await expect(editor(page)).toHaveValue('');
    await navLink(page, 'Notes').click();
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('Phone capture has no horizontal overflow', async ({ page, noema }) => {   // browser_check.py:149-150
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('A quick thought from my phone with a_very_long_identifier_that_must_wrap_instead_of_overflowing_0x41414141');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Phone width uses bottom navigation and full-screen Capture', async ({ page, noema }) => {   // handbook-trace U10
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/capture');
    const nav = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
    expect(nav.y + nav.height).toBeGreaterThan(844 - 100);
    expect(nav.width).toBeGreaterThan(300);
    expect((await editor(page).boundingBox())!.width).toBeGreaterThan(330);
    await expectPhoneFriendly(page, '.capture-screen');
  });
});

test.describe('Capture attachments and task link', () => {
  test('Rejects files that would fail on the server, each with its own message', async ({ page, noema }) => {   // spec §4.4 validation
    const big = test.info().outputPath('big.png');
    const a = test.info().outputPath('a.png');
    const b = test.info().outputPath('b.png');
    writeFileSync(big, Buffer.alloc(32 * MB + 1));
    writeFileSync(a, Buffer.alloc(31 * MB));
    writeFileSync(b, Buffer.alloc(31 * MB));
    await gotoApp(page, noema, '#/capture');
    const picker = page.locator('input[type=file]');
    await expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/mpeg');
    await picker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByRole('alert').filter({ hasText: S.unsupportedType })).toBeVisible();
    await picker.setInputFiles(big);
    await expect(page.getByRole('alert').filter({ hasText: S.fileTooLarge('big.png') })).toBeVisible();
    await picker.setInputFiles([a, b]);
    await expect(page.getByRole('alert').filter({ hasText: S.totalTooLarge })).toBeVisible();
    await expect(page.locator('.attachment')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove a.png' }).click();
    await picker.setInputFiles(Array.from({ length: 13 }, (_, index) => ({ name: `p${index}.png`, mimeType: 'image/png', buffer: PNG })));
    await expect(page.getByRole('alert').filter({ hasText: S.tooManyFiles })).toBeVisible();
    await expect(page.locator('.attachment')).toHaveCount(12);
    expect((await readLocalDb(page)).outbox).toEqual([]);
  });

  test('Paste and drop add images to the tray, and Remove takes one out', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    const bytes = [...PNG];
    await editor(page).evaluate((element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], 'pasted.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByRole('img', { name: 'pasted.png' })).toBeVisible();
    await page.locator('.writing-canvas').evaluate((element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], 'dropped.png', { type: 'image/png' }));
      element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByRole('img', { name: 'dropped.png' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove pasted.png' }).click();
    await expect(page.getByRole('img', { name: 'pasted.png' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'dropped.png' })).toBeVisible();
  });

  test('A capture can link to an open task as a small optional link', async ({ page, noema }) => {   // handbook-trace U19 (related task)
    const task = await serverJson<{ id: string }>(noema, 'POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, noema, '#/capture');
    await page.getByLabel('Link to a task').selectOption({ label: 'Two Sum' });
    await editor(page).fill('two pointers after sorting');
    await saveButton(page).click();
    await expect(notice(page)).toContainText('Saved on your server');
    const state = await serverState(noema);
    expect(state.notes[0].task_id).toBe(task.id);
    expect(state.tasks).toHaveLength(1);
  });
});

test.describe('Capture on native browser storage', () => {
  test('Draft text and exact Blob bytes survive browser process restart', async ({ browserType, launchOptions, noema }) => {   // native_storage_check.py:175
    const errors: string[] = [];
    const profile = test.info().outputPath('profile');
    let context = await persistentBrowser(browserType, launchOptions, profile, errors);
    try {
      let page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await editor(page).fill(RAW);
      await page.locator('input[type=file]').setInputFiles({ name: 'heap.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      await expect(draftStatus(page)).toHaveText(S.draftSaved);
      await context.close();

      context = await persistentBrowser(browserType, launchOptions, profile, errors);
      page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await expect(editor(page)).toHaveValue(RAW);
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      expect((await readDraftFileBytes(page)).equals(PNG)).toBe(true);
      expect((await serverState(noema)).notes).toEqual([]);
    } finally {
      await context.close();
    }
    expect(errors).toEqual([]);
  });

  const SEEDED = { id: 'abort-draft-0001', raw: 'A draft that must survive an aborted Save.', task_id: '', files: [] };

  test('Aborted atomic Save keeps persisted draft and rolls back queue insertion', async ({ page, noema }) => {   // native_storage_check.py:215
    await seedLocalDb(page, noema.origin, { draft: SEEDED });
    await failIdbWrite(page, { store: 'outbox', key: SEEDED.id, error: 'AbortError' });
    await gotoApp(page, noema, '#/capture');
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    await saveButton(page).click();
    await expect(localError(page)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not save the capture: ' })).toBeVisible();
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    const local = await readLocalDb(page);
    expect(local.outbox).toEqual([]);
    expect((local.draft as { id: string; raw: string })).toMatchObject({ id: SEEDED.id, raw: SEEDED.raw });
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Reload recovers original draft after transaction abort', async ({ page, noema }) => {   // native_storage_check.py:218
    await seedLocalDb(page, noema.origin, { draft: SEEDED });
    await failIdbWrite(page, { store: 'outbox', key: SEEDED.id, error: 'AbortError' });
    await gotoApp(page, noema, '#/capture');
    await saveButton(page).click();
    await expect(localError(page)).toBeVisible();
    await page.reload();
    await expect(editor(page)).toHaveValue(SEEDED.raw);
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
  });

  test('Injected quota failure has persistent truthful UI and retains editor text', async ({ page, noema }) => {   // native_storage_check.py:230
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Exact unsaved edit after simulated quota failure.');
    await expect(localError(page)).toBeVisible();
    await expect(localError(page)).toContainText(S.localSaveErrorNotice);
    await expect(draftStatus(page)).toHaveText(S.draftError);
    await page.waitForTimeout(1000);
    await expect(localError(page)).toBeVisible();
    await expect(draftStatus(page)).toHaveText(S.draftError);
    await expect(editor(page)).toHaveValue('Exact unsaved edit after simulated quota failure.');
  });

  test('Recovery control fits phone viewport', async ({ page, noema }) => {   // native_storage_check.py:233
    await page.setViewportSize({ width: 390, height: 844 });
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Phone quota failure.');
    await expect(localError(page)).toBeVisible();
    await expect(page.getByRole('button', { name: S.retryLocalSave })).toBeInViewport();
    await expectPhoneFriendly(page, '#local-save-error');
  });

  test('Retry commits recovered edit through native IndexedDB', async ({ page, noema }) => {   // native_storage_check.py:238
    await failIdbWrite(page, { store: 'kv', key: 'draft', error: 'QuotaExceededError' });
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Exact unsaved edit after simulated quota failure.');
    await expect(localError(page)).toBeVisible();
    await page.getByRole('button', { name: S.retryLocalSave }).click();
    await expect(localError(page)).toBeHidden();
    await expect(draftStatus(page)).toHaveText(S.draftSaved);
    expect(await draftRaw(page)).toBe('Exact unsaved edit after simulated quota failure.');
  });

  test('Immediate Save cancels draft debounce without resurrecting a saved draft', async ({ page, noema }) => {   // native_storage_check.py:274
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('Immediate Save before debounce: maybe not cleared, 0x4141.');
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    await expect.poll(async () => (await serverState(noema)).notes.length).toBe(1);
    await page.waitForTimeout(500);   // longer than the 350 ms debounce
    await page.reload();
    await expect(editor(page)).toHaveValue('');
    expect(await draftRaw(page)).toBe('');
  });

  test('Unavailable storage at boot leaves editable UI and failed Save retains text', async ({ page, noema }) => {   // native_storage_check.py:287
    await blockIdbOpen(page);
    await gotoApp(page, noema, '#/capture');
    await expect(localError(page)).toBeVisible();
    await editor(page).fill('Still editable with storage unavailable.');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not save the capture: ' })).toBeVisible();
    await expect(editor(page)).toHaveValue('Still editable with storage unavailable.');
    expect((await serverState(noema)).notes).toEqual([]);
  });
});

test.describe('Offline Capture', () => {
  test('Offline capture remains queued in storage adapter', async ({ page, noema, context }) => {   // browser_check.py:136-139
    await gotoApp(page, noema, '#/capture');
    await context.setOffline(true);
    await editor(page).fill('Offline learning note. Keep my original.');
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: S.captureSavedOffline })).toBeVisible();
    const { outbox } = await readLocalDb(page);
    expect(outbox.map(item => item.raw)).toEqual(['Offline learning note. Keep my original.']);
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Service worker opens actual capture UI offline with last snapshot', async ({ page, noema, context }) => {   // native_storage_check.py:179
    await serverJson(noema, 'POST', '/api/tasks', { title: 'Offline task from the last snapshot' });
    await gotoApp(page, noema, '#/capture');
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(page.getByText(S.offlineBanner(true, false))).toBeVisible();
    await expect(page.getByLabel('Link to a task').locator('option', { hasText: 'Offline task from the last snapshot' })).toHaveCount(1);
  });

  test('Explicit offline Save atomically queues original and resets stored draft', async ({ page, noema, context }) => {   // native_storage_check.py:184
    await gotoApp(page, noema, '#/capture');
    await context.setOffline(true);
    await editor(page).fill('free_slot(0x1234) may leave a pointer.');
    await expect(page.locator('#draft-status')).toHaveText(S.draftSaved);
    await saveButton(page).click();
    await expect(editor(page)).toHaveValue('');
    const local = await readLocalDb(page);
    expect(local.outbox.map(item => item.raw)).toEqual(['free_slot(0x1234) may leave a pointer.']);
    expect((local.draft as { raw: string; id: string }).raw).toBe('');
    expect((local.draft as { id: string }).id).not.toBe(local.outbox[0].id);
  });

  test('Queued attachment capture survives offline browser restart', async ({ browserType, launchOptions, noema }) => {   // native_storage_check.py:193
    const errors: string[] = [];
    const profile = test.info().outputPath('profile');
    let context = await persistentBrowser(browserType, launchOptions, profile, errors);
    try {
      let page = await context.newPage();
      await gotoApp(page, noema, '#/capture');
      await waitForServiceWorker(page);
      await context.setOffline(true);
      await editor(page).fill('Offline heap sketch');
      await page.locator('input[type=file]').setInputFiles({ name: 'heap.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
      await saveButton(page).click();
      await expect(editor(page)).toHaveValue('');
      await expect.poll(async () => (await readLocalDb(page)).outbox.length).toBe(1);
      const [queued] = (await readLocalDb(page)).outbox;
      await context.close();

      context = await persistentBrowser(browserType, launchOptions, profile, errors);
      await context.setOffline(true);
      page = await context.newPage();
      await page.goto(`${noema.origin}/#/capture`);
      await expect(editor(page)).toBeVisible();
      const { outbox } = await readLocalDb(page);
      expect(outbox.map(item => [item.id, item.raw, item.fileCount])).toEqual([[queued.id, 'Offline heap sketch', 1]]);
      expect((await serverState(noema)).notes).toEqual([]);
    } finally {
      await context.close();
    }
    expect(errors).toEqual([]);
  });
});
```

(`fakeMicrophonePage` and `beforeUnloadArmed` are imported now and used by the describe block Task 7 appends to this file.)

- [ ] **Step 3: Run them to verify they fail**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/capture.spec.ts`
Expected: FAIL — the first test reports `locator.fill: Timeout … waiting for getByLabel('Rough learning note')` (the Phase 2a Capture screen is heading-only).

- [ ] **Step 4: Write the stylesheet**

Create `web/src/styles/capture-notes.css`:

```css
/* Capture, Notes, Note view and Settings (Phase 2b). Ported from experiments/ui-ab/frontend/src/style.css:151-201, 298-313. */
.capture-screen, .notes-screen, .note-screen { max-width: 960px; }
.subtle-line, .tray-hint, .record-status, .draft-meta { font-size: 13px; line-height: 1.6; color: var(--muted); margin: 8px 0 0; }
.field-error { color: var(--text); font-size: 13px; margin: 8px 0 0; }
.field-error::before { content: '⚠ '; }
.inline-actions, .form-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.form-actions { justify-content: flex-end; margin-top: 16px; }

.capture-fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.writing-canvas { margin-top: 32px; border: 1px solid var(--border); background: var(--surface); border-radius: 12px; padding: 20px; }
.writing-canvas.dragging { border-style: dashed; border-color: var(--sage); }
.writing-canvas > textarea { display: block; width: 100%; min-height: 260px; background: transparent; border: 0; color: var(--text); resize: vertical; font-size: 18px; line-height: 1.8; padding: 6px 9px; }
.canvas-tools { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid var(--border); padding-top: 14px; margin-top: 16px; }
.tool-group { display: flex; flex-wrap: wrap; gap: 14px; }
.visual-tray { margin-top: 12px; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 14px; list-style: none; margin: 0; padding: 0; }
.attachment { display: flex; flex-direction: column; gap: 6px; max-width: 200px; font-size: 12px; color: var(--muted); }
.attachment.audio { max-width: 280px; }
.attachment img { max-width: 100%; max-height: 140px; object-fit: contain; border-radius: 8px; }
.attachment-name { overflow-wrap: anywhere; }
.capture-link { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 14px; font-size: 13px; color: var(--muted); }
.capture-link select { max-width: 100%; min-width: 0; }

.recording-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; padding: 10px 14px; border: 2px solid var(--sage); border-radius: 10px; }
.recording-controls[data-phase=paused] { border-style: dashed; border-color: var(--muted); }
.recording-controls[data-phase=recording] .recording-indicator { color: var(--sage); }
.recording-phase { font-weight: 600; }
.recording-elapsed { font-variant-numeric: tabular-nums; }

.saved-notice { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 14px; }
.saved-notice[data-storage=server] { border-color: var(--sage); }
.saved-notice p { margin: 0 0 6px; }
.storage-label { font-weight: 600; }
.folder-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-top: 8px; }
.folder-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }

.sketch-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }
.sketch-tools [aria-pressed=true] { color: var(--sage); text-decoration: underline; text-underline-offset: 4px; }
.sketch-text { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.sketch-canvas { display: block; width: min(640px, 100%); height: 320px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); touch-action: none; }
.sketch-canvas[data-tool=text] { cursor: text; }

.search-field { display: flex; align-items: center; gap: 10px; margin-top: 28px; border: 1px solid var(--border); border-radius: 10px; padding: 0 12px; }
.search-field input { flex: 1; min-width: 0; min-height: 44px; background: transparent; border: 0; color: var(--text); }
.folder-select { display: none; }
.notes-layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 28px; margin-top: 24px; }
.note-navigation { display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--border); padding-right: 16px; }
.note-navigation button { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; font-size: 14px; color: var(--muted); padding: 10px; border: 0; border-radius: 8px; background: none; }
.note-navigation button[aria-pressed=true] { color: var(--text); background: var(--surface); font-weight: 600; }
.note-navigation .count { margin-left: auto; font-size: 12px; }
.list-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.pane-toggle { display: none; }
.note-row { display: flex; flex-direction: column; gap: 4px; padding: 12px 4px; border-bottom: 1px solid var(--border); color: var(--text); text-decoration: none; }
.note-row-title { font-size: 16px; }
.note-row-meta { font-size: 13px; color: var(--muted); }
.empty-state { padding: 32px 12px; color: var(--muted); }

.note-page { margin-top: 16px; padding: 24px 28px; border: 1px solid var(--border); background: var(--surface); border-radius: 12px; }
.note-meta { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; margin-bottom: 14px; }
.note-title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.note-title-row h1 { font: 32px/1.15 Display, serif; margin: 0 0 12px; overflow-wrap: anywhere; }
.status-line { font-size: 13px; color: var(--muted); }
.note-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 16px 0; }
.segmented { display: inline-flex; gap: 2px; padding: 4px; border: 1px solid var(--border); border-radius: 9px; }
.segmented button { padding: 7px 12px; border: 0; border-radius: 5px; background: none; color: var(--muted); }
.segmented button[aria-pressed=true] { background: var(--bg); color: var(--text); font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
.note-body { line-height: 1.8; overflow-wrap: anywhere; }
.original-block { white-space: pre-wrap; overflow-wrap: anywhere; padding: 16px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; line-height: 1.7; }
.note-form { display: flex; flex-direction: column; gap: 12px; }
.note-form label { font-size: 13px; color: var(--muted); margin-bottom: -6px; }
.note-editor { width: 100%; min-height: 300px; padding: 12px; font-size: 16px; }
.latest-version { border: 1px dashed var(--border); border-radius: 9px; padding: 10px; }
.suggestion { margin-top: 16px; }
.note-visuals { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 20px; }
.embedded-image { margin: 0; max-width: 100%; }
.embedded-image img { max-width: 100%; max-height: 400px; object-fit: contain; }
.embedded-image figcaption { margin-top: 6px; font-size: 11px; color: var(--muted); }
.note-actions { margin-top: 28px; }

.history-list, .outbox-list { display: flex; flex-direction: column; gap: 14px; list-style: none; margin: 0; padding: 0; }
.settings-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.settings-row p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.settings-section { margin-top: 16px; }
.settings-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.settings-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
.settings-form .full { grid-column: 1 / -1; }
.token-value { display: block; margin-top: 8px; padding: 8px; overflow-wrap: anywhere; user-select: all; }

/* Breakpoints match the Phase 2a shell (02-screens-core.md shell.css): 649.98 px and 999.98 px. */
@media (min-width: 650px) and (max-width: 999.98px) and (orientation: landscape) {
  .notes-layout { grid-template-columns: 155px minmax(0, 1fr); gap: 20px; }
  .pane-toggle { display: inline-flex; }
  .notes-layout.pane-closed { grid-template-columns: minmax(0, 1fr); }
  .notes-layout.pane-closed .note-navigation { display: none; }
}

@media (max-width: 649.98px), (max-width: 999.98px) and (orientation: portrait) {
  .notes-layout { display: block; }
  .note-navigation { display: none; }
  .folder-select { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--muted); }
  .writing-canvas { margin-top: 16px; padding: 12px; }
  .writing-canvas > textarea { min-height: calc(100dvh - 340px); font-size: 16px; }
  .canvas-tools { align-items: flex-end; }
  .note-page { padding: 16px; }
  .settings-form { grid-template-columns: 1fr; }
  .capture-screen :is(button, select, a), .notes-screen :is(button, select, a), .note-screen :is(button, select, a, input) { min-height: 44px; min-width: 44px; }
}
```

- [ ] **Step 5: Implement the screen**

Replace the whole content of `web/src/screens/Capture.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Attachments, toastRejections } from '../capture/Attachments';
import { SavedNotice, type SavedCapture } from '../capture/SavedNotice';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { isOutboxItem, outboxGet } from '../local/db';
import { captureDraftStore, useCaptureDraft, type LocalSaveState } from '../local/drafts';
import { ACCEPT_ATTR } from '../local/limits';
import { subscribeOutbox } from '../local/outbox';
import { useNavigationGuard, type NavigationGuard } from '../routes/guards';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { runFlush, useSnapshot } from '../state/queries';
import { S } from '../strings';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { toast } from '../ui/Toast';
import '../styles/capture-notes.css';

const DRAFT_LABELS: Record<LocalSaveState, string> = {   // app.js:66
  saved: S.draftSaved,
  error: S.draftError,
  pending: S.draftPending,
  memory: S.draftMemory,
};

// Flush deletes an outbox item only after a 2xx, so an absent item means the server acknowledged it.
async function ackState(id: string): Promise<SavedCapture['state']> {
  const item = await outboxGet(id);
  if (item === undefined) return 'server';
  return isOutboxItem(item) && item.error ? 'rejected' : 'queued';
}

export function CaptureScreen() {
  const { draft, saveState, saving } = useCaptureDraft();
  const snapshot = useSnapshot().data ?? null;
  const connected = useConnected();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const picker = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedCapture | null>(null);
  const [dragging, setDragging] = useState(false);

  const savingGuard = useMemo<NavigationGuard | null>(
    () => (saving ? { id: 'capture-saving', check: () => ({ kind: 'block', toast: S.finishingLocalSave }), beforeUnload: true } : null),
    [saving],
  );
  useNavigationGuard(savingGuard);

  const pendingId = saved && saved.state !== 'server' ? saved.id : null;
  useEffect(() => {
    if (!pendingId) return;
    return subscribeOutbox(() => {
      ackState(pendingId).then(
        state => setSaved(current => (current?.id === pendingId ? { id: pendingId, state } : current)),
        () => {},
      );
    });
  }, [pendingId]);

  async function addFiles(files: File[]) {
    if (files.length) toastRejections(await captureDraftStore.addFiles(files));
  }

  async function save() {
    if (captureDraftStore.getSnapshot().saving) return;
    const id = captureDraftStore.getSnapshot().draft.id;
    const result = await captureDraftStore.save();
    if (!result.ok) {
      toast(result.message, { tone: 'error' });
      return;
    }
    setSaved({ id, state: 'queued' });
    toast(connected ? S.captureSavedSending : S.captureSavedOffline);   // app.js:417
    await runFlush(queryClient);
    try {
      const state = await ackState(id);
      setSaved(current => (current?.id === id ? { id, state } : current));
    } catch {
      // An unreadable queue keeps the queued wording; flush already reported it.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  const tasks = (snapshot?.tasks ?? []).filter(task => task.status !== 'done');   // app.js:216
  const linkedElsewhere = draft.task_id !== '' && !tasks.some(task => task.id === draft.task_id);

  return (
    <div className="screen capture-screen" data-quiet onKeyDown={onKeyDown}>
      <OfflineNotice />
      <PageHeading title={COPY.capture.title} subtitle={COPY.capture.subtitle} />
      <fieldset className="capture-fieldset" disabled={saving}>
        <legend className="sr-only">Capture</legend>
        <div
          className={dragging ? 'writing-canvas dragging' : 'writing-canvas'}
          data-quiet
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <label className="sr-only" htmlFor="capture-input">Rough learning note</label>
          <textarea
            id="capture-input"
            value={draft.raw}
            placeholder="Start anywhere. You don’t have to explain it neatly."
            onChange={event => captureDraftStore.setRaw(event.target.value)}
            onPaste={onPaste}
          />
          <div className="visual-tray" role="group" aria-labelledby="visual-tray-label">
            {/* app.js:213 */}
            <span className="eyebrow" id="visual-tray-label">Visuals &amp; recordings</span>
            <Attachments files={draft.files} onRemove={index => { void captureDraftStore.removeFile(index); }} />
            {draft.files.length === 0 && <p className="tray-hint">Paste or drop an image. Diagrams and audio stay with this note.</p>}
          </div>
          <div className="canvas-tools">
            <div className="tool-group">
              <button type="button" className="quiet-button" onClick={() => picker.current?.click()}><Icon name="image" />Image</button>
              <button type="button" className="quiet-button" onClick={() => openDialog({ kind: 'sketch' })}><Icon name="pen" />Sketch</button>
            </div>
            <button type="button" className="primary" onClick={() => void save()}>Save note <span aria-hidden="true">↗</span></button>
          </div>
          <input
            ref={picker}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={event => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addFiles(files);
            }}
          />
        </div>
        <label className="capture-link">
          Link to a task
          <select value={draft.task_id} onChange={event => { void captureDraftStore.setTaskId(event.target.value); }}>
            <option value="">None — just a learning note</option>
            {linkedElsewhere && <option value={draft.task_id}>Linked task (not open)</option>}
            {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
      </fieldset>
      <p className="draft-meta" id="draft-status" role="status">{DRAFT_LABELS[saveState]}</p>
      {saveState === 'error' && (
        <div className="notice error" id="local-save-error" role="alert">
          {S.localSaveErrorNotice}{' '}
          <button type="button" className="text-button" onClick={() => void captureDraftStore.persist()}>{S.retryLocalSave}</button>
        </div>
      )}
      {saved && (
        <SavedNotice
          saved={saved}
          onOpenNote={id => void navigate({ to: '/note/$id', params: { id } })}
          onOpenQueue={() => openDialog({ kind: 'outbox' })}
          onDismiss={() => setSaved(null)}
        />
      )}
      <p className="subtle-line">
        {snapshot?.capabilities.organizer
          ? 'Local AI cleanup runs after save. The original is preserved.'
          : 'Basic folder filing is on. AI rewriting is off until you connect a local model.'}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run the E2E and unit suites to verify they pass**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/capture.spec.ts && npm --prefix web test`
Expected: PASS (29 Capture E2E tests; every unit test green).

- [ ] **Step 7: Commit**

```bash
git add web/src/screens/Capture.tsx web/src/styles/capture-notes.css web/e2e/screenTest.ts web/e2e/capture.spec.ts
git commit -m "feat(web): Capture screen with validated attachments and after-save confirmation"
```

---

### Task 6: Sketch dialog (pen, eraser, undo, simple text)

Port of `public/app.js:443-453` plus the handbook §05 target controls (eraser, text). The recorder keeps running while the dialog is open because Capture stays mounted under the modal.

**Files:**
- Create: `web/src/capture/Sketch.tsx`
- Modify: `web/src/shell/DialogHost.tsx` (add the `sketch` arm)
- Test: `web/src/capture/Sketch.test.ts`, append a `Sketch` describe to `web/e2e/capture.spec.ts`

**Interfaces:**
- Consumes: `Dialog`, `Icon`, `toast`, `captureDraftStore.addFiles`, `toastRejections` (Task 2), `DialogRequest {kind:'sketch'}`, `closeDialog`.
- Produces:

```ts
export const SKETCH_UNDO_LIMIT = 12;      // app.js:449
export const SKETCH_INK = '#d6e1be';      // app.js:446
export type SketchTool = 'pen' | 'eraser' | 'text';
export function pushUndo<T>(stack: T[], item: T, limit?: number): T[];   // returns a new stack holding at most `limit` newest items
export function SketchDialog(props: { onClose: () => void }): JSX.Element;   // contract §6.3
```

- [ ] **Step 1: Write the failing tests**

Create `web/src/capture/Sketch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SKETCH_UNDO_LIMIT, pushUndo } from './Sketch';

describe('pushUndo', () => {
  it('keeps at most 12 steps, dropping the oldest (app.js:449)', () => {
    let stack: number[] = [];
    for (let step = 1; step <= 15; step += 1) stack = pushUndo(stack, step);
    expect(SKETCH_UNDO_LIMIT).toBe(12);
    expect(stack).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('does not mutate the previous stack', () => {
    const before = [1, 2];
    const after = pushUndo(before, 3);
    expect(before).toEqual([1, 2]);
    expect(after).toEqual([1, 2, 3]);
  });
});
```

Append to `web/e2e/capture.spec.ts`:

```ts
test.describe('Sketch', () => {
  test('Sketch offers pen, eraser, undo and a text tool', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    await page.getByRole('button', { name: 'Sketch' }).click();
    const dialog = page.getByRole('dialog', { name: 'A quick sketch' });
    await expect(dialog.getByText('Draw while you talk. Your recording continues.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add to capture' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draw something first.' })).toBeVisible();

    const canvas = dialog.getByLabel('Drawing canvas');
    const box = (await canvas.boundingBox())!;
    const inkIn = (x0: number, y0: number, x1: number, y1: number) => canvas.evaluate((element: HTMLCanvasElement, area) => {
      const scale = element.width / element.getBoundingClientRect().width;
      const [ax, ay, bx, by] = area.map(value => Math.round(value * scale));
      const pixels = element.getContext('2d')!.getImageData(ax, ay, Math.max(1, bx - ax), Math.max(1, by - ay)).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
      return false;
    }, [x0, y0, x1, y1]);
    const stroke = async (y: number) => {
      await page.mouse.move(box.x + 20, box.y + y);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + y, { steps: 8 });
      await page.mouse.up();
    };

    await stroke(60);
    expect(await inkIn(90, 58, 110, 62)).toBe(true);
    await dialog.getByRole('button', { name: 'Undo' }).click();
    expect(await inkIn(90, 58, 110, 62)).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await stroke(60);
    await dialog.getByRole('button', { name: 'Eraser' }).click();
    await expect(dialog.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'false');
    await stroke(60);
    expect(await inkIn(90, 58, 110, 62)).toBe(false);

    await dialog.getByRole('button', { name: 'Text' }).click();
    await dialog.getByLabel('Sketch text').fill('ptr');
    await page.mouse.click(box.x + 60, box.y + 150);
    expect(await inkIn(60, 134, 100, 152)).toBe(true);

    await dialog.getByRole('button', { name: 'Add to capture' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('img', { name: 'sketch.png' })).toBeVisible();
    const draft = (await readLocalDb(page)).draft as { files: { name: string }[] };
    expect(draft.files.map(file => file.name)).toEqual(['sketch.png']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/capture/Sketch.test.ts`
Expected: FAIL with `Failed to resolve import "./Sketch" from "src/capture/Sketch.test.ts"`.

Run: `npm --prefix web run e2e -- e2e/capture.spec.ts -g "Sketch offers"` (no rebuild here: `web/dist` is still the build from Task 5, and `tsc --noEmit` inside `npm run build` would stop first on the not-yet-created `./Sketch` import of the new unit test)
Expected: FAIL — `getByRole('dialog', { name: 'A quick sketch' })` never becomes visible (`DialogHost` has no `sketch` arm).

- [ ] **Step 3: Minimal implementation**

Create `web/src/capture/Sketch.tsx`:

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { captureDraftStore } from '../local/drafts';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/Toast';
import { toastRejections } from './Attachments';

export const SKETCH_UNDO_LIMIT = 12;   // app.js:449
export const SKETCH_INK = '#d6e1be';   // app.js:446
export type SketchTool = 'pen' | 'eraser' | 'text';

const TOOLS: { id: SketchTool; label: string; icon: 'pen' | 'eraser' | 'text' }[] = [
  { id: 'pen', label: 'Pen', icon: 'pen' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser' },
  { id: 'text', label: 'Text', icon: 'text' },
];

export function pushUndo<T>(stack: T[], item: T, limit = SKETCH_UNDO_LIMIT): T[] {
  const next = [...stack, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function SketchDialog({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const undo = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [text, setText] = useState('');
  const [hasDrawing, setHasDrawing] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // Size on the next frame, once the child Dialog's showModal() has laid the canvas out.
    const frame = requestAnimationFrame(() => {
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context) return;
      const rect = element.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);   // app.js:445
      element.width = Math.round(rect.width * scale);
      element.height = Math.round(rect.height * scale);
      context.scale(scale, scale);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function context2d(): CanvasRenderingContext2D | null {
    return canvas.current?.getContext('2d') ?? null;
  }

  function remember(context: CanvasRenderingContext2D) {
    const element = context.canvas;
    undo.current = pushUndo(undo.current, context.getImageData(0, 0, element.width, element.height));
    setUndoCount(undo.current.length);
  }

  function point(event: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const context = context2d();
    if (!context) return;
    const [x, y] = point(event);
    if (tool === 'text') {
      const value = text.trim();
      if (!value) {
        toast('Type the text first, then click where it goes.');
        return;
      }
      remember(context);
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = SKETCH_INK;
      context.font = '16px Inter, sans-serif';
      context.fillText(value, x, y);
      setHasDrawing(true);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    remember(context);
    drawing.current = true;
    setHasDrawing(true);
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = SKETCH_INK;
    context.lineWidth = tool === 'eraser' ? 18 : 2;
    context.beginPath();
    context.moveTo(x, y);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = context2d();
    if (!context) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function endStroke() {
    drawing.current = false;
  }

  function onUndo() {
    const context = context2d();
    const previous = undo.current.pop();
    if (context && previous) context.putImageData(previous, 0, 0);
    setUndoCount(undo.current.length);
  }

  function onClear() {
    const context = context2d();
    if (!context) return;
    remember(context);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
  }

  function onAdd() {
    const element = canvas.current;
    if (!element) return;
    if (!hasDrawing) {
      toast('Draw something first.');   // app.js:452
      return;
    }
    setAdding(true);
    element.toBlob(async blob => {
      if (!blob) {
        setAdding(false);
        toast('The sketch could not be exported. Try again.', { tone: 'error' });
        return;
      }
      const rejections = await captureDraftStore.addFiles([new File([blob], 'sketch.png', { type: 'image/png' })]);
      toastRejections(rejections);
      setAdding(false);
      if (!rejections.length) onClose();
    }, 'image/png');
  }

  return (
    <Dialog title="A quick sketch" onRequestClose={onClose} className="sketch-dialog">
      <p className="subtle-line">Draw while you talk. Your recording continues.</p>
      <div className="sketch-tools" role="group" aria-label="Sketch tools">
        {TOOLS.map(item => (
          <button key={item.id} type="button" className="quiet-button" aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>
            <Icon name={item.icon} />{item.label}
          </button>
        ))}
        {tool === 'text' && (
          <label className="sketch-text">Sketch text<input value={text} maxLength={80} onChange={event => setText(event.target.value)} /></label>
        )}
        <button type="button" className="quiet-button" onClick={onUndo} disabled={undoCount === 0}><Icon name="undo" />Undo</button>
        <button type="button" className="quiet-button" onClick={onClear}>Clear</button>
      </div>
      <canvas
        ref={canvas}
        className="sketch-canvas"
        aria-label="Drawing canvas"
        data-tool={tool}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <div className="form-actions">
        <button type="button" className="primary" onClick={onAdd} disabled={adding}>Add to capture</button>
      </div>
    </Dialog>
  );
}
```

In `web/src/shell/DialogHost.tsx` add next to the existing dialog imports:

```tsx
import { SketchDialog } from '../capture/Sketch';
```

and inside `switch (request?.kind)`, immediately before the `default:` line, add:

```tsx
    case 'sketch': return <SketchDialog onClose={closeDialog} />;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web test -- src/capture/Sketch.test.ts && npm --prefix web run build && npm --prefix web run e2e -- e2e/capture.spec.ts -g "Sketch offers"`
Expected: PASS (2 unit tests, 1 E2E test).

- [ ] **Step 5: Commit**

```bash
git add web/src/capture/Sketch.tsx web/src/capture/Sketch.test.ts web/src/shell/DialogHost.tsx web/e2e/capture.spec.ts
git commit -m "feat(web): sketch tray with pen, eraser, undo and text"
```

---

### Task 7: Recording control area in Capture

Spec §4.7: "Recording opens a small control area with elapsed time, Pause/Resume and Stop. Paused looks visibly different … The visual tray (images, sketch) stays usable while recording." Port of the recording guard (`app.js:269, 401, 555, 560`).

**Files:**
- Modify: `web/src/screens/Capture.tsx` (imports, recorder + guard, Save refusal, Record button, control area)
- Test: append a `Capture recording` describe to `web/e2e/capture.spec.ts`

**Interfaces:**
- Consumes: `useRecorder`, `formatElapsed`, `RECORDER_TEXT` (Task 3), `fakeMicrophonePage`, `beforeUnloadArmed`, `navLink` (Task 5), `S.stopRecordingBeforeLeaving`, `S.stopRecordingBeforeSaving`.
- Produces: `CaptureScreen` additionally registers the `'recording'` guard (`check: to => to !== '/capture' ? {kind:'block', toast: S.stopRecordingBeforeLeaving} : null`, `beforeUnload: true`, contract §6.1) while `phase !== 'idle'`; `.recording-controls[data-phase]` group named "Recording".

- [ ] **Step 1: Write the failing E2E test**

Append to `web/e2e/capture.spec.ts`:

```ts
test.describe('Capture recording', () => {
  test('Capture has one writing surface, a mic/image/sketch toolbar and one Save note action', async ({ page, noema }) => {   // handbook-trace U13
    await gotoApp(page, noema, '#/capture');
    const screen = page.locator('.capture-screen');
    await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Capture a thought.');
    await expect(screen.getByText('A quiet place for the rough edges.')).toBeVisible();
    await expect(screen.getByRole('textbox')).toHaveCount(1);
    await expect(screen.getByLabel(/title|folder/i)).toHaveCount(0);
    for (const name of ['Record a thought', 'Image', 'Sketch']) await expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Save note' })).toHaveCount(1);
    await expect(screen.getByRole('button', { name: 'Save note' })).toHaveText('Save note ↗');
    await expect(screen.getByRole('group', { name: 'Visuals & recordings' })).toBeVisible();
    await expect(draftStatus(page)).toHaveText(S.draftMemory);
  });

  test('No microphone permission is requested before Record', async ({ browserType, launchOptions, noema }) => {   // handbook-trace R9
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(browserType, launchOptions, errors);
    try {
      await page.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const counter = window as unknown as { micRequests: number };
        counter.micRequests = 0;
        navigator.mediaDevices.getUserMedia = constraints => {
          counter.micRequests += 1;
          return original(constraints);
        };
      });
      await gotoApp(page, noema, '#/capture');
      await expect(page.getByText('Audio stays local until you save.')).toBeVisible();
      await editor(page).fill('typing never opens the microphone');
      expect(await page.evaluate('window.micRequests')).toBe(0);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('group', { name: 'Recording' })).toBeVisible();
      expect(await page.evaluate('window.micRequests')).toBe(1);
      await page.getByRole('button', { name: 'Stop' }).click();
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Recording shows elapsed time, Pause/Resume and Stop; paused is labelled distinctly', async ({ browserType, launchOptions, noema }) => {   // handbook-trace U14
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(browserType, launchOptions, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      await page.getByRole('button', { name: 'Record' }).click();
      const controls = page.getByRole('group', { name: 'Recording' });
      await expect(controls).toHaveAttribute('data-phase', 'recording');
      await expect(controls.locator('.recording-phase')).toHaveText('Recording');
      await expect(controls.locator('.recording-elapsed')).not.toHaveText('0:00', { timeout: 3000 });
      await controls.getByRole('button', { name: 'Pause' }).click();
      await expect(controls).toHaveAttribute('data-phase', 'paused');
      await expect(controls.locator('.recording-phase')).toHaveText('Paused');
      await expect(controls.getByRole('button', { name: 'Resume' })).toBeVisible();
      const frozen = await controls.locator('.recording-elapsed').textContent();
      await page.waitForTimeout(1500);
      await expect(controls.locator('.recording-elapsed')).toHaveText(frozen!);
      expect(await controls.evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('dashed');
      await controls.getByRole('button', { name: 'Resume' }).click();
      await expect(controls.locator('.recording-phase')).toHaveText('Recording');
      expect(await controls.evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('solid');
      await controls.getByRole('button', { name: 'Stop' }).click();
      await expect(controls).toBeHidden();
      await expect(page.getByText('Recording added. Save when ready.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Record another thought' })).toBeVisible();
      await expect(page.locator('.attachment audio')).toHaveCount(1);
      await expect(page.locator('.attachment-name')).toHaveText(/^voice-.*\.webm$/);
      await saveButton(page).click();
      await expect(notice(page)).toContainText('Saved on your server');
      const [note] = (await serverState(noema)).notes;
      const full = await serverJson<{ attachments: { mime: string }[] }>(noema, 'GET', `/api/notes/${note.id}`);
      expect(full.attachments.map(attachment => attachment.mime)).toEqual(['audio/webm']);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Visual tray stays usable while recording', async ({ browserType, launchOptions, noema }) => {   // handbook-trace U14
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(browserType, launchOptions, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      await page.getByRole('button', { name: 'Record' }).click();
      const controls = page.getByRole('group', { name: 'Recording' });
      await expect(controls).toBeVisible();
      await page.locator('input[type=file]').setInputFiles({ name: 'while-recording.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('img', { name: 'while-recording.png' })).toBeVisible();
      await page.getByRole('button', { name: 'Sketch' }).click();
      await expect(page.getByRole('dialog', { name: 'A quick sketch' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'A quick sketch' })).toBeHidden();
      await expect(controls).toHaveAttribute('data-phase', 'recording');
      await controls.getByRole('button', { name: 'Stop' }).click();
      await expect(page.locator('.attachment')).toHaveCount(2);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });

  test('Save, navigation and unload are refused while recording', async ({ browserType, launchOptions, noema }) => {   // spec §4.5 guards
    const errors: string[] = [];
    const { page, close } = await fakeMicrophonePage(browserType, launchOptions, errors);
    try {
      await gotoApp(page, noema, '#/capture');
      expect(await beforeUnloadArmed(page)).toBe(false);
      await editor(page).fill('thinking aloud');
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('group', { name: 'Recording' })).toBeVisible();
      await saveButton(page).click();
      await expect(page.getByRole('status').filter({ hasText: S.stopRecordingBeforeSaving })).toBeVisible();
      expect((await readLocalDb(page)).outbox).toEqual([]);
      await navLink(page, 'Notes').click();
      await expect(page.getByRole('status').filter({ hasText: S.stopRecordingBeforeLeaving })).toBeVisible();
      await expect(page).toHaveURL(/#\/capture$/);
      expect(await beforeUnloadArmed(page)).toBe(true);
      await page.getByRole('button', { name: 'Stop' }).click();
      await expect(page.getByRole('group', { name: 'Recording' })).toBeHidden();
      expect(await beforeUnloadArmed(page)).toBe(false);
      await navLink(page, 'Notes').click();
      await expect(page).toHaveURL(/#\/notes$/);
    } finally {
      await close();
    }
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/capture.spec.ts -g "Capture recording"`
Expected: FAIL — the first test reports `expect(locator).toBeVisible()` failing for `getByRole('button', { name: 'Record a thought', exact: true })` (no recorder UI yet).

- [ ] **Step 3: Minimal implementation**

Edit `web/src/screens/Capture.tsx`:

1. After the line `import { Attachments, toastRejections } from '../capture/Attachments';` add:

```tsx
import { RECORDER_TEXT, formatElapsed, useRecorder } from '../capture/Recorder';
```

2. After the line `const [dragging, setDragging] = useState(false);` add:

```tsx
  const recorder = useRecorder();
  const recording = recorder.phase !== 'idle';
  const recordingGuard = useMemo<NavigationGuard | null>(
    () => (recording
      ? { id: 'recording', check: to => (to !== '/capture' ? { kind: 'block', toast: S.stopRecordingBeforeLeaving } : null), beforeUnload: true }
      : null),
    [recording],
  );
  useNavigationGuard(recordingGuard);
```

3. In `save()`, after the line `if (captureDraftStore.getSnapshot().saving) return;` add:

```tsx
    if (recording) {
      toast(S.stopRecordingBeforeSaving);   // app.js:401
      return;
    }
```

4. Replace the line

```tsx
              <button type="button" className="quiet-button" onClick={() => picker.current?.click()}><Icon name="image" />Image</button>
```

with

```tsx
              {/* app.js:211, 435 */}
              <button type="button" className="quiet-button" onClick={() => void recorder.start()} disabled={recording}><Icon name="mic" />{recorder.status === RECORDER_TEXT.added ? 'Record another thought' : 'Record a thought'}</button>
              <button type="button" className="quiet-button" onClick={() => picker.current?.click()}><Icon name="image" />Image</button>
```

5. Immediately before the line `          <input` that opens the hidden file picker (`ref={picker}`), add:

```tsx
          {recording ? (
            <div className="recording-controls" role="group" aria-label="Recording" data-phase={recorder.phase}>
              <span className="recording-indicator" aria-hidden="true"><Icon name={recorder.phase === 'paused' ? 'pause' : 'mic'} /></span>
              <span className="recording-phase" aria-live="polite">
                {recorder.phase === 'paused' ? 'Paused' : recorder.phase === 'starting' ? 'Starting…' : 'Recording'}
              </span>
              <span className="recording-elapsed">{formatElapsed(recorder.elapsedMs)}</span>
              {recorder.phase === 'paused' ? (
                <button type="button" className="secondary" onClick={recorder.resume}><Icon name="play" />Resume</button>
              ) : (
                <button type="button" className="secondary" onClick={recorder.pause} disabled={recorder.phase !== 'recording'}><Icon name="pause" />Pause</button>
              )}
              {/* app.js:438 */}
              <button type="button" className="secondary" onClick={recorder.stop} disabled={recorder.phase === 'starting'}><Icon name="stop" />Stop recording</button>
            </div>
          ) : (
            <p className="record-status">{recorder.status}</p>
          )}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/capture.spec.ts`
Expected: PASS (all Capture E2E tests, including the 5 new recording tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Capture.tsx web/e2e/capture.spec.ts
git commit -m "feat(web): recording control area with pause, resume and guards"
```

---

### Task 8: Outbox dialog and the outbox E2E ports

Port of `public/app.js:482, 539-544` (spec §5 "Outbox dialog"). `02-screens-core.md` leaves `dialogs/Outbox.tsx` and its `outbox` arm to this phase (its `DialogHost` ends in `default: return null; // Phase 2b adds outbox, …`), so this task creates them. `web/e2e/outbox.spec.ts` already exists: `01-foundation.md` Task 19 created it with the reconnect and lost-acknowledgement parity tests (rows 64, 77, 78, 85, 86) and the spec §8 "Upgrade" test. This task only appends the Outbox dialog tests to it and never rewrites those six tests. The Phase 2a StatusLine button already opens `{kind:'outbox'}`.

**Files:**
- Create: `web/src/dialogs/Outbox.tsx`
- Modify: `web/src/shell/DialogHost.tsx` (add the `outbox` arm)
- Modify: `web/e2e/outbox.spec.ts` (created by `01-foundation.md` Task 19; add four import lines at the top, append the `Outbox dialog` block)

**Interfaces:**
- Consumes: `closeDialog` (`shell/dialogs.ts`), `useOutboxItems()`, `retryItem(id)`, `discardItem(id)`, `isOutboxItem`, `OutboxItem`, `captureDraftStore.{getSnapshot,replaceWith}`, `Dialog`, `toast`, `useNavigate`, `S.{outboxTitle,outboxHelp,outboxEmpty,outboxFallbackText,attachmentsCount,retry,openCopy,discard,confirmReplaceDraft,openedCopy,confirmDiscard}`; E2E: `failFetch` (`web/e2e/faults.ts`), `gotoApp` (`web/e2e/fixtures.ts`), `PNG`, `serverJson` (Task 5), plus `S`, `test`, `expect`, `readLocalDb`, `seedLocalDb` and the `Page` type already imported by the existing `outbox.spec.ts` (`01-foundation.md` Task 19).
- Produces: `export function OutboxDialog(props: { onClose: () => void }): JSX.Element` (contract §6.3).

- [ ] **Step 1: Write the E2E tests**

Add these lines below the existing imports at the top of `web/e2e/outbox.spec.ts` (a second import from the same module is valid TypeScript; the names do not clash with the Task 19 helpers `notes`, `outboxIds`, `openApp`, `PNG_1PX`, `QUEUED`):

```ts
import { failFetch } from './faults';
import { gotoApp } from './fixtures';
import { PNG, serverJson } from './screenTest';
```

Append to the end of `web/e2e/outbox.spec.ts`:

```ts
const editor = (page: Page) => page.getByLabel('Rough learning note');
const outboxDialog = (page: Page) => page.getByRole('dialog', { name: S.outboxTitle });

test.describe('Outbox dialog', () => {
  test('Outbox lists queued captures; Open a copy asks before replacing a draft; Discard asks first', async ({ page, noema }) => {
    // Every upload attempt in this test fails, so queued-0001 stays queued through every flush trigger.
    await failFetch(page, { path: /\/api\/captures$/, method: 'POST', times: 100, fault: { status: 503, body: '{"detail":"Service busy"}', contentType: 'application/json' } });
    await seedLocalDb(page, noema.origin, {
      draft: { id: 'draft-0001', raw: 'Unsaved current draft', task_id: '', files: [] },
      outbox: [
        { id: 'queued-0001', raw: 'Queued thought about heaps', task_id: '', files: [{ name: 'heap.png', type: 'image/png', base64: PNG.toString('base64') }] },
        { id: 'queued-0002', raw: 'Rejected capture', task_id: '', files: [], error: 'Supported attachments: PNG, JPEG, WebP images.' },
      ],
    });
    await gotoApp(page, noema, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(2) }).click();
    const dialog = outboxDialog(page);
    await expect(dialog.getByText(S.outboxHelp)).toBeVisible();
    const first = dialog.getByRole('listitem').filter({ hasText: 'Queued thought about heaps' });
    await expect(first.getByText(S.attachmentsCount(1))).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Rejected capture' }).getByRole('alert')).toContainText('Supported attachments');

    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.confirmReplaceDraft); void prompt.dismiss(); });
    await first.getByRole('button', { name: S.openCopy }).click();
    await expect(dialog).toBeVisible();
    await expect(editor(page)).toHaveValue('Unsaved current draft');

    page.once('dialog', prompt => void prompt.accept());
    await first.getByRole('button', { name: S.openCopy }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#\/capture$/);
    await expect(editor(page)).toHaveValue('Queued thought about heaps');
    await expect(page.getByRole('img', { name: 'heap.png' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: S.openedCopy })).toBeVisible();
    const local = await readLocalDb(page);
    expect(local.outbox.map(item => item.id).sort()).toEqual(['queued-0001', 'queued-0002']);
    expect((local.draft as { id: string }).id).not.toBe('queued-0001');

    await page.getByRole('button', { name: S.outboxCount(2) }).click();
    const rejected = outboxDialog(page).getByRole('listitem').filter({ hasText: 'Rejected capture' });
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.confirmDiscard); void prompt.accept(); });
    await rejected.getByRole('button', { name: S.discard }).click();
    await expect(rejected).toHaveCount(0);
    expect((await readLocalDb(page)).outbox.map(item => item.id)).toEqual(['queued-0001']);
  });

  test('Retry clears a stored error and uploads the capture', async ({ page, noema }) => {
    await seedLocalDb(page, noema.origin, { outbox: [{ id: 'retry-capture-01', raw: 'Retry me', task_id: '', files: [], error: 'Temporary rejection' }] });
    await gotoApp(page, noema, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(1) }).click();
    const dialog = outboxDialog(page);
    await dialog.getByRole('button', { name: S.retry }).click();
    await expect(dialog.getByText(S.outboxEmpty)).toBeVisible();
    expect((await serverJson<{ raw: string }>(noema, 'GET', '/api/notes/retry-capture-01')).raw).toBe('Retry me');
  });

  test('An unreadable queued record is listed with Discard only', async ({ page, noema }) => {
    await seedLocalDb(page, noema.origin, {});
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('noema-local-v1', 1);
      request.onsuccess = () => {
        const tx = request.result.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({ id: 'broken-0001', raw: 42 });
        tx.oncomplete = () => { request.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    }));
    await gotoApp(page, noema, '#/capture');
    await page.getByRole('button', { name: S.outboxCount(1) }).click();
    const item = outboxDialog(page).getByRole('listitem');
    await expect(item).toContainText('This queued item cannot be read.');
    await expect(item.getByRole('button')).toHaveCount(1);
    page.once('dialog', prompt => void prompt.accept());
    await item.getByRole('button', { name: S.discard }).click();
    await expect(outboxDialog(page).getByText(S.outboxEmpty)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/outbox.spec.ts`
Expected: the three `Outbox dialog` tests FAIL — `getByRole('dialog', { name: 'Captures on this device' })` never becomes visible after clicking the StatusLine button (`DialogHost` has no `outbox` arm). The six `01-foundation.md` Task 19 tests in the same file still PASS.

- [ ] **Step 3: Minimal implementation**

Create `web/src/dialogs/Outbox.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router';
import { isOutboxItem, type OutboxItem } from '../local/db';
import { captureDraftStore } from '../local/drafts';
import { discardItem, retryItem, useOutboxItems } from '../local/outbox';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';

const UNREADABLE = 'This queued item cannot be read. It stays in this browser’s storage until you discard it.';   // new

function hasStringId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

export function OutboxDialog({ onClose }: { onClose: () => void }) {
  const { items, reload } = useOutboxItems();
  const navigate = useNavigate();

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { tone: 'error' });
    } finally {
      await reload().catch(() => {});
    }
  }

  async function openCopy(item: OutboxItem) {
    const { draft } = captureDraftStore.getSnapshot();
    if ((draft.raw || draft.files.length) && !window.confirm(S.confirmReplaceDraft)) return;   // app.js:541
    await captureDraftStore.replaceWith(item);
    onClose();
    await navigate({ to: '/capture' });
    toast(S.openedCopy);
  }

  function discard(id: string) {
    if (window.confirm(S.confirmDiscard)) void run(() => discardItem(id));   // app.js:544
  }

  return (
    <Dialog title={S.outboxTitle} onRequestClose={onClose}>
      <p className="subtle-line">{S.outboxHelp}</p>
      {items.length === 0 && <p className="subtle-line">{S.outboxEmpty}</p>}
      <ul className="outbox-list">
        {items.map((item, index) => (isOutboxItem(item) ? (
          <li key={item.id} className="outbox-item">
            <p>{item.raw.slice(0, 180) || S.outboxFallbackText}</p>
            <p className="subtle-line">{S.attachmentsCount(item.files.length)}</p>
            {item.error && <p className="notice error" role="alert">{item.error}</p>}
            <div className="inline-actions">
              <button type="button" className="secondary" onClick={() => void run(() => retryItem(item.id))}>{S.retry}</button>
              <button type="button" className="quiet-button" onClick={() => void run(() => openCopy(item))}>{S.openCopy}</button>
              <button type="button" className="quiet-button" onClick={() => discard(item.id)}>{S.discard}</button>
            </div>
          </li>
        ) : (
          <li key={hasStringId(item) ? item.id : `unreadable-${index}`} className="outbox-item">
            <p className="notice error">{UNREADABLE}</p>
            {hasStringId(item) && (
              <button type="button" className="quiet-button" onClick={() => discard(item.id)}>{S.discard}</button>
            )}
          </li>
        )))}
      </ul>
    </Dialog>
  );
}
```

In `web/src/shell/DialogHost.tsx` add next to the existing dialog imports:

```tsx
import { OutboxDialog } from '../dialogs/Outbox';
```

and inside `switch (request?.kind)`, immediately before the `default:` line, add:

```tsx
    case 'outbox': return <OutboxDialog onClose={closeDialog} />;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/outbox.spec.ts && npm --prefix web test`
Expected: PASS (9 outbox E2E tests; every unit test still green).

- [ ] **Step 5: Commit**

```bash
git add web/src/dialogs/Outbox.tsx web/src/shell/DialogHost.tsx web/e2e/outbox.spec.ts
git commit -m "feat(web): outbox dialog with retry, open-a-copy and discard"
```

---

### Task 9: `ui/Markdown.tsx` — the small note renderer, escaping all HTML

Port of `public/app.js:233-247` (`md`) to React elements (contract §6.2). The contract lists this file under P3, but `02-screens-core.md` leaves it to this phase. React escapes every text node, so user and model HTML can never become markup, and no `dangerouslySetInnerHTML` is used (spec §4.6 Safety).

**Files:**
- Create: `web/src/ui/Markdown.tsx`
- Test: `web/src/ui/Markdown.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React.
- Produces: `export function Markdown(props: { text: string }): JSX.Element` (contract §6.2). Supported, exactly as `app.js`: ```` ``` ```` fences (an unterminated fence closes at the end), `-`/`*` list items (leading spaces allowed), `#`–`###` headings, non-blank lines as paragraphs, inline `` `code` `` and `**bold**`.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/Markdown.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

afterEach(cleanup);

const html = (text: string) => render(<Markdown text={text} />).container.innerHTML;

describe('Markdown', () => {
  it('renders hostile HTML as text, never as elements', () => {
    const { container } = render(<Markdown text={'<img src=x onerror="window.pwned=1">\n<script>window.pwned=2</script>'} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.innerHTML).toBe('<p>&lt;img src=x onerror="window.pwned=1"&gt;</p><p>&lt;script&gt;window.pwned=2&lt;/script&gt;</p>');
  });

  it('renders headings 1–3 and paragraphs, and skips blank lines (app.js:240-243)', () => {
    expect(html('# One\n## Two\n### Three\n#### Four\n\n   \ntext')).toBe('<h1>One</h1><h2>Two</h2><h3>Three</h3><p>#### Four</p><p>text</p>');
  });

  it('groups list items and closes the list at the next other line', () => {
    expect(html('- a\n* b\n  - c\nafter')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul><p>after</p>');
    expect(html('- a\n\n- b')).toBe('<ul><li>a</li></ul><ul><li>b</li></ul>');
  });

  it('keeps fenced code verbatim, including markup-looking text', () => {
    expect(html('```\n<b>x</b>\n**y**\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;\n**y**</code></pre>');
  });

  it('closes an unterminated fence at the end, and a fence closes an open list', () => {
    expect(html('```\nline')).toBe('<pre><code>line</code></pre>');
    expect(html('- a\n```\nc\n```')).toBe('<ul><li>a</li></ul><pre><code>c</code></pre>');
  });

  it('renders inline code and bold, leaving unmatched markers as text', () => {
    expect(html('use `ptr` and **care** but **not')).toBe('<p>use <code>ptr</code> and <strong>care</strong> but **not</p>');
    expect(html('# **Hot** path\n- `a`')).toBe('<h1><strong>Hot</strong> path</h1><ul><li><code>a</code></li></ul>');
    expect(html('`<i>x</i>`')).toBe('<p><code>&lt;i&gt;x&lt;/i&gt;</code></p>');
  });

  it('renders nothing for empty text', () => {
    expect(html('')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/ui/Markdown.test.tsx`
Expected: FAIL with `Failed to resolve import "./Markdown" from "src/ui/Markdown.test.tsx"`.

- [ ] **Step 3: Minimal implementation**

Create `web/src/ui/Markdown.tsx`:

```tsx
import type { JSX, ReactNode } from 'react';

const HEADINGS = ['h1', 'h2', 'h3'] as const;

// app.js:236 — `code` and **bold** only. shortcut: markers nested inside each other render as text; upgrade if notes need nesting.
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(match[1] !== undefined ? <code key={parts.length}>{match[1]}</code> : <strong key={parts.length}>{match[2]}</strong>);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;
  let items: ReactNode[] | null = null;
  const closeList = () => {
    if (items) blocks.push(<ul key={blocks.length}>{items}</ul>);
    items = null;
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      closeList();
      if (code) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
      code = code ? null : [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const item = line.match(/^\s*[-*] (.*)/);
    if (item) {
      items = items ?? [];
      items.push(<li key={items.length}>{inline(item[1])}</li>);
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,3}) (.*)/);
    if (heading) {
      const Tag = HEADINGS[heading[1].length - 1];
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  closeList();
  if (code) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
  return <>{blocks}</>;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- src/ui/Markdown.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/Markdown.tsx web/src/ui/Markdown.test.tsx
git commit -m "feat(web): note Markdown renderer that escapes all HTML"
```

---

### Task 10: Notes list (search + recent, folders by form factor)

Port of `public/app.js:228-231, 454` with handbook §14 "Notes screen": search and recent notes are the default entrance; folders are a narrow pane on desktop, an optional collapsible pane on tablet, and a compact selector on phone.

**Files:**
- Create: `web/src/screens/notesList.ts`
- Modify (replace the Phase 2a heading-only body): `web/src/screens/Notes.tsx`
- Test: `web/src/screens/notesList.test.ts`, `web/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: `useSnapshot()`, `useSearch(q)`, `useConnected()`, `NoteSummary`, `age(stamp)`, `COPY.notes`, `OfflineNotice`, `PageHeading`, `Icon`, `Link` (TanStack Router); E2E: `createNote`, `editNote`, `serverJson`, `expectPhoneFriendly` (Task 5), `failFetch`, `test`, `expect`, `gotoApp`.
- Produces:

```ts
// screens/notesList.ts
export const SEARCH_DEBOUNCE_MS = 300;   // app.js:454
export const SEARCH_MAX_LENGTH = 500;    // server.py:215
export function foldersOf(notes: NoteSummary[]): string[];                       // unique, sorted (app.js:230)
export function localNoteMatches(notes: NoteSummary[], q: string): NoteSummary[]; // title + ' ' + folder, case-insensitive (app.js:229)
export function inFolder(notes: NoteSummary[], folder: string): NoteSummary[];    // '' = all
// screens/Notes.tsx
export function NotesScreen(): JSX.Element;   // search input id="note-search" (P3 keyboard.ts focuses it)
```

- [ ] **Step 1: Write the failing tests**

Create `web/src/screens/notesList.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeNoteSummary } from '../test/fixtures';
import { foldersOf, inFolder, localNoteMatches } from './notesList';

const notes = [
  makeNoteSummary('a', { title: 'Two pointers', folder: 'Programming / Algorithms' }),
  makeNoteSummary('b', { title: 'Heap slot', folder: 'Security / CTFs' }),
  makeNoteSummary('c', { title: 'Loose thought', folder: 'Inbox' }),
  makeNoteSummary('d', { title: 'More pointers', folder: 'Programming / Algorithms' }),
];
const ids = (list: { id: string }[]) => list.map(note => note.id);

describe('notesList', () => {
  it('lists each folder once, sorted', () => {
    expect(foldersOf(notes)).toEqual(['Inbox', 'Programming / Algorithms', 'Security / CTFs']);
    expect(foldersOf([])).toEqual([]);
  });

  it('matches title and folder case-insensitively on this device', () => {
    expect(ids(localNoteMatches(notes, 'POINTERS'))).toEqual(['a', 'd']);
    expect(ids(localNoteMatches(notes, 'security'))).toEqual(['b']);
    expect(ids(localNoteMatches(notes, 'algorithms'))).toEqual(['a', 'd']);
    expect(ids(localNoteMatches(notes, 'zebra'))).toEqual([]);
  });

  it('filters by folder, and an empty folder means all notes', () => {
    expect(ids(inFolder(notes, 'Programming / Algorithms'))).toEqual(['a', 'd']);
    expect(ids(inFolder(notes, ''))).toEqual(['a', 'b', 'c', 'd']);
    expect(inFolder(notes, 'Missing')).toEqual([]);
  });
});
```

Create `web/e2e/notes.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { failFetch } from './faults';
import { expect, gotoApp, test } from './fixtures';
import {
  PNG, WAV, beforeUnloadArmed, createNote, dispatchRefetch, editNote, expectPhoneFriendly, navLink, seedSuggestion, serverJson,
} from './screenTest';

const rows = (page: Page) => page.locator('.note-row');
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' });

test.describe('Notes list', () => {
  test('Notes opens on search and recent notes', async ({ page, noema }) => {
    const older = await createNote(noema, 'heap slot cleanup observation');
    const newer = await createNote(noema, 'two pointers on sorted input');
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A place to return to.');
    await expect(page.getByText('Your notes, with their original thinking intact.')).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recent notes' })).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText(newer.title);
    await expect(rows(page).nth(1)).toContainText(older.title);
    await rows(page).nth(0).click();
    await expect(page).toHaveURL(new RegExp(`#/note/${newer.id}$`));
  });

  test('Search waits 300 ms and uses the server, which also matches the original wording', async ({ page, noema }) => {
    const target = await createNote(noema, 'zebra pointer');
    await editNote(noema, target, { title: 'Pointer note', body: 'Rewritten body' });
    await createNote(noema, 'heap slot cleanup');
    await gotoApp(page, noema, '#/notes');
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/search')) requests.push(request.url()); });
    await searchBox(page).pressSequentially('zebra', { delay: 40 });
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Pointer note');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('q=zebra');
    await expect(searchBox(page)).toHaveAttribute('maxlength', '500');
  });

  test('Search falls back to title and folder matches on this device when the server search fails', async ({ page, noema }) => {
    // Both searches below must fail; a single-use fault would let the second one reach the real server.
    await failFetch(page, { path: /\/api\/search/, times: 10, fault: { status: 400, body: '{"detail":"Search failed"}', contentType: 'application/json' } });
    const note = await createNote(noema, 'zebra pointer');
    await editNote(noema, note, { title: 'Pointer note' });
    await gotoApp(page, noema, '#/notes');
    await searchBox(page).fill('pointer');
    await expect(page.getByText('Server search is unavailable. Showing title and folder matches on this device.')).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await searchBox(page).fill('zebra');
    await expect(page.getByText('No matching notes.')).toBeVisible();
  });

  test('Desktop width shows a narrow folder pane that filters the list', async ({ page, noema }) => {
    await editNote(noema, await createNote(noema, 'first'), { folder: 'Security / CTFs' });
    await editNote(noema, await createNote(noema, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page, noema, '#/notes');
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(pane).toBeVisible();
    await expect(page.getByLabel('Folder', { exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await pane.getByRole('button', { name: 'Security / CTFs' }).click();
    await expect(pane.getByRole('button', { name: 'Security / CTFs' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Security / CTFs');
  });

  test('Tablet width shows a collapsible folder pane in Notes', async ({ page, noema }) => {
    await createNote(noema, 'first');
    await page.setViewportSize({ width: 900, height: 700 });
    await gotoApp(page, noema, '#/notes');
    const toggle = page.getByRole('button', { name: 'Folders' });
    const pane = page.getByRole('complementary', { name: 'Note folders' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pane).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(pane).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
  });

  test('Phone width replaces the folder pane with a compact selector', async ({ page, noema }) => {
    await editNote(noema, await createNote(noema, 'first'), { folder: 'Security / CTFs' });
    await editNote(noema, await createNote(noema, 'second'), { folder: 'Programming / Algorithms' });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await page.getByLabel('Folder', { exact: true }).selectOption('Programming / Algorithms');
    await expect(rows(page)).toHaveCount(1);
    await expectPhoneFriendly(page, '.notes-screen');
  });

  test('Portrait tablet collapses to the single phone column', async ({ page, noema }) => {   // handbook-trace U12
    const note = await createNote(noema, 'portrait reading');
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoApp(page, noema, '#/notes');
    await expect(page.getByRole('complementary', { name: 'Note folders' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Folders' })).toBeHidden();
    await expect(page.getByLabel('Folder', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole('region', { name: 'Recent notes' }).boundingBox())!.width).toBeGreaterThan(768 * 0.85);
    await expect(rows(page)).toContainText(note.title);
  });
});
```

(`PNG`, `WAV`, `readFileSync`, `S`, `navLink`, `beforeUnloadArmed`, `dispatchRefetch` and `seedSuggestion` are used by the describe blocks Tasks 11 and 12 append.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/screens/notesList.test.ts`
Expected: FAIL with `Failed to resolve import "./notesList" from "src/screens/notesList.test.ts"`.

Run: `npm --prefix web run e2e -- e2e/notes.spec.ts` (no rebuild here: `web/dist` is still the build from Task 8, and `tsc --noEmit` inside `npm run build` would stop first on the not-yet-created `./notesList` import of the new unit test)
Expected: FAIL — `getByRole('searchbox', { name: 'Search notes' })` is not visible (the Phase 2a Notes screen is heading-only).

- [ ] **Step 3: Minimal implementation**

Create `web/src/screens/notesList.ts`:

```ts
import type { NoteSummary } from '../api/schemas';

export const SEARCH_DEBOUNCE_MS = 300;   // app.js:454
export const SEARCH_MAX_LENGTH = 500;    // server.py:215

export function foldersOf(notes: NoteSummary[]): string[] {
  return [...new Set(notes.map(note => note.folder))].sort();   // app.js:230
}

export function localNoteMatches(notes: NoteSummary[], q: string): NoteSummary[] {
  const needle = q.toLowerCase();
  return notes.filter(note => `${note.title} ${note.folder}`.toLowerCase().includes(needle));   // app.js:229
}

export function inFolder(notes: NoteSummary[], folder: string): NoteSummary[] {
  return folder ? notes.filter(note => note.folder === folder) : notes;
}
```

Replace the whole content of `web/src/screens/Notes.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { COPY } from '../copy';
import { useConnected } from '../domain/connection';
import { age } from '../domain/format';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSearch, useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { PageHeading } from '../ui/PageHeading';
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX_LENGTH, foldersOf, inFolder, localNoteMatches } from './notesList';
import '../styles/capture-notes.css';

export function NotesScreen() {
  const notes = useSnapshot().data?.notes ?? [];
  const connected = useConnected();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [paneOpen, setPaneOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useSearch(q);
  const searching = q !== '';
  const fallback = searching && (!connected || search.isError);
  const pending = searching && !fallback && search.isPending;
  const source = !searching ? notes : fallback ? localNoteMatches(notes, q) : (search.data ?? []);
  const rows = inFolder(source, folder);
  const folders = foldersOf(notes);

  return (
    <div className="screen notes-screen" data-quiet>
      <OfflineNotice />
      <PageHeading title={COPY.notes.title} subtitle={COPY.notes.subtitle} />
      <label className="search-field">
        <Icon name="search" />
        <span className="sr-only">Search notes</span>
        <input
          id="note-search"
          type="search"
          value={input}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Search words in your notes…"
          onChange={event => setInput(event.target.value)}
        />
      </label>
      <div className="folder-select">
        <label htmlFor="note-folder-select">Folder</label>
        <select id="note-folder-select" value={folder} onChange={event => setFolder(event.target.value)}>
          <option value="">All notes ({notes.length})</option>
          {folders.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className={paneOpen ? 'notes-layout' : 'notes-layout pane-closed'}>
        <aside className="note-navigation" id="note-folders" aria-label="Note folders">
          <button type="button" aria-pressed={folder === ''} onClick={() => setFolder('')}>
            <Icon name="folder" size={17} />All notes <span className="count">{notes.length}</span>
          </button>
          {folders.map(name => (
            <button key={name} type="button" aria-pressed={folder === name} onClick={() => setFolder(name)}>
              <Icon name="folder" size={17} />{name}
            </button>
          ))}
        </aside>
        <section aria-label={searching ? 'Search results' : 'Recent notes'} data-quiet>
          <div className="list-heading">
            <button
              type="button"
              className="quiet-button pane-toggle"
              aria-expanded={paneOpen}
              aria-controls="note-folders"
              onClick={() => setPaneOpen(open => !open)}
            >
              <Icon name="sidebar" />Folders
            </button>
            <h2 className="eyebrow">{searching ? 'Results' : 'Recent'}</h2>
          </div>
          {fallback && (
            <p className="notice" role="status">Server search is unavailable. Showing title and folder matches on this device.</p>
          )}
          {pending && <p className="subtle-line" role="status">Searching…</p>}
          {rows.map(note => (
            <Link key={note.id} to="/note/$id" params={{ id: note.id }} className="note-row">
              <span className="note-row-title">{note.title}</span>
              <span className="note-row-meta">
                {note.folder} · {age(note.updated_at)}{note.processing ? ` · ${note.processing}` : ''}
              </span>
            </Link>
          ))}
          {!pending && rows.length === 0 && (searching ? (
            <p className="empty-state">No matching notes.</p>
          ) : (
            <div className="empty-state">
              <h2>No notes here yet.</h2>
              <p>Save a brain dump. Folder filing happens after capture, not before it.</p>
              <Link to="/capture" className="primary">Capture a thought</Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web test -- src/screens/notesList.test.ts && npm --prefix web run build && npm --prefix web run e2e -- e2e/notes.spec.ts`
Expected: PASS (3 unit tests, 7 E2E tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/notesList.ts web/src/screens/notesList.test.ts web/src/screens/Notes.tsx web/e2e/notes.spec.ts
git commit -m "feat(web): notes list with debounced search and form-factor folders"
```

---

### Task 11: Note view (Note/Original/History tabs, edit with conflict handling, suggestions, organize/transcribe, attachments, export)

Port of `public/app.js:248-256, 384, 386, 505-514` with handbook §04 "Stored views" and §14 "Notes screen". `NoteViewScreen` is loaded lazily by the router (contract §6.1).

**Files:**
- Modify (replace the Phase 2a heading-only body): `web/src/screens/NoteView.tsx`
- Test: append a `Note view` describe to `web/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: `useParams({ from: '/note/$id' })`, `Link`, `useNote`, `useUpdateNote`, `useApplySuggestion`, `useProcessNote`, `Note`, `ApiError`, `age`, `noteMarkdownExport`, `useNavigationGuard`, `openDialog` (`{kind:'task'}`, `{kind:'note-history'}`), `OfflineNotice`, `Markdown` (Task 9), `toast`, `S.leaveNoteEdit`; E2E: `createNote`, `editNote`, `seedSuggestion`, `serverJson`, `dispatchRefetch`, `beforeUnloadArmed`, `navLink`, `expectPhoneFriendly` (Task 5).
- Produces:

```ts
export const NOTE_TEXT: { revisionSaved; queued; suggestion; emptyBody; noTypedInput; transcriptHeading; unavailable; blank };
export function downloadText(filename: string, text: string): void;   // Blob → object URL → <a download>, revoked after 1 s (app.js:386)
export function NoteViewScreen(): JSX.Element;   // registers the 'note-edit' guard ({kind:'confirm', message:S.leaveNoteEdit}, beforeUnload:true) while editing
```

- [ ] **Step 1: Write the failing E2E test**

Append to `web/e2e/notes.spec.ts`:

```ts
test.describe('Note view', () => {
  const noteField = (page: Page) => page.getByLabel('Note', { exact: true });

  async function editAndSave(page: Page, title: string, body: string) {
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill(title);
    await noteField(page).fill(body);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }

  test('Note edits create revision and retain raw text', async ({ page, noema }) => {   // browser_check.py:128-132
    const note = await createNote(noema, 'LeetCode trick: two pointers. not sure about duplicates yet.');
    await gotoApp(page, noema, `#/note/${note.id}`);
    await editAndSave(page, 'Two pointers — personal insight', 'My edited note. Still unsure about duplicates.');
    await expect(page.getByRole('status').filter({ hasText: 'Revision saved. The original is unchanged.' })).toBeVisible();
    const full = await serverJson<{ version: number; raw: string; body: string }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full.version).toBe(2);
    expect(full.raw).toBe(note.raw);
    expect(full.body).toBe('My edited note. Still unsure about duplicates.');
  });

  test('Original tab shows untouched capture', async ({ page, noema }) => {   // browser_check.py:133; handbook-trace R4
    const note = await createNote(noema, 'LeetCode trick: two pointers. not sure about duplicates yet.');
    await gotoApp(page, noema, `#/note/${note.id}`);
    await editAndSave(page, 'Two pointers — personal insight', 'My edited note.');
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.original-block')).toHaveText('LeetCode trick: two pointers. not sure about duplicates yet.');
    await expect(page.locator('.note-body')).toHaveCount(0);   // tabs, never side by side
  });

  test('Note renderer does not execute untrusted HTML', async ({ page, noema }) => {   // browser_check.py:142-144
    const hostile = '<img src=x onerror="window.pwned=1">\n<script>window.pwned=2</script>';
    const note = await createNote(noema, hostile);
    seedSuggestion(noema, note.id, { id: 'sugg-0001', title: 'Model title', body: '<img src=y onerror="window.pwned=3"> **bold**', folder: 'Inbox' });
    await gotoApp(page, noema, `#/note/${note.id}`);
    await expect(page.locator('.note-body').first()).toContainText('<img src=x onerror="window.pwned=1">');
    await page.locator('details.suggestion summary').click();
    await expect(page.locator('details.suggestion')).toContainText('<img src=y');
    await expect(page.locator('details.suggestion strong')).toHaveText('bold');
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toContainText('<script>window.pwned=2</script>');
    expect(await page.evaluate('window.pwned')).toBeUndefined();
    await expect(page.locator('.note-screen img')).toHaveCount(0);
  });

  test('Applying a suggestion keeps the edit history and says Nothing was overwritten', async ({ page, noema }) => {   // handbook-trace R5
    const note = await createNote(noema, 'heap slot raw thought');
    const edited = await editNote(noema, note, { title: 'My heap note', body: 'my manual body' });
    seedSuggestion(noema, note.id, { id: 'sugg-0002', title: 'Organized heap note', body: 'Clean body', folder: 'Security / CTFs' });
    await gotoApp(page, noema, `#/note/${note.id}`);
    const suggestion = page.locator('details.suggestion');
    await expect(suggestion.locator('summary')).toHaveText('An AI suggestion arrived after your edit. Nothing was overwritten.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(edited.title);
    await expect(page.locator('.note-body').first()).toContainText('my manual body');
    await suggestion.locator('summary').click();
    await suggestion.getByRole('button', { name: 'Use this version' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organized heap note');
    const full = await serverJson<{ raw: string; version: number; suggestions: unknown[] }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full.raw).toBe('heap slot raw thought');
    expect(full.version).toBe(3);
    expect(full.suggestions).toEqual([]);
    const history = await serverJson<{ version: number; body: string }[]>(noema, 'GET', `/api/notes/${note.id}/history`);
    expect(history.map(revision => revision.version)).toEqual([3, 2, 1]);
    expect(history.find(revision => revision.version === 2)?.body).toBe('my manual body');
  });

  test('Image attachment preview, capture save, note edit/save/reopen, immutable original', async ({ page, noema }) => {   // experiments/ui-ab/scripts/verify.py:69
    await gotoApp(page, noema, '#/capture');
    const capture = page.getByLabel('Rough learning note');
    await capture.fill('A distinct learning note\nKeep the original intact.');
    await page.locator('input[type=file]').setInputFiles({ name: 'example.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.attachment img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(capture).toHaveValue('');
    await expect(page.locator('.saved-notice')).toContainText('Saved on your server');
    await navLink(page, 'Notes').click();
    await page.locator('.note-row').first().click();
    await expect(page.locator('.note-page')).toContainText('A distinct learning note');
    await expect(page.locator('.embedded-image img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit' }).click();
    await noteField(page).fill('Edited organized note');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toContainText('Keep the original intact.');
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await expect(page.locator('.note-body').first()).toContainText('Edited organized note');
    await page.reload();
    await expect(page.locator('.note-body').first()).toContainText('Edited organized note');
  });

  test('Attachments display from the server; Organize and Transcribe report that local AI is off', async ({ page, noema }) => {
    const note = await createNote(noema, 'with visuals', [
      { name: 'diagram.png', type: 'image/png', bytes: PNG },
      { name: 'voice.wav', type: 'audio/wav', bytes: WAV },
    ]);
    await gotoApp(page, noema, `#/note/${note.id}`);
    await expect(page.getByRole('img', { name: 'diagram.png' })).toHaveAttribute('src', /^\/api\/attachments\//);
    await expect(page.locator('.note-visuals audio')).toHaveCount(1);
    await page.getByRole('button', { name: 'Organize with local AI' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'AI cleanup is off.' })).toBeVisible();
    await page.getByRole('button', { name: 'Transcribe recording' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Transcription is off.' })).toBeVisible();
    expect((await serverJson<{ version: number }>(noema, 'GET', `/api/notes/${note.id}`)).version).toBe(1);
  });

  test('Export Markdown downloads the note built on the device', async ({ page, noema }) => {
    const note = await createNote(noema, 'export <b>me</b> please');
    await gotoApp(page, noema, `#/note/${note.id}`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Markdown' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${note.title.replace(/[^\w -]/g, '').slice(0, 70) || 'note'}.md`);   // app.js:514
    expect(readFileSync((await file.path())!, 'utf8')).toBe(`# ${note.title}\n\nFolder: ${note.folder}\n\n${note.body}\n`);
  });

  test('An edit in progress survives a snapshot refetch; a conflicting save never overwrites', async ({ page, noema }) => {   // spec §8 Refetch; §4.3 409
    const note = await createNote(noema, 'conflict base');
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('My unsaved title');
    await noteField(page).fill('My unsaved body');
    await editNote(noema, note, { title: 'Changed elsewhere', body: 'Other device body' });
    await dispatchRefetch(page);
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    await expect(noteField(page)).toHaveValue('My unsaved body');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const conflict = page.locator('.note-form [role=alert]');
    await expect(conflict).toContainText('This note changed on another screen. Your draft has not been overwritten. Reopen to compare.');
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    expect((await serverJson<{ title: string }>(noema, 'GET', `/api/notes/${note.id}`)).title).toBe('Changed elsewhere');
    await conflict.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.locator('.latest-version')).toContainText('Changed elsewhere');
    await expect(page.getByLabel('Title')).toHaveValue('My unsaved title');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My unsaved title');
    expect((await serverJson<{ version: number }>(noema, 'GET', `/api/notes/${note.id}`)).version).toBe(3);
  });

  test('Leaving an unsaved note edit asks first; declining keeps the edit', async ({ page, noema }) => {   // spec §4.5 guards
    const note = await createNote(noema, 'guard me');
    await gotoApp(page, noema, `#/note/${note.id}`);
    expect(await beforeUnloadArmed(page)).toBe(false);
    await page.getByRole('button', { name: 'Edit' }).click();
    await noteField(page).fill('unsaved words');
    expect(await beforeUnloadArmed(page)).toBe(true);
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.leaveNoteEdit); void prompt.dismiss(); });
    await navLink(page, 'Notes').click();
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
    await expect(noteField(page)).toHaveValue('unsaved words');
    page.once('dialog', prompt => { expect(prompt.message()).toBe(S.leaveNoteEdit); void prompt.dismiss(); });
    await page.getByRole('button', { name: 'Original' }).click();
    await expect(noteField(page)).toHaveValue('unsaved words');
    page.once('dialog', prompt => void prompt.accept());
    await navLink(page, 'Notes').click();
    await expect(page).toHaveURL(/#\/notes$/);
  });

  test('A missing note says so', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/note/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Note unavailable');
    await expect(page.getByText('Note not found')).toBeVisible();
  });

  test('Phone width gives the open note the full content area', async ({ page, noema }) => {   // handbook-trace U12 (note takes the full content area); U24 touch targets
    const note = await createNote(noema, 'phone reading with a_very_long_identifier_0x4141414141414141414141414141');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, noema, `#/note/${note.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(note.title);
    expect((await page.locator('.note-page').boundingBox())!.width).toBeGreaterThan(390 * 0.85);
    await expectPhoneFriendly(page, '.note-screen');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/notes.spec.ts -g "Note view"`
Expected: FAIL — `getByRole('button', { name: 'Edit' })` is not found (the Phase 2a NoteView is heading-only).

- [ ] **Step 3: Minimal implementation**

Replace the whole content of `web/src/screens/NoteView.tsx` with:

```tsx
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import type { ApiError } from '../api/client';
import type { Note } from '../api/schemas';
import { age, noteMarkdownExport } from '../domain/format';
import { useNavigationGuard, type NavigationGuard } from '../routes/guards';
import { openDialog } from '../shell/dialogs';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useApplySuggestion, useNote, useProcessNote, useUpdateNote } from '../state/queries';
import { S } from '../strings';
import { Markdown } from '../ui/Markdown';
import { toast } from '../ui/Toast';
import '../styles/capture-notes.css';

export const NOTE_TEXT = {
  revisionSaved: 'Revision saved. The original is unchanged.',   // app.js:384
  queued: 'Queued for local processing.',   // app.js:513
  suggestion: 'An AI suggestion arrived after your edit. Nothing was overwritten.',   // app.js:254
  emptyBody: 'Your visual or recording is saved below.',   // app.js:253
  noTypedInput: '(No typed input)',   // app.js:253
  transcriptHeading: 'VOICE TRANSCRIPT',   // app.js:253
  unavailable: 'Note unavailable',   // app.js:279
  blank: 'Title and folder cannot be blank.',   // new
} as const;

const TITLE_MAX = 240, FOLDER_MAX = 240, BODY_MAX = 150_000;   // models.py NoteUpdate

type EditForm = { title: string; folder: string; body: string; baseVersion: number };
type FormError = { message: string; conflict: boolean };

function errorOf(error: unknown): FormError {
  return { message: error instanceof Error ? error.message : String(error), conflict: (error as Partial<ApiError>).status === 409 };
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);   // app.js:386
}

export function NoteViewScreen() {
  const { id } = useParams({ from: '/note/$id' });
  const note = useNote(id);
  // Keep showing loaded data when a background refetch fails, so an open edit is never unmounted.
  if (note.data) return <NotePage key={id} note={note.data} refetch={async () => (await note.refetch()).data} />;
  if (note.isError) {
    return (
      <div className="screen note-screen" data-quiet>
        <OfflineNotice />
        <header className="page-heading" data-quiet>
          <h1>{NOTE_TEXT.unavailable}</h1>
          <p>{note.error.message}</p>
        </header>
        <Link to="/notes" className="text-button">← All notes</Link>
      </div>
    );
  }
  return (
    <div className="screen note-screen" data-quiet>
      <OfflineNotice />
      <p className="subtle-line" role="status">Opening note…</p>
    </div>
  );
}

function NotePage({ note, refetch }: { note: Note; refetch: () => Promise<Note | undefined> }) {
  const [view, setView] = useState<'note' | 'original'>('note');
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [compare, setCompare] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);
  const update = useUpdateNote();
  const apply = useApplySuggestion();
  const process = useProcessNote();

  const editing = edit !== null;
  const editGuard = useMemo<NavigationGuard | null>(
    () => (editing ? { id: 'note-edit', check: () => ({ kind: 'confirm', message: S.leaveNoteEdit }), beforeUnload: true } : null),
    [editing],
  );
  useNavigationGuard(editGuard);

  function closeEdit() {
    setEdit(null);
    setCompare(false);
    setFormError(null);
  }

  function show(next: 'note' | 'original') {
    if (edit && !window.confirm(S.leaveNoteEdit)) return;   // app.js:485
    closeEdit();
    setView(next);
  }

  function startEdit() {
    setEdit({ title: note.title, folder: note.folder, body: note.body, baseVersion: note.version });
    setCompare(false);
    setFormError(null);
    setView('note');
  }

  function change(field: 'title' | 'folder' | 'body', value: string) {
    setEdit(current => current && { ...current, [field]: value });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!edit) return;
    if (!edit.title.trim() || !edit.folder.trim()) {
      setFormError({ message: NOTE_TEXT.blank, conflict: false });
      return;
    }
    setFormError(null);
    try {
      await update.mutateAsync({ id: note.id, body: { title: edit.title, folder: edit.folder, body: edit.body, expected_version: edit.baseVersion } });
      closeEdit();
      toast(NOTE_TEXT.revisionSaved);
    } catch (error) {
      setFormError(errorOf(error));
    }
  }

  async function reopen() {
    setFormError(null);
    const fresh = await refetch();
    if (!fresh) return;
    // Keep the user's text; only the base version moves, after they have seen the newer revision.
    setEdit(current => current && { ...current, baseVersion: fresh.version });
    setCompare(true);
  }

  async function applySuggestion(sid: string) {
    try {
      await apply.mutateAsync({ id: note.id, sid, expectedVersion: note.version });
    } catch (error) {
      toast(errorOf(error).message, { tone: 'error' });
    }
  }

  async function runProcess(kind: 'organize' | 'transcribe') {
    try {
      await process.mutateAsync({ id: note.id, kind });
      toast(NOTE_TEXT.queued);
    } catch (error) {
      toast(errorOf(error).message, { tone: 'error' });
    }
  }

  function exportMarkdown() {
    const { filename, text } = noteMarkdownExport(note);
    downloadText(filename, text);
  }

  const taskId = note.task_id;
  const hasAudio = note.attachments.some(attachment => attachment.mime.startsWith('audio/'));

  return (
    <div className="screen note-screen" data-quiet>
      <OfflineNotice />
      <Link to="/notes" className="text-button">← All notes</Link>
      <article className="note-page" data-quiet>
        <div className="note-meta">
          <span>{note.folder} · {age(note.updated_at)}</span>
          {taskId && <button type="button" className="text-button" onClick={() => openDialog({ kind: 'task', id: taskId })}>Linked task ↗</button>}
        </div>
        <div className="note-title-row">
          <h1>{note.title}</h1>
          {!editing && <button type="button" className="quiet-button" onClick={startEdit}>Edit</button>}
        </div>
        {note.error && <p className="notice error" role="alert">{note.error}</p>}
        {note.processing && note.processing !== 'error' && (
          <p className="notice" role="status">
            {note.processing}. Your original is saved.{' '}
            <button type="button" className="text-button" onClick={() => void refetch()}>Refresh</button>
          </p>
        )}
        <p className="status-line">
          {note.mode === 'original' ? 'Original wording · basic folder filing' : note.mode}
          {note.mode.startsWith('AI') ? ' · review the interpretation' : ''}
        </p>
        <div className="note-toolbar">
          <div className="segmented" role="group" aria-label="Note views">
            <button type="button" aria-pressed={view === 'note'} onClick={() => show('note')}>Note</button>
            <button type="button" aria-pressed={view === 'original'} onClick={() => show('original')}>Original</button>
            {/* app.js:252: History is the third tab; it opens over the note, so an open edit stays intact. */}
            <button type="button" onClick={() => openDialog({ kind: 'note-history', noteId: note.id })}>History</button>
          </div>
        </div>
        {edit ? (
          <form className="note-form" onSubmit={event => void saveEdit(event)}>
            <label htmlFor="note-edit-title">Title</label>
            <input id="note-edit-title" value={edit.title} required maxLength={TITLE_MAX} onChange={event => change('title', event.target.value)} />
            <label htmlFor="note-edit-folder">Folder</label>
            <input id="note-edit-folder" value={edit.folder} required maxLength={FOLDER_MAX} onChange={event => change('folder', event.target.value)} />
            <label htmlFor="note-edit-body">Note</label>
            <textarea id="note-edit-body" className="note-editor" value={edit.body} maxLength={BODY_MAX} onChange={event => change('body', event.target.value)} />
            {compare && (
              <details className="latest-version" open>
                <summary>Latest saved version · {note.version}</summary>
                <p>{note.title} · {note.folder}</p>
                <div className="original-block">{note.body}</div>
              </details>
            )}
            {formError && (
              <p className="field-error" role="alert">
                {formError.message}
                {formError.conflict && <> <button type="button" className="text-button" onClick={() => void reopen()}>Reopen</button></>}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="quiet-button" onClick={closeEdit}>Cancel</button>
              <button type="submit" className="primary" disabled={update.isPending}>Save changes</button>
            </div>
          </form>
        ) : view === 'original' ? (
          <div className="original-block">
            {note.raw || NOTE_TEXT.noTypedInput}
            {note.transcript ? `\n\n${NOTE_TEXT.transcriptHeading}\n\n${note.transcript}` : ''}
          </div>
        ) : (
          <div className="note-body"><Markdown text={note.body || NOTE_TEXT.emptyBody} /></div>
        )}
        {note.suggestions.map(suggestion => (
          <details key={suggestion.id} className="suggestion">
            <summary>{NOTE_TEXT.suggestion}</summary>
            <div className="note-body"><Markdown text={suggestion.body} /></div>
            <button type="button" className="secondary" disabled={apply.isPending} onClick={() => void applySuggestion(suggestion.id)}>Use this version</button>
          </details>
        ))}
        {note.attachments.length > 0 && (
          <div className="note-visuals">
            {note.attachments.map(attachment => {
              const src = `/api/attachments/${encodeURIComponent(attachment.id)}`;
              return (
                <figure key={attachment.id} className="embedded-image">
                  {attachment.mime.startsWith('image/')
                    ? <img src={src} alt={attachment.name} loading="lazy" />
                    : <audio controls src={src} preload="metadata" />}
                  <figcaption>{attachment.name}</figcaption>
                </figure>
              );
            })}
          </div>
        )}
        <div className="inline-actions note-actions">
          <button type="button" className="secondary" disabled={process.isPending} onClick={() => void runProcess('organize')}>Organize with local AI</button>
          {hasAudio && <button type="button" className="quiet-button" disabled={process.isPending} onClick={() => void runProcess('transcribe')}>Transcribe recording</button>}
          <button type="button" className="quiet-button" onClick={exportMarkdown}>Export Markdown</button>
        </div>
      </article>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/notes.spec.ts`
Expected: PASS (all Notes E2E tests, including the 11 Note view tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/NoteView.tsx web/e2e/notes.spec.ts
git commit -m "feat(web): note view with versioned edit, suggestions and export"
```

---

### Task 12: Note history dialog and restore

Port of `public/app.js:385, 511` with handbook §04: "A restore creates a new revision rather than erasing newer history."

**Files:**
- Create: `web/src/dialogs/NoteHistory.tsx`
- Modify: `web/src/shell/DialogHost.tsx` (add the `note-history` arm)
- Test: append a `Note history` describe to `web/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: `useNote(noteId)`, `useNoteHistory(noteId, true)`, `useRestoreNote()` (`{ id, version, expectedVersion }`), `dateLabel`, `Dialog`, `toast`, `ApiError`, `closeDialog`; E2E: `createNote`, `editNote`, `serverJson` (Task 5).
- Produces: `export function NoteHistoryDialog(props: { onClose: () => void; noteId: string }): JSX.Element` (contract §6.3).

- [ ] **Step 1: Write the failing E2E test**

Append to `web/e2e/notes.spec.ts`:

```ts
test.describe('Note history', () => {
  const historyDialog = (page: Page) => page.getByRole('dialog', { name: 'Note history' });

  test('Original and History are tabs beside the note', async ({ page, noema }) => {   // handbook-trace U19
    const note = await createNote(noema, 'tab layout');
    await gotoApp(page, noema, `#/note/${note.id}`);
    const tabs = page.getByRole('group', { name: 'Note views' });
    await expect(tabs.getByRole('button')).toHaveText(['Note', 'Original', 'History']);
    await tabs.getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.original-block')).toBeVisible();
    await expect(page.locator('.note-body')).toHaveCount(0);
    await tabs.getByRole('button', { name: 'History' }).click();
    await expect(historyDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(historyDialog(page)).toBeHidden();
    await expect(page.locator('.original-block')).toBeVisible();
  });

  test('History restore adds another revision', async ({ page, noema }) => {   // browser_check.py:134-135
    const note = await createNote(noema, 'original raw words');
    await editNote(noema, note, { title: 'Edited title', body: 'edited body' });
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    const current = dialog.getByRole('listitem').filter({ hasText: 'Version 2 · manual' });
    await expect(current).toBeVisible();
    await expect(current.getByRole('button', { name: 'Restore as a new revision' })).toHaveCount(0);
    await dialog.getByRole('listitem').filter({ hasText: 'Version 1' }).getByRole('button', { name: 'Restore as a new revision' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Restored as a new revision.' })).toBeVisible();
    const full = await serverJson<{ version: number; body: string; raw: string }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full.version).toBe(3);
    expect(full.body).toBe(full.raw);
    const history = await serverJson<{ version: number }[]>(noema, 'GET', `/api/notes/${note.id}/history`);
    expect(history.map(revision => revision.version)).toEqual([3, 2, 1]);
  });

  test('Revision previews render untrusted HTML as text', async ({ page, noema }) => {
    const note = await createNote(noema, 'safe base');
    await editNote(noema, note, { body: '<img src=z onerror="window.pwned=4">' });
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    await dialog.getByRole('listitem').filter({ hasText: 'Version 2' }).locator('summary').click();
    await expect(dialog).toContainText('<img src=z onerror="window.pwned=4">');
    expect(await page.evaluate('window.pwned')).toBeUndefined();
  });

  test('A restore against a changed note shows the conflict and changes nothing', async ({ page, noema }) => {
    const note = await createNote(noema, 'base words');
    const second = await editNote(noema, note, { body: 'second' });
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = historyDialog(page);
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Version 2' })).toBeVisible();
    await editNote(noema, second, { body: 'third from another device' });
    await dialog.getByRole('listitem').filter({ hasText: 'Version 1' }).getByRole('button', { name: 'Restore as a new revision' }).click();
    await expect(dialog.getByRole('alert')).toContainText('This note changed on another screen.');
    expect((await serverJson<{ body: string; version: number }>(noema, 'GET', `/api/notes/${note.id}`)).body).toBe('third from another device');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/notes.spec.ts -g "Note history"`
Expected: FAIL — `getByRole('dialog', { name: 'Note history' })` never appears (`DialogHost` has no `note-history` arm).

- [ ] **Step 3: Minimal implementation**

Create `web/src/dialogs/NoteHistory.tsx`:

```tsx
import { useState } from 'react';
import { dateLabel } from '../domain/format';
import { useNote, useNoteHistory, useRestoreNote } from '../state/queries';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';

export function NoteHistoryDialog({ onClose, noteId }: { onClose: () => void; noteId: string }) {
  const note = useNote(noteId);
  const history = useNoteHistory(noteId, true);
  const restore = useRestoreNote();
  const [error, setError] = useState<string | null>(null);
  const currentVersion = note.data?.version;

  async function restoreVersion(version: number) {
    if (currentVersion === undefined) return;
    setError(null);
    try {
      await restore.mutateAsync({ id: noteId, version, expectedVersion: currentVersion });
      onClose();
      toast('Restored as a new revision.');   // app.js:511
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Dialog title="Note history" onRequestClose={onClose}>
      {history.isPending && <p className="subtle-line" role="status">Loading history…</p>}
      {history.isError && <p className="field-error" role="alert">{history.error.message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <ol className="history-list">
        {(history.data ?? []).map(revision => (
          <li key={revision.id} className="history-item">
            <div className="inline-actions">
              <span className="subtle-line">Version {revision.version} · {revision.source} · {dateLabel(revision.created_at)}</span>
              {currentVersion !== undefined && revision.version !== currentVersion && (
                <button type="button" className="text-button" disabled={restore.isPending} onClick={() => void restoreVersion(revision.version)}>
                  Restore as a new revision
                </button>
              )}
            </div>
            <details>
              <summary>{revision.title}</summary>
              <div className="original-block">{revision.body}</div>
            </details>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
```

In `web/src/shell/DialogHost.tsx` add next to the existing dialog imports:

```tsx
import { NoteHistoryDialog } from '../dialogs/NoteHistory';
```

and inside `switch (request?.kind)`, immediately before the `default:` line, add:

```tsx
    case 'note-history': return <NoteHistoryDialog onClose={closeDialog} noteId={request.noteId} />;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/notes.spec.ts`
Expected: PASS (all Notes E2E tests, including the 4 history tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/dialogs/NoteHistory.tsx web/src/shell/DialogHost.tsx web/e2e/notes.spec.ts
git commit -m "feat(web): note history dialog with restore as a new revision"
```

---

### Task 13: Settings dialog (display name, observation, motion, companion, notifications, rules, tokens, export)

Port of `public/app.js:455-473, 481, 531-536` with spec §5 "Settings" and §4.7 "Greeting". Form values are copied from the snapshot once, when the dialog opens (or when the first snapshot arrives); later refetches never touch them. Toggles are optimistic and revert on failure. A created token lives only in this dialog's state: it is removed from the mutation cache and disappears when the dialog closes.

**Files:**
- Create: `web/src/dialogs/Settings.tsx`
- Modify: `web/src/shell/DialogHost.tsx` (add the `settings` arm)
- Test: `web/src/dialogs/Settings.test.tsx`, `web/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `useSnapshot`, `useUpdateSettings` (`SettingsPatch` → `Settings`), `useCreateRule` (`{app, contains, task_id}`), `useDeleteRule` (`{id}`), `useTokens(enabled)`, `useCreateToken` (`{name, scope, task_ids}` → `TokenCreated`), `useRevokeToken` (`{id}`), `useQueryClient`, `NOTIFICATIONS_KEY`, `openDialog({kind:'outbox'})`, `observationStatus` (`domain/nowState.ts`), `Dialog`, `toast`, `S.notificationsUnsupported`; E2E: `createNote`, `dispatchRefetch`, `navLink`, `openRuntimeLink`, `serverJson`, `serverState` (Task 5); tests: `stubFetch`, `jsonResponse`, `renderWithClient`, `installDialogPolyfill` (Task 4), `makeSnapshot`, `makeTask`, `queryKeys`.
- Produces:

```ts
export const DISPLAY_NAME_MAX = 60;
export const COMPANION_SIZE_MIN = 24, COMPANION_SIZE_MAX = 72;
export const SETTINGS_TEXT: { title: 'Your workspace'; offline: string; nameSaved: 'Name saved.'; tokenOnce: 'Copy this token now. It will not be displayed again.' };
export function SettingsDialog(props: { onClose: () => void; section?: 'agents' }): JSX.Element;   // contract §6.3
```

- [ ] **Step 1: Write the failing tests**

Create `web/src/dialogs/Settings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import type { Settings, Snapshot } from '../api/schemas';
import { queryKeys } from '../state/queries';
import { S } from '../strings';
import { installDialogPolyfill, jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { makeSnapshot, makeTask } from '../test/fixtures';
import { toast } from '../ui/Toast';
import { SETTINGS_TEXT, SettingsDialog } from './Settings';

let snapshot: Snapshot;
let patchStatus: number;
let stateStatus: number;
let calls: StubCall[];

beforeAll(installDialogPolyfill);

beforeEach(() => {
  snapshot = makeSnapshot({ tasks: [makeTask('t1', { title: 'Two Sum' })] });
  snapshot = { ...snapshot, settings: { ...snapshot.settings, display_name: 'Ada' } };
  patchStatus = 200;
  stateStatus = 200;
  calls = stubFetch(call => {
    if (call.url.startsWith('/api/state')) return stateStatus === 200 ? jsonResponse(200, snapshot) : jsonResponse(stateStatus, { detail: 'Service unavailable' });
    if (call.url === '/api/settings' && call.method === 'PATCH') {
      return patchStatus === 200
        ? jsonResponse(200, { ...snapshot.settings, ...(call.body as Partial<Settings>) })
        : jsonResponse(patchStatus, { detail: 'Settings storage failed' });
    }
    if (call.url === '/api/tokens' && call.method === 'GET') return jsonResponse(200, []);
    if (call.url === '/api/tokens' && call.method === 'POST') {
      const body = call.body as { scope: 'agent' | 'observer'; task_ids: string[] };
      return jsonResponse(201, { id: 'tok1', token: 'secret-token-value-0123456789', scope: body.scope, task_ids: body.task_ids });
    }
    return undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const seed = (data: Snapshot | null) => (queryClient: QueryClient) => {
  if (data) queryClient.setQueryData(queryKeys.snapshot(null), data);
};
const patches = () => calls.filter(call => call.method === 'PATCH').map(call => call.body);

describe('SettingsDialog', () => {
  it('copies display_name into the form on open and saves it stripped', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const input = screen.getByLabelText('Your name') as HTMLInputElement;
    expect(input.value).toBe('Ada');
    expect(input.maxLength).toBe(60);
    fireEvent.change(input, { target: { value: '  Grace  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(patches()).toEqual([{ display_name: 'Grace' }]));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(SETTINGS_TEXT.nameSaved));
    expect(input.value).toBe('Grace');
  });

  it('a snapshot refetch never replaces the name being typed', () => {
    const { queryClient } = renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const input = screen.getByLabelText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft name' } });
    act(() => {
      queryClient.setQueryData(queryKeys.snapshot(null), { ...snapshot, settings: { ...snapshot.settings, display_name: 'Server name', motion: true } });
    });
    expect(input.value).toBe('Draft name');
    expect((screen.getByLabelText('Enable background motion') as HTMLInputElement).checked).toBe(false);
  });

  it('toggles observation through one PATCH and reverts it when the server refuses', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const box = screen.getByLabelText('Enable window context') as HTMLInputElement;
    expect(box.checked).toBe(false);
    patchStatus = 500;
    fireEvent.click(box);
    expect(await screen.findByText('Settings storage failed')).toBeTruthy();
    expect(box.checked).toBe(false);
    expect(patches()).toEqual([{ observation_enabled: true }]);
    patchStatus = 200;
    fireEvent.click(box);
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(box.checked).toBe(true);
  });

  it('sends the companion mode and the size (24–72) the Sway helper reads', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    fireEvent.change(screen.getByLabelText('Companion mode'), { target: { value: 'dot' } });
    const size = screen.getByLabelText('Companion size') as HTMLInputElement;
    expect(size.min).toBe('24');
    expect(size.max).toBe('72');
    fireEvent.change(size, { target: { value: '56' } });
    await waitFor(() => expect(patches()).toEqual([{ companion: 'dot' }, { companion_size: 56 }]));
  });

  it('shows a created token once and keeps it nowhere else', async () => {
    const { queryClient, unmount } = renderWithClient(<SettingsDialog onClose={() => {}} section="agents" />, seed(snapshot));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '  Local agent ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByText('secret-token-value-0123456789')).toBeTruthy();
    expect(screen.getByText(SETTINGS_TEXT.tokenOnce)).toBeTruthy();
    expect(calls.find(call => call.method === 'POST' && call.url === '/api/tokens')?.body).toEqual({ name: 'Local agent', scope: 'agent', task_ids: [] });
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map(mutation => mutation.state.data ?? null))).not.toContain('secret-token-value');
    unmount();
    renderWithClient(<SettingsDialog onClose={() => {}} section="agents" />, seed(snapshot));
    await waitFor(() => expect(calls.filter(call => call.url === '/api/tokens' && call.method === 'GET').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('secret-token-value-0123456789')).toBeNull();
  });

  it('loads tokens only when the agents section is open', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    await act(async () => {});
    expect(calls.some(call => call.url === '/api/tokens')).toBe(false);
  });

  it('reports when notifications are unavailable in this browser', () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    expect(toast).toHaveBeenCalledWith(S.notificationsUnsupported);
  });

  it('without a snapshot it shows no setting inputs', () => {
    stateStatus = 503;
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(null));
    expect(screen.getByText(SETTINGS_TEXT.offline)).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(screen.queryByLabelText('Enable window context')).toBeNull();
  });
});
```

Create `web/e2e/settings.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { expect, gotoApp, test } from './fixtures';
import { createNote, dispatchRefetch, navLink, openRuntimeLink, serverJson, serverState } from './screenTest';

type SettingsBody = { settings: { display_name: string; observation_enabled: boolean; motion: boolean; companion: string; companion_size: number }; context_rules: unknown[] };
const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Your workspace' });
const serverSettings = async (noema: Parameters<typeof serverJson>[0]) => (await serverJson<SettingsBody>(noema, 'GET', '/api/state')).settings;

test.describe('Settings', () => {
  test('Display name edited in Settings updates the greeting and avatar', async ({ page, noema }) => {   // handbook-trace U6
    await gotoApp(page, noema, '#/settings');
    await expect(page.locator('.avatar')).toHaveCount(0);
    const dialog = settingsDialog(page);
    const name = dialog.getByLabel('Your name');
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('maxlength', '60');
    await name.fill('  Ada  ');
    await dialog.getByRole('button', { name: 'Save name' }).click();
    await expect.poll(async () => (await serverSettings(noema)).display_name).toBe('Ada');
    await expect(name).toHaveValue('Ada');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\.$/);
    await expect(page.locator('.avatar')).toHaveText('A');
  });

  test('A snapshot refetch never replaces the name being typed', async ({ page, noema }) => {   // spec §8 Refetch
    await gotoApp(page, noema, '#/settings');
    const name = settingsDialog(page).getByLabel('Your name');
    await name.fill('Half-typed');
    await serverJson(noema, 'PATCH', '/api/settings', { display_name: 'Other device' });
    await dispatchRefetch(page);
    await expect(name).toHaveValue('Half-typed');
  });

  test('Native settings URL opens actual existing dialog at startup', async ({ page, noema }) => {   // settings_link_check.py:29
    await gotoApp(page, noema, '#settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
  });

  test('Settings link adds no navigation screen', async ({ page, noema }) => {   // settings_link_check.py:31
    await gotoApp(page, noema, '#settings');
    await expect(settingsDialog(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Overview', 'Capture', 'Notes', 'Tasks']);
    await expect(page).toHaveURL(/#\/overview$/);
  });

  test('Linked settings edits actual existing server permission', async ({ page, noema }) => {   // settings_link_check.py:34
    await gotoApp(page, noema, '#settings');
    await settingsDialog(page).getByLabel('Enable window context').check();
    await expect.poll(async () => (await serverSettings(noema)).observation_enabled).toBe(true);
  });

  test('Settings link preserves current Capture route and editor text', async ({ page, noema }) => {   // settings_link_check.py:44
    await gotoApp(page, noema, '#/capture');
    const editor = page.getByLabel('Rough learning note');
    await editor.fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(editor).toHaveValue('Synthetic unsaved capture for settings-link recovery.');
    await expect(page).toHaveURL(/#\/capture$/);
  });

  test('Settings navigation never ingests an unsaved draft', async ({ page, noema }) => {   // settings_link_check.py:46
    await gotoApp(page, noema, '#/capture');
    await page.getByLabel('Rough learning note').fill('Synthetic unsaved capture for settings-link recovery.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await openRuntimeLink(page, '#/settings');
    await expect(settingsDialog(page)).toBeVisible();
    expect((await serverState(noema)).notes).toEqual([]);
  });

  test('Settings link preserves note-edit route and unsaved editor text', async ({ page, noema }) => {   // settings_link_check.py:58
    const note = await createNote(noema, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const field = page.getByLabel('Note', { exact: true });
    await field.fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page).getByLabel('Enable window context')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(field).toHaveValue('Synthetic unsaved note edit.');
    await expect(page).toHaveURL(new RegExp(`#/note/${note.id}$`));
  });

  test('Opening settings never replaces the saved note original', async ({ page, noema }) => {   // settings_link_check.py:60
    const note = await createNote(noema, 'Synthetic saved original for editor preservation.');
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note', { exact: true }).fill('Synthetic unsaved note edit.');
    await openRuntimeLink(page, 'settings');
    await expect(settingsDialog(page)).toBeVisible();
    const full = await serverJson<{ raw: string; version: number }>(noema, 'GET', `/api/notes/${note.id}`);
    expect(full).toMatchObject({ raw: 'Synthetic saved original for editor preservation.', version: 1 });
  });

  test('Kitten reveals implemented size, mode and observation controls', async ({ page, noema }) => {   // now_ui_check.py:222
    await gotoApp(page, noema, '#/settings');
    const dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toBeVisible();
    await expect(dialog.getByLabel('Companion mode').locator('option')).toHaveText(['cat', 'dot', 'hidden']);
    const size = dialog.getByLabel('Companion size');
    await expect(size).toHaveAttribute('min', '24');
    await expect(size).toHaveAttribute('max', '72');
    await expect(dialog.getByText('Logical pixels; native helper reads this setting.')).toBeVisible();
    await expect(dialog.getByLabel('Enable window context')).toBeVisible();
  });

  test('Observation permission does not claim an active observer or screenshots', async ({ page, noema }) => {   // now_ui_check.py:235
    await gotoApp(page, noema, '#/settings');
    const dialog = settingsDialog(page);
    const status = dialog.locator('#observation-status');
    await expect(status).toContainText('Observation paused');
    await dialog.getByLabel('Enable window context').check();
    await expect(status).toContainText('Allowed · no recent observer report');
    await expect(status).toContainText('no screenshot observation is implemented');
    await expect(dialog).not.toContainText('Recent window metadata report');
    await dialog.getByLabel('Enable window context').uncheck();
    await expect(status).toContainText('Observation paused');
  });

  test('Companion modes persist; browser reports no native connection and contains no kitten overlay', async ({ page, noema }) => {   // verify.py:71
    await gotoApp(page, noema, '#/settings');
    let dialog = settingsDialog(page);
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await expect.poll(async () => (await serverSettings(noema)).companion).toBe('dot');
    await expect(dialog.getByText('This browser does not connect to the desktop companion.')).toBeVisible();
    await page.reload();
    await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    dialog = settingsDialog(page);
    await expect(dialog.getByLabel('Companion mode')).toHaveValue('dot');
    await expect(page.locator('img[src*="cat"], #companion-launch, .companion')).toHaveCount(0);
  });

  test('Observation and motion start off; observation, companion mode and size reach the server', async ({ page, noema }) => {   // handbook-trace R9 (capture disabled by default)
    await gotoApp(page, noema, '#/settings');
    const dialog = settingsDialog(page);
    const observation = dialog.getByLabel('Enable window context');
    await expect(observation).not.toBeChecked();
    await expect(dialog.getByLabel('Enable background motion')).not.toBeChecked();
    await observation.check();
    await dialog.getByLabel('Companion mode').selectOption('dot');
    await dialog.getByLabel('Companion size').fill('56');
    await expect.poll(async () => serverSettings(noema))
      .toMatchObject({ observation_enabled: true, motion: false, companion: 'dot', companion_size: 56 });
  });

  test('Window-to-task rules can be added and removed', async ({ page, noema }) => {
    await serverJson(noema, 'POST', '/api/tasks', { title: 'Two Sum' });
    await gotoApp(page, noema, '#/settings');
    const dialog = settingsDialog(page);
    await dialog.getByText('Window-to-task rules').click();
    await dialog.getByLabel('App ID').fill('org.mozilla.firefox');
    await dialog.getByLabel('Title contains').fill('Two Sum');
    await dialog.getByLabel('Task', { exact: true }).selectOption({ label: 'Two Sum' });
    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await expect(dialog.getByText('org.mozilla.firefox / Two Sum → Two Sum')).toBeVisible();
    expect((await serverJson<SettingsBody>(noema, 'GET', '/api/state')).context_rules).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => (await serverJson<SettingsBody>(noema, 'GET', '/api/state')).context_rules.length).toBe(0);
  });

  test('A new token is shown once, survives nowhere, and can be revoked', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/settings');
    let dialog = settingsDialog(page);
    await dialog.getByText('Agent & observer tokens').click();
    await dialog.getByLabel('Label').fill('Local coding agent');
    await dialog.getByRole('button', { name: 'Create token' }).click();
    const value = dialog.locator('.token-value');
    await expect(value).toHaveText(/\S{20,}/);
    const token = (await value.textContent())!;
    await expect(dialog.getByText('Copy this token now. It will not be displayed again.')).toBeVisible();
    await expect(dialog.getByText('Local coding agent · agent')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(token);
    await page.reload();
    await expect(page.getByText(S.connected, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    dialog = settingsDialog(page);
    await dialog.getByText('Agent & observer tokens').click();
    await expect(dialog.getByText('Local coding agent · agent')).toBeVisible();
    await expect(dialog.locator('.token-value')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(dialog.getByText('Local coding agent · agent')).toHaveCount(0);
    expect(await serverJson<unknown[]>(noema, 'GET', '/api/tokens')).toEqual([]);
  });

  test('Export downloads the notebook archive; Local capture queue opens the outbox', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/settings');
    const dialog = settingsDialog(page);
    const download = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Export notes & tasks' }).click();
    expect((await download).suggestedFilename()).toBe('noema-export.zip');   // server.py:337
    await expect(dialog.getByText('Version 0.1.0 · local-first development build')).toBeVisible();   // app.js:465
    await dialog.getByRole('button', { name: 'Local capture queue' }).click();
    await expect(page.getByRole('dialog', { name: S.outboxTitle })).toBeVisible();
  });

  test('Settings opens from the navigation on every screen', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/notes');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(settingsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navLink(page, 'Notes')).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/dialogs/Settings.test.tsx`
Expected: FAIL with `Failed to resolve import "./Settings" from "src/dialogs/Settings.test.tsx"`.

Run: `npm --prefix web run e2e -- e2e/settings.spec.ts` (no rebuild here: `web/dist` is still the build from Task 12, and `tsc --noEmit` inside `npm run build` would stop first on the not-yet-created `./Settings` import of the new unit test)
Expected: FAIL — `getByRole('dialog', { name: 'Your workspace' })` never appears (`DialogHost` has no `settings` arm).

- [ ] **Step 3: Minimal implementation**

Create `web/src/dialogs/Settings.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Settings, SettingsPatch, TokenCreated } from '../api/schemas';
import { observationStatus } from '../domain/nowState';
import { openDialog } from '../shell/dialogs';
import { NOTIFICATIONS_KEY } from '../shell/notifications';
import { useCreateRule, useCreateToken, useDeleteRule, useRevokeToken, useSnapshot, useTokens, useUpdateSettings } from '../state/queries';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';
import '../styles/capture-notes.css';

export const DISPLAY_NAME_MAX = 60;   // models.py SettingsInput.display_name
export const COMPANION_SIZE_MIN = 24, COMPANION_SIZE_MAX = 72;   // models.py:134
export const SETTINGS_TEXT = {
  title: 'Your workspace',   // app.js:457
  offline: 'Settings load from your server. Reconnect to change them.',   // new
  nameSaved: 'Name saved.',   // new
  tokenOnce: 'Copy this token now. It will not be displayed again.',   // app.js:470
} as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notificationsOn(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_KEY) === '1';
  } catch {
    return false;
  }
}

function pick(source: Settings, changes: SettingsPatch): SettingsPatch {
  return Object.fromEntries(Object.keys(changes).map(key => [key, source[key as keyof SettingsPatch]])) as SettingsPatch;
}

export function SettingsDialog({ onClose, section }: { onClose: () => void; section?: 'agents' }) {
  const snapshot = useSnapshot().data ?? null;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings | null>(snapshot?.settings ?? null);
  const [name, setName] = useState(snapshot?.settings.display_name ?? '');
  const savedSize = useRef(snapshot?.settings.companion_size ?? 40);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsOn);
  const [agentsOpen, setAgentsOpen] = useState(section === 'agents');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [created, setCreated] = useState<TokenCreated | null>(null);
  const [scope, setScope] = useState<'agent' | 'observer'>('agent');
  const sizeInput = useRef<HTMLInputElement>(null);
  const agents = useRef<HTMLDetailsElement>(null);
  const tokenLabel = useRef<HTMLInputElement>(null);
  const update = useUpdateSettings();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const tokens = useTokens(agentsOpen);

  // Server data is copied into the form once; later refetches never touch what the user is editing.
  useEffect(() => {
    if (form !== null || !snapshot) return;
    setForm(snapshot.settings);
    setName(snapshot.settings.display_name);
    savedSize.current = snapshot.settings.companion_size;
  }, [form, snapshot]);

  useEffect(() => {
    if (section !== 'agents') return;
    const frame = requestAnimationFrame(() => {
      agents.current?.scrollIntoView?.({ block: 'nearest' });
      tokenLabel.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

  async function patch(changes: SettingsPatch): Promise<boolean> {
    const previous = form;
    setForm(current => current && { ...current, ...changes });
    setError(null);
    try {
      await update.mutateAsync(changes);
      return true;
    } catch (caught) {
      if (previous) setForm(current => current && { ...current, ...pick(previous, changes) });
      setError(message(caught));
      return false;
    }
  }

  useEffect(() => {
    const input = sizeInput.current;
    if (!input) return;
    // Commit on the native change event (release), as app.js:468 did, not on every drag step.
    const commit = () => {
      const value = Number(input.value);
      void patch({ companion_size: value }).then(ok => {
        if (ok) savedSize.current = value;
        else setForm(current => current && { ...current, companion_size: savedSize.current });
      });
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  });

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (await patch({ display_name: value })) {
      setName(value);
      toast(SETTINGS_TEXT.nameSaved);
    }
  }

  async function toggleNotifications() {
    try {
      if (notify) {
        localStorage.setItem(NOTIFICATIONS_KEY, '0');
        setNotify(false);
        return;
      }
      if (!('Notification' in window)) {
        toast(S.notificationsUnsupported);   // app.js:535
        return;
      }
      const permission = await Notification.requestPermission();
      localStorage.setItem(NOTIFICATIONS_KEY, permission === 'granted' ? '1' : '0');
      setNotify(permission === 'granted');
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    setRuleError(null);
    try {
      await createRule.mutateAsync({ app: String(data.get('app') ?? ''), contains: String(data.get('contains') ?? ''), task_id: String(data.get('task_id') ?? '') });
      element.reset();
    } catch (caught) {
      setRuleError(message(caught));
    }
  }

  async function removeRule(id: string) {
    setRuleError(null);
    try {
      await deleteRule.mutateAsync({ id });
    } catch (caught) {
      setRuleError(message(caught));
    }
  }

  async function addToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    setTokenError(null);
    setCreated(null);
    try {
      const result = await createToken.mutateAsync({
        name: String(data.get('name') ?? '').trim(),
        scope,
        task_ids: scope === 'agent' ? data.getAll('task_ids').map(String) : [],
      });
      // The secret is shown once from this dialog's state only; drop it from the mutation cache.
      const cache = queryClient.getMutationCache();
      cache.findAll({ predicate: mutation => mutation.state.data === result }).forEach(mutation => cache.remove(mutation));
      createToken.reset();
      setCreated(result);
      element.reset();
    } catch (caught) {
      setTokenError(message(caught));
    }
  }

  async function revoke(id: string) {
    setTokenError(null);
    try {
      await revokeToken.mutateAsync({ id });
    } catch (caught) {
      setTokenError(message(caught));
    }
  }

  const tasks = snapshot?.tasks ?? [];
  const capabilities = snapshot?.capabilities;
  const taskTitle = (id: string) => tasks.find(task => task.id === id)?.title ?? 'Unavailable task';

  return (
    <Dialog title={SETTINGS_TEXT.title} onRequestClose={onClose} className="settings-dialog">
      {form ? (
        <>
          <form className="settings-row" onSubmit={event => void saveName(event)}>
            <div>
              <label htmlFor="settings-display-name">Your name</label>
              <p>Shown in the Overview greeting. Leave it empty for no name.</p>
            </div>
            <div className="inline-actions">
              <input id="settings-display-name" value={name} maxLength={DISPLAY_NAME_MAX} autoComplete="name" onChange={event => setName(event.target.value)} />
              <button type="submit" className="secondary" disabled={update.isPending}>Save name</button>
            </div>
          </form>
          <div className="settings-row">
            <div>Screen context<p>Off by default. The Sway helper reports window metadata only. No screenshot analysis is implemented in this build.</p></div>
            <input type="checkbox" aria-label="Enable window context" checked={form.observation_enabled} onChange={event => void patch({ observation_enabled: event.target.checked })} />
          </div>
          {/* app.js:477: the status reflects the server snapshot, never the optimistic toggle. */}
          <p className="subtle-line" id="observation-status">{observationStatus(snapshot)}. Window metadata only; no screenshot observation is implemented.</p>
          <div className="settings-row">
            <div>Slow background motion<p>Pauses when hidden. Static by default.</p></div>
            <input type="checkbox" aria-label="Enable background motion" checked={form.motion} onChange={event => void patch({ motion: event.target.checked })} />
          </div>
          <div className="settings-row">
            <div>Companion<p>The Sway helper reads this setting. This browser does not connect to the desktop companion.</p></div>
            <select aria-label="Companion mode" value={form.companion} onChange={event => void patch({ companion: event.target.value as Settings['companion'] })}>
              {(['cat', 'dot', 'hidden'] as const).map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </div>
          <div className="settings-row">
            {/* app.js:459 */}
            <div>Companion size<p>Logical pixels; native helper reads this setting. Now {form.companion_size} px.</p></div>
            <input
              ref={sizeInput}
              type="range"
              aria-label="Companion size"
              min={COMPANION_SIZE_MIN}
              max={COMPANION_SIZE_MAX}
              value={form.companion_size}
              onChange={event => {
                const value = Number(event.target.value);
                setForm(current => current && { ...current, companion_size: value });
              }}
            />
          </div>
        </>
      ) : (
        <p className="notice" role="status">{SETTINGS_TEXT.offline}</p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="settings-row">
        <div>Reminder notifications<p>Opt-in browser notifications while a client is open. No push service or always-on delivery yet.</p></div>
        <button type="button" className="secondary" onClick={() => void toggleNotifications()}>{notify ? 'Disable notifications' : 'Enable notifications'}</button>
      </div>
      {capabilities && (
        <>
          <h3 className="eyebrow">Local processing</h3>
          <p className="notice">
            Note cleanup: {capabilities.organizer ? capabilities.model : 'off — original wording is preserved'}<br />
            Speech: {capabilities.speech ? capabilities.speech_model : 'off — recordings can still be saved'}<br />
            No models download or load automatically. Enable them using the README’s optional setup.
          </p>
        </>
      )}
      <details className="settings-section">
        <summary>Window-to-task rules</summary>
        <p className="subtle-line">A known application or title maps to a task. Unmatched windows do not become made-up focus claims. Pinned focus wins.</p>
        <ul className="history-list">
          {(snapshot?.context_rules ?? []).map(rule => (
            <li key={rule.id} className="inline-actions">
              <span>{rule.app || 'Any app'} / {rule.contains_text || 'Any title'} → {taskTitle(rule.task_id)}</span>
              <button type="button" className="quiet-button" onClick={() => void removeRule(rule.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <form className="settings-form" onSubmit={event => void addRule(event)}>
          <div><label htmlFor="rule-app">App ID</label><input id="rule-app" name="app" maxLength={160} placeholder="org.mozilla.firefox" /></div>
          <div><label htmlFor="rule-contains">Title contains</label><input id="rule-contains" name="contains" maxLength={200} placeholder="Two Sum" /></div>
          <div className="full">
            <label htmlFor="rule-task">Task</label>
            <select id="rule-task" name="task_id" required>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </div>
          <div className="full">
            <button type="submit" className="secondary" disabled={tasks.length === 0 || createRule.isPending}>Add rule</button>
            {ruleError && <p className="field-error" role="alert">{ruleError}</p>}
          </div>
        </form>
      </details>
      <details ref={agents} className="settings-section" open={agentsOpen} onToggle={event => setAgentsOpen(event.currentTarget.open)}>
        <summary>Agent &amp; observer tokens</summary>
        <p className="subtle-line">An agent token can report runs and read only the tasks you choose. Observer tokens may report window context and read the small companion summary. Never paste tokens into notes.</p>
        {tokens.isError && <p className="field-error" role="alert">{tokens.error.message}</p>}
        <ul className="history-list">
          {(tokens.data ?? []).map(token => (
            <li key={token.id} className="inline-actions">
              <span>{token.name} · {token.scope}</span>
              <button type="button" className="quiet-button" onClick={() => void revoke(token.id)}>Revoke</button>
            </li>
          ))}
        </ul>
        <form className="settings-form" onSubmit={event => void addToken(event)}>
          <div><label htmlFor="token-name">Label</label><input ref={tokenLabel} id="token-name" name="name" required maxLength={80} placeholder="Local coding agent" /></div>
          <div>
            <label htmlFor="token-scope">Access</label>
            <select id="token-scope" value={scope} onChange={event => setScope(event.target.value as 'agent' | 'observer')}>
              <option value="agent">Task-scoped agent</option>
              <option value="observer">Window observer</option>
            </select>
          </div>
          <div className="full">
            <label htmlFor="token-tasks">Allowed tasks · agent tokens</label>
            <select id="token-tasks" name="task_ids" multiple size={3} disabled={scope !== 'agent'}>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </div>
          <div className="full">
            <button type="submit" className="secondary" disabled={createToken.isPending}>Create token</button>
            {tokenError && <p className="field-error" role="alert">{tokenError}</p>}
          </div>
        </form>
        {created && (
          <div className="notice" role="status">
            <p>{SETTINGS_TEXT.tokenOnce}</p>
            <code className="token-value">{created.token}</code>
          </div>
        )}
        <p className="subtle-line">Use the generated task-scoped token with tools/agent.py. The wrapper tracks only the command you explicitly start; it does not attach to arbitrary browser sessions. See the README for the exact command and token environment setup.</p>
      </details>
      <h3 className="eyebrow">Keep your data</h3>
      <p className="subtle-line">One SQLite database and an attachments directory on the server. This build does not automatically deploy or synchronize independent servers.</p>
      <div className="inline-actions">
        <a href="/api/export" className="secondary" download>Export notes &amp; tasks</a>
        <button type="button" className="quiet-button" onClick={() => openDialog({ kind: 'outbox' })}>Local capture queue</button>
      </div>
      <p className="subtle-line">Version 0.1.0 · local-first development build</p>
    </Dialog>
  );
}
```

In `web/src/shell/DialogHost.tsx` add next to the existing dialog imports:

```tsx
import { SettingsDialog } from '../dialogs/Settings';
```

and inside `switch (request?.kind)`, immediately before the `default:` line, add:

```tsx
    case 'settings': return <SettingsDialog onClose={closeDialog} section={request.section} />;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix web test -- src/dialogs/Settings.test.tsx && npm --prefix web run build && npm --prefix web run e2e -- e2e/settings.spec.ts`
Expected: PASS (8 unit tests, 17 E2E tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/dialogs/Settings.tsx web/src/dialogs/Settings.test.tsx web/src/shell/DialogHost.tsx web/e2e/settings.spec.ts
git commit -m "feat(web): settings dialog with display name, rules and one-time tokens"
```

---

### Task 14: Close checkpoint and update reload (page side)

Port of the page half of the close contract (`public/app.js:598-614`, spec §6.3, contract §6.5) and the `vite:preloadError` handler (spec §6.2, contract §6.3). Contract §1.2 lists both files under P3; `02-screens-core.md` (its Prerequisites and `main.tsx` note) leaves them and their two `main.tsx` calls to this phase. The Electron plan relies on `window.__noemaCheckpointCloseReady` and the `noema:close-approved` message produced here. One deliberate difference from `app.js:603`: a save in flight shows `toast(S.closeSaveInFlight)` instead of `alert()` (contract §6.5).

**Files:**
- Create: `web/src/shell/checkpoint.ts`, `web/src/shell/preloadError.ts`
- Modify: `web/src/main.tsx` (two imports after `import { createAppRouter, openModalLink } from './routes/router';`; two calls after `installRefetchTriggers(qc);`)
- Test: `web/src/shell/checkpoint.test.ts`, `web/src/shell/preloadError.test.ts`, `web/e2e/checkpoint.spec.ts`

**Interfaces:**
- Consumes: `CHECKPOINT_CLOSE`, `CLOSE_APPROVED` (`events.ts`), `window.ipc`, `window.__noemaCheckpointCloseReady` (`globals.d.ts`), `captureDraftStore.{getSnapshot,persist}`, `taskDraftStore.{getSnapshot,persist}`, `isGuardActive` (`routes/guards.ts`), `toast` (`ui/Toast.tsx`), `S.{closeSaveInFlight,closeConfirm,closeDraftFailed,closeCheckpointFailed,updateReady,reload}`; E2E: `stubIpc`, `delayIdbTransactions`, `failIdbWrite`, `gotoApp`, `readLocalDb`, `createNote` (Task 5).
- Produces (contract §6.3):

```ts
// shell/checkpoint.ts
export function installCheckpointClose(): () => void;   // no-op unless typeof window.ipc?.postMessage === 'function'; sets __noemaCheckpointCloseReady after the listener is attached; cleanup removes both
// shell/preloadError.ts
export function installPreloadErrorHandler(): () => void;   // 'vite:preloadError' → preventDefault; persist both drafts (failures ignored); toast(S.updateReady, { action: { label: S.reload, onClick: reload } })
```

- [ ] **Step 1: Write the failing unit and E2E tests**

Create `web/src/shell/checkpoint.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  capture: { saving: false, saveState: 'saved' as string, draft: { id: 'd1', raw: 'thought', task_id: '', files: [] as unknown[] } },
  task: { draft: { id: 't1', raw: '', fields: {}, pending: null as unknown } },
  guards: new Set<string>(),
}));

vi.mock('../local/drafts', () => ({ captureDraftStore: { getSnapshot: () => state.capture, persist: vi.fn(async () => {}) } }));
vi.mock('../local/taskDraft', () => ({ taskDraftStore: { getSnapshot: () => state.task, persist: vi.fn(async () => {}) } }));
vi.mock('../routes/guards', () => ({ isGuardActive: (id: string) => state.guards.has(id) }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { installCheckpointClose } from './checkpoint';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const requestClose = () => window.dispatchEvent(new Event('noema:checkpoint-close'));
let postMessage: ReturnType<typeof vi.fn>;
let uninstall: () => void = () => {};

beforeEach(() => {
  state.capture = { saving: false, saveState: 'saved', draft: { id: 'd1', raw: 'thought', task_id: '', files: [] } };
  state.task = { draft: { id: 't1', raw: '', fields: {}, pending: null } };
  state.guards.clear();
  postMessage = vi.fn();
  window.ipc = { postMessage };
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  delete window.ipc;
  vi.restoreAllMocks();
  vi.resetAllMocks();   // also drops per-test persist implementations
});

describe('installCheckpointClose', () => {
  it('does nothing in an ordinary browser without the desktop bridge', async () => {
    delete window.ipc;
    uninstall = installCheckpointClose();
    expect(window.__noemaCheckpointCloseReady).toBeUndefined();
    requestClose();
    await settle();
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
  });

  it('marks the page ready only once the listener is installed, and unmarks it on cleanup', () => {
    expect(window.__noemaCheckpointCloseReady).toBeUndefined();
    uninstall = installCheckpointClose();
    expect(window.__noemaCheckpointCloseReady).toBe(true);
    uninstall();
    uninstall = () => {};
    expect(window.__noemaCheckpointCloseReady).toBeUndefined();
  });

  it('saves both drafts, then approves the close', async () => {
    state.task.draft.raw = 'add a task later';
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('noema:close-approved'));
    expect(vi.mocked(captureDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
    expect(vi.mocked(taskDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
  });

  it('does not rewrite an empty task draft', async () => {
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(taskDraftStore.persist).not.toHaveBeenCalled();
  });

  it('keeps the window open with a toast while a capture save is in flight', async () => {
    state.capture.saving = true;
    uninstall = installCheckpointClose();
    requestClose();
    await settle();
    expect(toast).toHaveBeenCalledWith(S.closeSaveInFlight);
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('asks before closing while recording or editing a note; declining keeps the window open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    uninstall = installCheckpointClose();
    for (const guard of ['recording', 'note-edit']) {
      state.guards.clear();
      state.guards.add(guard);
      requestClose();
      await settle();
    }
    expect(confirm.mock.calls).toEqual([[S.closeConfirm], [S.closeConfirm]]);
    expect(captureDraftStore.persist).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('noema:close-approved'));
  });

  it('asks before risking a draft whose write failed, and closes only when the user accepts', async () => {
    vi.mocked(captureDraftStore.persist).mockImplementation(async () => { state.capture.saveState = 'error'; });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    uninstall = installCheckpointClose();
    requestClose();
    await settle();
    expect(confirm).toHaveBeenCalledWith(S.closeDraftFailed);
    expect(postMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith('noema:close-approved'));
  });

  it('closes an empty draft whose write failed without asking', async () => {
    state.capture.draft.raw = '';
    vi.mocked(captureDraftStore.persist).mockImplementation(async () => { state.capture.saveState = 'error'; });
    const confirm = vi.spyOn(window, 'confirm');
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reports a checkpoint failure as an error and keeps the window open', async () => {
    state.task.draft.pending = { capture_id: 't1', raw: 'x', local_day: '2026-10-10', details: {} };
    vi.mocked(taskDraftStore.persist).mockRejectedValueOnce(new Error('QuotaExceededError'));
    uninstall = installCheckpointClose();
    requestClose();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(S.closeCheckpointFailed, { tone: 'error' }));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('ignores a second close request while the first is still running', async () => {
    let finish: () => void = () => {};
    vi.mocked(captureDraftStore.persist).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    uninstall = installCheckpointClose();
    requestClose();
    requestClose();
    await settle();
    expect(captureDraftStore.persist).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestClose();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
  });
});
```

Create `web/src/shell/preloadError.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../local/drafts', () => ({ captureDraftStore: { persist: vi.fn(async () => {}) } }));
vi.mock('../local/taskDraft', () => ({ taskDraftStore: { persist: vi.fn(async () => {}) } }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { installPreloadErrorHandler } from './preloadError';

let uninstall: () => void = () => {};
const fire = () => {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

afterEach(() => {
  uninstall();
  uninstall = () => {};
  vi.clearAllMocks();
});

describe('installPreloadErrorHandler', () => {
  it('stops the default error, saves both drafts, then offers a reload', async () => {
    uninstall = installPreloadErrorHandler();
    expect(fire().defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(S.updateReady, { action: { label: S.reload, onClick: expect.any(Function) } }));
    expect(vi.mocked(captureDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast).mock.invocationCallOrder[0]);
    expect(vi.mocked(taskDraftStore.persist).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast).mock.invocationCallOrder[0]);
  });

  it('still offers the reload when a draft write fails', async () => {
    vi.mocked(taskDraftStore.persist).mockRejectedValueOnce(new Error('quota'));
    uninstall = installPreloadErrorHandler();
    fire();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  });

  it('stops listening after cleanup', async () => {
    installPreloadErrorHandler()();
    expect(fire().defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast).not.toHaveBeenCalled();
  });
});
```

Create `web/e2e/checkpoint.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { S } from '../src/strings';
import { delayIdbTransactions, failIdbWrite, stubIpc } from './faults';
import { expect, gotoApp, readLocalDb, test } from './fixtures';
import { createNote } from './screenTest';

const requestClose = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event('noema:checkpoint-close')); });
const ipcMessages = (page: Page) => page.evaluate(() => (window as unknown as { __ipcMessages?: string[] }).__ipcMessages ?? []);
const editor = (page: Page) => page.getByLabel('Rough learning note');

test.describe('Close checkpoint', () => {
  test('The checkpoint saves a draft typed just before closing', async ({ page, noema }) => {
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    expect(await page.evaluate(() => window.__noemaCheckpointCloseReady)).toBe(true);
    await editor(page).fill('typed right before closing');
    await requestClose(page);
    await expect.poll(() => ipcMessages(page)).toEqual(['noema:close-approved']);
    expect(((await readLocalDb(page)).draft as { raw: string }).raw).toBe('typed right before closing');
  });

  test('A save in flight keeps the window open', async ({ page, noema }) => {
    await delayIdbTransactions(page, 1500);
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('saving slowly');
    await expect(page.locator('#draft-status')).toHaveText(S.draftSaved);
    await page.getByRole('button', { name: 'Save note' }).click();
    await requestClose(page);
    await expect(page.getByRole('status').filter({ hasText: S.closeSaveInFlight })).toBeVisible();
    expect(await ipcMessages(page)).toEqual([]);
  });

  test('A draft-write failure asks for confirmation', async ({ page, noema }) => {
    await failIdbWrite(page, { store: 'kv', key: 'draft', times: 10, error: 'QuotaExceededError' });
    await stubIpc(page);
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('cannot be stored');
    await expect(page.locator('#draft-status')).toHaveText(S.draftError);
    const declined = page.waitForEvent('dialog').then(async prompt => { expect(prompt.message()).toBe(S.closeDraftFailed); await prompt.dismiss(); });
    await requestClose(page);
    await declined;
    await page.waitForTimeout(200);
    expect(await ipcMessages(page)).toEqual([]);
    await expect(editor(page)).toHaveValue('cannot be stored');
    const accepted = page.waitForEvent('dialog').then(prompt => prompt.accept());
    await requestClose(page);
    await accepted;
    await expect.poll(() => ipcMessages(page)).toEqual(['noema:close-approved']);
  });

  test('An unsaved note edit asks before closing; declining keeps the edit', async ({ page, noema }) => {
    const note = await createNote(noema, 'note under edit');
    await stubIpc(page);
    await gotoApp(page, noema, `#/note/${note.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note', { exact: true }).fill('half-finished edit');
    const declined = page.waitForEvent('dialog').then(async prompt => { expect(prompt.message()).toBe(S.closeConfirm); await prompt.dismiss(); });
    await requestClose(page);
    await declined;
    await page.waitForTimeout(200);
    expect(await ipcMessages(page)).toEqual([]);
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('half-finished edit');
  });

  test('An ordinary browser never marks itself ready for the desktop close', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    expect(await page.evaluate(() => window.__noemaCheckpointCloseReady)).toBeUndefined();
  });

  test('A failed chunk load after an update saves the draft, then offers Reload', async ({ page, noema }) => {
    await gotoApp(page, noema, '#/capture');
    await editor(page).fill('kept across the update');
    await page.evaluate(() => { window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })); });
    const offer = page.getByRole('status').filter({ hasText: S.updateReady });
    await expect(offer).toBeVisible();
    await expect(offer.getByRole('button', { name: S.reload })).toBeVisible();
    expect(((await readLocalDb(page)).draft as { raw: string }).raw).toBe('kept across the update');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/shell/checkpoint.test.ts src/shell/preloadError.test.ts`
Expected: FAIL with `Failed to resolve import "./checkpoint" from "src/shell/checkpoint.test.ts"` and `Failed to resolve import "./preloadError" from "src/shell/preloadError.test.ts"`.

Run: `npm --prefix web run e2e -- e2e/checkpoint.spec.ts` (no rebuild here: `web/dist` is still the build from Task 13, and `tsc --noEmit` inside `npm run build` would stop first on the not-yet-created `./checkpoint` import of the new unit test)
Expected: FAIL — "The checkpoint saves a draft typed just before closing" reports `expect(received).toBe(expected)` with `Received: undefined` for `window.__noemaCheckpointCloseReady`, and "A failed chunk load after an update saves the draft, then offers Reload" never sees the `S.updateReady` status (nothing listens yet). "An ordinary browser never marks itself ready for the desktop close" already passes.

- [ ] **Step 3: Minimal implementation**

Create `web/src/shell/checkpoint.ts`:

```ts
import { CHECKPOINT_CLOSE, CLOSE_APPROVED } from '../events';
import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { isGuardActive } from '../routes/guards';
import { S } from '../strings';
import { toast } from '../ui/Toast';

// Page side of the desktop close contract (app.js:598-614, spec §6.3). Ordinary browsers have no bridge and ignore the request.
export function installCheckpointClose(): () => void {
  const ipc = window.ipc;
  if (typeof ipc?.postMessage !== 'function') return () => {};
  let closing = false;

  async function checkpoint(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      if (captureDraftStore.getSnapshot().saving) {
        toast(S.closeSaveInFlight);
        return;
      }
      if ((isGuardActive('recording') || isGuardActive('note-edit')) && !window.confirm(S.closeConfirm)) return;
      await captureDraftStore.persist();
      const { draft, saveState } = captureDraftStore.getSnapshot();
      if (saveState !== 'saved' && (draft.raw || draft.files.length) && !window.confirm(S.closeDraftFailed)) return;
      const task = taskDraftStore.getSnapshot().draft;
      if (task.raw || task.pending) await taskDraftStore.persist();
      ipc!.postMessage(CLOSE_APPROVED);
    } catch {
      toast(S.closeCheckpointFailed, { tone: 'error' });
    } finally {
      closing = false;
    }
  }

  const listener = () => { void checkpoint(); };
  window.addEventListener(CHECKPOINT_CLOSE, listener);
  window.__noemaCheckpointCloseReady = true;   // only after the listener exists (spec §6.3)
  return () => {
    window.removeEventListener(CHECKPOINT_CLOSE, listener);
    delete window.__noemaCheckpointCloseReady;
  };
}
```

Create `web/src/shell/preloadError.ts`:

```ts
import { captureDraftStore } from '../local/drafts';
import { taskDraftStore } from '../local/taskDraft';
import { S } from '../strings';
import { toast } from '../ui/Toast';

// A lazily loaded chunk from the previous build is gone (spec §6.2): keep the drafts, then let the user choose when to reload.
export function installPreloadErrorHandler(): () => void {
  const listener = (event: Event) => {
    event.preventDefault();
    void Promise.allSettled([captureDraftStore.persist(), taskDraftStore.persist()]).then(() => {
      toast(S.updateReady, { action: { label: S.reload, onClick: () => location.reload() } });
    });
  };
  window.addEventListener('vite:preloadError', listener);
  return () => window.removeEventListener('vite:preloadError', listener);
}
```

In `web/src/main.tsx`, after the line `import { createAppRouter, openModalLink } from './routes/router';` add:

```tsx
import { installCheckpointClose } from './shell/checkpoint';
import { installPreloadErrorHandler } from './shell/preloadError';
```

and after the line `  installRefetchTriggers(qc);` (it runs after both draft stores have loaded, contract §6.6 step 4) add:

```tsx
  installPreloadErrorHandler();
  installCheckpointClose();
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npm --prefix web test -- src/shell/checkpoint.test.ts src/shell/preloadError.test.ts`
Expected: PASS (10 checkpoint tests, 3 preload-error tests).

- [ ] **Step 5: Run the E2E test to verify it passes**

Run: `npm --prefix web run build && npm --prefix web run e2e -- e2e/checkpoint.spec.ts && npm --prefix web test`
Expected: PASS (6 E2E tests; every unit test green).

- [ ] **Step 6: Commit**

```bash
git add web/src/shell/checkpoint.ts web/src/shell/checkpoint.test.ts web/src/shell/preloadError.ts web/src/shell/preloadError.test.ts web/src/main.tsx web/e2e/checkpoint.spec.ts
git commit -m "feat(web): page-side close checkpoint and update reload offer"
```

---

### Task 15: Handbook trace rows, parity targets and the phase gate

Spec §4.7 "Traceability". `01-foundation.md` Task 1 already wrote one `handbook-trace.md` row per §4.7 bullet with binding test titles, and already names this plan and its task numbers in the 16 rows this phase owns (R1, R3–R5, R9, U6, U10–U19), with U10–U12 pointing at `capture.spec.ts`/`notes.spec.ts` and U19 including the related-task, desktop folder pane and phone selector tests. This task points the six parity rows whose tests live in `capture.spec.ts` at that file, and then proves every title this phase owns exists verbatim. Status stays `planned` (only P6 changes it); no title is renamed.

**Files:**
- Read only: `docs/superpowers/specs/handbook-trace.md` (rows R1, R3–R5, R9, U6, U10–U19 are verified, not edited)
- Modify: `docs/superpowers/specs/parity-map.md` (Section A rows 63, 67, 74, 75, 76, 83: Target file column only)
- Scratch only (never committed): `${TMPDIR:-/tmp}/noema-p2b/trace.py`, `${TMPDIR:-/tmp}/noema-p2b/titles.py`

**Interfaces:**
- Consumes: the test titles written in Tasks 5–14; the row formats of `01-foundation.md` Task 1 (`| ID | bullet | Handbook | Owning plan task | Test (file › title) | Status |` and `| # | Source | Label | Phase | Target | Status |`).
- Produces: parity rows whose Target file is where the test now lives; a passing title check over the 16 trace rows that name `03-screens-capture-notes.md`.

- [ ] **Step 1: Write the row-update script (scratch)**

```bash
mkdir -p "${TMPDIR:-/tmp}/noema-p2b"
cat > "${TMPDIR:-/tmp}/noema-p2b/trace.py" <<'EOF'
"""Target-file updates for Phase 2b; every replaced cell must exist exactly once."""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
P = '03-screens-capture-notes.md'

def update(path, row_id, old, new):
    text = path.read_text()
    # Section B of parity-map.md reuses small row numbers, so a row is matched by its id AND the cell being replaced.
    rows = [line for line in text.splitlines() if line.startswith(f'| {row_id} |') and old in line]
    assert len(rows) == 1 and rows[0].count(old) == 1, (path.name, row_id, old, len(rows))
    assert text.count(rows[0]) == 1, (path.name, row_id)
    path.write_text(text.replace(rows[0], rows[0].replace(old, new)))

parity = root / 'docs/superpowers/specs/parity-map.md'
for row_id, old in ((63, 'offline'), (67, 'layout'), (74, 'offline'), (75, 'offline'), (76, 'offline'), (83, 'layout')):
    update(parity, str(row_id), f'| web/e2e/{old}.spec.ts |', '| web/e2e/capture.spec.ts |')
print('updated')
EOF
```

- [ ] **Step 2: Write the title check (scratch) and run it to verify it fails**

```bash
cat > "${TMPDIR:-/tmp}/noema-p2b/titles.py" <<'EOF'
"""Every parity label and trace title this phase owns must be a test title, verbatim (01-foundation.md Task 1 rule)."""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
P = '03-screens-capture-notes.md'
mine = {f'web/e2e/{name}.spec.ts' for name in ('capture', 'notes', 'settings', 'outbox', 'checkpoint')}
moved = {'63', '67', '74', '75', '76', '83'}
source = {path: (root / path).read_text() if (root / path).exists() else '' for path in mine}
problems = []
for line in (root / 'docs/superpowers/specs/parity-map.md').read_text().splitlines():
    cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
    if len(cells) != 6:
        continue
    if cells[0] in moved and cells[4] not in mine:
        problems.append(f'parity row {cells[0]} still targets {cells[4]}')
    if cells[4] in mine and f"test('{cells[2]}'" not in source[cells[4]]:
        problems.append(f'parity row {cells[0]}: no test titled {cells[2]!r} in {cells[4]}')
owned = 0
for line in (root / 'docs/superpowers/specs/handbook-trace.md').read_text().splitlines():
    if P not in line:
        continue
    owned += 1
    current = ''
    for path, title in re.findall(r'(?:`([^`]+)` › )?"([^"]+)"', line):
        current = path or current
        if current in mine and f"test('{title}'" not in source[current]:
            problems.append(f'trace row {line.split("|")[1].strip()}: no test titled {title!r} in {current}')
if owned != 16:
    problems.append(f'{owned} of 16 trace rows name {P}')
print(*problems, f'{len(problems)} problems', sep='\n')
sys.exit(1 if problems else 0)
EOF
.venv/bin/python "${TMPDIR:-/tmp}/noema-p2b/titles.py" .
```
Expected: FAIL (exit 1), printing six `parity row … still targets web/e2e/offline.spec.ts` / `layout.spec.ts` lines and `6 problems`. Any `trace row …` or `… of 16 trace rows` line means a test title or the `01-foundation.md` Task 1 trace table drifted: make the test title match the trace row verbatim.

- [ ] **Step 3: Apply the row updates**

Run: `.venv/bin/python "${TMPDIR:-/tmp}/noema-p2b/trace.py" .`
Expected: prints `updated` (any `AssertionError` names the row whose text differs from `01-foundation.md` Task 1; fix that row by hand to the same new value and rerun).

- [ ] **Step 4: Run the title check to verify it passes**

Run: `.venv/bin/python "${TMPDIR:-/tmp}/noema-p2b/titles.py" .`
Expected: `0 problems`, exit 0 (every parity label targeting `capture.spec.ts`, `notes.spec.ts`, `settings.spec.ts` or `outbox.spec.ts` — rows 64, 77, 78, 85, 86 included — and every title in trace rows R1, R3–R5, R9, U6, U10–U19, is a test title verbatim).

- [ ] **Step 5: Run the full phase gate**

Run: `cd /home/p4nic/code/noema && npm --prefix web ci && npm --prefix web run build && npm --prefix web test && npm --prefix web run e2e && .venv/bin/python -m pytest` (the web gate, contract §0)
Expected: every command exits 0 (all Python tests, the production build with hashed assets, every Vitest file, every Playwright spec including `capture.spec.ts`, `outbox.spec.ts`, `notes.spec.ts`, `settings.spec.ts` and `checkpoint.spec.ts`).

- [ ] **Step 6: Verify no forbidden patterns entered `web/src`**

Run: `grep -rn "dangerouslySetInnerHTML\|from 'zod'" web/src --include=*.tsx --include=*.ts | grep -v "^web/src/zod.ts:" ; test $? -eq 1 && echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/parity-map.md
git commit -m "docs: point Capture parity rows at their tests"
```

---

## Spec coverage

| Spec requirement in scope | Task |
|---|---|
| §5 Capture: text | 5 |
| §5 Capture: task link | 5 |
| §5 Capture: images/audio with §4.4 limits (12 files, 32 MB each, < 60 MB total, MIME allowlist, picker `accept`, one toast per rejection) | 2, 5 |
| §5 Capture: sketch (DPR canvas, 12-step undo, `sketch.png`) | 6 |
| §5 Capture: MediaRecorder (webm/opus → webm → ogg/opus → mp4; 64 kbps; 1 s chunks; pause/resume; auto-stop over 30 MB) | 3, 7 |
| §5 Outbox dialog: Retry, Open a copy (new id; confirm before replacing a non-empty draft), Discard (confirm); malformed records Discard-only | 8 |
| §8 E2E Upgrade: an old-shape outbox item and drafts in `noema-local-v1`; the item uploads exactly once with its original id | 8 |
| §5 Notes: search (300 ms debounce, local fallback), folders, recent | 10 |
| §5 Note view: Note/Original/History | 11, 12 |
| §5 Note view: edit with `expected_version` + 409 conflict, never overwrite | 11 |
| §5 Note view: restore | 12 |
| §5 Note view: apply suggestion ("Nothing was overwritten") | 11 |
| §5 Note view: organize, transcribe | 11 |
| §5 Note view: attachments (`GET /api/attachments/{id}` as `src`) | 11 |
| §5 Note view: client-side Markdown export; rendering escapes all HTML | 9, 11, 12 |
| §4.6 Attachments are Blobs; object URLs revoked on unmount | 2, 11 (`downloadText`) |
| §4.6 Markdown escapes all HTML; no `dangerouslySetInnerHTML` with user content | 9, 15 (grep gate) |
| §5 Settings: observation, motion | 13 |
| §5 Settings: companion mode/size 24–72 for the Python helper | 13 |
| §5 Settings: context rules | 13 |
| §5 Settings: tokens shown once | 13 |
| §5 Settings: export link | 13 |
| §4.7 Greeting backend: `SettingsInput.display_name` (strip, max 60), `DEFAULT_SETTINGS['display_name']=''`, `tests/test_core.py` | 1 (verifies `01-foundation.md` Task 7) |
| §4.7 Greeting: `display_name` edited in Settings; greeting and avatar follow it | 13 |
| §4.3 Refetches never replace in-progress input (Capture, NoteView edit, Settings) | 5, 11, 13 |
| §4.3 No automatic mutation retries; every edit carries `expected_version`; 409 → conflict prompt | 4, 11, 12 |
| §4.4 Labels/toasts verbatim; "Saved to {folder}" only after server ack (P2 flush) | 5, 7, 13 (verbatim `app.js` strings) |
| §4.5 Guard: recording blocks leaving Capture with the existing toast | 7 |
| §4.5 Guard: save in flight → "Finishing the local save." | 5 |
| §4.5 Guard: unsaved note edit asks for confirmation | 11 |
| §4.5 `beforeunload` while recording, saving, editing a note | 5 (guard flag), 7, 11 |
| §4.5 Ctrl/Cmd+Enter submits Capture; plain Enter inserts a newline; IME respected | 5 |
| §4.7 Capture: no title/folder field, compact toolbar, one Save note | 5, 7 |
| §4.7 Capture: recording control area with elapsed time + Pause/Resume + Stop | 7 |
| §4.7 Capture: paused visibly distinct | 7 |
| §4.7 Capture: visual tray usable while recording | 7 |
| §4.7 Capture: no live organized preview | 5 |
| §4.7 After Save: quiet confirmation with title + folder, Open note, Change folder (PUT with `expected_version`, only after server ack; queued state stated otherwise) | 4, 5 |
| §4.7 Storage states: distinct labels | 4, 5 |
| §4.7 Sketch: pen, eraser, undo, simple text tool | 6 |
| §4.7 Notes: search + recent default entrance | 10 |
| §4.7 Notes: folder pane desktop / selector phone / collapsible tablet pane; portrait → phone column | 10 |
| §4.7 Notes: Original and History nearby (tabs) | 11, 12 |
| §4.7 Notes: related task is a small optional link | 5, 11 |
| §4.7 Product rules: a capture never creates a task; explicit Save boundary; originals immutable; late model result is a suggestion; capture disabled by default (mic only after Record, observation off) | 5, 7, 11, 13 |
| §4.7 Accessibility: touch targets ≥ 44×44 at phone widths; status not by colour alone (paused = text + dashed border) | 5, 7, 10, 11 |
| §4.7 Traceability rows in `handbook-trace.md` | 15 |
| §6.2 `vite:preloadError`: save drafts, then offer a reload | 14 |
| §6.3 Close contract, page side: refuse during save, confirm while recording/editing, save both drafts, confirm on draft-write failure, post `noema:close-approved`, ready flag after the listener | 14 |
| §8 E2E Refetch: an edit in progress survives a snapshot refetch | 5, 11, 13 |
| §8 E2E Navigation guards: a save in flight blocks navigation | 5 |
| §8 Parity ports, `qa/browser_check.py` rows 59–63, 65, 67 (text + image commit; note edit revision; Original tab; history restore; offline queue; untrusted HTML; phone capture overflow) | 5, 11, 12 |
| §8 Parity ports, `qa/native_storage_check.py` rows 72–76, 79, 80, 82–84, 88, 89 | 5 |
| §8 Parity ports, reconnect and lost acknowledgement: `qa/browser_check.py` row 64, `qa/native_storage_check.py` rows 77, 78, 85, 86 (`outbox.spec.ts`, the parity-map target) | `01-foundation.md` Task 19 (rerun in 8, 15) |
| §8 Parity ports, `qa/settings_link_check.py` rows 123–129; `qa/now_ui_check.py` rows 99, 109, 111; `qa/task_capture_check.py` row 155; `experiments/ui-ab/scripts/verify.py` rows 50, 52 | 5, 11, 13 |
| Parity rows owned elsewhere: 70 (service worker → P1 `sw.spec.ts`), 71, 81, 90 (P2 unit tests), 66, 68, 101 (Overview phone/tablet overflow and contrast → Phase 2a `layout.spec.ts`), 87 (priority/focus/reminder after restart → Phase 2a `now.spec.ts`) | — |

Deliberately skipped (ponytail): no Firefox project; no browser companion preview or `#companion-launch` (removed by spec §1/§5); no `offline.spec.ts`/`layout.spec.ts`/`guards.spec.ts`/`refetch.spec.ts` from this phase (their rows that concern these screens live in `capture.spec.ts`, `notes.spec.ts` and `settings.spec.ts`, and Task 15 retargets the six parity rows, so this phase never collides with Phase 2a on those shared file names); no nested inline Markdown (`app.js` has none either).
