// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', async importOriginal => ({ ...(await importOriginal<typeof import('../ui/Toast')>()), toast: vi.fn() }));
const r = vi.hoisted(() => ({ canGoBack: true, back: vi.fn(), navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useCanGoBack: () => r.canGoBack, useRouter: () => ({ history: { back: r.back }, navigate: r.navigate }) }));
vi.mock('../domain/connection', () => ({ useConnected: () => true }));

import type { Settings, Snapshot } from '../api/schemas';
import { queryKeys } from '../state/queries';
import { S } from '../strings';
import { jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { makeSnapshot, makeTask } from '../test/fixtures';
import { toast } from '../ui/Toast';
import { closeDialog, isDialogOpen, openDialog } from '../shell/dialogs';
import { polyfillDialog } from '../ui/testing';
import { SETTINGS_TEXT, SettingsScreen } from './Settings';

let snapshot: Snapshot;
let patchStatus: number;
let stateStatus: number;
let calls: StubCall[];
let tokenList: { id: string; name: string; scope: 'agent' | 'observer'; created_at: string }[] = [];

beforeAll(polyfillDialog);

beforeEach(() => {
  snapshot = makeSnapshot({ tasks: [makeTask('t1', { title: 'Two Sum' })] });
  snapshot = { ...snapshot, settings: { ...snapshot.settings, display_name: 'Ada' } };
  patchStatus = 200;
  tokenList = [];
  stateStatus = 200;
  calls = stubFetch(call => {
    if (call.url === '/api/ai') return jsonResponse(200, { configured: false, key_hint: '', from_env: false, enabled: false, model: 'openrouter/free', audio_model: 'thinkingmachines/inkling-small:free' });
    if (call.url === '/api/agent-connections') return jsonResponse(200, { connections: [{ provider: 'codex', name: 'Codex', installed: true, last_seen: null }, { provider: 'claude', name: 'Claude Code', installed: false, last_seen: null }] });
    if (call.url.startsWith('/api/state')) return stateStatus === 200 ? jsonResponse(200, snapshot) : jsonResponse(stateStatus, { detail: 'Service unavailable' });
    if (call.url === '/api/settings' && call.method === 'PATCH') {
      return patchStatus === 200
        ? jsonResponse(200, { ...snapshot.settings, ...(call.body as Partial<Settings>) })
        : jsonResponse(patchStatus, { detail: 'Settings storage failed' });
    }
    if (call.url === '/api/tokens' && call.method === 'GET') return jsonResponse(200, tokenList);
    if (call.url.startsWith('/api/tokens/') && call.method === 'DELETE') return jsonResponse(500, { detail: 'Revoke failed' });
    if (call.url === '/api/tokens' && call.method === 'POST') {
      const body = call.body as { scope: 'agent' | 'observer'; task_ids: string[] };
      return jsonResponse(201, { id: 'tok1', token: 'secret-token-value-0123456789', scope: body.scope, task_ids: body.task_ids });
    }
    return undefined;
  });
});

afterEach(() => {
  cleanup();
  act(() => closeDialog());
  r.canGoBack = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const seed = (data: Snapshot | null) => (queryClient: QueryClient) => {
  if (data) queryClient.setQueryData(queryKeys.snapshot(null), data);
};
const patches = () => calls.filter(call => call.method === 'PATCH').map(call => call.body);

const openTokens = () => { const details = screen.getByText('Advanced: agent & observer tokens').closest('details')!; details.open = true; fireEvent(details, new Event('toggle')); };
const switchFor = (name: string) => screen.getByRole('switch', { name });

describe('SettingsScreen', () => {
  it('copies display_name into the form on open and saves it stripped', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    const input = screen.getByLabelText('Your name') as HTMLInputElement;
    expect(input.value).toBe('Ada');
    expect(input.maxLength).toBe(60);
    fireEvent.change(input, { target: { value: '  Grace  ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(patches()).toEqual([{ display_name: 'Grace' }]));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(SETTINGS_TEXT.nameSaved));
    expect(input.value).toBe('Grace');
    fireEvent.submit(input.closest('form')!);
    fireEvent.blur(input);
    await act(async () => {});
    expect(patches()).toHaveLength(1);
  });

  it('a snapshot refetch never replaces the name being typed', () => {
    const { queryClient } = renderWithClient(<SettingsScreen />, seed(snapshot));
    const input = screen.getByLabelText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft name' } });
    act(() => {
      queryClient.setQueryData(queryKeys.snapshot(null), { ...snapshot, settings: { ...snapshot.settings, display_name: 'Server name', motion: true } });
    });
    expect(input.value).toBe('Draft name');
    expect(switchFor('Background motion').getAttribute('aria-checked')).toBe('false');
  });

  it('toggles observation through one PATCH and reverts it when the server refuses', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    const box = switchFor('Use window context');
    expect(box.getAttribute('aria-checked')).toBe('false');
    patchStatus = 500;
    fireEvent.click(box);
    expect(await screen.findByText('Settings storage failed')).toBeTruthy();
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(patches()).toEqual([{ observation_enabled: true }]);
    patchStatus = 200;
    fireEvent.click(box);
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(box.getAttribute('aria-checked')).toBe('true');
  });

  it('sends the companion mode and the size (24–72) the Sway helper reads', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.click(within(screen.getByRole('group', { name: 'Companion' })).getByRole('button', { name: 'Dot' }));
    const size = screen.getByLabelText('Companion size') as HTMLInputElement;
    expect(size.min).toBe('24');
    expect(size.max).toBe('72');
    fireEvent.change(size, { target: { value: '56' } });
    await waitFor(() => expect(patches()).toEqual([{ companion: 'dot' }, { companion_size: 56 }]));
  });

  it('shows a created token once and keeps it nowhere else', async () => {
    const { queryClient, unmount } = renderWithClient(<SettingsScreen />, seed(snapshot));
    openTokens();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '  Local agent ' } });
    const create = screen.getByRole('button', { name: 'Create token' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText('Choose at least one task for an agent token')).toBeTruthy();
    const tasks = screen.getByLabelText('Allowed tasks · agent tokens') as HTMLSelectElement;
    tasks.options[0].selected = true;
    fireEvent.change(tasks);
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(await screen.findByText('secret-token-value-0123456789')).toBeTruthy();
    expect(screen.getByText(SETTINGS_TEXT.tokenOnce)).toBeTruthy();
    expect(calls.find(call => call.method === 'POST' && call.url === '/api/tokens')?.body).toEqual({ name: 'Local agent', scope: 'agent', task_ids: ['t1'] });
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map(mutation => mutation.state.data ?? null))).not.toContain('secret-token-value');
    unmount();
    renderWithClient(<SettingsScreen />, seed(snapshot));
    openTokens();
    await waitFor(() => expect(calls.filter(call => call.url === '/api/tokens' && call.method === 'GET').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('secret-token-value-0123456789')).toBeNull();
  });

  it('a failing revoke shows its own error with the default (agent, no task) form state', async () => {
    tokenList = [{ id: 'tok9', name: 'Old agent', scope: 'agent', created_at: '2026-01-01T00:00:00Z' }];
    renderWithClient(<SettingsScreen />, seed(snapshot));
    openTokens();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Revoke failed');
    expect(screen.getByText('Choose at least one task for an agent token')).toBeTruthy();
  });

  it('loads tokens only when the tokens section is open', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    await act(async () => {});
    expect(calls.some(call => call.url === '/api/tokens')).toBe(false);
  });

  it('reports when notifications are unavailable in this browser', () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.click(switchFor('Desktop notifications'));
    expect(toast).toHaveBeenCalledWith(S.notificationsUnsupported);
  });

  it('without a snapshot it shows no setting inputs', () => {
    stateStatus = 503;
    renderWithClient(<SettingsScreen />, seed(null));
    expect(screen.getByText(SETTINGS_TEXT.offline)).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Use window context' })).toBeNull();
  });

  it('switches the theme with one PATCH and shows the choice', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    const group = screen.getByRole('group', { name: 'Appearance' });
    expect(within(group).getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'Dark' }));
    fireEvent.click(within(group).getByRole('button', { name: 'System' }));
    await waitFor(() => expect(patches()).toEqual([{ theme: 'system' }]));
    expect(within(group).getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('flips motion through the switch', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.click(switchFor('Background motion'));
    await waitFor(() => expect(patches()).toEqual([{ motion: true }]));
  });

  it('summarises status from the server and agent connections', async () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    const status = screen.getByRole('region', { name: 'Status' });
    expect(status.textContent).toContain(S.connected);
    expect(await within(status).findByText('Codex')).toBeTruthy();
    expect(status.textContent).toContain('0 notes');
    expect(status.textContent).toContain('Observation paused');
  });

  it('goes back with the Back button or Escape, home when there is no history', () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(r.back).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Your name'), { key: 'Escape' });
    expect(r.back).toHaveBeenCalledTimes(1);
    act(() => openDialog({ kind: 'outbox' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(r.back).toHaveBeenCalledTimes(1);
    act(() => closeDialog());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(r.back).toHaveBeenCalledTimes(2);
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('goes Home when there is no history to go back to', () => {
    r.canGoBack = false;
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(r.navigate).toHaveBeenCalledWith({ to: '/overview' });
    expect(r.back).not.toHaveBeenCalled();
  });

  it('opens the local capture queue', () => {
    renderWithClient(<SettingsScreen />, seed(snapshot));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(isDialogOpen()).toBe(true);
  });
});
