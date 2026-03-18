/**
 * Typed API client for the SCC Office Dashboard backend.
 * All endpoints hit /api/* — proxied via Vite dev server to localhost:3000.
 * All costs returned as integer cents; convert to dollars in display layer.
 */

import type {
  ApiResponse,
  AgentsListResponse,
  AgentDetailResponse,
  AgentId,
  CostSummary,
  CostHistoryResponse,
  Provider,
  FeedResponse,
  LoginResponse,
  LogoutResponse,
  HealthCheck,
} from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// TANSTACK QUERY KEYS
// ─────────────────────────────────────────────────────────────────────────────

export const queryKeys = {
  agents: ['agents'] as const,
  agentDetail: (id: AgentId) => ['agents', id] as const,
  costs: ['costs'] as const,
  costsHistory: (params: { hours?: number; agentId?: AgentId | null; provider?: Provider | null }) =>
    ['costs', 'history', params] as const,
  feed: (params: { agentId?: AgentId | null; limit?: number; cursor?: string | null }) =>
    ['feed', params] as const,
  health: ['health'] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BASE FETCH UTILITY
// ─────────────────────────────────────────────────────────────────────────────

class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // send HTTP-only scc_session cookie
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.ok) {
    throw new ApiClientError(json.error.code, json.error.message, response.status);
  }

  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export async function login(password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<LogoutResponse> {
  return apiFetch<LogoutResponse>('/api/auth/logout', {
    method: 'POST',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAgents(): Promise<AgentsListResponse> {
  return apiFetch<AgentsListResponse>('/api/agents');
}

export async function fetchAgentDetail(id: AgentId): Promise<AgentDetailResponse> {
  return apiFetch<AgentDetailResponse>(`/api/agents/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COSTS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCosts(): Promise<CostSummary> {
  return apiFetch<CostSummary>('/api/costs');
}

export async function fetchCostsHistory(params: {
  hours?: number;
  agentId?: AgentId | null;
  provider?: Provider | null;
}): Promise<CostHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (params.hours !== undefined) searchParams.set('hours', String(params.hours));
  if (params.agentId) searchParams.set('agentId', params.agentId);
  if (params.provider) searchParams.set('provider', params.provider);

  const queryString = searchParams.toString();
  return apiFetch<CostHistoryResponse>(`/api/costs/history${queryString ? `?${queryString}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEED
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFeed(params: {
  agentId?: AgentId | null;
  limit?: number;
  cursor?: string | null;
}): Promise<FeedResponse> {
  const searchParams = new URLSearchParams();
  if (params.agentId) searchParams.set('agentId', params.agentId);
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.cursor) searchParams.set('cursor', params.cursor);

  const queryString = searchParams.toString();
  return apiFetch<FeedResponse>(`/api/feed${queryString ? `?${queryString}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthCheck> {
  return apiFetch<HealthCheck>('/api/health');
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Format integer cents as a dollar string with 2dp: 34218 → "$342.18" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Check if an error is an API auth error (401 UNAUTHENTICATED) */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/** Check if an error is a rate limit error (429 RATE_LIMITED) */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 429;
}

export { ApiClientError };
