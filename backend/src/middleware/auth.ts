// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Auth Middleware
// Session token validation + rate limiter for login endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import rateLimit, { Store, IncrementResponse } from 'express-rate-limit';
import { getDb } from '../services/dbService';
import { AuthSession } from '../types';
import { createApiError } from './errorHandler';
import { logSecurityEvent } from '../services/auditService';

const SESSION_COOKIE = 'scc_session';

// ─── Replit DB-backed rate limit store ────────────────────────────────────────
//
// express-rate-limit defaults to an in-memory store, which is local to each
// Node.js process. On Replit Autoscale, multiple instances run in parallel —
// each with an independent counter. An attacker would effectively get
// N × max attempts before triggering any lockout.
//
// This store persists counters to Replit DB so all instances share state.

interface RateLimitRecord {
  count: number;
  resetTime: number; // Unix ms
}

class ReplitDbRateLimitStore implements Store {
  private readonly windowMs: number;
  private readonly keyPrefix: string;

  constructor(windowMs: number, keyPrefix = 'ratelimit:') {
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const db = getDb();
    const dbKey = `${this.keyPrefix}${key}`;
    const now = Date.now();

    const existing = await db.get(dbKey).catch(() => null) as RateLimitRecord | null;

    if (existing && existing.resetTime > now) {
      const updated: RateLimitRecord = {
        count: existing.count + 1,
        resetTime: existing.resetTime,
      };
      await db.set(dbKey, updated).catch(() => undefined);
      return { totalHits: updated.count, resetTime: new Date(updated.resetTime) };
    }

    // Window has expired or no record — start fresh
    const fresh: RateLimitRecord = {
      count: 1,
      resetTime: now + this.windowMs,
    };
    await db.set(dbKey, fresh).catch(() => undefined);
    return { totalHits: 1, resetTime: new Date(fresh.resetTime) };
  }

  async decrement(key: string): Promise<void> {
    const db = getDb();
    const dbKey = `${this.keyPrefix}${key}`;
    const existing = await db.get(dbKey).catch(() => null) as RateLimitRecord | null;
    if (existing && existing.count > 0) {
      await db.set(dbKey, { ...existing, count: existing.count - 1 }).catch(() => undefined);
    }
  }

  async resetKey(key: string): Promise<void> {
    const db = getDb();
    await db.delete(`${this.keyPrefix}${key}`).catch(() => undefined);
  }
}

// ─── Rate limiter for login endpoint ─────────────────────────────────────────
// Max 5 attempts per IP per 15 minutes.
// Uses Replit DB store to persist across Autoscale instances.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  store: new ReplitDbRateLimitStore(15 * 60 * 1000, 'ratelimit:login:'),
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind a proxy (Replit's case)
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? 'unknown';
  },
  handler: (req, res) => {
    const ip = typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip ?? 'unknown';

    // Fire and forget — audit log the rate limit event
    logSecurityEvent({
      type: 'rate_limit_triggered',
      ipAddress: ip,
      userAgent: req.headers['user-agent'] ?? 'unknown',
      detail: 'Login rate limit exceeded',
    }).catch(() => undefined);

    res.status(429).json(
      createApiError('RATE_LIMITED', 'Too many login attempts. Try again in 15 minutes.'),
    );
  },
});

// ─── General API rate limiter ──────────────────────────────────────────────────
// In-memory store is acceptable for the general API limiter — it is a broad
// throughput guard (120 req/min), not a security control. Brief over-counting
// across instances is tolerable.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(createApiError('RATE_LIMITED', 'Too many requests.'));
  },
});

// ─── Session validation middleware ────────────────────────────────────────────
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken: string | undefined = req.cookies?.[SESSION_COOKIE];

  if (!rawToken) {
    res.status(401).json(createApiError('UNAUTHENTICATED', 'Authentication required.'));
    return;
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const db = getDb();

  try {
    const key = `auth:session:${tokenHash}`;
    const record = await db.get(key) as unknown;

    if (!record) {
      clearSessionCookie(res);
      res.status(401).json(createApiError('UNAUTHENTICATED', 'Session not found or expired.'));
      return;
    }

    const session = record as AuthSession;
    const now = new Date();

    if (new Date(session.expiresAt) < now) {
      // Clean up expired session and log the expiry event
      await db.delete(key).catch(() => undefined);
      clearSessionCookie(res);

      logSecurityEvent({
        type: 'session_expired',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] ?? 'unknown',
      }).catch(() => undefined);

      res.status(401).json(createApiError('UNAUTHENTICATED', 'Session expired. Please log in again.'));
      return;
    }

    // Refresh lastUsedAt — fire and forget, don't block the request
    const updated: AuthSession = {
      ...session,
      lastUsedAt: now.toISOString(),
    };
    db.set(key, updated).catch(() => undefined);

    // Attach session to request for downstream use
    req.sessionRecord = updated;
    next();
  } catch {
    res.status(500).json(createApiError('INTERNAL_ERROR', 'Session validation failed.'));
  }
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}

export { SESSION_COOKIE };
