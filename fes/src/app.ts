import { join } from 'node:path';
import express, { type Express } from 'express';
import {
  forward,
  healthRouter,
  notFound,
  problemHandler,
  traceResponse,
  type VersionInfo,
} from '@shop-shell/server-common';

export interface FesConfig {
  /** The Shell's backend service, e.g. the mock backend in development. */
  backendUrl: string;
  /** The built Shell client. */
  clientDist: string;
  version: VersionInfo;
  /** How long a backend call may take: a slower API call is a 504, a slower readiness check fails. */
  backendTimeoutMs: number;
}

const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

async function backendReady(backendUrl: string, timeoutMs: number): Promise<boolean> {
  const res = await fetch(`${backendUrl}/health/ready`, { signal: AbortSignal.timeout(timeoutMs) });
  return res.ok;
}

export function createApp({
  backendUrl,
  clientDist,
  version,
  backendTimeoutMs,
}: FesConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(healthRouter({ version, ready: () => backendReady(backendUrl, backendTimeoutMs) }));

  const api = express.Router();
  api.use(traceResponse);
  api.get('/greeting', (_req, res) => forward(res, `${backendUrl}/greeting`, backendTimeoutMs));
  api.get('/test-error', async (req, res) => {
    if (req.query.in === 'backend') {
      await forward(res, `${backendUrl}/test-error`, backendTimeoutMs);
      return;
    }
    throw new Error('Shell FES test error');
  });
  api.use(notFound);
  api.use(problemHandler);
  app.use('/api/shell', api);

  // Hashed files never change; everything else must be revalidated so a deploy is live at once.
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders: (res, path) => {
        res.set('Cache-Control', path.includes('/assets/') ? IMMUTABLE : NO_CACHE);
      },
    }),
  );
  // Missing files are 404s, not the app shell.
  app.use('/assets', notFound);
  // Every other GET is a client route, including deep links into MFEs.
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', NO_CACHE).sendFile(join(clientDist, 'index.html'));
  });
  app.use(notFound);
  app.use(problemHandler);
  return app;
}
