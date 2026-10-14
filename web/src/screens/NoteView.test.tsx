// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ id: 'n1' }), Link: ({ children }: { children: unknown }) => <a href="#x">{children as never}</a> }));
vi.mock('../routes/guards', () => ({ useNavigationGuard: vi.fn() }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../shell/OfflineNotice', () => ({ OfflineNotice: () => null }));

import { jsonResponse, renderWithClient, stubFetch } from '../test/harness';
import { makeNote } from '../test/fixtures';
import { NoteViewScreen } from './NoteView';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const suggestion = { id: 's1', note_id: 'n1', title: 'T', body: 'AI text', folder: 'Inbox', created_at: '2026-01-01T00:00:00Z' };

function render(pendingPut: boolean) {
  const calls = stubFetch(call => (call.url === '/api/notes/n1' && call.method === 'GET'
    ? jsonResponse(200, makeNote('n1', { title: 'Hello', body: 'Body', raw: 'raw', suggestions: [suggestion] }))
    : undefined));
  if (pendingPut) {
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'PUT' ? new Promise<Response>(() => {}) : inner(input, init)));
  }
  renderWithClient(<NoteViewScreen />);
  return calls;
}

describe('NoteViewScreen edit guards', () => {
  it('disables the Note/Original tabs while a save is pending', async () => {
    render(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Note' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Original' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Use this version while editing', async () => {
    render(false);
    const use = await screen.findByRole('button', { name: 'Use this version' });
    expect((use as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByRole('button', { name: 'Use this version' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
