// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Canonical Type Definitions
// Source of truth: DATA-SCHEMA.md (Nadia, Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Agents ───────────────────────────────────────────────────────────────────

export type AgentState = 'active' | 'idle' | 'running' | 'offline' | 'error';

export type Provider = 'anthropic' | 'gemini' | 'openai';

export type AgentId =
  | 'clawdia'
  | 'security-agent'
  | 'self-improvement-agent'
  | 'marcus'
  | 'sienna'
  | 'dex'
  | 'nadia'
  | 'eli'
  | 'zara'
  | 'roan'
  | 'imogen'
  | 'cass'
  | 'otto'
  | 'phoebe';

export interface AgentStatus {
  id: AgentId;
  name: string;
  emoji: string;
  state: AgentState;
  currentTask: string | null;
  summary: string | null;
  lastSeenAt: string;
  snapshotAt: string;
  isProcessing: boolean;
  sessionId: string | null;
}

export type AgentType = 'orchestrator' | 'autonomous' | 'dev-subagent';

export interface AgentMeta {
  id: AgentId;
  name: string;
  emoji: string;
  type: AgentType;
}

// ─── Costs ────────────────────────────────────────────────────────────────────

export interface CostRecord {
  agentId: AgentId;
  provider: Provider;
  date: string;
  hour: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  updatedAt: string;
}

export interface AgentCostBreakdown {
  agentId: AgentId;
  agentName: string;
  agentEmoji: string;
  /** All-time aggregate cost across all records in DB. */
  costCents: number;
  /** Cost for today (UTC date). */
  todayCostCents: number;
  /** Cost for the rolling 7-day window. */
  weekCostCents: number;
  /** Cost for the current calendar month. */
  monthCostCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export interface ProviderCostBreakdown {
  provider: Provider;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export interface CostWindow {
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export type AlertLevel = 'normal' | 'amber' | 'red' | 'critical';

export interface BudgetStatus {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  fractionUsed: number;
  alertLevel: AlertLevel;
}

export interface CostSummary {
  computedAt: string;
  totals: {
    today: CostWindow;
    week: CostWindow;
    month: CostWindow;
    allTime: CostWindow;
  };
  byAgent: AgentCostBreakdown[];
  byProvider: ProviderCostBreakdown[];
  budget: BudgetStatus;
}

export interface CostHistoryPoint {
  timestamp: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostHistoryResponse {
  computedAt: string;
  windowHours: number;
  agentId: AgentId | null;
  provider: Provider | null;
  points: CostHistoryPoint[];
}

export interface MonthlyCostSummary {
  month: string;
  totalCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  updatedAt: string;
}

// ─── Budget Alerts ────────────────────────────────────────────────────────────

export interface BudgetAlert {
  month: string;
  thresholdCents: number;
  spendAtCrossingCents: number;
  crossedAt: string;
  telegramSent: boolean;
  telegramSentAt: string | null;
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export type FeedEntryCategory =
  | 'task-started'
  | 'task-completed'
  | 'task-failed'
  | 'agent-online'
  | 'agent-offline'
  | 'cost-alert'
  | 'session-started'
  | 'session-ended'
  | 'tool-call'
  | 'system';

export interface FeedEntry {
  key: string;
  agentId: AgentId;
  agentName: string;
  agentEmoji: string;
  category: FeedEntryCategory;
  summary: string;
  detail: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface FeedResponse {
  computedAt: string;
  totalCount: number;
  entries: FeedEntry[];
  nextCursor: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  userAgent: string;
  ipAddress: string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheck {
  status: HealthStatus;
  version: string;
  uptimeSeconds: number;
  checks: {
    replitDb: HealthStatus;
    logParser: HealthStatus;
    anthropicApi: HealthStatus;
    sessionPoller: HealthStatus;
  };
  lastLogParsedAt: string | null;
  lastCostPolledAt: string | null;
  computedAt: string;
}

// ─── API Envelope ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Express augmentation (attach session to req) ─────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionRecord?: AuthSession;
    }
  }
}
