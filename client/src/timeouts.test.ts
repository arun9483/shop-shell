import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, timeouts, TimeoutError, withTimeout } from './timeouts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('withTimeout', () => {
  it('rejects with a TimeoutError when the promise is too slow', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise(() => {}), 100, 'Loading a page');
    vi.advanceTimersByTime(100);
    await expect(slow).rejects.toBeInstanceOf(TimeoutError);
  });

  it('passes a fast result through', async () => {
    await expect(withTimeout(Promise.resolve('page'), 100, 'Loading a page')).resolves.toBe('page');
  });
});

describe('fetchWithTimeout', () => {
  function hangingFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(signal.reason as Error);
            });
          }),
      ),
    );
  }

  it(`aborts after timeouts.api (${timeouts.api} ms by default)`, async () => {
    vi.useFakeTimers();
    hangingFetch();
    const call = fetchWithTimeout('/api/slow');
    vi.advanceTimersByTime(timeouts.api);
    await expect(call).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts when the caller aborts', async () => {
    hangingFetch();
    const controller = new AbortController();
    const call = fetchWithTimeout('/api/slow', controller.signal);
    controller.abort(new Error('unmounted'));
    await expect(call).rejects.toThrow('unmounted');
  });
});
