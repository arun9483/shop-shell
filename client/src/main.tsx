// Monitoring starts first so it sees every error.
import './monitoring';
import '@arun-dev/tokens/base';
import '@arun-dev/tokens/brands/arun';
import '@arun-dev/ui/components.css';
// Fonts are the app's to load (the tokens leave out @font-face); then the page-wide base styles.
import '@arun-dev/tokens/primitives/fonts';
import './global.css';
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
