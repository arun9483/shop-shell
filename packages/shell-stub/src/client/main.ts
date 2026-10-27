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
import { mountThemeSwitcher } from './theme.js';

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

// The Shell's theme switcher, so the MFE can be checked in light, dark and system themes.
const themeRoot = document.getElementById('stub-theme');
if (themeRoot) mountThemeSwitcher(themeRoot);

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

// Development mode: the MFE's Vite dev server serves its source. Its HMR client and React Fast
// Refresh need this setup, which Vite otherwise puts in an app's own index.html.
if (config.devEntry) {
  const base = `/mfe/${name}`;
  const refresh = (await import(/* @vite-ignore */ `${base}/@react-refresh`)) as {
    default: { injectIntoGlobalHook: (target: Window) => void };
  };
  refresh.default.injectIntoGlobalHook(window);
  Object.assign(window, {
    $RefreshReg$: () => undefined,
    $RefreshSig$: () => (type: unknown) => type,
    __vite_plugin_react_preamble_installed__: true,
  });
  await import(/* @vite-ignore */ `${base}/@vite/client`);
}

// The built entry, or the source entry in development mode, through this stub's proxy.
const entry = config.devEntry ? `/mfe/${name}/${config.devEntry}` : `/mfe/${name}/entry.js`;

registerApplication({
  name,
  app: () => import(/* @vite-ignore */ entry) as Promise<LifeCycles>,
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
