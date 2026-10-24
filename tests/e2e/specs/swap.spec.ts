// MVP criterion 1: pointing the router's MFE_<NAME>_URL at another build swaps that MFE without
// rebuilding the Shell. For each available MFE this starts build B (a copy of the build with its own
// version) behind its own FES, and a second router that points at it.
import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { mfes, ports } from '../mfes.js';

const routerB = 3100;
const env = {
  NEW_RELIC_ENABLED: 'false',
  NEW_RELIC_NO_CONFIG_FILE: 'true',
  NEW_RELIC_LOG: 'stdout',
};
const children: ChildProcess[] = [];

function start(cwd: string, extra: Record<string, string>): void {
  const child = spawn(process.execPath, ['--enable-source-maps', 'dist/index.js'], {
    cwd,
    env: { ...process.env, ...env, ...extra },
    stdio: 'ignore',
  });
  children.push(child);
}

async function ready(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const ok = await fetch(url).then(
      (res) => res.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not start`);
}

test.afterAll(() => {
  for (const child of children) child.kill();
});

for (const [index, mfe] of mfes.entries()) {
  const { name } = mfe;

  test(`${name}: pointing the router at another build swaps it without touching the Shell`, async ({
    page,
    request,
  }) => {
    test.skip(!mfe.available, `shop-${name} is not checked out next to shop-shell and built`);
    test.slow();

    // Build B: the same files under a version of its own.
    const distB = mkdtempSync(join(tmpdir(), `${name}-build-b-`));
    cpSync(`${mfe.dir}/client/dist`, distB, { recursive: true });
    const versionFile = join(distB, 'version.json');
    const version = JSON.parse(readFileSync(versionFile, 'utf8')) as Record<string, string>;
    writeFileSync(versionFile, JSON.stringify({ ...version, version: 'build-b' }));

    const fesB = 3200 + index;
    start(`${mfe.dir}/fes`, {
      PORT: String(fesB),
      BACKEND_URL: `http://localhost:${mfe.backendPort}`,
      CLIENT_DIST: distB,
    });
    const routerPort = routerB + index;
    start(resolve(import.meta.dirname, '../../../router'), {
      PORT: String(routerPort),
      SHELL_URL: `http://localhost:${ports.fes}`,
      ...Object.fromEntries(
        mfes.map((m) => [
          `MFE_${m.name.toUpperCase()}_URL`,
          `http://localhost:${m.name === name ? fesB : m.fesPort}`,
        ]),
      ),
    });
    await ready(`http://localhost:${fesB}/health/live`);
    await ready(`http://localhost:${routerPort}/`);

    const a = `http://localhost:${ports.router}`;
    const b = `http://localhost:${routerPort}`;

    // Each router serves its own build of the MFE...
    const versionA: unknown = await (await request.get(`${a}/mfe/${name}/version.json`)).json();
    const versionB: unknown = await (await request.get(`${b}/mfe/${name}/version.json`)).json();
    expect(versionA).not.toMatchObject({ version: 'build-b' });
    expect(versionB).toMatchObject({ name: `@shop-${name}/client`, version: 'build-b' });

    // ...behind the very same Shell build.
    const shellA = await (await request.get(`${a}/`)).text();
    const shellB = await (await request.get(`${b}/`)).text();
    expect(shellB).toBe(shellA);

    // The swapped MFE runs in the Shell, and its files come from build B's FES.
    const served: string[] = [];
    page.on('response', (res) => {
      if (new URL(res.url()).pathname === `/mfe/${name}/entry.js`) served.push(res.url());
    });
    await page.goto(`${b}/${name}`);
    await expect(page.locator('#mfe-root h1')).toBeVisible();
    await expect(page.locator('#mfe-root [role="alert"]')).toHaveCount(0);
    expect(served).toEqual([`${b}/mfe/${name}/entry.js`]);
  });
}
