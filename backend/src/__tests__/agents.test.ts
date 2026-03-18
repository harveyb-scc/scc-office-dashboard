/**
 * Agents endpoint integration tests
 * GET /api/agents
 * GET /api/agents/:id
 *
 * Test strategy: AAA pattern.
 * Agent and cost services are mocked to return controlled fixtures.
 * Auth is tested via the requireAuth middleware path.
 */

import request from 'supertest';
import { createHash } from 'crypto';
import type { AgentStatus, CostSummary, FeedResponse } from '../types';

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

const mockGetAllAgentStatuses = jest.fn();
const mockGetAgentStatus = jest.fn();
const mockGetCostSummary = jest.fn();
const mockGetFeed = jest.fn();

jest.mock('../services/agentService', () => ({
  getAllAgentStatuses: (...args: unknown[]) => mockGetAllAgentStatuses(...args),
  getAgentStatus: (...args: unknown[]) => mockGetAgentStatus(...args),
  AGENT_ROSTER: [],
}));

jest.mock('../services/costService', () => ({
  getCostSummary: (...args: unknown[]) => mockGetCostSummary(...args),
  getCostHistory: jest.fn(),
}));

jest.mock('../services/feedService', () => ({
  getFeed: (...args: unknown[]) => mockGetFeed(...args),
}));

jest.mock('../services/alertService', () => ({
  alertService: { sendBudgetAlert: jest.fn(async () => false) },
}));

