import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as protocol from '../src/protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => fs.readFileSync(path.resolve(here, file), 'utf8');
const literal = (source: string, name: string) => source.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];

describe('sandboxed preloads cannot import protocol.ts, so their literals are pinned here', () => {
  it('main preload sends only close approval on the page channel', () => {
    const source = read('../src/preload.cts');
    expect(literal(source, 'IPC_PAGE')).toBe(protocol.IPC_PAGE);
    expect(literal(source, 'CLOSE_APPROVED')).toBe(protocol.CLOSE_APPROVED);
    expect(source).toContain("exposeInMainWorld('ipc'");
  });

  it('startup preload uses the startup channels', () => {
    const source = read('../src/startup-preload.cts');
    expect(literal(source, 'IPC_STARTUP_RETRY')).toBe(protocol.IPC_STARTUP_RETRY);
    expect(literal(source, 'IPC_STARTUP_CANCEL')).toBe(protocol.IPC_STARTUP_CANCEL);
    expect(literal(source, 'IPC_STARTUP_STATUS')).toBe(protocol.IPC_STARTUP_STATUS);
    expect(source).toContain("exposeInMainWorld('dharaStartup'");
  });

  it('page event names equal web/src/events.ts', () => {
    const events = read('../../web/src/events.ts');
    for (const name of ['CHECKPOINT_CLOSE', 'SERVICE_DOWN', 'SERVICE_UP', 'CLOSE_APPROVED'] as const) {
      expect(events.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]).toBe(protocol[name]);
    }
  });

  it('the startup page is local-only, has no inline script and renders text safely', () => {
    const html = read('../static/startup.html');
    const script = read('../static/startup.js');
    expect(html).toContain(`content="default-src 'self'"`);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    for (const fragment of ['id="status"', 'role="status"', 'id="retry"', 'Retry service', 'id="cancel"', 'Cancel / Quit']) expect(html).toContain(fragment);
    expect(script).not.toContain('innerHTML');
    expect(script).toContain('textContent');
  });
});
