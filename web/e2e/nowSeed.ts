// web/e2e/nowSeed.ts
// Test-only seeds for Overview states (port of qa/now_ui_check.py:64-99).
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { runSql } from './db';
import { expect, gotoApp } from './fixtures';
import { E2E_TOKEN, type NoemaServer } from './server';

export type SeedTask = { id: string; title: string; status: string; priority: string; version: number };
export type SeedState = {
  tasks: SeedTask[]; notes: unknown[]; reminders: { id: string; state: string }[];
  focus: { task_id: string; pinned: boolean } | null; runs: { id: string; status: string }[];
};
export const KINDS = ['new', 'available', 'waiting', 'attention', 'complete', 'unknown', 'disconnected'] as const;
export type Kind = (typeof KINDS)[number];

export const task = (noema: NoemaServer, title: string, fields: Record<string, unknown> = {}) => noema.api<SeedTask>('POST', '/api/tasks', { title, ...fields });
export const serverState = (noema: NoemaServer) => noema.api<SeedState>('GET', '/api/state');

export async function agentRun(noema: NoemaServer, t: SeedTask, event?: 'completed' | 'needs_input', session_url = '') {
  const run = await noema.api<{ id: string }>('POST', '/api/runs', { task_id: t.id, agent: 'Fixture command wrapper', session_url });
  if (event) await noema.api('POST', `/api/runs/${run.id}/events`, { event_id: randomUUID(), seq: 1, kind: event, message: 'A fixture result or question, not actual user activity.' });
  return run;
}

export function ageRun(noema: NoemaServer, runId: string): void {
  runSql(noema.dataDir, 'UPDATE runs SET updated_at=? WHERE id=?', [new Date(Date.now() - 5 * 60_000).toISOString(), runId]);
}

export async function note(noema: NoemaServer, raw: string): Promise<{ id: string }> {
  const form = new FormData();
  form.set('payload', JSON.stringify({ capture_id: randomUUID(), raw }));
  const response = await fetch(noema.origin + '/api/captures', { method: 'POST', body: form, headers: { Authorization: 'Bearer ' + E2E_TOKEN, 'X-Noema-Request': '1' } });
  if (!response.ok) throw new Error(`POST /api/captures → ${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

export async function seed(noema: NoemaServer, kind: Kind): Promise<void> {
  if (kind === 'available' || kind === 'disconnected') {
    const chosen = await task(noema, 'Study allocator cleanup', { priority: 'low', next_action: 'Read your original lifetime notes.' });
    await task(noema, 'Continue the two-pointer exercise', { priority: 'high', next_action: 'Check how duplicate values affect the pointer movement.' });
    await task(noema, 'Read the ownership chapter', { priority: 'medium' });
    await noema.api('POST', '/api/focus', { task_id: chosen.id, pinned: false });
  } else if (kind === 'waiting') {
    const traced = await task(noema, 'Trace ownership in the cleanup path', { status: 'waiting' });
    await agentRun(noema, traced);
    await task(noema, 'Test the revised cleanup', { status: 'blocked', dependencies: [traced.id] });
  } else if (kind === 'attention') {
    await agentRun(noema, await task(noema, 'Review the cleanup result', { priority: 'high' }), 'completed');
    await agentRun(noema, await task(noema, 'Answer the boundary-condition question', { priority: 'medium' }), 'needs_input');
  } else if (kind === 'complete') {
    await task(noema, 'Check duplicate handling', { status: 'done' });
    await task(noema, 'Review the allocator result', { status: 'done' });
  } else if (kind === 'unknown') {
    const run = await agentRun(noema, await task(noema, 'Check the missing agent report', { status: 'waiting' }));
    ageRun(noema, run.id);
  }
}

export const nowPage = (page: Page) => page.locator('.now-page');
export const ready = (page: Page, mode: string) => expect(nowPage(page)).toHaveAttribute('data-now-state', mode);

/** Seeds, opens Overview connected, and for 'disconnected' then drops the network (qa/now_ui_check.py:124-136). */
export async function openKind(page: Page, context: BrowserContext, noema: NoemaServer, kind: Kind): Promise<void> {
  await seed(noema, kind);
  await gotoApp(page, noema);
  await ready(page, kind === 'disconnected' ? 'available' : kind);
  if (kind === 'disconnected') {
    await context.setOffline(true);
    await ready(page, 'disconnected');
  }
}

export const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
