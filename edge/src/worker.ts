/** The FES origins, set at deploy: `SHELL_URL` and one `MFE_<NAME>_URL` per MFE. */
export type Env = Record<string, string | undefined>;

/** Reads every `MFE_<NAME>_URL` variable, e.g. `MFE_CATALOG_URL` gives the route `catalog`. */
export function mfeRoutes(env: Env): { name: string; url: string }[] {
  return Object.entries(env).flatMap(([key, url]) => {
    const match = /^MFE_([A-Z0-9]+)_URL$/.exec(key);
    return match?.[1] && url ? [{ name: match[1].toLowerCase(), url }] : [];
  });
}

/** `/mfe/<name>[/*]` and `/api/<name>[/*]` go to that MFE's FES, everything else to the Shell's. */
export function originFor(path: string, env: Env): string {
  const mfe = mfeRoutes(env).find(({ name }) =>
    [`/mfe/${name}`, `/api/${name}`].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    ),
  );
  const origin = mfe?.url ?? env.SHELL_URL;
  if (!origin) throw new Error('SHELL_URL is not set');
  return origin;
}

/**
 * The one public origin, routing by path as the dev router does. Requests and headers, trace
 * headers included, pass through unchanged; each FES sets its own caching headers.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Health and version checks go to each FES directly, never through the public origin.
    if (/^\/(health|version)(\/|$)/.test(url.pathname)) {
      return new Response('Not Found', { status: 404 });
    }
    const target = new URL(url.pathname + url.search, originFor(url.pathname, env));
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  },
};
