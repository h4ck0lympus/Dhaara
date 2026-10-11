// Minimal P1 entry (contract §1.3) plus boot and the outbox flush of contract §6.6 steps 5 and 8, so captures queued by
// the old UI upload after the upgrade (spec §8). 02-screens-core Task 14 replaces this body with the full boot order.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { boot } from './api/session';
import { connection, installConnectionListeners } from './domain/connection';
import { flushOutbox } from './local/outbox';
import { registerServiceWorker } from './shell/serviceWorker';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <main data-quiet>
      <h1>Noema</h1>
    </main>
  </StrictMode>,
);
installConnectionListeners();
void boot().then(async (result) => {
  if (result.kind !== 'ready') return;
  connection.report('state-success');
  await flushOutbox();
});
registerServiceWorker();
