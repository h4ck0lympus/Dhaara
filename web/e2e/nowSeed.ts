import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { TASK_EDIT_FIELDS } from '../src/domain/tasks';
import { runSql } from './db';
import { expect, gotoApp } from './fixtures';
import { E2E_TOKEN, type DharaServer } from './server';

export type SeedTask = { id: string; title: string; status: string; priority: string; version: number };
export type SeedState = {
  tasks: SeedTask[]; notes: { id: string; title: string; folder: string; task_id: string | null }[]; reminders: { id: string; state: string }[];
  focus: { task_id: string; pinned: boolean } | null; runs: { id: string; status: string }[];
};
export const KINDS = ['new', 'available', 'waiting', 'attention', 'complete', 'unknown', 'disconnected'] as const;
export type Kind = (typeof KINDS)[number];

export const task = (dhara: DharaServer, title: string, fields: Record<string, unknown> = {}) => dhara.api<SeedTask>('POST', '/api/tasks', { title, ...fields });
export async function changeElsewhere(dhara: DharaServer, id: string, changes: Record<string, unknown>): Promise<void> {
  const fresh = await dhara.api<Record<string, unknown>>('GET', `/api/tasks/${id}`);
  await dhara.api('PUT', `/api/tasks/${id}`, { ...Object.fromEntries(TASK_EDIT_FIELDS.map(k => [k, fresh[k]])), ...changes, expected_version: fresh.version });
}
export const serverState = (dhara: DharaServer) => dhara.api<SeedState>('GET', '/api/state');

export async function agentRun(dhara: DharaServer, t: SeedTask, event?: 'completed' | 'needs_input', session_url = '') {
  const run = await dhara.api<{ id: string }>('POST', '/api/runs', { task_id: t.id, agent: 'Fixture command wrapper', session_url });
  if (event) await dhara.api('POST', `/api/runs/${run.id}/events`, { event_id: randomUUID(), seq: 1, kind: event, message: 'A fixture result or question, not actual user activity.' });
  return run;
}

export function ageRun(dhara: DharaServer, runId: string): void {
  runSql(dhara.dataDir, 'UPDATE runs SET updated_at=? WHERE id=?', [new Date(Date.now() - 5 * 60_000).toISOString(), runId]);
}

export async function note(dhara: DharaServer, raw: string, files: { name: string; type: string; bytes: Buffer }[] = []): Promise<{ id: string }> {
  const form = new FormData();
  form.set('payload', JSON.stringify({ capture_id: randomUUID(), raw }));
  for (const file of files) form.append('attachments', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const response = await fetch(dhara.origin + '/api/captures', { method: 'POST', body: form, headers: { Authorization: 'Bearer ' + E2E_TOKEN, 'X-Dhara-Request': '1' } });
  if (!response.ok) throw new Error(`POST /api/captures → ${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

export async function seed(dhara: DharaServer, kind: Kind): Promise<void> {
  if (kind === 'available' || kind === 'disconnected') {
    const chosen = await task(dhara, 'Study allocator cleanup', { priority: 'low', next_action: 'Read your original lifetime notes.' });
    await task(dhara, 'Continue the two-pointer exercise', { priority: 'high', next_action: 'Check how duplicate values affect the pointer movement.' });
    await task(dhara, 'Read the ownership chapter', { priority: 'medium' });
    await dhara.api('POST', '/api/focus', { task_id: chosen.id, pinned: false });
  } else if (kind === 'waiting') {
    const traced = await task(dhara, 'Trace ownership in the cleanup path', { status: 'waiting' });
    await agentRun(dhara, traced);
    await task(dhara, 'Test the revised cleanup', { status: 'blocked', dependencies: [traced.id] });
  } else if (kind === 'attention') {
    await agentRun(dhara, await task(dhara, 'Review the cleanup result', { priority: 'high' }), 'completed');
    await agentRun(dhara, await task(dhara, 'Answer the boundary-condition question', { priority: 'medium' }), 'needs_input');
  } else if (kind === 'complete') {
    await task(dhara, 'Check duplicate handling', { status: 'done' });
    await task(dhara, 'Review the allocator result', { status: 'done' });
  } else if (kind === 'unknown') {
    const run = await agentRun(dhara, await task(dhara, 'Check the missing agent report', { status: 'waiting' }));
    ageRun(dhara, run.id);
  }
}

export const nowPage = (page: Page) => page.locator('.home');
export const ready = (page: Page, mode: string) => expect(nowPage(page)).toHaveAttribute('data-now-state', mode);

export async function openKind(page: Page, context: BrowserContext, dhara: DharaServer, kind: Kind): Promise<void> {
  await seed(dhara, kind);
  await gotoApp(page, dhara);
  await ready(page, kind === 'disconnected' ? 'available' : kind);
  if (kind === 'disconnected') {
    await context.setOffline(true);
    await ready(page, 'disconnected');
  }
}

export const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
