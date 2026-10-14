// web/src/shell/StatusLine.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot, makeTask } from '../test/fixtures';

vi.mock('../state/queries', () => ({ useSnapshot: vi.fn() }));
vi.mock('../domain/connection', () => ({ useConnected: vi.fn() }));
vi.mock('../local/outbox', () => ({ useOutboxCount: vi.fn() }));
vi.mock('../local/drafts', () => ({ useCaptureDraft: vi.fn() }));
vi.mock('./dialogs', () => ({ openDialog: vi.fn() }));

import { useConnected } from '../domain/connection';
import { useCaptureDraft } from '../local/drafts';
import { useOutboxCount } from '../local/outbox';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { openDialog } from './dialogs';
import { OfflineNotice } from './OfflineNotice';
import { StatusLine } from './StatusLine';

function given({ connected, snapshot = null, outbox = 0, saveState = 'saved' }: {
  connected: boolean; snapshot?: ReturnType<typeof makeSnapshot> | null; outbox?: number; saveState?: 'memory' | 'pending' | 'saved' | 'error';
}) {
  vi.mocked(useConnected).mockReturnValue(connected);
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot ?? undefined } as unknown as ReturnType<typeof useSnapshot>);
  vi.mocked(useOutboxCount).mockReturnValue(outbox);
  vi.mocked(useCaptureDraft).mockReturnValue({ saveState } as unknown as ReturnType<typeof useCaptureDraft>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('StatusLine', () => {
  it('labels the connection in words, not colour alone', () => {
    given({ connected: true, snapshot: makeSnapshot() });
    render(<StatusLine />);
    expect(document.querySelector('#connection-label')!.textContent).toBe(S.connected);
    cleanup();
    given({ connected: false, snapshot: makeSnapshot() });
    render(<StatusLine />);
    expect(document.querySelector('#connection-label')!.textContent).toBe(S.offline);
  });

  it('shows the integration summary from the snapshot', () => {
    const snapshot = makeSnapshot({ tasks: [makeTask('t')] });
    given({ connected: true, snapshot });
    render(<StatusLine />);
    expect(screen.getByText(S.statusSummary(snapshot, true))).toBeTruthy();
  });

  it('shows the queued-capture indicator only when the outbox has items and opens Outbox', () => {
    given({ connected: true, snapshot: makeSnapshot(), outbox: 0 });
    render(<StatusLine />);
    expect(screen.queryByRole('button', { name: S.outboxCount(1) })).toBeNull();
    cleanup();
    given({ connected: true, snapshot: makeSnapshot(), outbox: 2 });
    render(<StatusLine />);
    fireEvent.click(screen.getByRole('button', { name: '2 captures on this device' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'outbox' });
  });

  it('keeps queued, draft and saved-on-server labels distinct in the shell (handbook §20)', () => {
    given({ connected: true, snapshot: makeSnapshot(), outbox: 1 });
    render(<StatusLine />);
    const queued = screen.getByRole('button', { name: S.outboxCount(1) }).textContent;
    expect(queued).toBe('1 capture on this device');
    for (const other of [S.draftSaved, S.draftMemory, S.draftPending, S.savedTo('Inbox', ''), S.connected]) expect(queued).not.toBe(other);
    expect(queued).not.toMatch(/saved|uploaded|server/i);
  });
});

describe('OfflineNotice', () => {
  it('renders nothing while connected', () => {
    given({ connected: true, snapshot: makeSnapshot() });
    const { container } = render(<OfflineNotice />);
    expect(container.textContent).toBe('');
  });

  it.each([
    [true, 'saved', true, false], [false, 'saved', false, false], [true, 'error', true, true],
  ] as const)('offline with snapshot=%s, draft=%s uses offlineBanner(%s, %s)', (hasSnapshot, saveState, a, b) => {
    given({ connected: false, snapshot: hasSnapshot ? makeSnapshot() : null, saveState });
    render(<OfflineNotice />);
    expect(screen.getByRole('status').textContent).toBe(S.offlineBanner(a, b));
  });

  it('treats a snapshot without server_time as no snapshot', () => {
    given({ connected: false, snapshot: makeSnapshot({ server_time: '' }) });
    render(<OfflineNotice />);
    expect(screen.getByRole('status').textContent).toBe(S.offlineBanner(false, false));
  });
});
