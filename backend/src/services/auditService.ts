// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Security Audit Log Service
//
// Logs security events to Replit DB for durable, structured audit trail.
// Key format: audit:YYYY-MM-DD:TIMESTAMP:EVENT_TYPE
//
// Covered events:
//   login_success       — Successful password authentication
//   login_failure       — Failed password authentication
//   logout              — Explicit session logout
//   rate_limit_triggered — Login rate limiter triggered
//   session_expired     — Session TTL exceeded; user redirected to login
//
// Design:
//   - Writes are fire-and-forget. Audit log failures are never fatal.
//   - No PII in detail fields beyond IP address (required for security review).
//   - Passwords, tokens, and hashes are never logged.
//   - Events are also emitted to console so they appear in Replit's process logs.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from './dbService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'rate_limit_triggered'
  | 'session_expired';

export interface AuditEvent {
  type: AuditEventType;
  ipAddress: string;
  userAgent: string;
  occurredAt: string;
  detail?: string;
}

// ─── Log function ─────────────────────────────────────────────────────────────

/**
 * Write a security audit event to Replit DB.
 *
 * Key format: audit:<YYYY-MM-DD>:<TIMESTAMP_MS_PADDED>:<EVENT_TYPE>
 *
 * The date prefix enables efficient range queries by day.
 * The padded timestamp ensures lexicographic ordering within a day.
 *
 * Non-fatal: any DB write failure is logged to console and swallowed.
 */
export async function logSecurityEvent(event: {
  type: AuditEventType;
  ipAddress: string;
  userAgent: string;
  detail?: string;
}): Promise<void> {
  const now = new Date();
  const date = now.toISOString().substring(0, 10); // YYYY-MM-DD
  const ts = now.getTime().toString().padStart(16, '0');
  const key = `audit:${date}:${ts}:${event.type}`;

  const record: AuditEvent = {
    type: event.type,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    occurredAt: now.toISOString(),
    ...(event.detail ? { detail: event.detail } : {}),
  };

  // Also emit to console for Replit's process log capture
  console.log(`[audit] ${event.type} ip=${event.ipAddress} at=${now.toISOString()}${event.detail ? ` detail="${event.detail}"` : ''}`);

  try {
    const db = getDb();
    await db.set(key, record);
  } catch (err) {
    // Non-fatal — audit log failures must never break auth flow
    console.warn(`[audit] Failed to write audit event to DB: ${err instanceof Error ? err.message : String(err)}`);
  }
}
