# SCC Office Dashboard — Security Review
**Reviewer:** Roan, Application Security Engineer  
**Date:** 2026-03-17  
**Codebase revision:** Phase 8 (post-Dex integration)  
**Scope:** Full OWASP Top 10 review of backend and frontend source, environment configuration  
**Approved to deploy?** **YES WITH CONDITIONS** — see §8

---

## 1. Executive Summary — Security Posture: 🟡 YELLOW

The SCC Office Dashboard is a well-intentioned build with a solid security foundation. Helmet is in place, cookies are HttpOnly/Secure/SameSite=Strict, bcrypt is used for password hashing at cost factor 12, input validation is applied via Zod across all endpoints, CORS has a structure in place, and rate limiting exists on the auth endpoint. The team has clearly thought about security. However, five issues must be addressed before this goes live: the rate limiter uses in-memory state that will not hold across Replit Autoscale instances (defeating brute-force protection on the single-password auth system), the `bcrypt` native package will likely fail to compile on Replit (breaking authentication entirely on first deploy), CORS in production is scoped too broadly to `*.replit.app`, the login redirect parameter is an open redirect, and the health endpoint leaks operational information without authentication. None of these are exotic findings — they are addressable before deploy with targeted fixes. Once the conditions in §8 are satisfied, I will sign off.

---

## 2. Critical Findings — MUST Fix Before Deploy

### C-1 · In-Memory Rate Limiter Fails Across Replit Autoscale Instances

**What it is:**  
The login rate limiter (`express-rate-limit`) stores its counter data in Node.js process memory. When Replit Autoscale runs more than one instance of the backend (which it will do under load, on restart, or as a function of its scaling model), each instance has an independent counter. An attacker who knows there are N active instances effectively gets N × 5 login attempts per 15-minute window before hitting any lockout.

For a dashboard that is protected by a single shared password with no MFA, the rate limiter is the primary brute-force control. If it doesn't hold, brute force is viable.

**Where in code:**  
`backend/src/middleware/auth.ts` — `loginRateLimiter` (and `apiRateLimiter`)  
`backend/src/index.ts` — applied at `app.use('/api', apiRateLimiter)` and in the auth routes

**Why it matters:**  
Harvey is the sole user. The entire security model for access control is: strong password + rate limit. If one of those legs fails, the other carries all the weight. A strong password helps — but it should not be the only control.

**Exact fix:**  
Use a shared backing store for the rate limiter. The codebase already has Replit DB available. Use `express-rate-limit` with a custom `store` implementation backed by Replit DB, or use `rate-limit-redis` if Redis is available in the deployment.

Minimal path (no new dependencies — implement a custom `express-rate-limit` store):

```typescript
// In middleware/auth.ts — replace default memory store with a Replit DB store

import { Store, Options, IncrementResponse } from 'express-rate-limit';
import { getDb } from '../services/dbService';

class ReplitDbRateLimitStore implements Store {
  private readonly windowMs: number;
  private readonly prefix: string;

  constructor(windowMs: number, prefix = 'ratelimit:') {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const db = getDb();
    const dbKey = `${this.prefix}${key}`;
    const now = Date.now();
    const windowEnd = now + this.windowMs;

    const existing = await db.get(dbKey).catch(() => null) as
      | { count: number; resetTime: number } | null;

    if (existing && existing.resetTime > now) {
      const updated = { count: existing.count + 1, resetTime: existing.resetTime };
      await db.set(dbKey, updated).catch(() => undefined);
      return { totalHits: updated.count, resetTime: new Date(updated.resetTime) };
    }

    const fresh = { count: 1, resetTime: windowEnd };
    await db.set(dbKey, fresh).catch(() => undefined);
    return { totalHits: 1, resetTime: new Date(windowEnd) };
  }

  async decrement(key: string): Promise<void> {
    const db = getDb();
    const dbKey = `${this.prefix}${key}`;
    const existing = await db.get(dbKey).catch(() => null) as
      | { count: number; resetTime: number } | null;
    if (existing && existing.count > 0) {
      await db.set(dbKey, { ...existing, count: existing.count - 1 }).catch(() => undefined);
    }
  }

  async resetKey(key: string): Promise<void> {
    const db = getDb();
    await db.delete(`${this.prefix}${key}`).catch(() => undefined);
  }
}

// Apply when constructing loginRateLimiter:
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: new ReplitDbRateLimitStore(15 * 60 * 1000, 'ratelimit:login:'),
  // ... rest of config unchanged
});
```

