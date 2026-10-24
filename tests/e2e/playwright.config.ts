import { defineConfig, devices } from '@playwright/test';

// Runs against built output: `pnpm build` first. Catalog and Cart are not started here, so their
// routes show the Shell's fallback until those repositories run on ports 3002 and 3003.
const env = {
  NEW_RELIC_ENABLED: 'false',
  NEW_RELIC_NO_CONFIG_FILE: 'true',
  NEW_RELIC_LOG: 'stdout',
  NEW_RELIC_LOG_LEVEL: 'warn',
};

export const ports = { router: 3000, fes: 3001, backend: 4001 } as const;

function server(dir: string, port: number, extra: Record<string, string> = {}) {
  return {
    command: 'pnpm start',
    cwd: `../../${dir}`,
    url: `http://localhost:${port}${dir === 'router' ? '/' : '/health/live'}`,
    env: { ...env, PORT: String(port), ...extra },
    reuseExistingServer: !process.env.CI,
  };
}

export default defineConfig({
  testDir: 'specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${ports.router}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    server('mock-backend', ports.backend),
    server('fes', ports.fes, {
      BACKEND_URL: `http://localhost:${ports.backend}`,
      CLIENT_DIST: '../client/dist',
    }),
    server('router', ports.router, {
      SHELL_URL: `http://localhost:${ports.fes}`,
      MFE_CATALOG_URL: 'http://localhost:3002',
      MFE_CART_URL: 'http://localhost:3003',
    }),
  ],
});
