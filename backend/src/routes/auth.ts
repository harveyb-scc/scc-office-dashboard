// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Auth Routes
// POST /api/auth/login
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config';
import { getDb } from '../services/dbService';
import { loginRateLimiter, requireAuth, SESSION_COOKIE } from '../middleware/auth';
import { asyncHandler, AppError, createApiError } from '../middleware/errorHandler';
import { AuthSession } from '../types';
import { logSecurityEvent } from '../services/auditService';

const router = Router();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Login schema ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  password: z.string().min(1, { message: 'Password is required' }),
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(createApiError('MISSING_PASSWORD', 'Password is required.'));
      return;
    }

    const { password } = parsed.data;

    // Constant-time comparison via bcrypt
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, config.DASHBOARD_PASSWORD_HASH);
    } catch {
      throw new AppError(500, 'INTERNAL_ERROR', 'Authentication check failed.');
    }

    if (!passwordMatch) {
      // Do not distinguish wrong password from unknown user
      logSecurityEvent({
        type: 'login_failure',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] ?? 'unknown',
      }).catch(() => undefined);

      res.status(400).json(createApiError('INVALID_CREDENTIALS', 'Invalid credentials.'));
      return;
    }

    // Generate session token — 32 bytes of cryptographic randomness
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const session: AuthSession = {
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: now.toISOString(),
      userAgent: req.headers['user-agent'] ?? 'unknown',
      ipAddress: getClientIp(req),
    };

    const db = getDb();
    try {
      await db.set(`auth:session:${tokenHash}`, session);

      // Increment session count — fire and forget
      const countRaw = await db.get('meta:auth:session-count').catch(() => '0');
      const count = parseInt(typeof countRaw === 'string' ? countRaw : '0', 10);
      await db.set('meta:auth:session-count', String(count + 1)).catch(() => undefined);
    } catch {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create session.');
    }

    // Audit log the successful login
    logSecurityEvent({
      type: 'login_success',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    }).catch(() => undefined);

    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
    });

    res.status(200).json({
      ok: true,
      data: { expiresAt: expiresAt.toISOString() },
    });
  }),
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const rawToken: string | undefined = req.cookies?.[SESSION_COOKIE];

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
    });

    if (!rawToken) {
      // Idempotent — no session to clear
      res.status(200).json({ ok: true, data: { loggedOut: true } });
      return;
    }

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const db = getDb();

    try {
      await db.delete(`auth:session:${tokenHash}`);

      // Decrement session count
      const countRaw = await db.get('meta:auth:session-count').catch(() => '0');
      const count = Math.max(
        0,
        parseInt(typeof countRaw === 'string' ? countRaw : '0', 10) - 1,
      );
      await db.set('meta:auth:session-count', String(count)).catch(() => undefined);
    } catch {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to delete session.');
    }

    logSecurityEvent({
      type: 'logout',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    }).catch(() => undefined);

    res.status(200).json({ ok: true, data: { loggedOut: true } });
  }),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}

export default router;