Alternatively: configure Replit to serve from a **single Autoscale instance** (set max replicas = 1 in Replit deployment config). This is the fastest path to production if the custom store is out of sprint scope — but it is an operational control, not a code control, and can be silently overridden by Replit platform changes. Code fix is preferred.

---

### C-2 · `bcrypt` Native Bindings Will Likely Break Authentication on Replit

**What it is:**  
The `bcrypt` package (`^5.1.1`) is the C++ native binding implementation. It requires `node-gyp` compilation at install time. Replit's container build environment does not guarantee the native compilation toolchain is available. If the package fails to build, the `bcrypt.compare()` call in `routes/auth.ts` will throw at runtime — meaning every login attempt returns HTTP 500 and Harvey cannot access the dashboard at all.

This is the bcrypt audit concern Dex flagged. It is not a CVE — it is a deployment correctness issue with security consequences (auth breaks silently on first deploy).

Additionally, `npm audit` should be run against the lock file before deploy. At the time of this review, the lock file is not included in the review scope — it must be clean at `--audit-level=high` before any deploy goes ahead. No exceptions.

**Where in code:**  
`backend/package.json` — `"bcrypt": "^5.1.1"`  
`backend/src/routes/auth.ts` — `import bcrypt from 'bcrypt'`  
`backend/.env.example` — instructs bcrypt hash generation during setup

**Why it matters:**  
If auth breaks on deploy, the first anyone knows is Harvey being locked out of a production system. The bcryptjs pure-JavaScript alternative is functionally identical — same API, same hash compatibility, no native compilation required, same security properties.

**Exact fix:**  
Replace `bcrypt` with `bcryptjs`:

```bash
npm uninstall bcrypt @types/bcrypt
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

In `routes/auth.ts`:
```typescript
// Before:
import bcrypt from 'bcrypt';

// After:
import bcrypt from 'bcryptjs';
```

No other code changes required — the APIs are drop-in compatible.

Also: run `npm audit --audit-level=high` after this change. Any remaining high or critical CVEs must be resolved before deploy, per my non-negotiable rules.

---

## 3. High Findings — Should Fix Before Deploy

### H-1 · CORS Production Wildcard Too Broad (`*.replit.app`)

**What it is:**  
In production mode, the CORS origin allowlist accepts any request from `*.replit.app` or `*.repl.co`:

```typescript
/\.replit\.app$/,
/\.repl\.co$/,
```

Replit hosts thousands of public projects on `*.replit.app`. Any of them can be configured as a CORS origin that the backend will honour.

`SameSite=Strict` on the session cookie provides significant mitigation here (assuming `replit.app` is registered on the Public Suffix List, which makes cross-subdomain requests "cross-site" for SameSite purposes). However:
1. Browser PSL behaviour varies across versions and platforms.
2. The `credentials: true` CORS header with an overly broad origin list is still a defence-in-depth failure.
3. If any other SCC project on Replit is compromised, it can make credentialed requests to the dashboard backend.

The dashboard has a specific deployment URL. Use it.

**Where in code:**  
`backend/src/index.ts` — `allowedOrigins` array for production

**Exact fix:**  
Add a `FRONTEND_URL` environment variable and lock CORS to it:

```typescript
// In config/index.ts, add:
FRONTEND_URL: z.string().url().optional(),

// In index.ts:
const allowedOrigins =
  config.NODE_ENV === 'production'
    ? [config.FRONTEND_URL ?? ''].filter(Boolean)
    : [/localhost:\d+/, /127\.0\.0\.1:\d+/];
```

Set `FRONTEND_URL=https://scc-office-dashboard.replit.app` (or whatever the exact Replit deployment URL is) in Replit Secrets.

---

### H-2 · Open Redirect on Login (`?redirect=` Parameter Unvalidated)

**What it is:**  
In `Login.tsx`, the post-login redirect destination is read directly from the URL query string and passed to React Router's `navigate()` without validation:

```typescript
const redirectTo = searchParams.get('redirect') ?? '/';
// ...
navigate(redirectTo, { replace: true });
```

