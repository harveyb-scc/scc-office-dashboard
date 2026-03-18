/**
 * Costs endpoint integration tests
 * GET /api/costs
 * GET /api/costs/history
 *
 * Test strategy: AAA pattern.
 * CostService is mocked to return controlled fixture data.
 * Budget threshold states (normal / amber / red / critical) are tested
 * by varying the `alertLevel` and `spentCents` fields in the fixture.
 */

import request from 'supertest';
import { createHash } from 'crypto';
import type { CostSummary, CostHistoryResponse } from '../types';

// ─── DB mock ──────────────────────────────────────────────────────────────────

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

// ─── Service mocks ────────────────────────────────────────────────────────────

const mockGetCostSummary = jest.fn();
const mockGetCostHistory = jest.fn();

jest.mock('../services/costService', () => ({
  getCostSummary: (...args: unknown[]) => mockGetCostSummary(...args),
  getCostHistory: (...args: unknown[]) => mockGetCostHistory(...args),
}));

jest.mock('../services/agentService', () => ({
  getAllAgentStatuses: jest.fn(),
  getAgentStatus: jest.fn(),
  AGENT_ROSTER: [],
}));

jest.mock('../services/feedService', () => ({
  getFeed: jest.fn(),
}));

jest.mock('../services/alertService', () => ({
  alertService: { sendBudgetAlert: jest.fn(async () => false) },
}));

jest.mock('../integrations', () => ({
  startCostPoller: jest.fn(),
}));

// ─── Fixture factory ──────────────────────────────────────────────────────────

function buildCostSummary(spentCents: number): CostSummary {
  const budgetCents = 50000;
  let alertLevel: CostSummary['budget']['alertLevel'];

  if (spentCents >= 50000) alertLevel = 'critical';
  else if (spentCents >= 47500) alertLevel = 'red';
  else if (spentCents >= 40000) alertLevel = 'amber';
  else alertLevel = 'normal';

  return {
    computedAt: new Date().toISOString(),
    totals: {
      today: { costCents: 100, inputTokens: 5000, outputTokens: 1000, callCount: 3 },
      week: { costCents: 800, inputTokens: 40000, outputTokens: 8000, callCount: 25 },
      month: { costCents: spentCents, inputTokens: 300000, outputTokens: 60000, callCount: 150 },
      allTime: { costCents: spentCents + 10000, inputTokens: 700000, outputTokens: 140000, callCount: 400 },
    },
    byAgent: [
      {
        agentId: 'clawdia',
        agentName: 'Clawdia',
        agentEmoji: '🦞',
        costCents: Math.round(spentCents * 0.6),
        inputTokens: 180000,
        outputTokens: 36000,
        callCount: 90,
      },
    ],
    byProvider: [
      {
        provider: 'anthropic',
        costCents: spentCents,
        inputTokens: 300000,
        outputTokens: 60000,
        callCount: 150,
      },
    ],
    budget: {
      budgetCents,
      spentCents,
      remainingCents: budgetCents - spentCents,
      fractionUsed: Math.min(spentCents / budgetCents, 1),
      alertLevel,
    },
  };
}

function buildHistoryResponse(
  windowHours: number,
  pointCount: number,
): CostHistoryResponse {
  const now = new Date();
  const points = Array.from({ length: pointCount }, (_, i) => ({
    timestamp: new Date(now.getTime() - (windowHours - i) * 60 * 60 * 1000).toISOString(),
    costCents: i * 10,
    inputTokens: i * 500,
    outputTokens: i * 100,
  }));

  return {
    computedAt: now.toISOString(),
    windowHours,
    agentId: null,
    provider: null,
    points,
  };
}

// ─── App setup ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  process.env.DASHBOARD_PASSWORD_HASH = '$2b$12$testhashtesthashtesthashtesth.testhashabcdefghijklm';
  process.env.SESSION_SECRET = 'costs-test-session-secret-at-least-32-chars-long!!';
  process.env.OPENCLAW_LOG_PATH = '/tmp/test-openclaw-logs';
  process.env.NODE_ENV = 'test';
  process.env.REPLIT_DB_URL = 'http://localhost:9999/test-db';

  const { default: importedApp } = await import('../index');
  app = importedApp;
});

beforeEach(() => {
  Object.keys(mockDb).forEach((k) => delete mockDb[k]);
  jest.clearAllMocks();
});

// ─── Session helpers ──────────────────────────────────────────────────────────

function createSession(): string {
  const rawToken = 'c'.repeat(64);
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  mockDb[`auth:session:${tokenHash}`] = {
    tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    lastUsedAt: new Date().toISOString(),
    userAgent: 'test',
    ipAddress: '127.0.0.1',
  };
  return rawToken;
}

// ─── GET /api/costs ───────────────────────────────────────────────────────────

