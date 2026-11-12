import { defineConfig, devices } from '@playwright/test';
import { externalOrigin, mfes, origin, ports, routerDir } from './mfes.js';

// Runs against built output: `pnpm build` here, in `shop-router` and in each MFE repository first.
// `shop-router` is required. An MFE whose repository is not checked out next to this one (or at
// SHOP_<NAME>_DIR) and built is not started, so its route shows the Shell's fallback. With
// E2E_BASE_URL set, nothing is started and the tests run through that origin instead; specs that
// start their own servers are left out.
const env = {
  NEW_RELIC_ENABLED: 'false',
  NEW_RELIC_NO_CONFIG_FILE: 'true',
  NEW_RELIC_LOG: 'stdout',
  NEW_RELIC_LOG_LEVEL: 'warn',
};

function server(
  cwd: string,
  port: number,
  extra: Record<string, string> = {},
  path = '/health/live',
) {
  return {
    command: 'pnpm start',
    cwd,
    url: `http://localhost:${port}${path}`,
    env: { ...env, PORT: String(port), ...extra },
    reuseExistingServer: !process.env.CI,
  };
}

function unit(dir: string, fesPort: number, backendPort: number) {
  return [
    server(`${dir}/mock-backend`, backendPort),
    server(`${dir}/fes`, fesPort, {
      BACKEND_URL: `http://localhost:${backendPort}`,
      CLIENT_DIST: '../client/dist',
    }),
  ];
}

const sso = process.env.E2E_SSO === '1';
// Stops and starts Keycloak, so it runs alone: E2E_SSO=1 E2E_IDP_DOWN=1.
const idpDown = process.env.E2E_IDP_DOWN === '1';

export default defineConfig({
  testDir: 'specs',
  // Login (MVP-2): with E2E_SSO=1, only sso.spec.ts runs, through a stack with login on (the Docker
  // stack with compose.sso.yaml). Without it, sso.spec.ts is left out and MVP-1's specs run.
  ...(sso
    ? { testMatch: idpDown ? 'idp-down.spec.ts' : 'sso.spec.ts' }
    : {
        testIgnore: externalOrigin
          ? [
              'readiness.spec.ts',
              'standalone.spec.ts',
              'swap.spec.ts',
              'sso.spec.ts',
              'idp-down.spec.ts',
            ]
          : ['sso.spec.ts', 'idp-down.spec.ts'],
      }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: origin, ignoreHTTPSErrors: !!externalOrigin },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalOrigin
    ? []
    : [
        ...unit('../..', ports.fes, ports.backend),
        ...mfes.filter((m) => m.available).flatMap((m) => unit(m.dir, m.fesPort, m.backendPort)),
        server(
          routerDir,
          ports.router,
          {
            SHELL_URL: `http://localhost:${ports.fes}`,
            ...Object.fromEntries(
              mfes.map((m) => [`MFE_${m.name.toUpperCase()}_URL`, `http://localhost:${m.fesPort}`]),
            ),
          },
          '/',
        ),
      ],
});
