// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithClient, stubFetch } from '../test/harness';
import { AgentConnections } from './AgentConnections';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('connects once without a task or token and allows disconnection', async () => {
  let installed = false;
  const calls = stubFetch(call => {
    if (call.method === 'POST') installed = (call.body as { enabled: boolean }).enabled;
    return jsonResponse(200, { connections: [{ provider: 'codex', name: 'Codex', installed, last_seen: null }] });
  });
  renderWithClient(<AgentConnections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Codex' }));
  expect(await screen.findByText('Open /hooks in Codex and trust the dhaara hooks')).toBeTruthy();
  expect(calls.find(c => c.method === 'POST')).toEqual({ url: '/api/agent-connections/codex', method: 'POST', body: { enabled: true } });
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect Codex' }));
  await screen.findByRole('button', { name: 'Connect Codex' });
  expect(calls.filter(c => c.method === 'POST').map(c => c.body)).toEqual([{ enabled: true }, { enabled: false }]);
});

it('keeps the connection uninstalled when configuration cannot be written', async () => {
  stubFetch(call => call.method === 'POST'
    ? jsonResponse(409, { detail: 'Existing configuration was preserved.' })
    : jsonResponse(200, { connections: [{ provider: 'claude', name: 'Claude Code', installed: false, last_seen: null }] }));
  renderWithClient(<AgentConnections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Claude Code' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('preserved'));
  expect(screen.getByRole('button', { name: 'Connect Claude Code' })).toBeTruthy();
});

it('shows Connected once the agent has reported', async () => {
  stubFetch(() => jsonResponse(200, { connections: [{ provider: 'claude', name: 'Claude Code', installed: true, last_seen: '2026-01-01T00:00:00Z' }] }));
  renderWithClient(<AgentConnections />);
  expect(await screen.findByText('Connected')).toBeTruthy();
});