describe('GET /api/costs', () => {
  // ── Authenticated — happy path ────────────────────────────────────────────────
  test('returns 200 with full cost summary when authenticated', async () => {
    // Arrange
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(5000));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { data } = res.body;
    expect(data).toHaveProperty('computedAt');
    expect(data).toHaveProperty('totals');
    expect(data).toHaveProperty('byAgent');
    expect(data).toHaveProperty('byProvider');
    expect(data).toHaveProperty('budget');

    // totals fields
    expect(data.totals).toHaveProperty('today');
    expect(data.totals).toHaveProperty('week');
    expect(data.totals).toHaveProperty('month');
    expect(data.totals).toHaveProperty('allTime');
    expect(typeof data.totals.today.costCents).toBe('number');

    // budget fields
    expect(data.budget).toHaveProperty('budgetCents');
    expect(data.budget).toHaveProperty('spentCents');
    expect(data.budget).toHaveProperty('remainingCents');
    expect(data.budget).toHaveProperty('fractionUsed');
    expect(data.budget).toHaveProperty('alertLevel');
  });

  // ── Budget threshold states ───────────────────────────────────────────────────

  test('budget.alertLevel is "normal" when spend is below $400 (39999 cents)', async () => {
    // Arrange
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(39999));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data.budget.alertLevel).toBe('normal');
    expect(res.body.data.budget.spentCents).toBe(39999);
  });

  test('budget.alertLevel is "amber" when spend is exactly $400 (40000 cents)', async () => {
    // Arrange
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(40000));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data.budget.alertLevel).toBe('amber');
    expect(res.body.data.budget.fractionUsed).toBe(0.8);
  });

  test('budget.alertLevel is "red" when spend is $475 (47500 cents)', async () => {
    // Arrange
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(47500));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data.budget.alertLevel).toBe('red');
    expect(res.body.data.budget.fractionUsed).toBe(0.95);
  });

  test('budget.alertLevel is "critical" when spend reaches $500 (50000 cents)', async () => {
    // Arrange
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(50000));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data.budget.alertLevel).toBe('critical');
    expect(res.body.data.budget.fractionUsed).toBe(1);
    expect(res.body.data.budget.remainingCents).toBe(0);
  });

  test('budget.alertLevel is "critical" and fractionUsed clamps to 1 when spend EXCEEDS $500', async () => {
    // Arrange — spend over the $500 cap
    const token = createSession();
    mockGetCostSummary.mockResolvedValue(buildCostSummary(52000));

    // Act
    const res = await request(app)
      .get('/api/costs')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data.budget.alertLevel).toBe('critical');
    expect(res.body.data.budget.fractionUsed).toBe(1); // clamped by Math.min
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────────
  test('returns 401 UNAUTHENTICATED without session cookie', async () => {
    // Act
    const res = await request(app).get('/api/costs');

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

// ─── GET /api/costs/history ───────────────────────────────────────────────────

describe('GET /api/costs/history', () => {
  // ── Authenticated — happy path ────────────────────────────────────────────────
  test('returns 200 with history data when authenticated (default 168h window)', async () => {
    // Arrange
    const token = createSession();
    mockGetCostHistory.mockResolvedValue(buildHistoryResponse(168, 24));

    // Act
    const res = await request(app)
      .get('/api/costs/history')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { data } = res.body;
    expect(data).toHaveProperty('computedAt');
    expect(data).toHaveProperty('windowHours');
    expect(data).toHaveProperty('points');
    expect(data).toHaveProperty('agentId');
    expect(data).toHaveProperty('provider');

    expect(Array.isArray(data.points)).toBe(true);
    expect(data.windowHours).toBe(168);

    // Each point must have the correct shape
    if (data.points.length > 0) {
      const point = data.points[0];
      expect(point).toHaveProperty('timestamp');
      expect(point).toHaveProperty('costCents');
      expect(point).toHaveProperty('inputTokens');
      expect(point).toHaveProperty('outputTokens');
      expect(typeof point.costCents).toBe('number');
    }
  });

  test('passes hours parameter to getCostHistory service', async () => {
    // Arrange
    const token = createSession();
    mockGetCostHistory.mockResolvedValue(buildHistoryResponse(24, 24));

    // Act
    const res = await request(app)
      .get('/api/costs/history?hours=24')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(mockGetCostHistory).toHaveBeenCalledWith(24, null, null);
  });

  test('passes agentId parameter to getCostHistory service', async () => {
    // Arrange
    const token = createSession();
    const agentHistory = buildHistoryResponse(168, 10);
    agentHistory.agentId = 'clawdia';
    mockGetCostHistory.mockResolvedValue(agentHistory);

    // Act
    const res = await request(app)
      .get('/api/costs/history?agentId=clawdia')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(mockGetCostHistory).toHaveBeenCalledWith(168, 'clawdia', null);
    expect(res.body.data.agentId).toBe('clawdia');
  });

  // ── Empty history ─────────────────────────────────────────────────────────────
  test('returns 200 with empty points array when no cost history exists', async () => {
    // Arrange
    const token = createSession();
    mockGetCostHistory.mockResolvedValue({
      computedAt: new Date().toISOString(),
      windowHours: 168,
      agentId: null,
      provider: null,
      points: [],
    } as CostHistoryResponse);

    // Act
    const res = await request(app)
      .get('/api/costs/history')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.points).toEqual([]);
    expect(res.body.data.windowHours).toBe(168);
  });

  // ── Invalid query parameters ──────────────────────────────────────────────────
  test('returns 400 INVALID_HOURS when hours=0', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/costs/history?hours=0')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_HOURS');
  });

  test('returns 400 INVALID_HOURS when hours=721 (exceeds max of 720)', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/costs/history?hours=721')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_HOURS');
  });

  test('returns 400 INVALID_AGENT_ID for unknown agentId', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/costs/history?agentId=fake-bot')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_AGENT_ID');
  });

  test('returns 400 INVALID_PROVIDER for unknown provider', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/costs/history?provider=unknownai')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_PROVIDER');
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────────
  test('returns 401 UNAUTHENTICATED for history without session', async () => {
    // Act
    const res = await request(app).get('/api/costs/history');

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
