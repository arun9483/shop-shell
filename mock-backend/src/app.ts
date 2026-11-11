import express, { type Express, type RequestHandler } from 'express';
import {
  healthRouter,
  meHandler,
  notFound,
  problemHandler,
  traceResponse,
  type VersionInfo,
} from '@shop-shell/server-common';

/**
 * Stand-in for the Shell's backend service. Dev only; never deployed. With `requireUser` (MVP-2,
 * `AUTH_ENABLED=true`), every route but health and version needs a signed-in user with a Shell role.
 */
export function createApp(version: VersionInfo, requireUser?: RequestHandler): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(healthRouter({ version }));
  app.use(traceResponse);
  if (requireUser) {
    app.use(requireUser);
    app.get('/me', meHandler);
  }

  app.get('/greeting', (_req, res) => {
    res.json({ message: 'Welcome to the shop.' });
  });

  app.get('/test-error', () => {
    throw new Error('Shell mock backend test error');
  });

  app.use(notFound);
  app.use(problemHandler);
  return app;
}
