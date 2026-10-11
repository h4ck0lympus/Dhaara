// Minimal P1 entry (contract §1.3); P3 replaces the body with the boot order of contract §6.6.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import { registerServiceWorker } from './shell/serviceWorker';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <main data-quiet>
      <h1>Noema</h1>
    </main>
  </StrictMode>,
);
registerServiceWorker();
