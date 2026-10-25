import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { NewRelicConfig } from '../config.js';
import { createApp } from './app.js';
import { listen } from './listen.js';
import { resolveSettings } from './settings.js';
import { startVite, viteMiddleware } from './vite.js';

const usage = `Usage: shell-stub --name <mfe> --mfe-url <url> [--port <port>] [--route <path>]
                  [--env-file <file>] [--dev [--dev-root <dir>] [--dev-entry <path>]]

Runs one shop MFE standalone at http://localhost:<port>/<mfe>.

  --name      the MFE's name, as in the Shell's MFE list (e.g. catalog)
  --mfe-url   the MFE's FES (e.g. http://localhost:3002)
  --port      the stub's port (default 3100); 0 picks any free port
  --route     the MFE's route (default /<name>)
  --env-file  a .env file with the New Relic browser keys (optional):
              NEW_RELIC_ACCOUNT_ID, NEW_RELIC_TRUST_KEY, NEW_RELIC_AGENT_ID,
              NEW_RELIC_BROWSER_LICENSE_KEY, NEW_RELIC_BROWSER_APPLICATION_ID
  --dev       development mode with HMR: runs the MFE's own Vite in this process and serves
              /mfe/<name> from its source; the API still goes to --mfe-url
  --dev-root  the MFE's Vite project, for --dev (default client)
  --dev-entry the entry in that project's source, for --dev (default src/entry.tsx)

Environment (overrides the flags, e.g. for other ports on one machine; can be in --env-file):
  SHELL_STUB_PORT, SHELL_STUB_MFE_URL`;

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'mfe-url': { type: 'string' },
    port: { type: 'string' },
    route: { type: 'string' },
    'env-file': { type: 'string' },
    dev: { type: 'boolean', default: false },
    'dev-root': { type: 'string', default: 'client' },
    'dev-entry': { type: 'string', default: 'src/entry.tsx' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.name) {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

if (values['env-file'] && existsSync(values['env-file'])) process.loadEnvFile(values['env-file']);

function newRelic(): NewRelicConfig | undefined {
  const env = process.env;
  const config = {
    accountId: env.NEW_RELIC_ACCOUNT_ID ?? '',
    trustKey: env.NEW_RELIC_TRUST_KEY ?? '',
    agentId: env.NEW_RELIC_AGENT_ID ?? '',
    licenseKey: env.NEW_RELIC_BROWSER_LICENSE_KEY ?? '',
    applicationId: env.NEW_RELIC_BROWSER_APPLICATION_ID ?? '',
  };
  return Object.values(config).every(Boolean) ? config : undefined;
}

function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const name = values.name;
const settings = (() => {
  try {
    return resolveSettings({ port: values.port, mfeUrl: values['mfe-url'] }, process.env);
  } catch (error) {
    return fail(error);
  }
})();
const { mfeUrl } = settings;
const monitoring = newRelic();
const server = createServer();
const devRoot = resolve(values['dev-root']);
const vite = values.dev ? await startVite(devRoot, server) : undefined;

server.on(
  'request',
  createApp({
    name,
    routePrefix: values.route ?? `/${name}`,
    mfeUrl,
    clientDir: join(import.meta.dirname, '..', 'client'),
    ...(monitoring ? { newRelic: monitoring } : {}),
    ...(vite ? { devMiddleware: viteMiddleware(vite), devEntry: values['dev-entry'] } : {}),
  }),
);

const port = await listen(server, settings.port).catch(fail);
console.log(`${name} standalone on http://localhost:${port}/${name}`);
if (vite) {
  console.log(`  /mfe/${name} -> Vite in ${devRoot} (development mode, HMR)`);
  console.log(`  /api/${name} -> ${mfeUrl}`);
} else {
  console.log(`  /mfe/${name}, /api/${name} -> ${mfeUrl}`);
}
console.log(`  New Relic browser agent: ${monitoring ? 'on' : 'off'}`);
