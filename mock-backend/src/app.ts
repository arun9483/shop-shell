import express, { type Express } from 'express';
import {
  healthRouter,
  notFound,
  problemHandler,
  traceResponse,
  type VersionInfo,
} from '@shop-shell/server-common';

/** Stand-in for the Shell's backend service. Dev only; never deployed. */
export function createApp(version: VersionInfo): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(healthRouter({ version }));
  app.use(traceResponse);

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
