import { addErrorHandler, registerApplication, type LifeCycles } from 'single-spa';

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

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function activeMfe(pathname: string): Mfe | undefined {
  return mfes.find((mfe) => matches(pathname, mfe.routePrefix));
}

export function registerMfes(): void {
  for (const mfe of mfes) {
    registerApplication({
      name: mfe.name,
      // The entry comes from the MFE's own build at run time, so Vite must not bundle it.
      app: () => import(/* @vite-ignore */ mfe.entry) as Promise<LifeCycles>,
      activeWhen: (location) => matches(location.pathname, mfe.routePrefix),
      customProps: () => ({ domElement: document.getElementById(MFE_ROOT_ID) }),
    });
  }

  addErrorHandler((error) => {
    reportError(error);
    window.dispatchEvent(new CustomEvent(MFE_ERROR_EVENT, { detail: error.appOrParcelName }));
  });
}
