// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, NoteUpdateBody } from '../api/schemas';
import { queryKeys } from '../state/queries';
import { S } from '../strings';
import { jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { makeNote } from '../test/fixtures';
import { STORAGE_LABELS, SavedNotice } from './SavedNotice';

const CONFLICT = 'This note changed on another screen. Your draft has not been overwritten. Reload the latest version to compare.';
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
