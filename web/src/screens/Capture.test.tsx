// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S } from '../strings';

const { save, connectionGet, addFiles, busy } = vi.hoisted(() => ({ save: vi.fn(), connectionGet: vi.fn(), addFiles: vi.fn(async () => []), busy: { saving: false } }));
vi.mock('../domain/connection', () => ({ connection: { get: connectionGet } }));
vi.mock('../local/drafts', () => ({
  useCaptureDraft: () => ({ draft: { id: 'd1', raw: 'note', files: [], task_id: '' }, saveState: 'saved', saving: false }),
  captureDraftStore: { getSnapshot: () => ({ saving: busy.saving, draft: { id: 'd1' } }), subscribe: () => () => {}, save, addFiles },
}));
vi.mock('../local/db', () => ({ outboxGet: vi.fn(async () => undefined), isOutboxItem: vi.fn(() => false) }));
vi.mock('../local/outbox', () => ({ subscribeOutbox: vi.fn(() => () => {}) }));
vi.mock('../state/queries', () => ({ useSnapshot: () => ({ data: undefined }), runFlush: vi.fn(async () => {}) }));
vi.mock('../routes/guards', () => ({ useNavigationGuard: vi.fn() }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../shell/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('../capture/Attachments', () => ({ Attachments: () => null, toastRejections: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../capture/SavedNotice', () => ({ SavedNotice: () => null }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { toast } from '../ui/Toast';
import { CaptureScreen } from './Capture';

afterEach(() => { cleanup(); vi.clearAllMocks(); busy.saving = false; });

describe('CaptureScreen after-save toast', () => {
  it.each([
    [false, S.captureSavedOffline],
    [true, S.captureSavedSending],
  ])('with connection.get() === %s the toast is %s, read at save time', async (connected, message) => {
    save.mockImplementation(async () => { connectionGet.mockReturnValue(connected); return { ok: true }; });
    render(<CaptureScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Save note/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(message));
  });
});

describe('CaptureScreen drop', () => {
  const dropFile = () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const { container } = render(<CaptureScreen />);
    fireEvent.drop(container.querySelector('.writing-canvas') as Element, { dataTransfer: { files: [file] } });
    return file;
  };

  it('adds a dropped file', () => {
    const file = dropFile();
    expect(addFiles).toHaveBeenCalledWith([file]);
  });

  it('says so instead of silently losing a file dropped while a save is in flight', () => {
    busy.saving = true;
    dropFile();
    expect(addFiles).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(S.finishingLocalSave);
  });
});
