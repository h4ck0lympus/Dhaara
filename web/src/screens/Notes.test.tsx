// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeNoteSummary, makeSnapshot } from '../test/fixtures';

const h = vi.hoisted(() => ({ search: {} as Record<string, string | undefined>, navigate: vi.fn(), connected: true, results: { data: undefined as unknown, isError: false, isPending: false } }));
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => h.search,
  useNavigate: () => h.navigate,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), useSearch: vi.fn(() => h.results) }));
vi.mock('../domain/connection', () => ({ useConnected: () => h.connected }));
vi.mock('../shell/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('./NoteView', () => ({ EmbeddedNote: ({ id, onBack }: { id: string; onBack: () => void }) => <div><p>Reading {id}</p><button type="button" onClick={onBack}>← All notes</button></div> }));

import { openDialog, closeDialog } from '../shell/dialogs';
import { useSearch, useSnapshot } from '../state/queries';
import { NotesScreen } from './Notes';
import { DEFAULT_PANES, PANES_KEY, RESIZE_STEP } from './notesPanes';

const notes = [
  makeNoteSummary('a', { title: 'Two pointers', folder: 'Algorithms' }),
  makeNoteSummary('b', { title: 'Heap slot', folder: 'CTF' }),
  makeNoteSummary('c', { title: 'Heap grooming', folder: 'CTF' }),
];
function given(search: Record<string, string | undefined> = {}) {
  h.search = search;
  vi.mocked(useSnapshot).mockReturnValue({ data: makeSnapshot({ notes }) } as ReturnType<typeof useSnapshot>);
  return render(<NotesScreen />);
}
const lastSearch = () => { const call = h.navigate.mock.calls.at(-1)![0] as { to: string; search: (prev: object) => object }; expect(call.to).toBe('/notes'); return call.search(h.search); };
const listTitles = () => [...document.querySelectorAll('.note-row-title')].map(n => n.textContent);
const stored = () => JSON.parse(localStorage.getItem(PANES_KEY)!);

beforeEach(() => { h.connected = true; h.results = { data: undefined, isError: false, isPending: false }; localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); act(() => closeDialog()); });

describe('Notes folders and list', () => {
  it('lists folders with counts and filters through the URL', () => {
    given();
    const folders = screen.getByRole('complementary', { name: 'Folders' });
    expect(within(folders).getAllByRole('button', { pressed: false }).map(b => b.textContent)).toEqual(['Algorithms 1', 'CTF 2']);
    expect(within(folders).getByRole('button', { name: 'All notes 3' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(folders).getByRole('button', { name: 'CTF 2' }));
    expect(lastSearch()).toEqual({ folder: 'CTF' });
  });

  it('shows only the chosen folder, keeping the other URL state', () => {
    given({ folder: 'CTF', q: undefined });
    expect(listTitles()).toEqual(['Heap slot', 'Heap grooming']);
    expect(screen.getByRole('region', { name: 'Notes in CTF' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Heap slot/ }));
    expect(lastSearch()).toEqual({ folder: 'CTF', q: undefined, note: 'b' });
  });

  it('opens the selected note in the note pane and closes it with back', async () => {
    given({ note: 'b' });
    expect(await within(screen.getByRole('article', { name: 'Open note' })).findByText('Reading b')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Heap slot/ }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '← All notes' }));
    expect(lastSearch()).toEqual({ note: undefined });
  });

  it('invites choosing a note when none is selected, and offers capture when empty', () => {
    given();
    expect(screen.getByText('Choose a note to read it here.')).toBeTruthy();
    cleanup();
    h.search = {};
    vi.mocked(useSnapshot).mockReturnValue({ data: makeSnapshot() } as ReturnType<typeof useSnapshot>);
    render(<NotesScreen />);
    expect(screen.getByRole('link', { name: 'Capture a thought' }).getAttribute('href')).toBe('/capture');
  });
});

describe('Notes search', () => {
  it('debounces the URL query before asking the server', () => {
    vi.useFakeTimers();
    given({ q: '  heap ' });
    expect(vi.mocked(useSearch)).toHaveBeenLastCalledWith('heap');
    h.results = { data: [notes[2]], isError: false, isPending: false };
    cleanup();
    given({ q: 'heap' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(listTitles()).toEqual(['Heap grooming']);
    expect(screen.getByRole('region', { name: 'Search results' })).toBeTruthy();
  });

  it('falls back to local title and folder matches offline or on error', () => {
    h.connected = false;
    given({ q: 'heap' });
    expect(listTitles()).toEqual(['Heap slot', 'Heap grooming']);
    expect(screen.getByRole('status').textContent).toContain('Server search is unavailable');
    cleanup();
    h.connected = true;
    h.results = { data: undefined, isError: true, isPending: false };
    given({ q: 'algorithms' });
    expect(listTitles()).toEqual(['Two pointers']);
  });

  it('says when nothing matches and while searching', () => {
    h.results = { data: [], isError: false, isPending: false };
    given({ q: 'zzz' });
    expect(screen.getByText('No matching notes.')).toBeTruthy();
    cleanup();
    h.results = { data: undefined, isError: false, isPending: true };
    given({ q: 'zzz' });
    expect(screen.getByText('Searching…')).toBeTruthy();
  });
});

describe('Notes panes', () => {
  it('hides and shows each pane, remembering the choice', () => {
    given({ note: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide folders' }));
    expect(screen.queryByRole('complementary', { name: 'Folders' })).toBeNull();
    expect(stored().folders).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Hide note list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide note' }));
    expect(screen.queryByRole('article', { name: 'Open note' })).toBeNull();
    cleanup();
    given({ note: 'a' });
    expect(screen.queryByRole('complementary', { name: 'Folders' })).toBeNull();
    for (const pane of ['folders', 'note list', 'note']) fireEvent.click(screen.getByRole('button', { name: `Show ${pane}` }));
    expect(stored()).toMatchObject({ folders: true, list: true, note: true });
  });

  it('toggles panes with Ctrl+1/2/3, but not with other modifiers or while a dialog is open', () => {
    given();
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(screen.queryByRole('complementary', { name: 'Folders' })).toBeNull();
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(screen.getByRole('complementary', { name: 'Folders' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '2', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: '2' });
    act(() => openDialog({ kind: 'outbox' }));
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    expect(screen.getByRole('article', { name: 'Open note' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide note list' })).toBeTruthy();
  });

  it('resizes with arrow keys inside the limits and remembers widths', () => {
    given();
    const handle = screen.getByRole('button', { name: 'Resize folders pane (arrow keys)' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(stored().foldersWidth).toBe(DEFAULT_PANES.foldersWidth + RESIZE_STEP);
    for (let i = 0; i < 40; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(stored().foldersWidth).toBe(160);
    expect((screen.getByRole('complementary', { name: 'Folders' }) as HTMLElement).style.width).toBe('160px');
  });

  it('resizes by dragging', () => {
    given();
    const handle = screen.getByRole('button', { name: 'Resize note list pane (arrow keys)' });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 560, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(stored().listWidth).toBe(DEFAULT_PANES.listWidth + 60);
  });
});
