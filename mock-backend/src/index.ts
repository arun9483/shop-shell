import { closeOnSignal, readVersion } from '@shop-shell/server-common';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4001);

const server = createApp(readVersion(import.meta.dirname)).listen(port, () => {
  console.log(`shell mock backend on http://localhost:${port}`);
});
closeOnSignal(server);
