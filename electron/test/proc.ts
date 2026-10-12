import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function tempDir(prefix = 'noema-lifecycle-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Alive and not a zombie (tests/test_managed_service.py:37-41 `live`). */
export function live(pid: number): boolean {
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').pop()!.trim().split(' ')[0] !== 'Z';
  } catch {
    return false;
  }
}

export function readPids(file: string): number[] {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as number[];
  } catch {
    return [];   // not written yet, or mid-write
  }
}

export async function until(predicate: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(40);
  }
  throw new Error('Condition did not become true');
}

/** The managed service strips NOEMA_ACCESS_TOKEN, so the admin token is the workspace's admin.token (test_managed_service.py:99-101). */
export async function admin<T = any>(workspaceDir: string, port: number, apiPath: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = fs.readFileSync(path.join(workspaceDir, 'admin.token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${port}/api${apiPath}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`${apiPath}: ${response.status}`);
  return (await response.json()) as T;
}