If Harvey receives a link such as:
```
https://dashboard.replit.app/login?redirect=https://phishing-site.com/fake-scc-login
```
…and logs in, React Router will attempt to navigate to the external URL. Depending on browser behaviour and React Router's handling of absolute URLs, Harvey could land on an attacker-controlled page after successfully authenticating — a phishing opportunity that trades on the legitimacy of having just logged into the real dashboard.

**Where in code:**  
`frontend/src/pages/Login.tsx` — `const redirectTo = searchParams.get('redirect') ?? '/'`

**Exact fix:**  
Validate that the redirect is a relative internal path before using it:

```typescript
function getSafeRedirectPath(raw: string | null): string {
  if (!raw) return '/';
  // Must be a relative path starting with '/' and not starting with '//'
  // (double-slash can create protocol-relative URLs)
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes(':')) {
    return raw;
  }
  return '/';
}

const redirectTo = getSafeRedirectPath(searchParams.get('redirect'));
```

---

### H-3 · Unauthenticated Health Endpoint Leaks Operational Internals

**What it is:**  
`GET /api/health` requires no authentication and returns:

- Server uptime (seconds since process start — enables timing attacks against restart events)
- Whether the Anthropic API key is configured
- Replit DB connectivity status
- Log parser status (and indirectly, whether logs are present on the filesystem)
- Last log parse and cost poll timestamps
- Version number

This endpoint is deliberately public (likely for uptime monitoring). However, in its current form, it provides an attacker with a detailed picture of the backend's internal state — which services are running, whether external API keys are configured, and operational timing data.

**Where in code:**  
`backend/src/routes/health.ts` — `GET /` with no auth middleware

**Why it matters:**  
An attacker probing the dashboard gains confirmation that the system is live, its version, and which integrations are active — useful for targeted exploitation.

**Exact fix (two-tier approach):**  
Option A (simplest): Add `requireAuth` to the health route. Monitoring uptime checks can use a dedicated key if needed.

Option B (preserve public monitoring): Return a minimal public response and a detailed authenticated response:

```typescript
router.get('/', async (req: Request, res: Response) => {
  const isAuthenticated = !!(req.cookies?.[SESSION_COOKIE]); // simplified pre-check
  // ...
  if (!isAuthenticated) {
    // Public response — only overall status
    return res.status(httpStatus).json({ ok: true, data: { status: overallStatus } });
  }
  // Full response for authenticated requests
  return res.status(httpStatus).json({ ok: true, data: health });
});
```

Prefer Option A for this dashboard — there is no external uptime monitoring requirement in the brief.

---

### H-4 · No Structured Security Audit Log

**What it is:**  
Authentication events — login attempts (success and failure), logouts, session expirations, and rate limit triggers — are not written to a durable security log. The current logging is `console.log()` and `console.error()` which routes to Replit's ephemeral process logs.

Per my operational standards, security events must be logged in a structured, durable format: who attempted what, from where, when, and what happened.

**Where in code:**  
`backend/src/routes/auth.ts` — no security event logging on login success or failure  
`backend/src/middleware/auth.ts` — no logging on session validation failure, rate limit trigger, or session expiry

**Exact fix:**  
Add structured security logging to auth events. Write to Replit DB with a time-bounded key pattern:

```typescript
// In a new services/auditLog.ts:
export async function logSecurityEvent(event: {
  type: 'login_success' | 'login_failure' | 'logout' | 'session_expired' | 'rate_limited';
  ipAddress: string;
  userAgent: string;
  detail?: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const key = `audit:security:${Date.now().toString().padStart(16, '0')}`;
  await db.set(key, { ...event, occurredAt: now }).catch(() => undefined);
  // Also emit to console for Replit log capture
  console.log(`[audit] ${event.type} from ${event.ipAddress} at ${now}${event.detail ? ' — ' + event.detail : ''}`);
}
```

At minimum, log: login success (with IP), login failure (with IP, without reason leakage), rate limit trigger (with IP), logout, session expiry.

---

## 4. Medium Findings — Fix in First Week Post-Launch

### M-1 · Session Record Not Runtime-Validated on Read

**What it is:**  
In `requireAuth`, the session record retrieved from Replit DB is cast without runtime validation:

```typescript
const record = await db.get(key) as unknown;
// ...
const session = record as AuthSession;
```

