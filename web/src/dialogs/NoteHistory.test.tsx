// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithClient, stubFetch } from '../test/harness';
import { makeNote } from '../test/fixtures';
import { polyfillDialog } from '../ui/testing';
import { NoteHistoryDialog } from './NoteHistory';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const revision = (version: number) => ({ id: version, note_id: 'n1', version, title: `T${version}`, body: `B${version}`, folder: 'Inbox', source: 'edit', created_at: '2026-01-01T00:00:00Z' });

describe('NoteHistoryDialog', () => {
  it('after a 409 restore it refetches the note so a second Restore uses the fresh version', async () => {
    let version = 2;
    const calls = stubFetch(call => {
      if (call.url === '/api/notes/n1' && call.method === 'GET') return jsonResponse(200, makeNote('n1', { version }));
      if (call.url === '/api/notes/n1/history') return jsonResponse(200, [revision(2), revision(1)]);
      if (call.url === '/api/notes/n1/restore/1') {
        const expected = (call.body as { expected_version: number }).expected_version;
        return expected === 3 ? jsonResponse(200, makeNote('n1', { version: 4 })) : jsonResponse(409, { detail: 'This note changed' });
      }
      return undefined;
    });
    renderWithClient(<NoteHistoryDialog noteId="n1" onClose={() => {}} />);
    const restore = await screen.findByRole('button', { name: 'Restore as a new revision' });
    version = 3;   // another device saved meanwhile
    fireEvent.click(restore);
    expect((await screen.findByRole('alert')).textContent).toBe('This note changed');
    await waitFor(() => expect(calls.filter(call => call.url === '/api/notes/n1' && call.method === 'GET').length).toBe(2));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restore as a new revision' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore as a new revision' })[1]);
    await waitFor(() => expect(calls.filter(call => call.url === '/api/notes/n1/restore/1').map(call => (call.body as { expected_version: number }).expected_version)).toEqual([2, 3]));
  });
});
