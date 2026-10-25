import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { listen } from './listen.js';
import { DEFAULT_PORT, resolveSettings } from './settings.js';

const mfeUrl = 'http://localhost:3002';

describe('resolveSettings', () => {
  it('takes the flags, with a default port', () => {
    expect(resolveSettings({ port: '3102', mfeUrl }, {})).toEqual({ port: 3102, mfeUrl });
    expect(resolveSettings({ mfeUrl }, {})).toEqual({ port: DEFAULT_PORT, mfeUrl });
  });

  it('lets SHELL_STUB_PORT and SHELL_STUB_MFE_URL override the flags', () => {
    const env = { SHELL_STUB_PORT: '3202', SHELL_STUB_MFE_URL: 'http://localhost:3302' };
    expect(resolveSettings({ port: '3102', mfeUrl }, env)).toEqual({
      port: 3202,
      mfeUrl: 'http://localhost:3302',
    });
  });

  it('accepts port 0 for any free port', () => {
    expect(resolveSettings({ port: '0', mfeUrl }, {}).port).toBe(0);
  });

  it.each(['abc', '-1', '3.5', '70000', ''])('rejects the port "%s"', (port) => {
    expect(() => resolveSettings({ port, mfeUrl }, {})).toThrow(/port must be a number/);
  });

  it('requires a valid MFE URL', () => {
    expect(() => resolveSettings({}, {})).toThrow(/--mfe-url .* is required/);
    // The usual slip: no scheme, so `localhost:` would be read as one.
    expect(() => resolveSettings({ mfeUrl: 'localhost:3002' }, {})).toThrow(/must start with http/);
  });
});

describe('listen', () => {
  it('resolves with the port it got, a free one for port 0', async () => {
    const server = createServer();
    const port = await listen(server, 0);
    expect(port).toBe((server.address() as AddressInfo).port);
    expect(port).toBeGreaterThan(0);
    server.close();
  });

  it('explains a port in use instead of throwing EADDRINUSE', async () => {
    const taken = createServer();
    const port = await listen(taken, 0);
    await expect(listen(createServer(), port)).rejects.toThrow(
      `port ${port} is in use. Pass --port <n>, set SHELL_STUB_PORT, or use --port 0`,
    );
    taken.close();
  });
});
