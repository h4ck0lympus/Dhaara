// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MergeSuggestion } from '../api/schemas';

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('../state/queries', () => ({ useMergeAction: () => ({ mutateAsync: h.mutateAsync, isPending: false }) }));
vi.mock('../ui/Toast', () => ({ toast: vi.fn(), toastError: vi.fn() }));
import { toast, toastError } from '../ui/Toast';
import { MergeSuggestions } from './MergeSuggestions';

const s = (id: string, note_id: string, target_id: string, state: 'open' | 'merged' = 'open'): MergeSuggestion =>
  ({ id, note_id, target_id, state, reason: 'Both are about GCD records.', updated_at: '', note_title: `Jot ${id}`, target_title: `Target ${id}` });

beforeEach(() => { h.mutateAsync.mockReset().mockResolvedValue({ id: 'x', state: 'merged' }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MergeSuggestions', () => {
  it('shows only open suggestions that touch a visible note', () => {
    render(<MergeSuggestions suggestions={[s('a', 'n1', 't1'), s('b', 'n9', 't9'), s('c', 'n2', 't2', 'merged'), s('d', 'n8', 'n1')]} visibleIds={new Set(['n1', 'n2'])} />);
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Merge suggestion for Jot a', 'Merge suggestion for Jot d']);
    expect(screen.getAllByText('Both are about GCD records.')).toHaveLength(2);
  });

  it('renders nothing when no suggestion applies', () => {
    const { container } = render(<MergeSuggestions suggestions={[s('a', 'n1', 't1')]} visibleIds={new Set(['zz'])} />);
    expect(container.innerHTML).toBe('');
  });

  it('merges with an Undo toast, and Undo reverts', async () => {
    render(<MergeSuggestions suggestions={[s('a', 'n1', 't1')]} visibleIds={new Set(['n1'])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Merged into “Target a”.', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })));
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: 'a', action: 'accept' });
    vi.mocked(toast).mock.calls[0][1]!.action!.onClick();
    await waitFor(() => expect(h.mutateAsync).toHaveBeenLastCalledWith({ id: 'a', action: 'undo' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith('Merge undone.'));
  });

  it('keeps separate, and reports failures', async () => {
    render(<MergeSuggestions suggestions={[s('a', 'n1', 't1')]} visibleIds={new Set(['n1'])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep separate' }));
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: 'a', action: 'dismiss' });
    h.mutateAsync.mockRejectedValueOnce(new Error('changed'));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
