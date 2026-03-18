// ─────────────────────────────────────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────────────────────────────────────

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

export interface AgentMeta {
  id: AgentId;
  name: string;
  emoji: string;
  type: 'orchestrator' | 'autonomous' | 'dev-subagent';
}

// ─────────────────────────────────────────────────────────────────────────────
// COSTS
// ─────────────────────────────────────────────────────────────────────────────

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
  /** All-time aggregate cost (kept for backwards compatibility) */
  costCents: number;
  /** Cost for today only */
  todayCostCents: number;
  /** Cost for the current rolling 7-day week */
  weekCostCents: number;
  /** Cost for the current calendar month */
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

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY FEED
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthSession {
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  userAgent: string;
  ipAddress: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// API ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DETAIL RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentDetailResponse {
  agent: AgentStatus;
  recentActivity: FeedEntry[];
  costs: {
    today: CostWindow;
    week: CostWindow;
    month: CostWindow;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH RESPONSES
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  expiresAt: string;
}

export interface LogoutResponse {
  loggedOut: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTS LIST RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentsListResponse {
  agents: AgentStatus[];
  dataFreshAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT
// ─────────────────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc' | 'none';
export type LedgerSortColumn = 'name' | 'today' | 'week' | 'month';
