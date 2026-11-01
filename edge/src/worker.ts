/** The router's origin, set at deploy. */
export interface Env {
  ROUTER_URL?: string;
}

/**
 * The shop's one public origin, forwarding everything to `shop-router`, which does all the routing.
 * Requests and headers, trace headers included, pass through unchanged; each FES sets its own
 * caching headers.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.ROUTER_URL) throw new Error('ROUTER_URL is not set');
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, env.ROUTER_URL);
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
