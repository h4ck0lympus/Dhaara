import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import { PERMISSION_PROMPTS, classifyPermission, installPermissions, type PermissionKind } from '../src/permissions.js';

const ORIGIN = 'http://127.0.0.1:8765';
const PAGE = `${ORIGIN}/#/capture`;
type RequestHandler = (contents: unknown, permission: string, callback: (granted: boolean) => void, details: Record<string, unknown>) => void;
type CheckHandler = (contents: unknown, permission: string, requestingOrigin: string, details: Record<string, unknown>) => boolean;

function fakeSession() {
  const handlers: { request?: RequestHandler; check?: CheckHandler } = {};
  const session = {
    setPermissionRequestHandler(handler: RequestHandler) { handlers.request = handler; },
    setPermissionCheckHandler(handler: CheckHandler) { handlers.check = handler; },
  } as unknown as Session;
  const request = (permission: string, details: Record<string, unknown>) =>
    new Promise<boolean>((resolve) => handlers.request!(null, permission, resolve, details));
  const check = (permission: string, details: Record<string, unknown>) => handlers.check!(null, permission, ORIGIN, details);
  return { session, request, check };
}

function install(answers: boolean[]) {
  const fake = fakeSession();
  const prompts: PermissionKind[] = [];
  installPermissions(fake.session, ORIGIN, async (kind) => {
    prompts.push(kind);
    return answers.shift() ?? false;
  });
  return { ...fake, prompts };
}

describe('classifyPermission (spec §6.3 Permissions)', () => {
  const main = { isMainFrame: true, requestingUrl: PAGE };

  it('recognises audio-only media and notifications from the main frame at the origin', () => {
    expect(classifyPermission('media', { ...main, mediaTypes: ['audio'] }, ORIGIN)).toBe('media-audio');
    expect(classifyPermission('notifications', main, ORIGIN)).toBe('notifications');
  });

  it.each([
    ['video', 'media', { ...main, mediaTypes: ['video'] }],
    ['audio and video', 'media', { ...main, mediaTypes: ['audio', 'video'] }],
    ['no media types', 'media', { ...main, mediaTypes: [] }],
    ['missing media types', 'media', main],
    ['a subframe', 'media', { isMainFrame: false, requestingUrl: PAGE, mediaTypes: ['audio'] }],
    ['another origin', 'notifications', { isMainFrame: true, requestingUrl: 'http://127.0.0.1:9000/' }],
    ['credentials', 'notifications', { isMainFrame: true, requestingUrl: 'http://u@127.0.0.1:8765/' }],
    ['an unparsable URL', 'notifications', { isMainFrame: true, requestingUrl: 'nope' }],
    ['geolocation', 'geolocation', main],
    ['clipboard', 'clipboard-read', main],
    ['display capture', 'display-capture', main],
    ['openExternal', 'openExternal', main],
  ])('denies %s', (_label, permission, details) => {
    expect(classifyPermission(permission, details as { isMainFrame: boolean; requestingUrl: string; mediaTypes?: string[] }, ORIGIN)).toBeNull();
  });
});

describe('installPermissions', () => {
  it('prompts once for audio, remembers the answer and reports it to the check handler', async () => {
    const { request, check, prompts } = install([true]);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'audio' })).toBe(false);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['audio'] })).toBe(true);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['audio'] })).toBe(true);
    expect(prompts).toEqual(['media-audio']);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'audio' })).toBe(true);
    expect(check('media', { isMainFrame: true, requestingUrl: PAGE, mediaType: 'video' })).toBe(false);
  });

  it('remembers a denial too, and never prompts for video', async () => {
    const { request, check, prompts } = install([false]);
    expect(await request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await request('media', { isMainFrame: true, requestingUrl: PAGE, mediaTypes: ['video'] })).toBe(false);
    expect(prompts).toEqual(['notifications']);
    expect(check('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
  });

  it('shares one prompt between concurrent requests', async () => {
    const { request, prompts } = install([true]);
    const details = { isMainFrame: true, requestingUrl: PAGE };
    expect(await Promise.all([request('notifications', details), request('notifications', details)])).toEqual([true, true]);
    expect(prompts).toEqual(['notifications']);
  });

  it('treats a failed prompt as a denial', async () => {
    const fake = fakeSession();
    installPermissions(fake.session, ORIGIN, async () => { throw new Error('dialog failed'); });
    expect(await fake.request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
  });

  it('forgets decisions on a new install (app restart)', async () => {
    const first = install([true]);
    await first.request('notifications', { isMainFrame: true, requestingUrl: PAGE });
    const second = install([false]);
    expect(second.check('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(await second.request('notifications', { isMainFrame: true, requestingUrl: PAGE })).toBe(false);
    expect(second.prompts).toEqual(['notifications']);
  });

  it('uses the main.rs prompt wording', () => {
    expect(PERMISSION_PROMPTS).toEqual({
      'media-audio': 'Allow Dhara to use your microphone for a recording?',
      notifications: 'Allow Dhara to show notifications?',
    });
  });
});
