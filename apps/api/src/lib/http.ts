import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Parse and validate request data with a zod schema; throws a 400 on failure. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Validation failed', z.flattenError(result.error));
  }
  return result.data;
}

/** Express 5 forwards rejected promises automatically; this keeps handler typing tidy. */
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  async (req, res, next) => {
    await fn(req, res, next);
  };

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'Not found'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
