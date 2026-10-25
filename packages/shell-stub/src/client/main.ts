// The Shell's page setup for one MFE: the same design-system CSS, fonts and base styles the Shell
// loads, single-spa, and the element the MFE mounts into. The MFE runs unchanged, through the same
// lifecycles and `domElement` prop as in the Shell.
import '@arun-dev/tokens/base';
import '@arun-dev/tokens/brands/arun';
import '@arun-dev/ui/components.css';
import '@arun-dev/tokens/primitives/fonts';
// The Shell's own page-wide styles, so a standalone MFE looks as it does in the Shell.
import '../../../../client/src/global.css';
import './stub.css';
import { addErrorHandler, navigateToUrl, registerApplication, start } from 'single-spa';
import type { LifeCycles } from 'single-spa';
import type { StubConfig } from '../config.js';

function readConfig(): StubConfig {
  const element = document.getElementById('shell-stub-config');
  if (!element?.textContent) throw new Error('shell-stub: the server did not provide a config');
  return JSON.parse(element.textContent) as StubConfig;
}

const config = readConfig();
const { name, routePrefix } = config;
// Monitoring starts before the MFE loads, so it sees every error.
if (config.newRelic) {
  const { startMonitoring } = await import('./monitoring.js');
  startMonitoring(config.newRelic);
}

const title = document.getElementById('stub-title');
const message = document.getElementById('stub-message');
const mfeRoot = document.getElementById('mfe-root');
if (title) title.textContent = `${name[0]?.toUpperCase() ?? ''}${name.slice(1)} (standalone)`;
document.title = `${name} standalone`;

function matches(pathname: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

function show(text: string | null): void {
  if (!message) return;
  message.textContent = text;
  message.hidden = text === null;
}

registerApplication({
  name,
  // The entry comes from the MFE's own build, through this stub's proxy.
  app: () => import(/* @vite-ignore */ `/mfe/${name}/entry.js`) as Promise<LifeCycles>,
  activeWhen: (location) => matches(location.pathname),
  customProps: () => ({ domElement: mfeRoot }),
});

addErrorHandler((error) => {
  reportError(error);
  show(`The ${name} section is unavailable`);
});

window.addEventListener('single-spa:routing-event', () => {
  if (!matches(window.location.pathname)) show(`This page is not part of ${name}.`);
  else if (message?.textContent.startsWith('This page')) show(null);
});

// Opening the stub's root goes straight to the MFE.
if (window.location.pathname === '/') navigateToUrl(routePrefix);
start({ urlRerouteOnly: true });
