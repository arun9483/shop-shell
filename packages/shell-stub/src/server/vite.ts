import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RequestHandler } from 'express';
import type { createServer as CreateViteServer, ViteDevServer } from 'vite';

type ExportTarget = string | { import?: ExportTarget; default?: ExportTarget } | undefined;

/** The ES module file an export map entry points at: a path, or its `import`/`default` condition. */
function esmEntry(target: ExportTarget): string | undefined {
  if (typeof target === 'string' || target === undefined) return target;
  return esmEntry(target.import ?? target.default);
}

/**
 * Starts the MFE's own Vite (from its `node_modules`, with its `vite.config.ts`) inside this
 * process, in middleware mode, with HMR on `server`: one process, one port, one origin.
 */
export async function startVite(root: string, server: Server): Promise<ViteDevServer> {
  // Vite belongs to the MFE, so it is resolved from the MFE's Vite project, not from this package.
  const require = createRequire(join(root, 'package.json'));
  const packageJson = require.resolve('vite/package.json');
  const { exports } = JSON.parse(readFileSync(packageJson, 'utf8')) as {
    exports: Record<string, ExportTarget>;
  };
  const entry = esmEntry(exports['.']);
  if (!entry) throw new Error(`shell-stub: no ES module entry in ${packageJson}`);
  const file = join(dirname(packageJson), entry);
  const { createServer } = (await import(pathToFileURL(file).href)) as {
    createServer: typeof CreateViteServer;
  };
  return createServer({
    root,
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server } },
  });
}

export function viteMiddleware(vite: ViteDevServer): RequestHandler {
  return (req, res, next) => {
    vite.middlewares(req, res, next);
  };
}
