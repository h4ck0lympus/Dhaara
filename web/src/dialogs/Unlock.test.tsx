// web/src/dialogs/Unlock.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { polyfillDialog } from '../ui/testing';

vi.mock('../api/session', () => ({ unlock: vi.fn() }));
vi.mock('../shell/unlock', () => ({ completeUnlock: vi.fn(async () => {}) }));
import { unlock } from '../api/session';
import { completeUnlock } from '../shell/unlock';
import { S } from '../strings';
import { UnlockDialog } from './Unlock';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderUnlock(onClose = vi.fn()) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><UnlockDialog onClose={onClose} /></QueryClientProvider>);
  return { qc, onClose };
}

describe('UnlockDialog', () => {
  it('explains where the token is and focuses the field', () => {
    renderUnlock();
    expect(screen.getByRole('dialog', { name: S.unlockTitle })).toBeTruthy();
    expect(screen.getByText(S.unlockHelp)).toBeTruthy();
    const field = screen.getByLabelText(S.accessToken) as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.autocomplete).toBe('current-password');
    expect(document.activeElement).toBe(field);
  });

  it('shows a wrong token inline and keeps the dialog', async () => {
    vi.mocked(unlock).mockRejectedValueOnce(new ApiError('http', 'Invalid access token', 401));
    renderUnlock();
    fireEvent.change(screen.getByLabelText(S.accessToken), { target: { value: 'wrong-token' } });
    fireEvent.click(screen.getByRole('button', { name: S.unlock }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid access token'));
    expect(completeUnlock).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: S.unlock }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('unlocks with the token, then completes (refresh, flush)', async () => {
    vi.mocked(unlock).mockResolvedValueOnce();
    const { qc } = renderUnlock();
    fireEvent.change(screen.getByLabelText(S.accessToken), { target: { value: 'right-token-0123456789abcdef' } });
    fireEvent.click(screen.getByRole('button', { name: S.unlock }));
    await waitFor(() => expect(completeUnlock).toHaveBeenCalledWith(qc));
    expect(unlock).toHaveBeenCalledWith('right-token-0123456789abcdef');
  });

  it('can be dismissed', () => {
    const { onClose } = renderUnlock();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
