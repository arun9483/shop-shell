import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Router as ExpressRouter } from 'express';

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

/** `/health/live`, `/health/ready` and `/version`. They are not API routes. */
export function healthRouter({
  version,
  ready = () => Promise.resolve(true),
}: HealthOptions): ExpressRouter {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.type('application/health+json').json({ status: 'pass' });
  });
  router.get('/health/ready', async (_req, res) => {
    const ok = await ready().catch(() => false);
    res
      .status(ok ? 200 : 503)
      .type('application/health+json')
      .json({ status: ok ? 'pass' : 'fail' });
  });
  router.get('/version', (_req, res) => {
    res.json(version);
  });
  return router;
}
