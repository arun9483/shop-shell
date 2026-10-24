import { STATUS_CODES } from 'node:http';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { traceIdOf } from './trace.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Responds with an RFC 9457 problem; 5xx details are not exposed. */
export const problemHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: STATUS_CODES[status],
      status,
      ...(status < 500 && err instanceof Error ? { detail: err.message } : {}),
      instance: req.originalUrl,
      traceId: traceIdOf(res),
    });
};

export const notFound: RequestHandler = (req) => {
  throw new HttpError(404, `No route for ${req.method} ${req.path}`);
};
