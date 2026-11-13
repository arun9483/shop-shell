// Criterion 9 (MVP-2 phase 5): with the IdP down, every check fails closed (503), pages say so in plain
// HTML, and an expired login is not sent to a login page that is down. Stops Keycloak, so it runs alone:
//
//   E2E_SSO=1 E2E_IDP_DOWN=1 E2E_BASE_URL=https://shop.test TEST_USER_PASSWORD=… pnpm test:e2e
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { origin } from '../mfes.js';

const keycloak = process.env.E2E_KEYCLOAK_CONTAINER ?? 'shop-keycloak-1';
const idpOrigin = process.env.E2E_IDP_ORIGIN ?? 'https://shop.test:8443';
const password = process.env.TEST_USER_PASSWORD ?? '';
// The FES gate and the backend each reuse an answer for 15 s.
const CACHES_MS = 16_000;

const docker = (...args: string[]) => execFileSync('docker', args, { stdio: 'ignore' });

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test.afterAll(() => {
  // Whatever happened, leave Keycloak running.
  docker('start', keycloak);
});

async function login(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  if (page.url().startsWith(idpOrigin)) {
    await page.locator('#username').fill('alice');
    await page.locator('#password').fill(password);
    await page.locator('#kc-login').click();
  }
  await expect(page.getByText('Alice Test')).toBeVisible();
}

test('with the IdP down: 503 everywhere, a plain page, no login redirect; then it recovers', async ({
  page,
  context,
}) => {
  expect(password, 'TEST_USER_PASSWORD from shop-mfe-platform/docker/.env').not.toBe('');
  await login(page, '/help');

  docker('stop', keycloak);
  await page.waitForTimeout(CACHES_MS);

  for (const path of ['/api/shell/greeting', '/api/catalog/products', '/api/cart']) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(503);
    expect(res.headers()['content-type'], path).toContain('application/problem+json');
    expect(res.headers()['cache-control'], path).toBe('no-store');
  }

  const other = await context.newPage();
  const response = await other.goto('/catalog');
  expect(response?.status()).toBe(503);
  await expect(other.getByText('Login cannot be checked right now')).toBeVisible();
  await expect(other.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/catalog');
  await other.close();

  // An expired login: refresh answers 503, so the page says it could not load and stays in the shop.
  await context.clearCookies({ name: 'shop_at' });
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByText('The greeting could not be loaded.')).toBeVisible();
  expect(page.url().startsWith(origin)).toBe(true);

  docker('start', keycloak);
  await expect
    .poll(
      async () =>
        (
          await page.request.get(`${idpOrigin}/realms/shop/.well-known/openid-configuration`)
        ).status(),
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe(200);

  // No server restarted: the shop works again, after a new login if the IdP's session did not survive.
  await login(page, '/catalog');
  await expect(page.getByRole('link', { name: 'Stoneware mug' })).toBeVisible();
});
