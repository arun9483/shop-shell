import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { notFound, problemHandler } from '../problem.js';
import { meHandler, requireUser } from './backend.js';
import { TtlCache } from './cache.js';
import { oidcSettingsFromEnv } from './config.js';
import { cookieSealer, readCookie } from './cookies.js';
import { fesGate } from './fes.js';
import { IdpUnavailableError, type IdpAdapter, type IdpUser } from './idp/adapter.js';
import type { Idp } from './metadata.js';
import { checkAccessToken } from './token.js';

vi.mock('newrelic', () => ({ default: { setUserID: vi.fn(), getTraceMetadata: () => ({}) } }));

const ISSUER = 'https://idp.test/realms/shop';
let signingKey: CryptoKey;
let otherKey: CryptoKey;
let idp: () => Promise<Idp>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const settings = {
    issuer: ISSUER,
    internalUrl: ISSUER,
    clientId: 'shell-fes',
    clientSecret: 's',
  };
  idp = () => Promise.resolve({ settings, keys, config: {} as Idp['config'] });
});

function token(claims: JWTPayload = {}, key = signingKey, expiresIn = '5m'): Promise<string> {
  return new SignJWT({
    typ: 'Bearer',
    sid: 'sid-1',
    azp: 'shell-fes',
    aud: ['shell-backend'],
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

const alice: IdpUser = {
  sub: 'user-1',
  preferred_username: 'alice',
  name: 'Alice Test',
  enabled: true,
};

function fakeAdapter(overrides: Partial<IdpAdapter> = {}): IdpAdapter & { calls: number } {
  const adapter = {
    calls: 0,
    getUser: () => Promise.resolve(alice),
    getUnitRoles: () => Promise.resolve(['shell-user']),
    isSessionActive: () => {
      adapter.calls++;
      return Promise.resolve(true);
    },
    isAccessToken: (_header: Record<string, unknown>, claims: Record<string, unknown>) =>
      claims.typ === 'Bearer',
    ...overrides,
  };
  return adapter;
}

const checks = (audience?: string, authorizedParty?: string) => ({
  keys: createLocalJWKSet({ keys: [] }),
  issuer: ISSUER,
  isAccessToken: fakeAdapter().isAccessToken,
  ...(audience ? { audience } : {}),
  ...(authorizedParty ? { authorizedParty } : {}),
});

describe('checkAccessToken', () => {
  it('accepts a valid lightweight access token and returns sub and sid', async () => {
    const { keys } = await idp();
    await expect(
      checkAccessToken(await token(), { ...checks('shell-backend'), keys }),
    ).resolves.toEqual({
      sub: 'user-1',
      sid: 'sid-1',
    });
  });

  it.each([
    ['signed by another key', () => token({}, otherKey)],
    ['expired', () => token({}, signingKey, '-1m')],
    ['an ID token', () => token({ typ: 'ID' })],
    ['without the backend in aud', () => token({ aud: ['cart-backend'] })],
    ['issued to another client', () => token({ azp: 'other' })],
    ['without a session', () => token({ sid: undefined })],
  ])('refuses a token %s with 401', async (_what, make) => {
    const { keys } = await idp();
    await expect(
      checkAccessToken(await make(), { ...checks('shell-backend', 'shell-fes'), keys }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('TtlCache', () => {
  it('shares a load, reuses it until it expires, and forgets failures', async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    let loads = 0;
    const load = () => Promise.resolve(++loads);
    expect(await Promise.all([cache.get('a', load), cache.get('a', load)])).toEqual([1, 1]);
    now = 999;
    expect(await cache.get('a', load)).toBe(1);
    now = 1000;
    expect(await cache.get('a', load)).toBe(2);
    await expect(cache.get('b', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get('b', load)).toBe(3);
  });
});

describe('oidcSettingsFromEnv', () => {
  it('is off unless AUTH_ENABLED=true', () => {
    expect(oidcSettingsFromEnv({})).toBeUndefined();
    expect(oidcSettingsFromEnv({ AUTH_ENABLED: '1' })).toBeUndefined();
  });

  it('stops the server when a setting is missing', () => {
    expect(() => oidcSettingsFromEnv({ AUTH_ENABLED: 'true', OIDC_ISSUER_URL: ISSUER })).toThrow(
      'OIDC_CLIENT_ID',
    );
  });
});

describe('cookieSealer', () => {
  it('opens only what it sealed', async () => {
    const sealer = cookieSealer('a'.repeat(64));
    const sealed = await sealer.seal('refresh-token');
    expect(sealed).not.toContain('refresh-token');
    expect(await sealer.open(sealed)).toBe('refresh-token');
    expect(await cookieSealer('b'.repeat(64)).open(sealed)).toBeUndefined();
    expect(await sealer.open(`${sealed}x`)).toBeUndefined();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => cookieSealer('short')).toThrow('32 bytes');
  });
});

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    const req = { get: () => 'a=1; shop_at=abc.def; b=2' } as unknown as express.Request;
    expect(readCookie(req, 'shop_at')).toBe('abc.def');
    expect(readCookie(req, 'missing')).toBeUndefined();
  });
});

function backendApp(adapter: IdpAdapter): express.Express {
  const app = express();
  app.use(requireUser({ idp, adapter, unit: 'shell' }));
  app.get('/me', meHandler);
  app.use(notFound);
  app.use(problemHandler);
  return app;
}

describe('requireUser and /me (backend)', () => {
  it('answers /me with OIDC fields and the unit roles, never enabled or sid', async () => {
    const res = await request(backendApp(fakeAdapter()))
      .get('/me')
      .set('authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sub: 'user-1',
      preferred_username: 'alice',
      name: 'Alice Test',
      roles: ['shell-user'],
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses no token, an ended session and a disabled user with 401', async () => {
    expect((await request(backendApp(fakeAdapter())).get('/me')).status).toBe(401);
    const ended = fakeAdapter({ isSessionActive: () => Promise.resolve(false) });
    expect(
      (
        await request(backendApp(ended))
          .get('/me')
          .set('authorization', `Bearer ${await token()}`)
      ).status,
    ).toBe(401);
    const disabled = fakeAdapter({ getUser: () => Promise.resolve({ ...alice, enabled: false }) });
    expect(
      (
        await request(backendApp(disabled))
          .get('/me')
          .set('authorization', `Bearer ${await token()}`)
      ).status,
    ).toBe(401);
  });

  it('refuses a user without a role in the unit with 403', async () => {
    const noRole = fakeAdapter({ getUnitRoles: () => Promise.resolve([]) });
    const res = await request(backendApp(noRole))
      .get('/me')
      .set('authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('fails closed with 503 when the IdP cannot answer', async () => {
    const down = fakeAdapter({ getUser: () => Promise.reject(new IdpUnavailableError('down')) });
    const res = await request(backendApp(down))
      .get('/me')
      .set('authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(503);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('asks the IdP once per session within the cache time', async () => {
    const adapter = fakeAdapter();
    const app = backendApp(adapter);
    const bearer = `Bearer ${await token()}`;
    await request(app).get('/me').set('authorization', bearer);
    await request(app).get('/me').set('authorization', bearer);
    expect(adapter.calls).toBe(1);
  });
});

describe('fesGate (FES)', () => {
  let backend: Server;
  let backendUrl: string;
  let meStatus = 200;
  let meCalls = 0;

  beforeAll(async () => {
    const fake = express();
    fake.get('/me', (_req, res) => {
      meCalls++;
      res.status(meStatus).json(meStatus === 200 ? { sub: 'user-1', roles: ['shell-user'] } : {});
    });
    backend = fake.listen(0);
    await new Promise((resolve) => backend.once('listening', resolve));
    backendUrl = `http://localhost:${(backend.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    backend.close();
  });

  function fesApp(): express.Express {
    const gate = fesGate({
      idp,
      adapter: fakeAdapter(),
      signInClientId: 'shell-fes',
      backendUrl,
      backendTimeoutMs: 1000,
      cacheMs: 0,
    });
    const ok: RequestHandler = (_req, res) => {
      res.json({ me: res.locals.me as unknown, bearer: Boolean(res.locals.accessToken) });
    };
    const app = express();
    app.get('/api/x', gate.api, ok);
    app.get('/page', gate.page, ok);
    app.use(problemHandler);
    return app;
  }

  it("lets a signed-in user through with the backend's /me answer and the token for backend calls", async () => {
    meStatus = 200;
    const res = await request(fesApp())
      .get('/api/x')
      .set('cookie', `shop_at=${await token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ me: { sub: 'user-1', roles: ['shell-user'] }, bearer: true });
  });

  it('answers 401 to API calls and sends pages to sign in without a valid token', async () => {
    expect((await request(fesApp()).get('/api/x')).status).toBe(401);
    expect(
      (
        await request(fesApp())
          .get('/api/x')
          .set('cookie', `shop_at=${await token({ typ: 'ID' })}`)
      ).status,
    ).toBe(401);
    const page = await request(fesApp()).get('/page?x=1');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/auth/login?returnTo=%2Fpage%3Fx%3D1');
  });

  it("passes the backend's 401 and 403 back, and fails closed when it cannot answer", async () => {
    const cookie = `shop_at=${await token()}`;
    meStatus = 401;
    expect((await request(fesApp()).get('/api/x').set('cookie', cookie)).status).toBe(401);
    meStatus = 403;
    expect((await request(fesApp()).get('/api/x').set('cookie', cookie)).status).toBe(403);
    meStatus = 500;
    expect((await request(fesApp()).get('/api/x').set('cookie', cookie)).status).toBe(503);
    expect(meCalls).toBeGreaterThan(0);
  });
});
