import { resolve } from 'node:path';
import { readVersion } from '@shop-shell/server-common';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4001';
const clientDist = resolve(process.env.CLIENT_DIST ?? '../client/dist');
const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS ?? 3000);

createApp({
  backendUrl,
  clientDist,
  version: readVersion(import.meta.dirname),
  backendTimeoutMs,
}).listen(port, () => {
  console.log(`shell FES on http://localhost:${port}`);
});
