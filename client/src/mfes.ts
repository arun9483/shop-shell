import {
  addErrorHandler,
  registerApplication,
  setBootstrapMaxTime,
  setMountMaxTime,
  type LifeCycles,
} from 'single-spa';
import { goToLogin, headStatus, loginIsOn, refreshFor } from './auth';
import { timeouts, withTimeout } from './timeouts';

export interface Mfe {
  name: string;
  routePrefix: string;
  entry: string;
}

/** The static MFE list. Adding or removing an MFE changes this list and redeploys the Shell. */
export const mfes: readonly Mfe[] = [
  { name: 'catalog', routePrefix: '/catalog', entry: '/mfe/catalog/entry.js' },
  { name: 'cart', routePrefix: '/cart', entry: '/mfe/cart/entry.js' },
];

/** The element every MFE mounts into. */
export const MFE_ROOT_ID = 'mfe-root';

/** The event the Shell fires when an MFE fails to load or a lifecycle throws. */
export const MFE_ERROR_EVENT = 'shell:mfe-error';

/** The event the Shell fires when the user has no role in an MFE: its entry answered 403. */
export const MFE_NO_ACCESS_EVENT = 'shell:mfe-no-access';

const noAccess = new Set<string>();

function importEntry(mfe: Mfe, retry: boolean): Promise<LifeCycles> {
  // A failed import is remembered by the browser for that URL, so a retry asks for a new one.
  const url = retry ? `${mfe.entry}?retry=${Date.now()}` : mfe.entry;
  return withTimeout(
    import(/* @vite-ignore */ url) as Promise<LifeCycles>,
    timeouts.mfeLoad,
    `Loading ${mfe.name}`,
  );
}

/**
 * Loads an MFE's entry. With login on (MVP-2) the entry needs a valid login and a role in the MFE,
 * and a failed `import()` does not say why, so the Shell asks for the entry's status: `401` → refresh
 * and load once more (or log in); `403` → the "no access" fallback; anything else fails as in MVP-1.
 */
async function loadMfe(mfe: Mfe): Promise<LifeCycles> {
  try {
    return await importEntry(mfe, false);
  } catch (error) {
    if (!loginIsOn()) throw error;
    const status = await headStatus(mfe.entry);
    if (status === 401) {
      if (await refreshFor(mfe.entry)) return importEntry(mfe, true);
      goToLogin();
    } else if (status === 403) {
      noAccess.add(mfe.name);
      window.dispatchEvent(new CustomEvent(MFE_NO_ACCESS_EVENT, { detail: mfe.name }));
    }
    throw error;
  }
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function activeMfe(pathname: string): Mfe | undefined {
  return mfes.find((mfe) => matches(pathname, mfe.routePrefix));
}

export function registerMfes(): void {
  // A slow bootstrap or mount fails (dieOnTimeout) instead of only warning, so the fallback shows.
  setBootstrapMaxTime(timeouts.mfeMount, true);
  setMountMaxTime(timeouts.mfeMount, true);

  for (const mfe of mfes) {
    registerApplication({
      name: mfe.name,
      // The entry comes from the MFE's own build at run time, so Vite must not bundle it.
      app: () => loadMfe(mfe),
      activeWhen: (location) => matches(location.pathname, mfe.routePrefix),
      customProps: () => ({ domElement: document.getElementById(MFE_ROOT_ID) }),
    });
  }

  addErrorHandler((error) => {
    // No access is expected, not an error to report.
    if (!noAccess.has(error.appOrParcelName)) reportError(error);
    window.dispatchEvent(new CustomEvent(MFE_ERROR_EVENT, { detail: error.appOrParcelName }));
  });
}
