import { connectIdp, oidcSettingsFromEnv, requireUser } from '@arun-dev/server/auth';
import { closeOnSignal, readVersion } from '@arun-dev/server/http';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4001);

// Login (MVP-2) is off unless AUTH_ENABLED=true.
const settings = oidcSettingsFromEnv();
const loggedIn = settings && requireUser({ ...connectIdp(settings), audience: 'shell-backend' });

const server = createApp(readVersion(import.meta.dirname), loggedIn).listen(port, () => {
  console.log(`shell mock backend on http://localhost:${port}${loggedIn ? ' (login on)' : ''}`);
});
closeOnSignal(server);
