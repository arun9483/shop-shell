import {
  checkAccessToken,
  clearCookie,
  notFound,
  COOKIES,
  HttpError,
  IdpUnavailableError,
  readCookie,
  TtlCache,
  tryAgainPage,
  setCookie,
  loginAttemptCookie,
  type CookieSealer,
  type Idp,
  type IdpAdapter,
  ownClient,
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
  /** How long `/auth/login` waits for the IdP before saying login cannot be checked (F9). */
  idpCheckTimeoutMs?: number;
  /** How long one IdP check's answer is reused. */
  idpCheckCacheMs?: number;
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
export function loginRoutes({
  idp,
  adapter,
  publicOrigin,
  sealer,
  idpCheckTimeoutMs = 2000,
  idpCheckCacheMs = 5000,
}: LoginOptions): Router {
  const router = Router();
  const callbackUrl = `${publicOrigin}/auth/callback`;
  const idpChecks = new TtlCache<boolean>(idpCheckCacheMs);

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
    const current = await idp();
    return checkAccessToken(token, {
      keys: current.keys,
      issuer: current.settings.issuer,
      authorizedParty: ownClient(current).clientId,
      isAccessToken: adapter.isAccessToken,
    }).then(
      () => true,
      () => false,
    );
  }

  /**
   * Whether the IdP answers now, asked inside the network where this server reaches it. The login
   * page itself is the IdP's, so without this check a down IdP shows the browser a bare gateway error
   * on the IdP's address instead of the shop's page (MVP-2 verification, F9).
   */
  function idpAnswers(): Promise<boolean> {
    return idpChecks.get('idp', async () => {
      const current = await reachIdp();
      if (!current) return false;
      const base = current.settings.internalUrl.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/.well-known/openid-configuration`, {
          signal: AbortSignal.timeout(idpCheckTimeoutMs),
        });
        return res.ok;
      } catch {
        return false;
      }
    });
  }

  /** The IdP, or undefined when it cannot be reached; a wrong setting is still an error. */
  async function reachIdp(): Promise<Idp | undefined> {
    try {
      return await idp();
    } catch (error) {
      if (error instanceof IdpUnavailableError) return undefined;
      throw error;
    }
  }

  // `none` is the user's own navigation (typed address, bookmark); covers every step of a redirect chain.
  const fromShop = (req: Request) =>
    ['same-origin', 'none'].includes(req.get('sec-fetch-site') ?? '');

  const toLogin = (returnTo: string) => `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  router.get('/auth/login', async (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    if (!(await idpAnswers())) {
      // Try again goes to the page asked for, not here: the gate then decides afresh.
      tryAgainPage(res, returnTo);
      return;
    }
    const { config } = ownClient(await idp());
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const attempt: Attempt = { verifier, nonce, returnTo };
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
    const { config } = ownClient(await idp());
    let tokens: client.TokenEndpointResponse;
    try {
      tokens = await client.authorizationCodeGrant(config, new URL(req.originalUrl, publicOrigin), {
        pkceCodeVerifier: attempt.verifier,
        expectedState: state,
        expectedNonce: attempt.nonce,
      });
    } catch {
      res.redirect(302, (await loggedIn(req)) ? attempt.returnTo : toLogin(attempt.returnTo));
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
    const { config } = ownClient(await idp());
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

  /**
   * A page load with an expired login (MVP-2 verification, F9): the gate sends pages here, as only
   * `/auth/*` receives the refresh token. Refreshes on the server and goes back to the page, so the
   * browser never visits the IdP while the refresh token is valid; an ended or missing login goes on
   * to log in; an IdP that cannot answer gets the shop's `503` page. A GET, as it is a page load; so
   * it refreshes only for a navigation the browser says started in the shop or from the user
   * (`Sec-Fetch-Site`), and another site cannot make it refresh, e.g. to keep a session from timing
   * out. Anything else, or no header, goes on to log in, as before F9.
   */
  router.get('/auth/resume', async (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    const sealed = fromShop(req) ? readCookie(req, COOKIES.refreshToken.name) : undefined;
    const refreshToken = sealed && (await sealer.open(sealed));
    if (!refreshToken) {
      res.redirect(302, toLogin(returnTo));
      return;
    }
    const current = await reachIdp();
    if (!current) {
      tryAgainPage(res, returnTo);
      return;
    }
    const { config } = ownClient(current);
    let tokens: client.TokenEndpointResponse;
    try {
      tokens = await client.refreshTokenGrant(config, refreshToken);
    } catch (error) {
      if (error instanceof client.ResponseBodyError) {
        // The IdP's session has ended.
        clearSession(res);
        res.redirect(302, toLogin(returnTo));
        return;
      }
      // As POST /auth/refresh: any other failure means the IdP cannot answer now.
      tryAgainPage(res, returnTo);
      return;
    }
    await setSession(res, tokens);
    res.redirect(302, returnTo);
  });

  router.post('/auth/logout', async (req, res) => {
    sameOrigin(req);
    const sealed = readCookie(req, COOKIES.idToken.name);
    const idToken = sealed && (await sealer.open(sealed));
    clearSession(res);
    const { config, clientId } = ownClient(await idp());
    const postLogout = { post_logout_redirect_uri: `${publicOrigin}/auth/logged-out` };
    // With the ID token the IdP logs out at once; without it, it asks the user to confirm.
    const url = client.buildEndSessionUrl(
      config,
      idToken ? { ...postLogout, id_token_hint: idToken } : { ...postLogout, client_id: clientId },
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

  // Logout and refresh change state, so they take POST only: otherwise another site could end a
  // user's session with a plain link. An address typed in the browser gets a page saying so (F1).
  router.get(['/auth/logout', '/auth/refresh'], (req, res) => {
    const text =
      req.path === '/auth/logout'
        ? 'To log out, use the Log out button in the shop.'
        : 'This address is used by the shop itself, not opened in a browser.';
    res
      .status(405)
      .set('Allow', 'POST')
      .type('html')
      .send(
        `<!doctype html><title>Not a page</title><p>${text}</p><p><a href="/">Back to the shop</a></p>`,
      );
  });
  // Any other /auth address is not part of the shop: a 404, never the app.
  router.use('/auth', notFound);

  return router;
}
