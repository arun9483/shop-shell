import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ports = { router: 3000, fes: 3001, backend: 4001 } as const;

export interface Mfe {
  /** As in the Shell's static MFE list: route `/<name>`, files `/mfe/<name>/`, API `/api/<name>/`. */
  name: string;
  /** The MFE's repository, built. */
  dir: string;
  fesPort: number;
  backendPort: number;
  /** True when the repository is checked out next to this one (or at SHOP_<NAME>_DIR) and built. */
  available: boolean;
}

function mfe(name: string, fesPort: number, backendPort: number): Mfe {
  const dir = resolve(
    process.env[`SHOP_${name.toUpperCase()}_DIR`] ??
      resolve(import.meta.dirname, `../../../shop-${name}`),
  );
  const available =
    existsSync(`${dir}/fes/dist/index.js`) && existsSync(`${dir}/client/dist/entry.js`);
  return { name, dir, fesPort, backendPort, available };
}

/** Every MFE in the Shell's static list. An unavailable one shows the Shell's fallback. */
export const mfes: readonly Mfe[] = [mfe('catalog', 3002, 4002), mfe('cart', 3003, 4003)];

export function byName(name: string): Mfe {
  const found = mfes.find((m) => m.name === name);
  if (!found) throw new Error(`No MFE ${name}`);
  return found;
}
