// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', async importOriginal => ({ ...(await importOriginal<typeof import('../ui/Toast')>()), toast: vi.fn() }));

import { makeSnapshot } from '../test/fixtures';
import { jsonResponse, renderWithClient, stubFetch, type StubCall } from '../test/harness';
import { toast } from '../ui/Toast';
import { AI_TEXT, AISettings } from './AISettings';

const settings = makeSnapshot().settings;
let status: { configured: boolean; key_hint: string; from_env: boolean; enabled: boolean; model: string; audio_model: string };
let calls: StubCall[];
const models = [
  { id: 'a/free', name: 'Alpha', context: 1, structured: true, audio: false },
  { id: 'b/free', name: 'Beta', context: 1, structured: false, audio: true },
];

beforeEach(() => {
  status = { configured: false, key_hint: '', from_env: false, enabled: false, model: 'openrouter/free', audio_model: 'thinkingmachines/inkling-small:free' };
  calls = stubFetch(call => {
    if (call.url === '/api/ai' && call.method === 'GET') return jsonResponse(200, status);
    if (call.url === '/api/ai/key' && call.method === 'PUT') {
      if ((call.body as { key: string }).key === 'bad') return jsonResponse(400, { detail: 'That does not look like an OpenRouter key.' });
      status = { ...status, configured: true, key_hint: '…cdef' };
      return jsonResponse(200, status);
    }
    if (call.url === '/api/ai/key' && call.method === 'DELETE') { status = { ...status, configured: false, key_hint: '' }; return jsonResponse(200, status); }
    if (call.url === '/api/ai/models') return jsonResponse(200, models);
    return undefined;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function given(patch = vi.fn(async () => true), overrides = {}) {
  renderWithClient(<AISettings settings={{ ...settings, ...overrides }} onPatch={patch} />);
  return patch;
}

describe('AISettings', () => {
  it('explains what is sent before anything is on', async () => {
    given();
    expect(screen.getByText(AI_TEXT.intro)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Checking…');
    expect(await screen.findByLabelText('OpenRouter key')).toBeTruthy();
    expect(screen.getByText(AI_TEXT.privacy)).toBeTruthy();
    expect(calls.some(c => c.url === '/api/ai/models')).toBe(false);
  });

  it('refuses to switch on without a key', async () => {
    const patch = given();
    await screen.findByLabelText('OpenRouter key');
    fireEvent.click(screen.getByRole('switch', { name: 'Send to OpenRouter' }));
    expect(screen.getByRole('alert').textContent).toBe('Add an OpenRouter key first.');
    expect(patch).not.toHaveBeenCalled();
  });

  it('saves a key write-only, reports a bad one, then offers the free models', async () => {
    given();
    const input = await screen.findByLabelText('OpenRouter key') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That does not look like an OpenRouter key.');
    fireEvent.change(input, { target: { value: ' sk-or-v1-0123456789abcdef ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('OpenRouter key saved.'));
    expect(calls.filter(c => c.method === 'PUT').at(-1)!.body).toEqual({ key: 'sk-or-v1-0123456789abcdef' });
    expect(await screen.findByText('Saved · …cdef')).toBeTruthy();
    const text = await screen.findByLabelText('Text model');
    await waitFor(() => expect([...within(text).getAllByRole('option')].map(o => o.textContent)).toEqual([AI_TEXT.router, 'Alpha', 'Beta · no strict JSON']));
    expect([...within(screen.getByLabelText('Dictation model')).getAllByRole('option')].map(o => o.textContent)).toEqual(['thinkingmachines/inkling-small:free', 'Beta']);
  });

  it('switches on and changes models through settings patches', async () => {
    status = { ...status, configured: true, key_hint: '…cdef' };
    const patch = given();
    fireEvent.click(await screen.findByRole('switch', { name: 'Send to OpenRouter' }));
    expect(patch).toHaveBeenCalledWith({ ai_enabled: true });
    await waitFor(() => expect(within(screen.getByLabelText('Text model')).getAllByRole('option').length).toBe(3));
    fireEvent.change(screen.getByLabelText('Text model'), { target: { value: 'a/free' } });
    expect(patch).toHaveBeenCalledWith({ ai_model: 'a/free' });
    fireEvent.change(screen.getByLabelText('Dictation model'), { target: { value: 'b/free' } });
    expect(patch).toHaveBeenCalledWith({ ai_audio_model: 'b/free' });
  });

  it('removing the key turns AI off; an env key cannot be removed here', async () => {
    status = { ...status, configured: true, key_hint: '…cdef' };
    const patch = given(vi.fn(async () => true), { ai_enabled: true });
    expect((await screen.findByRole('switch', { name: 'Send to OpenRouter' })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ ai_enabled: false }));
    expect(toast).toHaveBeenCalledWith('OpenRouter key removed. AI is off.');
    cleanup();
    status = { ...status, configured: true, from_env: true, key_hint: '…9999' };
    given();
    expect(await screen.findByText('Set by DHARA_OPENROUTER_API_KEY')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull();
  });
});
