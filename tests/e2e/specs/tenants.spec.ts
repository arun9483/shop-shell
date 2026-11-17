// MVP-3 phase 3, criterion 5: two tenants side by side (shop-mfe-platform's docker/tenant.sh), each with
// its own shop host, IdP host and Keycloak. A login on one is not a login on the other, and no cookie of
// one reaches the other's hosts.
//
//   E2E_TENANTS=1 E2E_BASE_URL=https://orga.shop.test E2E_TENANT_B_ORIGIN=https://orgb.shop.test \
//   E2E_TENANT_A_IDP=https://orga-idp.test E2E_TENANT_B_IDP=https://orgb-idp.test \
//   E2E_TENANT_A_PASSWORD=… E2E_TENANT_B_PASSWORD=… pnpm test:e2e
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { origin } from '../mfes.js';

const required = (name: string) => {
  const value = process.env[name] ?? '';
  expect(value, name).not.toBe('');
  return value;
};

interface Tenant {
  origin: string;
  idp: string;
  password: string;
}

let a: Tenant;
let b: Tenant;

test.beforeAll(() => {
  a = { origin, idp: required('E2E_TENANT_A_IDP'), password: required('E2E_TENANT_A_PASSWORD') };
  b = {
    origin: required('E2E_TENANT_B_ORIGIN'),
    idp: required('E2E_TENANT_B_IDP'),
    password: required('E2E_TENANT_B_PASSWORD'),
  };
});

const hostOf = (url: string) => new URL(url).hostname;

/** Opens the tenant's shop, logs in on its own IdP as alice, and waits to be back. */
async function login(page: Page, tenant: Tenant): Promise<void> {
  await page.goto(`${tenant.origin}/help`);
  await expect(page).toHaveURL(new RegExp(`^${tenant.idp}/`));
  await page.locator('#username').fill('alice');
  await page.locator('#password').fill(tenant.password);
  await page.locator('#kc-login').click();
  await expect(page).toHaveURL(`${tenant.origin}/help`);
  await expect(page.getByText('Alice Test')).toBeVisible();
}

/** Every cookie the browser would send to the tenant's shop or IdP. */
async function cookiesFor(context: BrowserContext, tenant: Tenant) {
  return context.cookies([
    tenant.origin,
    `${tenant.origin}/auth/logout`,
    `${tenant.origin}/auth/callback`,
    tenant.idp,
    `${tenant.idp}/realms/`,
  ]);
}

test('a login on one tenant is not a login on the other, and no cookie crosses over', async ({
  context,
}) => {
  const page = await context.newPage();
  await login(page, a);

  // Tenant A's cookies are host-only, on A's own hosts.
  const aCookies = await context.cookies();
  expect(aCookies.length).toBeGreaterThan(0);
  for (const cookie of aCookies) {
    expect([hostOf(a.origin), hostOf(a.idp)], cookie.name).toContain(cookie.domain);
  }
  // None of them would be sent to tenant B.
  expect(await cookiesFor(context, b)).toEqual([]);

  // Tenant B asks for its own login, on its own IdP.
  const other = await context.newPage();
  await other.goto(`${b.origin}/help`);
  await expect(other).toHaveURL(new RegExp(`^${b.idp}/`));
  expect((await other.request.get(`${b.origin}/api/shell/me`)).status()).toBe(401);

  // Logged in on both, each with its own session; ending B's leaves A's.
  await login(other, b);
  const bCookieNames = (await cookiesFor(context, b)).map((c) => `${c.domain} ${c.name}`);
  expect(
    bCookieNames.every((c) => c.startsWith(hostOf(b.origin)) || c.startsWith(hostOf(b.idp))),
  ).toBe(true);
  await other.getByRole('button', { name: 'Log out' }).click();
  await expect(other).toHaveURL(new RegExp(`^${b.idp}/`));
  expect((await page.request.get(`${a.origin}/api/shell/me`)).status()).toBe(200);
});
