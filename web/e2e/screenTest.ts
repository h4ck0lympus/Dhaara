import type { BrowserContext, BrowserType, Locator, Page } from '@playwright/test';
import { expect, PNG_1PX } from './fixtures';
import { runSql } from './db';
import { note } from './nowSeed';
import type { DharaServer } from './server';

export const MB = 1024 * 1024;
export const PNG = Buffer.from(PNG_1PX, 'base64');   // native_storage_check.py:24
export const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.alloc(28)]);   // detect_mime, server.py:44

export async function persistentBrowser(browserType: BrowserType, dir: string, errors: string[]): Promise<BrowserContext> {
  const context = await browserType.launchPersistentContext(dir, { viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(12_000);
  context.on('page', page => page.on('pageerror', error => errors.push(String(error))));
  return context;
}

export async function fakeMicrophonePage(browserType: BrowserType, errors: string[]): Promise<{ page: Page; close(): Promise<void> }> {
  const browser = await browserType.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  return { page, close: () => browser.close() };
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export async function readDraftFileBytes(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dhara-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const draft = await new Promise<{ files: { blob: Blob }[] }>((resolve, reject) => {
        const request = db.transaction('kv', 'readonly').objectStore('kv').get('draft');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return Array.from(new Uint8Array(await draft.files[0].blob.arrayBuffer()));
    } finally {
      db.close();
    }
  });
  return Buffer.from(bytes);
}

export async function expectPhoneFriendly(page: Page, scope: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow').toBe(true);
  const small = await page
    .locator(`${scope} :is(button, a, select, input:not([type=file]):not([type=checkbox]):not([type=range]))`)
    .evaluateAll(elements => elements
      .filter(element => element.getClientRects().length > 0)
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { control: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, width: rect.width, height: rect.height };
      })
      .filter(control => control.width < 44 || control.height < 44));
  expect(small, 'touch targets ≥ 44×44 px at phone width').toEqual([]);
}

export function navLink(page: Page, label: 'Overview' | 'Capture' | 'Notes' | 'Tasks'): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true });
}

export async function openRuntimeLink(page: Page, hash: string): Promise<void> {
  await page.evaluate(value => { location.hash = value; }, hash);
}

export function beforeUnloadArmed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

export type CreatedNote = { id: string; title: string; folder: string; body: string; raw: string; version: number; task_id: string | null };

export const createNote = (dhara: DharaServer, raw: string, files: { name: string; type: string; bytes: Buffer }[] = []) => note(dhara, raw, files) as Promise<CreatedNote>;

// Test-only: inserts a worker-style AI suggestion straight into the disposable database.
export function seedSuggestion(dhara: DharaServer, noteId: string, s: { id: string; title: string; body: string; folder: string }): void {
  runSql(dhara.dataDir, 'INSERT INTO suggestions VALUES(?,?,?,?,?,?)', [s.id, noteId, s.title, s.body, s.folder, new Date().toISOString()]);
}

export const editNote = (dhara: DharaServer, from: CreatedNote, changes: Partial<Pick<CreatedNote, 'title' | 'folder' | 'body'>>) =>
  dhara.api<CreatedNote>('PUT', `/api/notes/${from.id}`, { title: from.title, folder: from.folder, body: from.body, ...changes, expected_version: from.version });
