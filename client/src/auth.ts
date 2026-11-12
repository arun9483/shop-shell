import { fetchWithTimeout, timeouts } from './timeouts';

// MVP-2 login, client side. Every client of the shop (the Shell and each MFE) carries this small
// wrapper itself; they share only these URLs and names, never code.

/** Shared by every tab of the shop, so only one tab refreshes at a time. */
export const REFRESH_LOCK = 'shop-auth-refresh';

/** Where a page goes to log in, coming back to the same address. */
export function loginUrl(): string {
  return `/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

export function goToLogin(): void {
  window.location.assign(loginUrl());
}

/** The Shell FES marks the page when login is on (MVP-2); otherwise nothing is asked (MVP-1). */
export function loginIsOn(): boolean {
  return document.querySelector('meta[name="shop-login"]') !== null;
}

/** The status of `url` without its body, or 0 when it does not answer in time. */
export async function headStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeouts.api),
    });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * After a `401` for `url` that cannot be retried as a call (an MFE's entry): under the shared lock,
 * check again (another tab may have refreshed), then refresh once. `unavailable` when login cannot
 * be checked right now (`503`): going to login would only reach an IdP that is down.
 */
export function refreshFor(url: string): Promise<'logged-in' | 'login' | 'unavailable'> {
  return underRefreshLock(async () => {
    if ((await headStatus(url)) !== 401) return 'logged-in';
    const refreshed = await fetch('/auth/refresh', { method: 'POST' });
    if (refreshed.ok) return 'logged-in';
    return refreshed.status === 401 ? 'login' : 'unavailable';
  });
}

// Without the Web Locks API, refreshes are still serialised within this page.
let pageQueue: Promise<unknown> = Promise.resolve();

function underRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  if ('locks' in navigator) return navigator.locks.request(REFRESH_LOCK, work);
  const run = pageQueue.then(work, work);
  pageQueue = run.catch(() => undefined);
  return run;
}

/**
 * An API call with login handled. A `401` means the lightweight access token has expired: under the
 * shared lock, retry first (another tab may have refreshed, and cookies are shared by every tab), then
 * refresh once and retry. If the user still is not logged in, go to login. If login cannot be checked
 * right now (refresh answers `503`, e.g. the IdP is down), return that answer, so the page says it
 * could not load, instead of sending the user to an IdP that is down. With login off (MVP-1) no call
 * is ever a `401`, so this is a plain call.
 */
export async function apiFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const first = await fetchWithTimeout(url, signal);
  if (first.status !== 401) return first;
  const res = await underRefreshLock(async () => {
    const retry = await fetchWithTimeout(url, signal);
    if (retry.status !== 401) return retry;
    const refreshed = await fetch('/auth/refresh', { method: 'POST' });
    if (refreshed.ok) return fetchWithTimeout(url, signal);
    return refreshed.status === 401 ? retry : refreshed;
  });
  if (res.status === 401) goToLogin();
  return res;
}
