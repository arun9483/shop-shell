import type { Response } from 'express';

/**
 * Calls an upstream URL and sends its status, content type and body back unchanged. The New Relic
 * agent adds the trace headers to the outgoing call.
 */
export async function forward(res: Response, url: string): Promise<void> {
  const upstream = await fetch(url);
  const body = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  const type = upstream.headers.get('content-type');
  if (type) res.type(type);
  res.send(body);
}
