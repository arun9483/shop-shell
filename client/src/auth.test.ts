import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './auth';

let loggedIn: boolean;
let refreshes: number;

function stubServer(refreshWorks: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/auth/refresh') {
        expect(init?.method).toBe('POST');
        refreshes++;
        if (refreshWorks) loggedIn = true;
        return Promise.resolve(new Response(null, { status: refreshWorks ? 204 : 401 }));
      }
      return Promise.resolve(
        loggedIn ? Response.json({ ok: true }) : new Response(null, { status: 401 }),
      );
    }),
  );
}

beforeEach(() => {
  loggedIn = false;
  refreshes = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('passes any answer but 401 through untouched', async () => {
    loggedIn = true;
    stubServer(true);
    expect((await apiFetch('/api/shell/greeting')).status).toBe(200);
    expect(refreshes).toBe(0);
  });

  it('refreshes once on a 401 and retries the call', async () => {
    stubServer(true);
    const res = await apiFetch('/api/shell/greeting');
    expect(res.status).toBe(200);
    expect(refreshes).toBe(1);
  });

  it('shares one refresh between calls refused at the same time', async () => {
    stubServer(true);
    const answers = await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it('goes to login, back to this page, when refresh fails', async () => {
    stubServer(false);
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/help', search: '?x=1', assign });
    const res = await apiFetch('/api/shell/greeting');
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith('/auth/login?returnTo=%2Fhelp%3Fx%3D1');
  });
});
