import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Response, type Router as ExpressRouter } from 'express';

export interface VersionInfo {
  name: string;
  version: string;
  commit: string;
  buildTime: string;
}

/** Reads the `version.json` that `write-version` puts next to the compiled output. */
export function readVersion(dir: string): VersionInfo {
  try {
    return JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')) as VersionInfo;
  } catch {
    return { name: 'unknown', version: '0.0.0', commit: 'unknown', buildTime: 'unknown' };
  }
}

export interface HealthOptions {
  version: VersionInfo;
  /** Readiness check; the server is ready when it resolves to true. */
  ready?: () => Promise<boolean>;
}

/**
 * A health response, the same from every server in the shop. It follows the IETF health check draft
 * (draft-inadarei-api-health-check-06): `application/health+json`, with `503` for `fail`.
 */
function sendHealth(res: Response, status: 'pass' | 'fail', version: VersionInfo): void {
  res
    .status(status === 'pass' ? 200 : 503)
    .type('application/health+json')
    .json({ status, version: version.version, releaseId: version.commit, serviceId: version.name });
}

/** `/health/live`, `/health/ready` and `/version`. They are not API routes. */
export function healthRouter({
  version,
  ready = () => Promise.resolve(true),
}: HealthOptions): ExpressRouter {
  const router = Router();
  router.use(['/health', '/version'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/health/live', (_req, res) => {
    sendHealth(res, 'pass', version);
  });
  router.get('/health/ready', async (_req, res) => {
    const ok = await ready().catch(() => false);
    sendHealth(res, ok ? 'pass' : 'fail', version);
  });
  router.get('/version', (_req, res) => {
    res.json(version);
  });
  return router;
}
