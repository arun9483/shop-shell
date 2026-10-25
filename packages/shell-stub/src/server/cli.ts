import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { NewRelicConfig } from '../config.js';
import { createApp } from './app.js';

const usage = `Usage: shell-stub --name <mfe> --mfe-url <url> [--port <port>] [--route <path>] [--env-file <file>]

Runs one shop MFE standalone at http://localhost:<port>/<mfe>.

  --name      the MFE's name, as in the Shell's MFE list (e.g. catalog)
  --mfe-url   the MFE's FES (e.g. http://localhost:3002)
  --port      the stub's port (default 3100)
  --route     the MFE's route (default /<name>)
  --env-file  a .env file with the New Relic browser keys (optional):
              NEW_RELIC_ACCOUNT_ID, NEW_RELIC_TRUST_KEY, NEW_RELIC_AGENT_ID,
              NEW_RELIC_BROWSER_LICENSE_KEY, NEW_RELIC_BROWSER_APPLICATION_ID`;

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'mfe-url': { type: 'string' },
    port: { type: 'string', default: '3100' },
    route: { type: 'string' },
    'env-file': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.name || !values['mfe-url']) {
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

const name = values.name;
const port = Number(values.port);
const monitoring = newRelic();
createApp({
  name,
  routePrefix: values.route ?? `/${name}`,
  mfeUrl: values['mfe-url'],
  clientDir: join(import.meta.dirname, '..', 'client'),
  ...(monitoring ? { newRelic: monitoring } : {}),
}).listen(port, () => {
  console.log(`${name} standalone on http://localhost:${port}/${name}`);
  console.log(`  /mfe/${name}, /api/${name} -> ${values['mfe-url'] ?? ''}`);
  console.log(`  New Relic browser agent: ${monitoring ? 'on' : 'off'}`);
});
