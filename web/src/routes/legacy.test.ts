// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLegacyHashRewrite, installModalLinks, modalRequestForHash, rewriteLegacyHash } from './legacy';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); history.replaceState(null, '', '#/overview'); });

describe('rewriteLegacyHash', () => {
  it.each([
    ['#overview', '#/overview'], ['#capture', '#/capture'], ['#notes', '#/notes'], ['#plan', '#/plan'],
    ['#settings', '#/settings'], ['#note/abc', '#/note/abc'], ['#task/t-1', '#/task/t-1'],
  ])('%s → %s', (hash, rewritten) => expect(rewriteLegacyHash(hash)).toBe(rewritten));

  it.each(['', '#', '#/overview', '#/note/abc', '#unknown', '#note/', 'overview'])('leaves %j alone', hash => {
    expect(rewriteLegacyHash(hash)).toBeNull();
  });
});

describe('installLegacyHashRewrite', () => {
  it('rewrites on every hashchange and ignores new forms', () => {
    const navigate = vi.fn();
    cleanups.push(installLegacyHashRewrite(navigate));
    history.replaceState(null, '', '#plan');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).toHaveBeenCalledWith('/plan');
    history.replaceState(null, '', '#/notes');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('rewrites the hash in place on popstate, before the router reads it', () => {
    cleanups.push(installLegacyHashRewrite(vi.fn()));
    history.replaceState(null, '', '#plan');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(location.hash).toBe('#/plan');
  });

  it('leaves legacy modal links for installModalLinks', () => {
    cleanups.push(installLegacyHashRewrite(vi.fn()));
    history.replaceState(null, '', '#task/abc');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(location.hash).toBe('#task/abc');
  });

  it('stops listening after uninstall', () => {
    const navigate = vi.fn();
    installLegacyHashRewrite(navigate)();
    history.replaceState(null, '', '#capture');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('modalRequestForHash', () => {
  it.each([
    ['#/task/abc', { kind: 'task', id: 'abc' }], ['#task/abc', { kind: 'task', id: 'abc' }],
    ['#/task/a%20b', { kind: 'task', id: 'a b' }], ['#/task/%E0%A4%A', { kind: 'task', id: '%E0%A4%A' }],
    ['#/settings', { kind: 'settings' }], ['#settings', { kind: 'settings' }],
  ])('%s → %j', (hash, request) => expect(modalRequestForHash(hash)).toEqual(request));

  it.each(['#/plan', '#/task/', '#/note/abc', ''])('%j is not a modal link', hash => expect(modalRequestForHash(hash)).toBeNull());
});

describe('installModalLinks', () => {
  it('opens the dialog, restores the previous URL and state, and hides the event from the router', () => {
    const open = vi.fn(), router = vi.fn();
    cleanups.push(installModalLinks(() => ({ href: '/notes', state: { key: 'k', __TSR_index: 3 } }), open));
    window.addEventListener('popstate', router);
    cleanups.push(() => window.removeEventListener('popstate', router));
    history.pushState(null, '', '#task/abc');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(open).toHaveBeenCalledWith({ kind: 'task', id: 'abc' });
    expect(location.hash).toBe('#/notes');
    expect(history.state).toEqual({ key: 'k', __TSR_index: 3 });
    expect(router).not.toHaveBeenCalled();
  });

  it('lets ordinary navigation reach the router', () => {
    const open = vi.fn(), router = vi.fn();
    cleanups.push(installModalLinks(() => ({ href: '/notes', state: null }), open));
    window.addEventListener('popstate', router);
    cleanups.push(() => window.removeEventListener('popstate', router));
    history.pushState(null, '', '#/plan');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(open).not.toHaveBeenCalled();
    expect(router).toHaveBeenCalledOnce();
    expect(location.hash).toBe('#/plan');
  });
});
