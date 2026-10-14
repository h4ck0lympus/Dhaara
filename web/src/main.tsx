import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { onUnauthorized } from './api/client';
import type { Snapshot } from './api/schemas';
import { boot } from './api/session';
import { connection, installConnectionListeners } from './domain/connection';
import { LocalStoreError } from './local/db';
import { captureDraftStore } from './local/drafts';
import { migrateLocalDb } from './local/migrate';
import { taskDraftStore } from './local/taskDraft';
import { installLegacyHashRewrite, installModalLinks, rewriteLegacyHash } from './routes/legacy';
import { createAppRouter, openModalLink } from './routes/router';
import { installCheckpointClose } from './shell/checkpoint';
import { installPreloadErrorHandler } from './shell/preloadError';
import { registerServiceWorker } from './shell/serviceWorker';
import { requestUnlock } from './shell/unlock';
import { createQueryClient } from './state/queryClient';
import { installRefetchTriggers, queryKeys, readCachedSnapshot } from './state/queries';
import { S } from './strings';
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
  await migrateLocalDb();   // rename-shim: moves pre-rename local data before any draft store opens the new database (rename spec §4.4)
  const qc = createQueryClient();
  const [, , cached] = await Promise.allSettled([captureDraftStore.load(), taskDraftStore.load(), readCachedSnapshot()]);
  if (cached.status === 'fulfilled' && cached.value) qc.setQueryData(queryKeys.snapshot(null), cached.value);
  installConnectionListeners();
  installRefetchTriggers(qc);
  installPreloadErrorHandler();
  installCheckpointClose();
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
    <StrictMode><QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider></StrictMode>,
  );
  registerServiceWorker();
}

// public/app.js:616 — never leave a blank page when startup itself throws. With `retry`, the user retries in place
// (rename spec §4.4: the pre-rename database is moved before anything else touches local storage).
function showStartupFailure(message: string, retry = false): void {
  const main = document.createElement('main');
  main.dataset.quiet = '';
  const title = document.createElement('h1');
  title.textContent = 'Dhara';
  const text = document.createElement('p');
  text.setAttribute('role', 'alert');
  text.textContent = message;
  main.append(title, text);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = S.retry;
    button.onclick = () => {
      main.remove();
      void start().catch(onStartupError);
    };
    main.append(button);
  }
  document.getElementById('root')?.replaceChildren(main);
}

function onStartupError(error: unknown): void {
  if (error instanceof LocalStoreError) showStartupFailure(error.message, true);
  else showStartupFailure('Could not open the workspace. Check the server and reload.');
}

void start().catch(onStartupError);
