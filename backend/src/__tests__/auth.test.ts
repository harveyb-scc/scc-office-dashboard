/**
 * Auth endpoint integration tests
 * POST /api/auth/login
 * POST /api/auth/logout
 *
 * Test strategy: AAA pattern throughout.
 * DB is mocked to avoid Replit DB dependency in CI.
 * Rate limiter is reset between relevant tests via unique IPs.
 */

import request from 'supertest';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';

// ─── Environment setup BEFORE app import ──────────────────────────────────────
// The config module validates env vars at import time; set them before loading.

const TEST_PASSWORD = 'correctpassword99';
let TEST_PASSWORD_HASH: string;

// DB mock — in-memory store, avoids Replit DB requirement in CI
const mockDb: Record<string, unknown> = {};

jest.mock('../services/dbService', () => ({
  getDb: () => ({
    get: jest.fn(async (key: string) => mockDb[key] ?? null),
    set: jest.fn(async (key: string, val: unknown) => { mockDb[key] = val; }),
    delete: jest.fn(async (key: string) => { delete mockDb[key]; }),
    list: jest.fn(async () => []),
  }),
  listKeys: jest.fn(async () => []),
}));

// Agent service mock — not under test here
jest.mock('../services/agentService', () => ({
  getAllAgentStatuses: jest.fn(),
  getAgentStatus: jest.fn(),
  AGENT_ROSTER: [],
}));

// Cost service mock
jest.mock('../services/costService', () => ({
  getCostSummary: jest.fn(),
  getCostHistory: jest.fn(),
}));

// Feed service mock
jest.mock('../services/feedService', () => ({
  getFeed: jest.fn(),
}));

// Alert service mock
jest.mock('../services/alertService', () => ({
  alertService: { sendBudgetAlert: jest.fn(async () => false) },
}));

// Integrations (cost poller) — no-op in tests
jest.mock('../integrations', () => ({
  startCostPoller: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

// ─── Before all: generate bcrypt hash and set env ────────────────────────────

beforeAll(async () => {
  TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 12);

  process.env.DASHBOARD_PASSWORD_HASH = TEST_PASSWORD_HASH;
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long!!';
  process.env.OPENCLAW_LOG_PATH = '/tmp/test-openclaw-logs';
  process.env.NODE_ENV = 'test';
  process.env.REPLIT_DB_URL = 'http://localhost:9999/test-db'; // Never called — mocked

  // Dynamic import AFTER env is set, so config validation passes
  const { default: importedApp } = await import('../index');
  app = importedApp;
});

beforeEach(() => {
  // Reset in-memory DB before each test
  Object.keys(mockDb).forEach((k) => delete mockDb[k]);
});

// ─── Helper: create a valid session in the mock DB ───────────────────────────

async function createValidSession(): Promise<string> {
  const rawToken = 'a'.repeat(64);
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const session = {
    tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    lastUsedAt: new Date().toISOString(),
    userAgent: 'test-agent',
    ipAddress: '127.0.0.1',
  };

  mockDb[`auth:session:${tokenHash}`] = session;
  return rawToken;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  // ── AC-LOGIN-02: Happy path ──────────────────────────────────────────────────
  test('returns 200 and sets session cookie on correct password', async () => {
    // Arrange
    const payload = { password: TEST_PASSWORD };

    // Act
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.1')
      .send(payload);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('expiresAt');
    expect(typeof res.body.data.expiresAt).toBe('string');

    // Session cookie must be set
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const sessionCookie = cookies.find((c) => c.startsWith('scc_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Strict/i);
  });

  // ── Wrong password ────────────────────────────────────────────────────────────
  test('returns 400 INVALID_CREDENTIALS on wrong password', async () => {
    // Arrange
    const payload = { password: 'wrongpassword' };

    // Act
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.2')
      .send(payload);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBeTruthy();

    // Must NOT set a session cookie on failure
    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookie = setCookie?.find((c) => c.startsWith('scc_session='));
    expect(sessionCookie).toBeUndefined();
  });

  // ── Missing body ──────────────────────────────────────────────────────────────
  test('returns 400 MISSING_PASSWORD when body has no password field', async () => {
    // Arrange — send empty JSON body

    // Act
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.3')
      .set('Content-Type', 'application/json')
      .send({});

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('MISSING_PASSWORD');
  });

  test('returns 400 MISSING_PASSWORD when body is completely absent', async () => {
    // Arrange — no body at all

    // Act
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.4')
      .set('Content-Type', 'application/json');

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('MISSING_PASSWORD');
  });

  // ── Rate limit (6th attempt) ─────────────────────────────────────────────────
  // The rate limiter blocks on 6th attempt from same IP (max: 5, skipSuccessfulRequests: true)
  test('returns 429 RATE_LIMITED on the 6th failed login attempt from same IP', async () => {
    // Arrange — use unique IP so previous tests don't affect this
    const ip = '10.99.99.99';

    // Act — exhaust 5 attempts (all wrong password)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ password: 'wrong' });
      expect(res.status).toBe(400); // Each attempt is a genuine 400
    }

    // Act — 6th attempt is blocked by rate limiter
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ password: 'wrong' });

    // Assert
    expect(res.status).toBe(429);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.message).toMatch(/15 minutes/i);

    // RateLimit headers should be present
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  test('does NOT count a successful login against the rate limit', async () => {
    // Arrange — unique IP, make 4 failed attempts then 1 success
    const ip = '10.88.88.88';

    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ password: 'wrong' });
    }

    // Act — successful login
    const successRes = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ password: TEST_PASSWORD });

    // Assert — success is not rate-limited
    expect(successRes.status).toBe(200);

    // Next request (wrong) should still be allowed — success was skipped
    const afterRes = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ password: 'wrong' });
    expect(afterRes.status).toBe(400); // Still 400, not 429 yet
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  // ── Valid session ─────────────────────────────────────────────────────────────
  test('returns 200 and clears session cookie when authenticated', async () => {
    // Arrange — create a valid session in the mock DB
    const rawToken = await createValidSession();

    // Act
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `scc_session=${rawToken}`)
      .send();

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.loggedOut).toBe(true);

    // Cookie should be cleared (set with empty value or Max-Age=0)
    const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    const clearedCookie = cookies.find((c) => c.startsWith('scc_session='));
    expect(clearedCookie).toBeDefined();
    // Max-Age=0 or Expires in the past signals deletion
    expect(clearedCookie).toMatch(/Max-Age=0|Expires=.*1970/i);
  });

  // ── No session ────────────────────────────────────────────────────────────────
  test('returns 401 UNAUTHENTICATED when no session cookie is present', async () => {
    // Arrange — no cookie

    // Act
    const res = await request(app)
      .post('/api/auth/logout')
      .send();

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('returns 401 UNAUTHENTICATED when session cookie references non-existent session', async () => {
    // Arrange — cookie with a token that is not in the DB
    const fakeToken = 'z'.repeat(64);

    // Act
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `scc_session=${fakeToken}`)
      .send();

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('session is deleted from DB after successful logout', async () => {
    // Arrange
    const rawToken = await createValidSession();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const sessionKey = `auth:session:${tokenHash}`;

    // Confirm session exists before logout
    expect(mockDb[sessionKey]).toBeDefined();

    // Act
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `scc_session=${rawToken}`)
      .send();

    // Assert — session removed from DB
    expect(mockDb[sessionKey]).toBeUndefined();
  });
});