There is no Zod validation of the retrieved object's shape. If a malformed record is stored (due to a bug, a schema migration, or a compromised DB), the session check may behave unexpectedly — either allowing access when it should deny, or throwing an unhandled error.

**Where in code:**  
`backend/src/middleware/auth.ts` — `requireAuth` function

**Exact fix:**  
Add a Zod schema for `AuthSession` and parse on retrieval:

```typescript
import { z } from 'zod';

const AuthSessionSchema = z.object({
  tokenHash: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string(),
  userAgent: z.string(),
  ipAddress: z.string(),
});

// In requireAuth:
const parseResult = AuthSessionSchema.safeParse(record);
if (!parseResult.success) {
  await db.delete(key).catch(() => undefined);
  clearSessionCookie(res);
  res.status(401).json(createApiError('UNAUTHENTICATED', 'Session invalid.'));
  return;
}
const session = parseResult.data;
```

---

### M-2 · PII Stored in Session Records Without Documented Retention Policy

**What it is:**  
Each `AuthSession` record stores `ipAddress` and `userAgent`. These are Harvey's personal data (IP address is PII under GDPR and similar frameworks). They are stored in Replit DB without a defined retention period and without documentation in `DATA-SCHEMA.md`.

The session TTL is 24 hours — so sessions expire — but there is no active cleanup of expired session records. The `auth:session:*` keys will accumulate indefinitely unless explicitly cleaned up.

**Where in code:**  
`backend/src/routes/auth.ts` — session creation  
`backend/src/types/index.ts` — `AuthSession` interface  

**Exact fix:**  
1. Add session cleanup to `cost-poller.ts`'s `runHourlyCleanup()` — delete `auth:session:*` keys where `expiresAt` is in the past.
2. Document `auth:session:*` keys in `DATA-SCHEMA.md` §5.3 with a 24-hour retention limit.
3. Evaluate whether `ipAddress` is strictly necessary. If stored only for audit purposes, move it to the security audit log (see H-4) and remove from the session record.

---

### M-3 · Cost Double-Counting on Server Restart

**What it is:**  
The cost poller's `lastPollMs` state lives in process memory only. When the server restarts, `lastPollMs` resets to `0`, causing `getTodaysLogs()` to re-parse the full day's log file. Since `ingestTokenUsage()` accumulates additively (it adds to existing `CostRecord` entries rather than replacing them), every restart inflates the cost data for the current day.

This was acknowledged in the integration README as a known limitation, but it is a data integrity issue that directly affects a financial display (The Ledger) visible to Harvey. A restart during a period of high activity could cause cost figures to be significantly overstated.

**Where in code:**  
`backend/src/integrations/cost-poller.ts` — `state.lastPollMs` not persisted  
`backend/src/services/costService.ts` — `ingestTokenUsage()` is additive

**Exact fix:**  
Persist `lastPollMs` to Replit DB across restarts:

```typescript
// At the end of a successful runPollCycle():
await db.set('meta:poller:lastPollMs', String(cycleStart)).catch(() => undefined);

// At server startup, before first cycle:
const savedMs = await db.get('meta:poller:lastPollMs').catch(() => null);
state.lastPollMs = savedMs && typeof savedMs === 'string' ? parseInt(savedMs, 10) : 0;
```

Alternatively, make `ingestTokenUsage()` idempotent by keying on a unique event identifier (e.g., hash of agentId + timestamp + token counts) before writing. This is the more robust solution but requires more work.

---

### M-4 · No Maximum Concurrent Session Enforcement

**What it is:**  
The auth system creates sessions on every successful login but does not limit concurrent session count or provide a way to see and invalidate all active sessions. If Harvey's session cookie is stolen (e.g. via physical device access), the attacker's session remains valid until TTL expiry — Harvey has no way to force-invalidate all sessions from another device.

**Where in code:**  
`backend/src/routes/auth.ts` — no session limit on login  

**Exact fix:**  
Track session IDs per user (there is only one "user" here) and enforce a maximum of 5 concurrent sessions. On the 6th login, revoke the oldest session. Alternatively, expose a `POST /api/auth/logout-all` endpoint that deletes all `auth:session:*` keys — add it to the dashboard's security settings panel in a future sprint.

---

## 5. Low Findings — Track and Address

