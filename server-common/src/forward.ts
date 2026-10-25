import type { Response } from 'express';
import { HttpError } from './problem.js';

/**
 * Calls an upstream URL and sends its status, content type and body back unchanged. The New Relic
 * agent adds the trace headers to the outgoing call; `headers` adds any auth. An upstream slower
 * than `timeoutMs` is a 504.
 */
export async function forward(
  res: Response,
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<void> {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new HttpError(504, `Backend did not answer within ${timeoutMs} ms`);
    }
    throw error;
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  const type = upstream.headers.get('content-type');
  if (type) res.type(type);
  res.send(body);
}
