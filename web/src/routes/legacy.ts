import type { DialogRequest } from '../shell/dialogs';

const LEGACY_PAGES = ['overview', 'capture', 'notes', 'plan', 'settings'];

export function rewriteLegacyHash(hash: string): string | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null;
  const route = hash.slice(1);
  if (LEGACY_PAGES.includes(route)) return '#/' + route;
  const match = /^(note|task)\/(.+)$/.exec(route);
  return match ? `#/${match[1]}/${match[2]}` : null;
}

export function installLegacyHashRewrite(navigate: (to: string) => void): () => void {
  const onHashChange = () => {
    const rewritten = rewriteLegacyHash(location.hash);
    if (rewritten) navigate(rewritten.slice(1));
  };
  // The router's popstate handler maps '#plan' to '#/overview' before hashchange fires: rewrite first, in the capture phase.
  // Modal links are left as typed: replaceState here would move the router to /task/... before installModalLinks reads its location.
  const onPopState = () => {
    if (modalRequestForHash(location.hash)) return;
    const rewritten = rewriteLegacyHash(location.hash);
    if (rewritten) history.replaceState(history.state, '', rewritten);
  };
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onPopState, true);
  return () => {
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('popstate', onPopState, true);
  };
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function modalRequestForHash(hash: string): DialogRequest | null {
  const path = hash.startsWith('#/') ? hash.slice(2) : hash.startsWith('#') ? hash.slice(1) : '';
  if (path === 'settings') return { kind: 'settings' };
  const match = /^task\/(.+)$/.exec(path);
  return match ? { kind: 'task', id: decode(match[1]) } : null;
}

export function installModalLinks(current: () => { href: string; state: unknown }, open: (request: DialogRequest) => void): () => void {
  // Capture phase on window, installed before the router: the screen underneath never unmounts.
  const onPopState = (event: PopStateEvent) => {
    const request = modalRequestForHash(location.hash);
    if (!request) return;
    event.stopImmediatePropagation();
    const previous = current();
    history.replaceState(previous.state, '', '#' + previous.href);
    open(request);
  };
  window.addEventListener('popstate', onPopState, true);
  return () => window.removeEventListener('popstate', onPopState, true);
}
