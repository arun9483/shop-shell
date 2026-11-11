import {
  closeOnSignal,
  connectIdp,
  oidcSettingsFromEnv,
  readVersion,
  requireUser,
} from '@shop-shell/server-common';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4001);

// Sign-in (MVP-2) is off unless AUTH_ENABLED=true.
const settings = oidcSettingsFromEnv();
const signedIn = settings && requireUser({ ...connectIdp(settings), unit: 'shell' });

const server = createApp(readVersion(import.meta.dirname), signedIn).listen(port, () => {
  console.log(`shell mock backend on http://localhost:${port}${signedIn ? ' (sign-in on)' : ''}`);
});
closeOnSignal(server);
