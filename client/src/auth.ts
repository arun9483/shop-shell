import { createAuth } from '@arun-dev/client';
import { timeouts } from './timeouts';

// MVP-2 login, client side, from @arun-dev/client with the server's default names (`/auth`, `shop`).
// The package is shared at build time: the Shell gives MFEs nothing new at runtime.
export const {
  apiFetch,
  channel,
  goToLogin,
  headStatus,
  loginIsOn,
  refreshFor,
  startLogout,
  urls,
} = createAuth({ apiTimeoutMs: timeouts.api });
