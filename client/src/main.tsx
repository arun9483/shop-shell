// Monitoring starts first so it sees every error.
import './monitoring';
import '@arun-dev/tokens/base';
import '@arun-dev/tokens/brands/arun';
import '@arun-dev/ui/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { start } from 'single-spa';
import { App } from './App';
import { registerMfes } from './mfes';

registerMfes();
start({ urlRerouteOnly: true });

const root = document.getElementById('shell-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