### L-1 · CSP Allows `'unsafe-inline'` for Styles

**What:**  
`styleSrc: ["'self'", "'unsafe-inline'"]` in the Helmet CSP config weakens XSS protection for stylesheets. Tailwind CSS generates utility classes that are compiled at build time — a nonce-based or hash-based CSP for styles is achievable with Vite configuration.

**Fix:**  
Explore Tailwind's `safeList` + Vite CSP nonce plugin. Not blocking — Tailwind's build-time nature means no runtime style injection is required. Address in first sprint post-launch.

---

### L-2 · Loose Version Ranges for Security-Critical Packages

**What:**  
`package.json` uses `^` (caret) ranges for `helmet`, `bcrypt`, `express`, and `express-rate-limit`. A `^` range allows minor and patch updates, which could pull in a breaking or vulnerable version without the team knowing.

**Fix:**  
Pin exact versions in production. After running `npm ci` or `npm install`:
```bash
npm shrinkwrap  # or commit package-lock.json and use npm ci in CI
```
For security-critical packages specifically (helmet, auth), consider exact pinning in `package.json` itself.

---

### L-3 · Session Count Tracking is Non-Atomic

**What:**  
The login and logout routes increment/decrement a `meta:auth:session-count` key using a read-then-write pattern. Under concurrent requests (unlikely given Harvey is the sole user, but worth noting), this can produce incorrect counts.

**Fix:**  
Use Replit DB's `list()` call to count active `auth:session:*` keys directly when needed, rather than maintaining a separate counter. Or accept the eventual consistency given the single-user context.

---

### L-4 · `npm audit` Script Excludes Moderate Vulnerabilities

**What:**  
The `package.json` audit script is `npm audit --audit-level=high`. This ignores `moderate` severity advisories. In a security-sensitive context, moderate CVEs in auth or session-related dependencies should still require review.

**Fix:**  
Change to `npm audit --audit-level=moderate` and triage each finding. Moderate CVEs that are not exploitable in this deployment context can be explicitly suppressed with `npm audit --omit` and a documented rationale.

---

### L-5 · `require()` Inside ES Module Function (`openclaw-logs.ts`)

**What:**  
In `openclaw-logs.ts`, the `knownAgentIds()` function uses `require('../constants/agents')` inside a module function to avoid a circular dependency. This mixes CommonJS `require()` with ES module patterns and bypasses TypeScript's module resolution.

**Fix:**  
Resolve the circular dependency properly — move `AGENT_ROSTER` to a shared constants file that neither `openclaw-logs.ts` nor `agents.ts` depends on. This is a code quality issue with a minor security angle (dynamic requires are harder to audit statically).

---

### L-6 · Telegram Alert Uses `parse_mode: 'HTML'` Without Output Encoding

**What:**  
The `alertService` builds alert messages using `parse_mode: 'HTML'` for Telegram. The values interpolated into the message are entirely server-generated (dollar amounts, month names), so there is no current injection risk. However, if this service is extended to include any user-facing or log-derived data, HTML injection into Telegram becomes possible.

**Fix:**  
Add an HTML-escaping helper for any string interpolated into Telegram messages, or switch to `parse_mode: 'MarkdownV2'` which has a more restrictive character set. Document this as a rule in the alertService module header.

---

## 6. OWASP Top 10 Mapping

| # | OWASP Category | Status | Finding |
|---|----------------|--------|---------|
| A01 | Broken Access Control | ⚠️ Partial | M-4 (no session limit); H-3 (health endpoint unauthenticated); L-5 (dynamic require bypasses static analysis) |
| A02 | Cryptographic Failures | ✅ Pass | bcrypt cost 12, HttpOnly+Secure cookies, SHA-256 token hashing, HTTPS enforced in production via Helmet/HSTS |
| A03 | Injection | ✅ Pass | Zod validation on all inputs; no SQL (Replit KV store); no eval(); no dynamic query construction |
| A04 | Insecure Design | ⚠️ Partial | C-1 (rate limit design fails on multi-instance); M-3 (cost idempotency not designed in) |
| A05 | Security Misconfiguration | ⚠️ Partial | H-1 (CORS wildcard); H-3 (health endpoint); L-2 (loose version ranges) |
| A06 | Vulnerable Components | ⚠️ Needs verification | C-2 (bcrypt native bindings + `npm audit` not confirmed clean); L-2 (version pinning) |
| A07 | Auth Failures | ⚠️ Partial | C-1 (rate limit multi-instance); H-4 (no audit log); M-4 (no concurrent session limit) |
| A08 | Integrity Failures | ✅ Pass | No unverified external data trusted; token hashed before storage |
| A09 | Logging Failures | ⚠️ Partial | H-4 (no durable security audit log for auth events) |
| A10 | SSRF | ✅ Pass | Only server-initiated fetches are to known Telegram/Anthropic endpoints; no user-controlled URLs in server-side fetch |

