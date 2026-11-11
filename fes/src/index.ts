import { resolve } from 'node:path';
import {
  backendAuth,
  closeOnSignal,
  connectIdp,
  cookieSealer,
  fesGate,
  oidcSettingsFromEnv,
  readVersion,
  requiredEnv,
} from '@shop-shell/server-common';
import { createApp, type FesAuth } from './app.js';
import { loginRoutes } from './login.js';

const port = Number(process.env.PORT ?? 3001);
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4001';
const clientDist = resolve(process.env.CLIENT_DIST ?? '../client/dist');
const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS ?? 3000);

// Login (MVP-2) is off unless AUTH_ENABLED=true.
function login(): FesAuth | undefined {
  const settings = oidcSettingsFromEnv();
  if (!settings) return undefined;
  const { idp, adapter } = connectIdp(settings);
  const gate = fesGate({
    idp,
    adapter,
    // The Shell FES logs users in as its own client, so it accepts that client's tokens.
    loginClientId: requiredEnv('OIDC_CLIENT_ID'),
    backendUrl,
    backendAudience: 'shell-backend',
    backendTimeoutMs,
  });
  const routes = loginRoutes({
    idp,
    adapter,
    publicOrigin: requiredEnv('PUBLIC_ORIGIN'),
    sealer: cookieSealer(requiredEnv('AUTH_COOKIE_KEY')),
  });
  return { login: routes, page: gate.page, api: gate.api };
}

const auth = login();
const server = createApp({
  backendUrl,
  clientDist,
  version: readVersion(import.meta.dirname),
  backendTimeoutMs,
  // BACKEND_AUTH=google on Cloud Run, where the backend is private.
  backendHeaders: backendAuth(process.env.BACKEND_AUTH, backendUrl),
  ...(auth ? { auth } : {}),
}).listen(port, () => {
  console.log(`shell FES on http://localhost:${port}${auth ? ' (login on)' : ''}`);
});
closeOnSignal(server);
