// MVP-2 sign-in for the Shell (phase 2), through a stack with sign-in on: the Docker stack with
// shop-mfe-platform's compose.sso.yaml.
//
//   E2E_SSO=1 E2E_BASE_URL=https://shop.test TEST_USER_PASSWORD=… pnpm test:e2e
//
// Users sign in on the identity provider's own page (Keycloak, https://shop.test:8443) as alice (every
// unit's roles) or bob (no Catalog role).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { origin } from '../mfes.js';
import { expectNoAxeViolations } from './helpers.js';

const password = process.env.TEST_USER_PASSWORD ?? '';
const idpOrigin = process.env.E2E_IDP_ORIGIN ?? 'https://shop.test:8443';
const names = { alice: 'Alice Test', bob: 'Bob Test' } as const;
type User = keyof typeof names;

test.beforeAll(() => {
  expect(password, 'TEST_USER_PASSWORD from shop-mfe-platform/docker/.env').not.toBe('');
});

const onSignInPage = (page: Page) => expect(page).toHaveURL(new RegExp(`^${idpOrigin}/`));

async function fillSignIn(page: Page, user: User): Promise<void> {
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
}

/** Opens `path`, signs in on the IdP's page, and waits to be back on `path`. */
async function signIn(page: Page, user: User, path = '/'): Promise<void> {
  await page.goto(path);
  await onSignInPage(page);
  await fillSignIn(page, user);
  await expect(page).toHaveURL(`${origin}${path}`);
  await expect(page.getByText(names[user])).toBeVisible();
}

async function cookie(context: BrowserContext, name: string) {
  return (
    (await context.cookies(origin)).find((c) => c.name === name) ??
    (await context.cookies(`${origin}/auth/logout`)).find((c) => c.name === name)
  );
}

test.describe('without signing in', () => {
  test('pages go to sign-in and come back to the same address; APIs answer 401', async ({
    page,
    request,
  }) => {
    await page.goto('/help?x=1');
    await onSignInPage(page);
    const returnTo = new URL(page.url()).searchParams.get('redirect_uri');
    expect(returnTo).toBe(`${origin}/auth/callback`);

    const api = await request.get('/api/shell/greeting');
    expect(api.status()).toBe(401);
    expect(api.headers()['content-type']).toContain('application/problem+json');
    expect(api.headers()['cache-control']).toBe('no-store');
  });

  test('hashed files and version.json stay public', async ({ page, request }) => {
    await signIn(page, 'alice');
    const script = await page.locator('script[type="module"][src]').first().getAttribute('src');
    expect(script).toMatch(/^\/assets\//);
    expect((await request.get(script ?? '')).status()).toBe(200);
    expect((await request.get('/version.json')).status()).toBe(200);
  });
});

test.describe('signed in', () => {
  test('lands on the page asked for, with the three cookies, none readable by page code', async ({
    page,
    context,
  }) => {
    await signIn(page, 'alice', '/help');
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();

    const at = await cookie(context, 'shop_at');
    const rt = (await context.cookies(`${origin}/auth/refresh`)).find((c) => c.name === 'shop_rt');
    const id = await cookie(context, 'shop_id');
    expect([at?.path, rt?.path, id?.path]).toEqual(['/', '/auth', '/auth/logout']);
    for (const c of [at, rt, id]) {
      expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    }
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/shop_/);
  });

  test('pages and API calls carry only shop_at', async ({ page }) => {
    const sent: string[] = [];
    // The page itself and API calls; files served from the browser's cache send no headers at all.
    page.on('request', async (req) => {
      const kind = req.resourceType();
      if (new URL(req.url()).origin === origin && (kind === 'document' || kind === 'fetch')) {
        sent.push((await req.allHeaders()).cookie ?? '');
      }
    });
    await signIn(page, 'alice');
    sent.length = 0;
    await page.reload();
    await expect(page.getByText('Welcome to the shop.')).toBeVisible();
    expect(sent.length).toBeGreaterThan(2);
    for (const header of sent) {
      expect(header).toContain('shop_at=');
      expect(header).not.toMatch(/shop_rt=|shop_id=/);
    }
  });

  test('/api/shell/me gives the user and the Shell roles, never a token or sid', async ({
    page,
  }) => {
    await signIn(page, 'alice');
    const res = await page.request.get('/api/shell/me');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers().vary).toMatch(/Cookie/);
    const me = (await res.json()) as Record<string, unknown>;
    expect(me).toMatchObject({
      preferred_username: 'alice',
      name: 'Alice Test',
      roles: ['shell-user'],
    });
    expect(typeof me.sub).toBe('string');
    expect(Object.keys(me)).not.toEqual(expect.arrayContaining(['sid']));
    expect(JSON.stringify(me)).not.toMatch(/eyJ/);
  });

  test('the user display has no axe violations in either theme', async ({ page }) => {
    await signIn(page, 'alice');
    for (const theme of ['light', 'dark']) {
      await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });
});

