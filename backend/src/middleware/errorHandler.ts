// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Centralised Error Handler
// Returns consistent ApiError shape on all unhandled errors.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function createApiError(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known application error
  if (err instanceof AppError) {
    res.status(err.statusCode).json(createApiError(err.code, err.message));
    return;
  }

  // Zod validation error (should be caught in routes, but belt-and-suspenders)
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => i.message).join('; ');
    res.status(400).json(createApiError('VALIDATION_ERROR', message));
    return;
  }

  // Unknown error — do not leak internals
  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';

  // Log server errors — never log sensitive request data
  console.error('[errorHandler] Unhandled error:', message);

  res.status(500).json(createApiError('INTERNAL_ERROR', 'Internal server error'));
}

// Async route wrapper — eliminates try/catch boilerplate in every route
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
