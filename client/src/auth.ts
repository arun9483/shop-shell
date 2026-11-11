import { fetchWithTimeout } from './timeouts';

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
 * refresh once and retry. If the user still is not logged in, go to login. With login off (MVP-1)
 * no call is ever a `401`, so this is a plain call.
 */
export async function apiFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const first = await fetchWithTimeout(url, signal);
  if (first.status !== 401) return first;
  const res = await underRefreshLock(async () => {
    const retry = await fetchWithTimeout(url, signal);
    if (retry.status !== 401) return retry;
    const refreshed = await fetch('/auth/refresh', { method: 'POST' });
    return refreshed.ok ? fetchWithTimeout(url, signal) : retry;
  });
  if (res.status === 401) goToLogin();
  return res;
}
