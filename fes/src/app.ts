import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express, type RequestHandler, type Router } from 'express';
import {
  forward,
  noBackendAuth,
  type BackendHeaders,
  healthRouter,
  notFound,
  problemHandler,
  traceResponse,
  userBearer,
  type VersionInfo,
} from '@shop-shell/server-common';

/** Login for the shop (MVP-2), when `AUTH_ENABLED=true`. */
export interface FesAuth {
  /** `/auth/*`: the login lifecycle. */
  login: Router;
  /** Pages: no valid login → login page. */
  page: RequestHandler;
  /** `/api/shell/*`: no valid login → 401, no Shell role → 403. */
  api: RequestHandler;
}

export interface FesConfig {
  /** The Shell's backend service, e.g. the mock backend in development. */
  backendUrl: string;
  /** The built Shell client. */
  clientDist: string;
  version: VersionInfo;
  /** How long a backend call may take: a slower API call is a 504, a slower readiness check fails. */
  backendTimeoutMs: number;
  /** Auth for backend calls: a Google identity token on Cloud Run, nothing locally. */
  backendHeaders?: BackendHeaders;
  /** Off (MVP-1 behaviour) unless given. */
  auth?: FesAuth;
}

const NO_CACHE = 'no-cache';
const LOGIN_MARKER = '<meta name="shop-login" content="on">';

function withLoginMarker(html: string): string {
  return html.includes('</head>')
    ? html.replace('</head>', `${LOGIN_MARKER}</head>`)
    : html.replace(/^(<!doctype html>)?/i, `$1${LOGIN_MARKER}`);
}
const IMMUTABLE = 'public, max-age=31536000, immutable';

async function backendReady(
  backendUrl: string,
  timeoutMs: number,
  headers: BackendHeaders,
): Promise<boolean> {
  const res = await fetch(`${backendUrl}/health/ready`, {
    headers: await headers(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.ok;
}

export function createApp({
  backendUrl,
  clientDist,
  version,
  backendTimeoutMs,
  backendHeaders = noBackendAuth,
  auth,
}: FesConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    healthRouter({
      version,
      ready: () => backendReady(backendUrl, backendTimeoutMs, backendHeaders),
    }),
  );

  if (auth) app.use(auth.login);

  // Backend calls carry the user's lightweight access token when login is on.
  const headersFor = async (res: express.Response) => ({
    ...(await backendHeaders()),
    ...userBearer(res),
  });

  const api = express.Router();
  api.use(traceResponse);
  if (auth) {
    api.use(auth.api);
    // The gate has just asked the backend's /me: its answer is the user.
    api.get('/me', (_req, res) => {
      res.set('Cache-Control', 'no-store').set('Vary', 'Cookie').json(res.locals.me);
    });
  }
  api.get('/greeting', async (_req, res) =>
    forward(res, `${backendUrl}/greeting`, backendTimeoutMs, await headersFor(res)),
  );
  api.get('/test-error', async (req, res) => {
    if (req.query.in === 'backend') {
      await forward(res, `${backendUrl}/test-error`, backendTimeoutMs, await headersFor(res));
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
  // Every other GET is a client route, including deep links into MFEs: logged in only, with auth on.
  if (auth) {
    // The page says login is on, so the client asks for the user only then: with login off it
    // makes no extra request (MVP-1). Read once: the client's files change only with a deploy.
    let page: string | undefined;
    app.get('/{*path}', auth.page, (_req, res) => {
      page ??= withLoginMarker(readFileSync(join(clientDist, 'index.html'), 'utf8'));
      res.set('Cache-Control', NO_CACHE).type('html').send(page);
    });
  }
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', NO_CACHE).sendFile(join(clientDist, 'index.html'));
  });
  app.use(notFound);
  app.use(problemHandler);
  return app;
}