test.describe('refresh', () => {
  test('an expired access token is refreshed once and the call retried', async ({
    page,
    context,
  }) => {
    await signIn(page, 'alice');
    const refreshes: number[] = [];
    page.on('response', (res) => {
      if (res.url() === `${origin}/auth/refresh`) refreshes.push(res.status());
    });
    // As if shop_at had expired: the next API call is a 401.
    await context.clearCookies({ name: 'shop_at' });
    await page.getByRole('link', { name: 'Help' }).click();
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByText('Welcome to the shop.')).toBeVisible();
    expect(refreshes).toEqual([204]);
    expect((await cookie(context, 'shop_at'))?.path).toBe('/');
  });
});

test.describe('sign-out', () => {
  test('no confirmation page, cookies cleared, and access ends', async ({ page, context }) => {
    test.setTimeout(90_000);
    await signIn(page, 'alice');
    const oldAccess = (await cookie(context, 'shop_at'))?.value ?? '';
    const oldRefresh =
      (await context.cookies(`${origin}/auth/refresh`)).find((c) => c.name === 'shop_rt')?.value ??
      '';

    await page.getByRole('button', { name: 'Sign out' }).click();
    // Back to the shop, which is protected, so on to the IdP's sign-in form: never its "log out?" page.
    await onSignInPage(page);
    await expect(page.locator('#username')).toBeVisible();
    expect((await context.cookies(origin)).filter((c) => c.name.startsWith('shop_'))).toEqual([]);

    const refresh = await page.request.post('/auth/refresh', {
      headers: { origin, cookie: `shop_rt=${oldRefresh}` },
    });
    expect(refresh.status()).toBe(401);
    // The old access token stops working within 30 s: the FES gate and the backend each reuse an
    // answer for 15 s.
    await expect
      .poll(
        async () =>
          (
            await page.request.get('/api/shell/greeting', {
              headers: { cookie: `shop_at=${oldAccess}` },
            })
          ).status(),
        { timeout: 40_000, intervals: [2_000] },
      )
      .toBe(401);
  });
});

test.describe('several tabs', () => {
  test('signing out in one tab sends the other to sign-in at once', async ({ context }) => {
    const first = await context.newPage();
    await signIn(first, 'alice');
    const second = await context.newPage();
    await second.goto('/help');
    await expect(second.getByText(names.alice)).toBeVisible();

    await first.getByRole('button', { name: 'Sign out' }).click();
    await onSignInPage(second);
  });

  test('sign-ins started in two tabs both succeed', async ({ context }) => {
    const [first, second] = [await context.newPage(), await context.newPage()];
    await first.goto('/');
    await second.goto('/help');
    await onSignInPage(first);
    await onSignInPage(second);
    await fillSignIn(first, 'alice');
    await expect(first.getByText(names.alice)).toBeVisible();
    await fillSignIn(second, 'alice');
    await expect(second).toHaveURL(`${origin}/help`);
    await expect(second.getByText(names.alice)).toBeVisible();
  });

  test('another user signing in in one tab makes the other reload as that user', async ({
    context,
  }) => {
    const [first, second] = [await context.newPage(), await context.newPage()];
    await signIn(first, 'alice');
    // Sign out at the IdP directly, so the Shell sends no "signed-out" message, then sign in as bob.
    await second.goto(`${idpOrigin}/realms/shop/protocol/openid-connect/logout`);
    await second.locator('#kc-logout').click();
    await second.goto('/auth/login');
    await fillSignIn(second, 'bob');
    await expect(second.getByText(names.bob)).toBeVisible();
    await expect(first.getByText(names.bob)).toBeVisible();
    await expect(first.getByText(names.alice)).toHaveCount(0);
  });
});