---

## 7. Positive Observations

These are done right. I want to name them so the team knows what to preserve.

- **Helmet.js with explicit CSP** — well-configured, not left at defaults.
- **Session token never stored raw** — SHA-256 hash in DB, raw token in cookie only. Correct.
- **bcrypt cost factor 12** — `.env.example` gets this right. The issue is the package choice, not the usage.
- **Constant-time comparison via bcrypt** — `bcrypt.compare()` is timing-safe. No timing oracle on login.
- **Zod validation on all API inputs** — every route validates before touching the database or filesystem.
- **Request body size limit** — `10kb` limit prevents oversized payloads.
- **Credentials `include` on all API calls** — frontend correctly sends cookies.
- **`skipSuccessfulRequests: true` on login rate limiter** — correct. Only failed attempts count toward lockout.
- **Session expiry enforced server-side** — not just relying on cookie `maxAge`.
- **`SameSite=Strict` cookie** — correctly prevents CSRF.
- **Explicit 404 handler** — doesn't leak route information.
- **Error handler scrubs internal errors** — `INTERNAL_ERROR` returned to client; full error logged server-side only.
- **Log parser defensive design** — per-line error isolation, never throws, graceful empty returns. Good resilience posture.
- **Config validation at startup** — the app refuses to start with invalid environment config. Excellent.

---

## 8. Approved to Deploy?

### **YES WITH CONDITIONS**

The codebase is not approved in its current state. The following conditions must be satisfied before any production deployment. Each condition maps to a finding above.

| # | Condition | Finding | Owner | Blocking? |
|---|-----------|---------|-------|-----------|
| 1 | Replace `bcrypt` with `bcryptjs` and confirm `npm audit --audit-level=high` returns zero findings | C-2 | Marcus | ✅ Hard block |
| 2 | Implement shared-state rate limiter (Replit DB-backed) OR lock Replit deployment to max 1 instance | C-1 | Marcus / Otto | ✅ Hard block |
| 3 | Lock CORS to the specific `FRONTEND_URL` deployment URL, not `*.replit.app` | H-1 | Marcus | ✅ Hard block |
| 4 | Fix open redirect on `?redirect=` — validate relative path before `navigate()` | H-2 | Sienna | ✅ Hard block |
| 5 | Restrict `/api/health` to authenticated users only (or return minimal public response) | H-3 | Marcus | ✅ Hard block |
| 6 | Add structured security audit logging for auth events (login, failure, logout, expiry) | H-4 | Marcus | ✅ Hard block |

**Conditions 1–6 are non-negotiable. Nothing ships without them.**

The medium and low findings can be addressed in the first week post-launch without blocking the release, provided:
- M-1 (session validation) and M-3 (cost double-counting) are tracked as P1 issues in the first sprint.
- The team accepts the known limitation on cost data accuracy across server restarts until M-3 is resolved, and Harvey is informed.

Once conditions 1–6 are confirmed complete, re-submit for sign-off. I will review the diffs only (not a full re-review) and approve within one working day.

---

## 9. Sign-Off Procedure

1. Marcus resolves C-1, C-2, H-1, H-3, H-4 — creates PR against `main`
2. Sienna resolves H-2 — creates PR against `main`
3. Eli reviews both PRs for code quality
4. Roan reviews security diffs before merge
5. Zara runs regression testing on auth flow, CORS, health endpoint
6. Otto deploys to Replit after all PRs merge
7. Roan verifies production deployment (manual smoke test: login, CORS headers, health response, rate limit)
8. Sign-off granted → dashboard goes live

---

*Roan — Application Security Engineer, SCC Dev Team*  
*"Security is not the thing that slows development down. It is the thing that makes everything else worth building."*
