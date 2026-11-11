import {
  checkAccessToken,
  clearCookie,
  COOKIES,
  HttpError,
  readCookie,
  setCookie,
  loginAttemptCookie,
  type CookieSealer,
  type Idp,
  type IdpAdapter,
} from '@shop-shell/server-common';
import { Router, type Request, type Response } from 'express';
import * as client from 'openid-client';

export interface LoginOptions {
  idp: () => Promise<Idp>;
  adapter: IdpAdapter;
  /** The shop's public origin, e.g. `https://shop.test`: the callback and return addresses. */
  publicOrigin: string;
  /** Encrypts the refresh token, the ID token and each login attempt. */
  sealer: CookieSealer;
}

// A login attempt must finish within this time.
const ATTEMPT_MS = 10 * 60 * 1000;

interface Attempt {
  verifier: string;
  nonce: string;
  returnTo: string;
}

/** Only a path on the shop's own origin, never another site or the login routes themselves. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x5c) return '/'; // control characters, backslash
  }
  if (value.startsWith('/auth/')) return '/';
  return value;
}

/**
 * The Shell FES's login lifecycle (MVP-2): the only place tokens are received, refreshed or cleared.
 * Sets the three session cookies together and clears them together (ADR 0003).
 */
export function loginRoutes({ idp, adapter, publicOrigin, sealer }: LoginOptions): Router {
  const router = Router();
  const callbackUrl = `${publicOrigin}/auth/callback`;

  router.use('/auth', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  async function setSession(res: Response, tokens: client.TokenEndpointResponse): Promise<void> {
    setCookie(res, COOKIES.accessToken, tokens.access_token);
    if (tokens.refresh_token)
      setCookie(res, COOKIES.refreshToken, await sealer.seal(tokens.refresh_token));
    if (tokens.id_token) setCookie(res, COOKIES.idToken, await sealer.seal(tokens.id_token));
  }

  function clearSession(res: Response): void {
    clearCookie(res, COOKIES.accessToken);
    clearCookie(res, COOKIES.refreshToken);
    clearCookie(res, COOKIES.idToken);
  }

  // Another site may not refresh or end a user's session.
  function sameOrigin(req: Request): void {
    if (req.get('origin') !== publicOrigin)
      throw new HttpError(403, 'Cross-origin request refused');
  }

  async function loggedIn(req: Request): Promise<boolean> {
    const token = readCookie(req, COOKIES.accessToken.name);
    if (!token) return false;
    const { settings, keys } = await idp();
    return checkAccessToken(token, {
      keys,
      issuer: settings.issuer,
      authorizedParty: settings.clientId,
      isAccessToken: adapter.isAccessToken,
    }).then(
      () => true,
      () => false,
    );
  }

  router.get('/auth/login', async (req, res) => {
    const { config } = await idp();
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const attempt: Attempt = { verifier, nonce, returnTo: safeReturnTo(req.query.returnTo) };
    setCookie(
      res,
      loginAttemptCookie(state),
      await sealer.seal(JSON.stringify(attempt)),
      ATTEMPT_MS,
    );
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid',
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    res.redirect(302, url.href);
  });

  router.get('/auth/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookie = loginAttemptCookie(state);
    const sealed = state ? readCookie(req, cookie.name) : undefined;
    const opened = sealed && (await sealer.open(sealed));
    if (!opened) {
      // Another tab may have finished logging in already.
      res.redirect(302, (await loggedIn(req)) ? '/' : '/auth/login');
      return;
    }
    const attempt = JSON.parse(opened) as Attempt;
    clearCookie(res, cookie);
    const { config } = await idp();
    let tokens: client.TokenEndpointResponse;
    try {
      tokens = await client.authorizationCodeGrant(config, new URL(req.originalUrl, publicOrigin), {
        pkceCodeVerifier: attempt.verifier,
        expectedState: state,
        expectedNonce: attempt.nonce,
      });
    } catch {
      res.redirect(
        302,
        (await loggedIn(req))
          ? attempt.returnTo
          : `/auth/login?returnTo=${encodeURIComponent(attempt.returnTo)}`,
      );
      return;
    }
    await setSession(res, tokens);
    res.redirect(302, attempt.returnTo);
  });

  router.post('/auth/refresh', async (req, res) => {
    sameOrigin(req);
    const sealed = readCookie(req, COOKIES.refreshToken.name);
    const refreshToken = sealed && (await sealer.open(sealed));
    if (!refreshToken) {
      clearSession(res);
      throw new HttpError(401, 'Login required');
    }
    const { config } = await idp();
    let tokens: client.TokenEndpointResponse;
    try {
      tokens = await client.refreshTokenGrant(config, refreshToken);
    } catch (error) {
      if (error instanceof client.ResponseBodyError) {
        // The IdP's session has ended.
        clearSession(res);
        throw new HttpError(401, 'Login required');
      }
      throw new HttpError(503, 'Login cannot be refreshed now');
    }
    await setSession(res, tokens);
    res.status(204).end();
  });

  router.post('/auth/logout', async (req, res) => {
    sameOrigin(req);
    const sealed = readCookie(req, COOKIES.idToken.name);
    const idToken = sealed && (await sealer.open(sealed));
    clearSession(res);
    const { config, settings } = await idp();
    const postLogout = { post_logout_redirect_uri: `${publicOrigin}/auth/logged-out` };
    // With the ID token the IdP logs out at once; without it, it asks the user to confirm.
    const url = client.buildEndSessionUrl(
      config,
      idToken
        ? { ...postLogout, id_token_hint: idToken }
        : { ...postLogout, client_id: settings.clientId },
    );
    res.redirect(303, url.href);
  });

  // Where the IdP sends the browser once its session has ended: only now are the other tabs told, so
  // none of them logs in again on the session being ended. Then on to the shop, which asks to log in.
  router.get('/auth/logged-out', (_req, res) => {
    res
      .type('html')
      .send(
        '<!doctype html><title>Logged out</title><script>' +
          "try{new BroadcastChannel('shop-auth').postMessage({type:'logged-out'})}catch{}" +
          'location.replace(\'/\')</script><p>You are logged out. <a href="/">Continue</a></p>',
      );
  });

  return router;
}
