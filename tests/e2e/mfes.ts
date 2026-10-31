import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ports = { router: 3000, fes: 3001, backend: 4001 } as const;

/** The `shop-router` repository, built, next to this one or at SHOP_ROUTER_DIR. */
export const routerDir = resolve(
  process.env.SHOP_ROUTER_DIR ?? resolve(import.meta.dirname, '../../../shop-router'),
);

export interface SlowApi {
  page: string;
  api: string;
  message: string;
}

export interface Mfe {
  /** As in the Shell's static MFE list: route `/<name>`, files `/mfe/<name>/`, API `/api/<name>/`. */
  name: string;
  /** The MFE's repository, built. */
  dir: string;
  fesPort: number;
  backendPort: number;
  /** API routes that answer 200, besides the test trigger. */
  api: readonly string[];
  /** A page whose first API call can be slowed, and what it says when that call times out. */
  slowApi: SlowApi;
  /** Whether it runs in the Shell stub's development mode (HMR): its client is a Vite project. */
  devMode: boolean;
  /** True when the repository is checked out next to this one (or at SHOP_<NAME>_DIR) and built. */
  available: boolean;
}

function mfe(
  name: string,
  fesPort: number,
  backendPort: number,
  api: readonly string[],
  slowApi: SlowApi,
  devMode = false,
): Mfe {
  const dir = resolve(
    process.env[`SHOP_${name.toUpperCase()}_DIR`] ??
      resolve(import.meta.dirname, `../../../shop-${name}`),
  );
  const available =
    existsSync(`${dir}/fes/dist/index.js`) && existsSync(`${dir}/client/dist/entry.js`);
  return {
    name,
    dir,
    fesPort,
    backendPort,
    api,
    slowApi,
    available,
    devMode,
  };
}

/** Every MFE in the Shell's static list. An unavailable one shows the Shell's fallback. */
export const mfes: readonly Mfe[] = [
  mfe(
    'catalog',
    3002,
    4002,
    ['/api/catalog/products', '/api/catalog/products/mug'],
    {
      page: '/catalog',
      api: '/api/catalog/products',
      message: 'Products could not be loaded.',
    },
    true,
  ),
  mfe(
    'cart',
    3003,
    4003,
    ['/api/cart'],
    {
      page: '/cart',
      api: '/api/cart',
      message: 'The cart could not be loaded.',
    },
    true,
  ),
];

export function byName(name: string): Mfe {
  const found = mfes.find((m) => m.name === name);
  if (!found) throw new Error(`No MFE ${name}`);
  return found;
}
