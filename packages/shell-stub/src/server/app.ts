import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { StubConfig } from '../config.js';

export interface StubOptions extends StubConfig {
  /** The MFE's FES, e.g. http://localhost:3002. */
  mfeUrl: string;
  /** The built stub page (dist/client). */
  clientDir: string;
}

const CONFIG_PLACEHOLDER = '<!--shell-stub-config-->';

/** Escapes `<` so the JSON cannot close the script element it sits in. */
function configScript(config: StubConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<script type="application/json" id="shell-stub-config">${json}</script>`;
}

/**
 * One origin for one MFE, as the router is for the whole shop: `/mfe/<name>` and `/api/<name>` go
 * to the MFE's FES, `/__stub/` serves the stub page's files, and every other page is the stub page.
 */
export function createApp({ mfeUrl, clientDir, ...config }: StubOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  const prefixes = [`/mfe/${config.name}`, `/api/${config.name}`];
  app.use(
    createProxyMiddleware({
      target: mfeUrl,
      xfwd: true,
      pathFilter: (path) =>
        prefixes.some(
          (prefix) =>
            path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
        ),
    }),
  );

  app.use(
    '/__stub',
    express.static(clientDir, {
      index: false,
      setHeaders: (res, path) => {
        res.set(
          'Cache-Control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );

  const page = readFileSync(join(clientDir, 'index.html'), 'utf8').replace(
    CONFIG_PLACEHOLDER,
    configScript(config),
  );
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache').type('html').send(page);
  });
  return app;
}
