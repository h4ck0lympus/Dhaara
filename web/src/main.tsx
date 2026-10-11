import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { onUnauthorized } from './api/client';
import type { Snapshot } from './api/schemas';
import { boot } from './api/session';
import { connection, installConnectionListeners } from './domain/connection';
import { captureDraftStore } from './local/drafts';
import { taskDraftStore } from './local/taskDraft';
import { installLegacyHashRewrite, installModalLinks, rewriteLegacyHash } from './routes/legacy';
import { createAppRouter, openModalLink } from './routes/router';
import { registerServiceWorker } from './shell/serviceWorker';
import { requestUnlock } from './shell/unlock';
import { createQueryClient } from './state/queryClient';
import { installRefetchTriggers, queryKeys, readCachedSnapshot } from './state/queries';
import './styles/base.css';
import './styles/shell.css';
import './styles/ui.css';
import './styles/screens.css';

function latestSnapshot(qc: QueryClient): Snapshot | undefined {
  return qc.getQueriesData<Snapshot>({ queryKey: ['snapshot'] }).map(([, data]) => data).find(data => data !== undefined);
}

async function start(): Promise<void> {
  const legacy = rewriteLegacyHash(location.hash);
  if (legacy) history.replaceState(null, '', legacy);
  const qc = createQueryClient();
  const [, , cached] = await Promise.allSettled([captureDraftStore.load(), taskDraftStore.load(), readCachedSnapshot()]);
  if (cached.status === 'fulfilled' && cached.value) qc.setQueryData(queryKeys.snapshot(null), cached.value);
  installConnectionListeners();
  installRefetchTriggers(qc);
  const result = await boot();
  if (result.kind === 'ready') {
    qc.setQueryData(queryKeys.snapshot(null), result.snapshot);
    connection.report('state-success');
  }
  if (result.kind === 'locked') requestUnlock();
  onUnauthorized(requestUnlock);
  let router: ReturnType<typeof createAppRouter> | undefined;
  // Both installed before createAppRouter so they run before the router's own popstate listener (rewrite first: legacy modal links).
  installLegacyHashRewrite(to => router!.history.replace(to));
  installModalLinks(() => router!.state.location, request => openModalLink(request, latestSnapshot(qc)));
  router = createAppRouter(qc);
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>,
  );
  registerServiceWorker();
}

// public/app.js:616 — never leave a blank page when startup itself throws.
function showStartupFailure(): void {
  const main = document.createElement('main');
  main.dataset.quiet = '';
  const title = document.createElement('h1');
  title.textContent = 'Noema';
  const message = document.createElement('p');
  message.textContent = 'Could not open the workspace. Check the server and reload.';
  main.append(title, message);
  document.getElementById('root')?.replaceChildren(main);
}

void start().catch(showStartupFailure);
