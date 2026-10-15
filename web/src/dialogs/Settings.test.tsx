// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ outbox: 0 }));
vi.mock('../local/outbox', () => ({ useOutboxCount: () => h.outbox }));
vi.mock('../ui/Toast', async importOriginal => ({ ...(await importOriginal<typeof import('../ui/Toast')>()), toast: vi.fn() }));

import type { Settings, Snapshot } from '../api/schemas';
import { queryKeys } from '../state/queries';
import { S } from '../strings';
import { jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { makeSnapshot, makeTask } from '../test/fixtures';
import { toast } from '../ui/Toast';
import { polyfillDialog } from '../ui/testing';
import { SETTINGS_TEXT, SettingsDialog } from './Settings';

let snapshot: Snapshot;
let patchStatus: number;
let stateStatus: number;
let calls: StubCall[];

beforeAll(polyfillDialog);

beforeEach(() => {
  snapshot = makeSnapshot({ tasks: [makeTask('t1', { title: 'Two Sum' })] });
  snapshot = { ...snapshot, settings: { ...snapshot.settings, display_name: 'Ada' } };
  patchStatus = 200;
  h.outbox = 0;
  stateStatus = 200;
  calls = stubFetch(call => {
    if (call.url === '/api/agent-connections') return jsonResponse(200, { connections: [] });
    if (call.url.startsWith('/api/state')) return stateStatus === 200 ? jsonResponse(200, snapshot) : jsonResponse(stateStatus, { detail: 'Service unavailable' });
    if (call.url === '/api/settings' && call.method === 'PATCH') {
      return patchStatus === 200
        ? jsonResponse(200, { ...snapshot.settings, ...(call.body as Partial<Settings>) })
        : jsonResponse(patchStatus, { detail: 'Settings storage failed' });
    }
    return undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const seed = (data: Snapshot | null) => (queryClient: QueryClient) => {
  if (data) queryClient.setQueryData(queryKeys.snapshot(null), data);
};
const patches = () => calls.filter(call => call.method === 'PATCH').map(call => call.body);

describe('SettingsDialog', () => {
  it('copies display_name into the form on open and saves it stripped on Enter, once', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('Ada');
    expect(input.maxLength).toBe(60);
    fireEvent.change(input, { target: { value: '  Grace  ' } });
    fireEvent.submit(input);
    await waitFor(() => expect(patches()).toEqual([{ display_name: 'Grace' }]));
    fireEvent.blur(input);
    expect(patches()).toEqual([{ display_name: 'Grace' }]);
    expect(input.value).toBe('Grace');
  });

  it('saves the name on blur and skips an unchanged name', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'Grace' } });
    fireEvent.blur(input);
    await waitFor(() => expect(patches()).toEqual([{ display_name: 'Grace' }]));
  });

  it('saves a typed name when the dialog closes without a blur', async () => {
    const onClose = vi.fn();
    renderWithClient(<SettingsDialog onClose={onClose} />, seed(snapshot));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(patches()).toEqual([{ display_name: 'Grace' }]));
  });

  it('closing before settings load never clears the saved name', async () => {
    stateStatus = 503;
    const onClose = vi.fn();
    renderWithClient(<SettingsDialog onClose={onClose} />, seed(null));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(patches()).toEqual([]);
  });

  it('a snapshot refetch never replaces the name being typed', () => {
    const { queryClient } = renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft name' } });
    act(() => {
      queryClient.setQueryData(queryKeys.snapshot(null), { ...snapshot, settings: { ...snapshot.settings, display_name: 'Server name', motion: true } });
    });
    expect(input.value).toBe('Draft name');
    expect((screen.getByLabelText('Motion') as HTMLInputElement).checked).toBe(false);
  });

  it('toggles observation through one PATCH and reverts it when the server refuses', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    const box = screen.getByLabelText('Screen') as HTMLInputElement;
    expect(box.checked).toBe(false);
    patchStatus = 500;
    fireEvent.click(box);
    expect(await screen.findByText('Settings storage failed')).toBeTruthy();
    expect(box.checked).toBe(false);
    expect(patches()).toEqual([{ observation_enabled: true }]);
    patchStatus = 200;
    fireEvent.click(box);
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(box.checked).toBe(true);
  });

  it('sends the companion mode and the size (24–72) the Sway helper reads', async () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    fireEvent.change(screen.getByLabelText('Companion mode'), { target: { value: 'dot' } });
    const size = screen.getByLabelText('Companion size') as HTMLInputElement;
    expect(size.min).toBe('24');
    expect(size.max).toBe('72');
    fireEvent.change(size, { target: { value: '56' } });
    await waitFor(() => expect(patches()).toEqual([{ companion: 'dot' }, { companion_size: 56 }]));
  });

  it('shows capability status and the capture queue only when it has items', () => {
    snapshot = { ...snapshot, capabilities: { ...snapshot.capabilities, organizer: true, model: 'local-model', speech: false } };
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    expect(screen.getByText('local-model')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Local capture queue' })).toBeNull();
    cleanup();
    h.outbox = 2;
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    expect(screen.getByRole('button', { name: 'Local capture queue' })).toBeTruthy();
  });

  it('reports when notifications are unavailable in this browser', () => {
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(snapshot));
    fireEvent.click(screen.getByLabelText('Alerts'));
    expect(toast).toHaveBeenCalledWith(S.notificationsUnsupported);
  });

  it('without a snapshot it shows no setting inputs', () => {
    stateStatus = 503;
    renderWithClient(<SettingsDialog onClose={() => {}} />, seed(null));
    expect(screen.getByText(SETTINGS_TEXT.offline)).toBeTruthy();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByLabelText('Screen')).toBeNull();
  });
});