jest.mock('../integrations', () => ({
  startCostPoller: jest.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const agentFixture: AgentStatus = {
  id: 'clawdia',
  name: 'Clawdia',
  emoji: '🦞',
  state: 'active',
  currentTask: 'Reviewing performance brief',
  summary: null,
  lastSeenAt: new Date().toISOString(),
  snapshotAt: new Date().toISOString(),
  isProcessing: true,
  sessionId: 'session_test_123',
};

const fullRosterFixture: AgentStatus[] = [
  agentFixture,
  { ...agentFixture, id: 'marcus', name: 'Marcus', emoji: '⚙️', state: 'idle', currentTask: null },
  { ...agentFixture, id: 'sienna', name: 'Sienna', emoji: '🎨', state: 'offline', currentTask: null },
];

const costSummaryFixture: CostSummary = {
  computedAt: new Date().toISOString(),
  totals: {
    today: { costCents: 150, inputTokens: 10000, outputTokens: 2000, callCount: 5 },
    week: { costCents: 1200, inputTokens: 80000, outputTokens: 16000, callCount: 40 },
    month: { costCents: 5000, inputTokens: 300000, outputTokens: 60000, callCount: 150 },
    allTime: { costCents: 12000, inputTokens: 700000, outputTokens: 140000, callCount: 400 },
  },
  byAgent: [
    {
      agentId: 'clawdia',
      agentName: 'Clawdia',
      agentEmoji: '🦞',
      costCents: 3000,
      inputTokens: 200000,
      outputTokens: 40000,
      callCount: 100,
    },
  ],
  byProvider: [
    {
      provider: 'anthropic',
      costCents: 12000,
      inputTokens: 700000,
      outputTokens: 140000,
      callCount: 400,
    },
  ],
  budget: {
    budgetCents: 50000,
    spentCents: 5000,
    remainingCents: 45000,
    fractionUsed: 0.1,
    alertLevel: 'normal',
  },
};

const feedFixture: FeedResponse = {
  computedAt: new Date().toISOString(),
  totalCount: 2,
  entries: [
    {
      key: 'feed-1',
      agentId: 'clawdia',
      agentName: 'Clawdia',
      agentEmoji: '🦞',
      category: 'task-started',
      summary: 'Started reviewing performance brief',
      detail: null,
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
  nextCursor: null,
};

// ─── App setup ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  process.env.DASHBOARD_PASSWORD_HASH = '$2b$12$testhashtesthashtesthashtesth.testhashabcdefghijklm';
  process.env.SESSION_SECRET = 'agents-test-session-secret-at-least-32-chars-long!!';
  process.env.OPENCLAW_LOG_PATH = '/tmp/test-openclaw-logs';
  process.env.NODE_ENV = 'test';
  process.env.REPLIT_DB_URL = 'http://localhost:9999/test-db';

  const { default: importedApp } = await import('../index');
  app = importedApp;
});

beforeEach(() => {
  Object.keys(mockDb).forEach((k) => delete mockDb[k]);
  jest.clearAllMocks();

  // Default mock returns
  mockGetAllAgentStatuses.mockResolvedValue({
    agents: fullRosterFixture,
    dataFreshAt: new Date().toISOString(),
  });
  mockGetAgentStatus.mockResolvedValue(agentFixture);
  mockGetCostSummary.mockResolvedValue(costSummaryFixture);
  mockGetFeed.mockResolvedValue(feedFixture);
});

// ─── Session helpers ──────────────────────────────────────────────────────────

function createSession(): string {
  const rawToken = 'b'.repeat(64);
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

// ─── GET /api/agents ──────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  // ── Authenticated — happy path ────────────────────────────────────────────────
  test('returns 200 with all agent statuses when authenticated', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/agents')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('agents');
    expect(res.body.data).toHaveProperty('dataFreshAt');
    expect(Array.isArray(res.body.data.agents)).toBe(true);
    expect(res.body.data.agents.length).toBe(3);

    // Each agent must have required fields
    const agent = res.body.data.agents[0];
    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('emoji');
    expect(agent).toHaveProperty('state');
    expect(agent).toHaveProperty('lastSeenAt');
    expect(agent).toHaveProperty('snapshotAt');
    expect(agent).toHaveProperty('isProcessing');
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────────
  test('returns 401 UNAUTHENTICATED when no session cookie', async () => {
    // Arrange — no cookie

    // Act
    const res = await request(app).get('/api/agents');

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('returns 401 when session cookie contains invalid token', async () => {
    // Arrange — valid-looking token but not in DB
    const res = await request(app)
      .get('/api/agents')
      .set('Cookie', 'scc_session=notarealsession12345678901234567890123456789012345678901234');

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  // ── Empty log state ────────────────────────────────────────────────────────────
  test('returns 200 with all agents showing offline state when no log data', async () => {
    // Arrange — mock returns agents all in offline state
    const token = createSession();
    const offlineRoster: AgentStatus[] = fullRosterFixture.map((a) => ({
      ...a,
      state: 'offline',
      currentTask: null,
      isProcessing: false,
      sessionId: null,
      lastSeenAt: '1970-01-01T00:00:00.000Z',
    }));
    mockGetAllAgentStatuses.mockResolvedValue({
      agents: offlineRoster,
      dataFreshAt: new Date().toISOString(),
    });

    // Act
    const res = await request(app)
      .get('/api/agents')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.agents.every((a: AgentStatus) => a.state === 'offline')).toBe(true);
    // currentTask can be null when idle/offline
    expect(res.body.data.agents.every((a: AgentStatus) => a.currentTask === null)).toBe(true);
  });
});

// ─── GET /api/agents/:id ──────────────────────────────────────────────────────

describe('GET /api/agents/:id', () => {
  // ── Valid id ──────────────────────────────────────────────────────────────────
  test('returns 200 with agent detail, recent activity, and costs for a valid agent id', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/agents/clawdia')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveProperty('agent');
    expect(res.body.data).toHaveProperty('recentActivity');
    expect(res.body.data).toHaveProperty('costs');

    const { agent } = res.body.data;
    expect(agent.id).toBe('clawdia');
    expect(agent.name).toBe('Clawdia');
    expect(agent.emoji).toBe('🦞');
    expect(agent.state).toBe('active');

    // Costs structure
    expect(res.body.data.costs).toHaveProperty('today');
    expect(res.body.data.costs).toHaveProperty('month');
    expect(typeof res.body.data.costs.today.costCents).toBe('number');

    // Recent activity is an array (may be empty)
    expect(Array.isArray(res.body.data.recentActivity)).toBe(true);
  });

  test('returns all valid agent IDs from the roster', async () => {
    // Arrange
    const token = createSession();
    const validIds = [
      'clawdia', 'security-agent', 'self-improvement-agent',
      'marcus', 'sienna', 'dex', 'nadia', 'eli',
      'zara', 'roan', 'imogen', 'cass', 'otto', 'phoebe',
    ];

    for (const id of validIds) {
      mockGetAgentStatus.mockResolvedValueOnce({ ...agentFixture, id } as AgentStatus);

      // Act
      const res = await request(app)
        .get(`/api/agents/${id}`)
        .set('Cookie', `scc_session=${token}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.data.agent.id).toBe(id);
    }
  });

  // ── Invalid id ────────────────────────────────────────────────────────────────
  test('returns 404 AGENT_NOT_FOUND for an unknown agent id', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get('/api/agents/unknown-bot')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
    expect(res.body.error.message).toContain('unknown-bot');
  });

  test('returns 404 for empty string segment (double-slash)', async () => {
    // Arrange
    const token = createSession();

    // Act — request with whitespace in id
    const res = await request(app)
      .get('/api/agents/   ')
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(404);
  });

  test('returns 404 for sql-injection-looking id', async () => {
    // Arrange
    const token = createSession();

    // Act
    const res = await request(app)
      .get("/api/agents/'; DROP TABLE sessions;--")
      .set('Cookie', `scc_session=${token}`);

    // Assert
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────────
  test('returns 401 UNAUTHENTICATED when requesting agent detail without session', async () => {
    // Arrange — no cookie

    // Act
    const res = await request(app).get('/api/agents/clawdia');

    // Assert
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
