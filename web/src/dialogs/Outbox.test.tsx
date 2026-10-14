// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '../ui/testing';

const h = vi.hoisted(() => ({ navigate: vi.fn(async () => {}), items: [] as unknown[], reload: vi.fn(async () => {}) }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../local/outbox', () => ({ useOutboxItems: () => ({ items: h.items, reload: h.reload }), retryItem: vi.fn(), discardItem: vi.fn(async () => {}) }));
vi.mock('../local/drafts', () => ({ captureDraftStore: { getSnapshot: vi.fn(), replaceWith: vi.fn(async () => {}) } }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));
import { captureDraftStore } from '../local/drafts';
import { discardItem } from '../local/outbox';
import { S } from '../strings';
import { toast } from '../ui/Toast';
import { OutboxDialog } from './Outbox';

const queued = { id: 'q1', raw: 'Queued thought', task_id: '', files: [], error: '' };
const given = (draftRaw: string, saving = false) =>
  vi.mocked(captureDraftStore.getSnapshot).mockReturnValue({ draft: { id: 'd', raw: draftRaw, task_id: '', files: [] }, saving } as unknown as ReturnType<typeof captureDraftStore.getSnapshot>);

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); h.items = []; });

function open(onClose = vi.fn()) {
  h.items = [queued];
  render(<OutboxDialog onClose={onClose} />);
  return onClose;
}

describe('OutboxDialog', () => {
  it('shows the empty state', () => {
    render(<OutboxDialog onClose={vi.fn()} />);
    expect(screen.getByText(S.outboxEmpty)).toBeTruthy();
  });

  it('does nothing but tell the user while the draft is saving', async () => {
    given('', true);
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: S.openCopy }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.finishingLocalSave));
    expect(captureDraftStore.replaceWith).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a non-empty draft when the replace confirmation is declined', async () => {
    given('typing');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: S.openCopy }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(S.confirmReplaceDraft));
    expect(captureDraftStore.replaceWith).not.toHaveBeenCalled();
  });

  it('replaces an empty draft without asking, closes, navigates to Capture and toasts', async () => {
    given('');
    const confirm = vi.spyOn(window, 'confirm');
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: S.openCopy }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S.openedCopy));
    expect(confirm).not.toHaveBeenCalled();
    expect(captureDraftStore.replaceWith).toHaveBeenCalledWith(queued);
    expect(onClose).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith({ to: '/capture' });
  });

  it('discards only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    open();
    fireEvent.click(screen.getByRole('button', { name: S.discard }));
    expect(discardItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: S.discard }));
    await waitFor(() => expect(discardItem).toHaveBeenCalledWith('q1'));
    expect(confirm).toHaveBeenCalledWith(S.confirmDiscard);
  });

  it('lists an unreadable record with Discard only, and one without an id with no buttons', () => {
    h.items = [{ id: 'bad', raw: 42 }, { raw: 1 }];
    render(<OutboxDialog onClose={vi.fn()} />);
    expect(screen.getAllByText(/cannot be read/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: S.discard })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: S.retry })).toBeNull();
  });
});
