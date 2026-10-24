import { lazy, type ComponentType } from 'react';

// Timeouts for this unit, set at build time from VITE_ variables (see .env.example). They run on
// setTimeout, so a test can fast-forward the page clock instead of waiting.
function ms(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const timeouts = {
  /** A lazy feature chunk slower than this shows the unit's fallback. */
  lazyChunk: ms(import.meta.env.VITE_LAZY_CHUNK_TIMEOUT_MS, 5000),
  /** An API call slower than this fails like any other failed call. */
  api: ms(import.meta.env.VITE_API_TIMEOUT_MS, 4000),
  /** An MFE entry slower than this to load shows the Shell's fallback for that MFE. */
  mfeLoad: ms(import.meta.env.VITE_MFE_LOAD_TIMEOUT_MS, 5000),
  /** An MFE bootstrap or mount slower than this shows the Shell's fallback for that MFE. */
  mfeMount: ms(import.meta.env.VITE_MFE_MOUNT_TIMEOUT_MS, 3000),
};

export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${what} took longer than ${timeoutMs} ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** `React.lazy` whose chunk must arrive within `timeouts.lazyChunk`. */
export function lazyWithTimeout<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
) {
  return lazy(() => withTimeout(load(), timeouts.lazyChunk, 'Loading a page'));
}

/** `fetch` that is aborted after `timeouts.api`, or when `signal` aborts. */
export function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new TimeoutError(`${url} took longer than ${timeouts.api} ms`));
  }, timeouts.api);
  signal?.addEventListener('abort', () => {
    controller.abort(signal.reason);
  });
  return fetch(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}
