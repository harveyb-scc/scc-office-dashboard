# DATA-SCHEMA.md — SCC Office Dashboard
**Author:** Nadia (Senior Data Engineer, SCC)
**Phase:** 3 — Data Schema
**Status:** Ready for Marcus (Phase 4)
**Last Updated:** 2026-03-17

---

## Overview

This document is the canonical data contract for the SCC Office Dashboard backend. Marcus implements from this spec directly. Nothing in the API deviates from what is defined here without a schema review.

The backend has three data sources and one persistence layer:

| Source | What it provides |
|--------|-----------------|
| OpenClaw log files | Agent activity, task descriptions, session events |
| `openclaw sessions list` | Live agent status (polled via bridge every 60s) |
| Anthropic usage API | Per-model token costs, aggregated by day |
| Replit DB | Persistence for cost history, budget alerts, feed entries, auth tokens |

Replit DB is a key-value store. There are no joins, no transactions, and no foreign key constraints. Every design decision below accounts for this. Keys are the schema.

---

## Part 1 — Replit DB Key Structure

### 1.1 Naming Convention

All keys follow this pattern:

```
<namespace>:<entity>:<identifier>[:<subkey>]
```

Namespaces:
- `agent` — agent status snapshots
- `cost` — cost records
- `alert` — budget alert records
- `feed` — activity feed entries
- `auth` — session/auth tokens
- `meta` — internal bookkeeping (indexes, cursors, counters)

Colons (`:`) are the only separator. No slashes, no dots, no mixed case.

---

### 1.2 Agent Status Snapshots

Purpose: Cache the last-known status of each agent. Written every polling cycle (60s). Not time-series — always overwritten.

```
agent:status:<agentId>
```

**Examples:**
```
agent:status:clawdia
agent:status:marcus
agent:status:security-agent
```

**Value:** JSON-serialised `AgentStatus` object (see Part 2).

**TTL:** 5 minutes. If a key is older than 5 minutes and no new poll has refreshed it, the agent is considered stale/unreachable.

**Meta key — agent roster index:**
```
meta:agent:ids
```
Value: JSON array of all known agent IDs (`string[]`). Written once at startup, updated if a new agent appears in log parsing.

---

### 1.3 Cost Records (Hourly)

Purpose: Time-series cost data. One record per agent per provider per UTC hour. Used to build sparklines and aggregate totals.

```
cost:hourly:<agentId>:<provider>:<YYYY-MM-DD-HH>
```

`HH` is zero-padded UTC hour (00–23).

**Examples:**
```
cost:hourly:clawdia:anthropic:2026-03-17-14
cost:hourly:clawdia:gemini:2026-03-17-14
cost:hourly:marcus:anthropic:2026-03-17-09
```

**Value:** JSON-serialised `CostRecord` object (see Part 2).

**Meta key — daily cost index (for efficient date-range scans):**
```
meta:cost:days
```
Value: JSON array of UTC date strings that have at least one cost record (`string[]`). Example: `["2026-03-01", "2026-03-02", ...]`. Append-only; used to avoid full-keyspace scans.

**Meta key — running monthly total (cache, recomputed on write):**
```
meta:cost:monthly:<YYYY-MM>
```
Value: JSON-serialised `MonthlyCostSummary` object (see Part 2).

---

### 1.4 Budget Alerts

Purpose: Record when a threshold was crossed so duplicate alerts are not sent within the same month.

```
alert:budget:<YYYY-MM>:<thresholdCents>
```

`thresholdCents` is the threshold value in integer cents (e.g., `40000` for $400.00, `47500` for $475.00, `50000` for $500.00).

**Examples:**
```
alert:budget:2026-03:40000
alert:budget:2026-03:47500
alert:budget:2026-03:50000
```

**Value:** JSON-serialised `BudgetAlert` object (see Part 2).

---

### 1.5 Activity Feed Entries

Purpose: Chronological log of agent actions for The Feed view. Sourced from OpenClaw log parsing.

```
feed:entry:<agentId>:<ISO8601-timestamp-ms>:<nanoid6>
```

`ISO8601-timestamp-ms` is UTC milliseconds since epoch, zero-padded to 16 digits, ensuring lexicographic sort equals chronological sort.

`nanoid6` is a 6-character random suffix to avoid collisions from the same agent at the same millisecond.

**Examples:**
```
feed:entry:clawdia:0001742234400000:a3kX9z
feed:entry:marcus:0001742234512345:Bm7wQr
```

**Value:** JSON-serialised `FeedEntry` object (see Part 2).

**Meta key — feed cursor (for incremental log parsing):**
```
meta:feed:cursor:<agentId>
```
Value: ISO 8601 timestamp string of the last successfully parsed log line for that agent. Used by Dex's log parser to resume from where it left off.

---

### 1.6 Auth Tokens (User Sessions)

Purpose: Server-side session tokens for the password-protected dashboard. Single-user (Harvey).

```
auth:session:<tokenHash>
```

`tokenHash` is the SHA-256 hex digest of the raw session token. The raw token is sent to the client as an HTTP-only cookie. Only the hash is stored in Replit DB — never the raw token.

**Value:** JSON-serialised `AuthSession` object (see Part 2).

**Meta key — active session count (rate-limit aid):**
```
meta:auth:session-count
```
Value: integer (string-encoded). Incremented on login, decremented on logout.

---

## Part 2 — TypeScript Data Models

All interfaces represent the shapes stored in Replit DB and served by the API. Every field is explicitly typed and nullability is documented.

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────────────────────────────────────

/** All possible agent operational states. */
type AgentState = 'active' | 'idle' | 'running' | 'offline' | 'error';

/** All known providers. Extend here when new providers are added. */
type Provider = 'anthropic' | 'gemini' | 'openai';

/** All known agent IDs. Matches PROJECT-BRIEF.md roster. */
type AgentId =
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

/**
 * Snapshot of a single agent's current state.
 * Written to Replit DB on every polling cycle.
 * Source: openclaw sessions list + log parsing.
 */
interface AgentStatus {
  /** Stable machine identifier. Matches AgentId union. */
  id: AgentId;
  /** Human-readable display name. */
  name: string;
  /** Emoji avatar for display. */
  emoji: string;
  /** Operational state. */
  state: AgentState;
  /**
   * Plain-English description of what the agent is currently doing.
   * Derived from log parsing — most recent non-heartbeat task description.
   * Null if no active task or agent is offline.
   */
  currentTask: string | null;
  /**
   * Plain-English summary for the expanded detail view.
   * Null if not enough context to summarise.
   */
  summary: string | null;
  /** UTC ISO 8601 timestamp of the last activity observed in logs. */
  lastSeenAt: string;
  /** UTC ISO 8601 timestamp this snapshot was written to Replit DB. */
  snapshotAt: string;
  /**
   * True if the agent produced any log output in the last 60 seconds.
   * Used to drive the visual pulse animation.
   */
  isProcessing: boolean;
  /** OpenClaw session ID if agent is in an active session. Null otherwise. */
  sessionId: string | null;
}

/**
 * Static metadata for an agent (display config, not operational state).
 * Used by the frontend for agents that may be offline.
 */
interface AgentMeta {
  id: AgentId;
  name: string;
  emoji: string;
  type: 'orchestrator' | 'autonomous' | 'dev-subagent';
}

// ─────────────────────────────────────────────────────────────────────────────
// COSTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One cost record for a single agent, provider, and UTC hour.
 * Written by Dex after each polling cycle.
 * Replit DB key: cost:hourly:<agentId>:<provider>:<YYYY-MM-DD-HH>
 */
interface CostRecord {
  agentId: AgentId;
  provider: Provider;
  /** UTC date string: YYYY-MM-DD */
  date: string;
  /** UTC hour: 0–23 */
  hour: number;
  /** Cost in USD cents (integer). Avoids floating-point rounding. */
  costCents: number;
  /** Input tokens consumed this hour. */
  inputTokens: number;
  /** Output tokens consumed this hour. */
  outputTokens: number;
  /** Number of API calls aggregated into this record. */
  callCount: number;
  /** UTC ISO 8601 timestamp this record was last updated. */
  updatedAt: string;
}

/**
 * Per-agent cost breakdown for a time window.
 * Computed at query time from CostRecord aggregation.
 */
interface AgentCostBreakdown {
  agentId: AgentId;
  agentName: string;
  agentEmoji: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

/**
 * Per-provider cost breakdown for a time window.
 */
interface ProviderCostBreakdown {
  provider: Provider;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

/**
 * Full cost summary response — all windows, all breakdowns.
 * Served by GET /api/costs.
 */
interface CostSummary {
  /** UTC ISO 8601 timestamp this summary was computed. */
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

/** Cost totals for a single time window. */
interface CostWindow {
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

/** Current budget state for display in The Ledger. */
interface BudgetStatus {
  /** Budget cap in cents. Always 50000 ($500.00). */
  budgetCents: number;
  /** Current month spend in cents. */
  spentCents: number;
  /** Remaining budget in cents. May be negative if over budget. */
  remainingCents: number;
  /** 0.0–1.0 fraction consumed. */
  fractionUsed: number;
  /** UI alert level for display colouring. */
  alertLevel: 'normal' | 'amber' | 'red' | 'critical';
}

/**
 * One data point for sparkline charts.
 * Served by GET /api/costs/history.
 */
interface CostHistoryPoint {
  /** UTC ISO 8601 timestamp for the start of this hour bucket. */
  timestamp: string;
  /** Cost in cents for this hour bucket. */
  costCents: number;
  /** Aggregated across all agents + providers unless filtered. */
  inputTokens: number;
  outputTokens: number;
}

/** Full history response. */
interface CostHistoryResponse {
  computedAt: string;
  /** Query window: hours of data returned. */
  windowHours: number;
  /** Optionally filtered to a single agent. Null means all agents. */
  agentId: AgentId | null;
  /** Optionally filtered to a single provider. Null means all providers. */
  provider: Provider | null;
  points: CostHistoryPoint[];
}

/**
 * Cached monthly cost summary stored in Replit DB.
 * Replit DB key: meta:cost:monthly:<YYYY-MM>
 * Recomputed on every hourly cost write for the current month.
 */
interface MonthlyCostSummary {
  /** Month: YYYY-MM */
  month: string;
  totalCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records a budget threshold crossing event.
 * Prevents duplicate Telegram alerts within the same calendar month.
 * Replit DB key: alert:budget:<YYYY-MM>:<thresholdCents>
 */
interface BudgetAlert {
  /** Month: YYYY-MM */
  month: string;
  /** Threshold that was crossed (cents): 40000, 47500, or 50000 */
  thresholdCents: number;
  /** Spend level at the moment the threshold was crossed (cents). */
  spendAtCrossingCents: number;
  /** UTC ISO 8601 timestamp when the threshold was crossed. */
  crossedAt: string;
  /** Whether a Telegram notification was successfully sent. */
  telegramSent: boolean;
  /** UTC ISO 8601 timestamp when the Telegram message was sent. Null if not yet sent. */
  telegramSentAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY FEED
// ─────────────────────────────────────────────────────────────────────────────

type FeedEntryCategory =
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

/**
 * A single activity timeline entry.
 * Sourced from OpenClaw log parsing by Dex.
 * Replit DB key: feed:entry:<agentId>:<timestamp-ms>:<nanoid6>
 */
interface FeedEntry {
  /** Composite key stored alongside value for reconstruction. */
  key: string;
  agentId: AgentId;
  agentName: string;
  agentEmoji: string;
  category: FeedEntryCategory;
  /**
   * Plain-English summary of the action.
   * Written at parse time. No technical jargon.
   * Maximum 200 characters.
   */
  summary: string;
  /**
   * Optional longer plain-English description.
   * Shown in expanded view. Maximum 500 characters.
   */
  detail: string | null;
  /** UTC ISO 8601 timestamp of the event (from log line, not parse time). */
  occurredAt: string;
  /** UTC ISO 8601 timestamp this entry was written to Replit DB. */
  createdAt: string;
}

/** Response shape for GET /api/feed. */
interface FeedResponse {
  computedAt: string;
  /** Total entries matching the query (for display). */
  totalCount: number;
  /** Entries returned (may be a page if limit is applied). */
  entries: FeedEntry[];
  /** Cursor for next page. Null if no more pages. */
  nextCursor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side session record.
 * Replit DB key: auth:session:<SHA256(rawToken)>
 * NEVER store the raw token. Only the hash goes in DB.
 */
interface AuthSession {
  /** SHA-256 hex hash of the raw session token. */
  tokenHash: string;
  /** UTC ISO 8601 timestamp the session was created. */
  createdAt: string;
  /** UTC ISO 8601 timestamp the session expires. */
  expiresAt: string;
  /** UTC ISO 8601 timestamp the session was last used. */
  lastUsedAt: string;
  /** User agent string from login request (for audit trail only). */
  userAgent: string;
  /** IP address from login request (for audit trail only). */
  ipAddress: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

type HealthStatus = 'ok' | 'degraded' | 'down';

interface HealthCheck {
  status: HealthStatus;
  version: string;
  uptimeSeconds: number;
  checks: {
    replitDb: HealthStatus;
    logParser: HealthStatus;
    anthropicApi: HealthStatus;
    sessionPoller: HealthStatus;
  };
  /** UTC ISO 8601 timestamp of last successful log parse cycle. */
  lastLogParsedAt: string | null;
  /** UTC ISO 8601 timestamp of last successful cost poll cycle. */
  lastCostPolledAt: string | null;
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

/** All successful API responses are wrapped in this envelope. */
interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** All error API responses are wrapped in this envelope. */
interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

---

## Part 3 — API Contract

### 3.0 General Rules

- **Base URL:** `/api`
- **Content-Type:** All requests and responses: `application/json`
- **Auth:** Session token delivered as an HTTP-only cookie named `scc_session`. All protected endpoints validate this cookie against Replit DB on every request.
- **Response envelope:** Every response uses `ApiResponse<T>` (see Part 2). `ok: true` with `data` on success; `ok: false` with `error.code` and `error.message` on failure.
- **Timestamps:** All timestamps are UTC ISO 8601 strings (e.g., `"2026-03-17T14:00:00.000Z"`).
- **Costs:** All cost values in the API are **integer cents** (USD). The frontend converts to dollars for display.
- **HTTP status codes:** 200 success, 400 bad request, 401 unauthenticated, 403 forbidden, 404 not found, 429 rate limited, 500 internal error.

---

### 3.1 `GET /api/agents`

Returns the current status of all agents in the roster.

**Auth required:** Yes

**Request:** No query parameters. No request body.

**Response `200`:**
```typescript
ApiSuccess<{
  agents: AgentStatus[];
  /** UTC ISO 8601 — when the underlying poll data was last refreshed. */
  dataFreshAt: string;
}>
```

**Example response body:**
```json
{
  "ok": true,
  "data": {
    "agents": [
      {
        "id": "clawdia",
        "name": "Clawdia",
        "emoji": "🦞",
        "state": "active",
        "currentTask": "Reviewing Marcus's PR for the cost aggregation endpoint",
        "summary": "Currently in a Telegram session with Harvey, coordinating Phase 4 handoff to Marcus.",
        "lastSeenAt": "2026-03-17T14:02:00.000Z",
        "snapshotAt": "2026-03-17T14:02:05.000Z",
        "isProcessing": true,
        "sessionId": "session_abc123"
      }
    ],
    "dataFreshAt": "2026-03-17T14:02:05.000Z"
  }
}
```

**Behaviour notes:**
- Agents in the roster with no Replit DB snapshot (never seen) are returned with `state: "offline"`, all other fields null/defaults, and `lastSeenAt` as the epoch.
- Sort order: orchestrators first, then autonomous, then dev-subagents, all alphabetical within type.

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 401 | `UNAUTHENTICATED` | Missing or invalid session cookie |
| 500 | `INTERNAL_ERROR` | Replit DB read failure |

---

### 3.2 `GET /api/agents/:id`

Returns the full status and detail for a single agent.

**Auth required:** Yes

**Path parameters:**
- `id` — `AgentId` string (e.g., `clawdia`, `marcus`)

**Request:** No query parameters. No request body.

**Response `200`:**
```typescript
ApiSuccess<{
  agent: AgentStatus;
  /** Last 10 feed entries for this agent. */
  recentActivity: FeedEntry[];
  /** Cost totals for this agent: today / week / month. */
  costs: {
    today: CostWindow;
    week: CostWindow;
    month: CostWindow;
  };
}>
```

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 401 | `UNAUTHENTICATED` | Missing or invalid session cookie |
| 404 | `AGENT_NOT_FOUND` | `id` is not in the known agent roster |
| 500 | `INTERNAL_ERROR` | Replit DB read failure |

---

### 3.3 `GET /api/costs`

Returns the full cost summary: all time windows, per-agent breakdown, per-provider breakdown, and current budget status.

**Auth required:** Yes

**Request:** No query parameters. No request body.

**Response `200`:**
```typescript
ApiSuccess<CostSummary>
```

**Computation notes:**
- "Today" = from 00:00:00 UTC today to now.
- "Week" = rolling 7 days from now.
- "Month" = calendar month to date (UTC).
- "All time" = all records in Replit DB.
- All aggregations are computed at request time from `cost:hourly:*` keys. The monthly total is cross-checked against the `meta:cost:monthly:<YYYY-MM>` cache; if they differ by >1 cent (floating-point drift), the cache is recomputed and written.

**Budget alert level thresholds:**

| `alertLevel` | Condition |
|-------------|-----------|
| `normal` | Month spend < $400.00 |
| `amber` | $400.00 ≤ spend < $475.00 |
| `red` | $475.00 ≤ spend < $500.00 |
| `critical` | spend ≥ $500.00 |

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 401 | `UNAUTHENTICATED` | Missing or invalid session cookie |
| 500 | `INTERNAL_ERROR` | Replit DB read failure or aggregation failure |

---

### 3.4 `GET /api/costs/history`

Returns hourly cost data points for sparkline charts.

**Auth required:** Yes

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hours` | integer | No | `168` (7 days) | Number of hours of history to return. Max: `720` (30 days). |
| `agentId` | `AgentId` | No | null | Filter to a specific agent. |
| `provider` | `Provider` | No | null | Filter to a specific provider. |

**Request body:** None.

**Response `200`:**
```typescript
ApiSuccess<CostHistoryResponse>
```

**Behaviour notes:**
- Returns one `CostHistoryPoint` per hour in the requested window, including hours with zero activity (filled with zeros). Sparse data is zero-filled so the frontend always receives a dense array.
- `timestamp` in each point is the start of the UTC hour bucket (e.g., `"2026-03-17T14:00:00.000Z"`).
- If both `agentId` and `provider` are specified, data is filtered to match both.

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 400 | `INVALID_HOURS` | `hours` is not a positive integer or exceeds 720 |
| 400 | `INVALID_AGENT_ID` | `agentId` is not in the known roster |
| 400 | `INVALID_PROVIDER` | `provider` is not a known provider |
| 401 | `UNAUTHENTICATED` | Missing or invalid session cookie |
| 500 | `INTERNAL_ERROR` | Replit DB read failure |

---

### 3.5 `GET /api/feed`

Returns the activity timeline. Newest entries first.

**Auth required:** Yes

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `agentId` | `AgentId` | No | null | Filter to a specific agent. |
| `limit` | integer | No | `50` | Entries to return. Max: `200`. |
| `cursor` | string | No | null | Pagination cursor from previous response's `nextCursor`. |

**Request body:** None.

**Response `200`:**
```typescript
ApiSuccess<FeedResponse>
```

**Behaviour notes:**
- Entries are sorted descending by `occurredAt` (newest first).
- Cursor-based pagination. The `nextCursor` value is an opaque base64-encoded string encoding the key of the last returned entry. Pass it back as `cursor` to get the next page.
- If `cursor` is provided and invalid (malformed or expired), return `400 INVALID_CURSOR` — do not silently ignore it.

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 400 | `INVALID_AGENT_ID` | `agentId` is not in the known roster |
| 400 | `INVALID_LIMIT` | `limit` is not a positive integer or exceeds 200 |
| 400 | `INVALID_CURSOR` | `cursor` is malformed or expired |
| 401 | `UNAUTHENTICATED` | Missing or invalid session cookie |
| 500 | `INTERNAL_ERROR` | Replit DB read failure |

---

### 3.6 `POST /api/auth/login`

Authenticates the user and issues a session token.

**Auth required:** No

**Request body:**
```typescript
{
  /** Plain-text password. Compared against bcrypt hash in environment variable. */
  password: string;
}
```

**Response `200`:**
```typescript
ApiSuccess<{
  /** UTC ISO 8601 timestamp the session expires. */
  expiresAt: string;
}>
```

Sets an HTTP-only, `SameSite=Strict`, `Secure` cookie named `scc_session` with the raw session token value. The cookie Max-Age matches session expiry (24 hours).

**Implementation notes:**
- The password hash is stored in environment variable `DASHBOARD_PASSWORD_HASH` (bcrypt, cost factor 12).
- On successful login: generate a 32-byte cryptographically random token via `crypto.randomBytes(32).toString('hex')`. Hash it with SHA-256. Store the `AuthSession` record in Replit DB under `auth:session:<hash>`.
- Rate limit: maximum 5 failed login attempts per IP per 15-minute window. Return `429 RATE_LIMITED` on breach.
- Always return `400 INVALID_CREDENTIALS` for wrong password — never distinguish between "wrong password" and "user not found" (there is only one user, but do not leak this via error messaging).

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 400 | `MISSING_PASSWORD` | `password` field absent from body |
| 400 | `INVALID_CREDENTIALS` | Password does not match |
| 429 | `RATE_LIMITED` | Too many failed attempts from this IP |
| 500 | `INTERNAL_ERROR` | Token generation or DB write failure |

---

### 3.7 `POST /api/auth/logout`

Invalidates the current session.

**Auth required:** Yes (must have a valid session to log out of)

**Request body:** None.

**Response `200`:**
```typescript
ApiSuccess<{ loggedOut: true }>
```

Clears the `scc_session` cookie (Max-Age=0).

**Implementation notes:**
- Delete the `auth:session:<hash>` key from Replit DB.
- Decrement `meta:auth:session-count`.
- If session token is missing or already expired, still return `200 ok: true` — idempotent logout.

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| 500 | `INTERNAL_ERROR` | DB write failure during session deletion |

---

### 3.8 `GET /api/health`

Health check endpoint. Used by Replit Autoscale keep-alive and monitoring.

**Auth required:** No

**Request:** No query parameters. No request body.

**Response `200`:**
```typescript
ApiSuccess<HealthCheck>
```

**Response `503`** (when `status` is `degraded` or `down`):
```typescript
ApiSuccess<HealthCheck>
```

Note: The response body shape is identical regardless of health status. The HTTP status code differs: `200` when healthy, `503` when degraded or down. This allows monitoring tools to detect failures via HTTP status while still reading the full diagnostic payload.

**Error responses:**

| HTTP | `error.code` | When |
|------|-------------|------|
| *(none)* | — | This endpoint never returns `ok: false`. All failures are expressed via `HealthCheck.status` and `HealthCheck.checks`. |

---

## Part 4 — Cost Calculation Logic

### 4.1 Sources

Costs are aggregated from two sources:

**Source A: Anthropic Usage API**

Endpoint: `GET https://api.anthropic.com/v1/usage` (or billing API equivalent — confirm with Dex).

- Polled every 60 seconds by Dex's cost-polling service.
- Returns token counts and model breakdowns per API key per time period.
- Used for all `provider: "anthropic"` cost records.
- Pricing constants (stored in environment variables, not hardcoded):
  - `ANTHROPIC_INPUT_PRICE_PER_MILLION_TOKENS` (USD)
  - `ANTHROPIC_OUTPUT_PRICE_PER_MILLION_TOKENS` (USD)
  - These must be updated when Anthropic pricing changes. The calculation is never baked into DB values — always stored as token counts. Dollar values are computed at read time from current pricing constants.

**Source B: OpenClaw Log Files**

Path pattern: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`

- Parsed by Dex's log parser every 60 seconds.
- Log lines contain JSON-structured usage data with agent ID, model, input tokens, output tokens, timestamp.
- Used to attribute costs to specific agents (the Anthropic API gives org-level totals; logs give per-agent breakdown).
- Dex reconciles: org total from Anthropic API ≥ sum of per-agent totals from logs (some system overhead may not appear in agent logs).

### 4.2 Cost Calculation

Costs are stored as **integer cents** to avoid floating-point accumulation errors across hourly records.

```
costCents = ROUND(
  (inputTokens / 1_000_000 * inputPriceUSD +
   outputTokens / 1_000_000 * outputPriceUSD)
  * 100
)
```

Rounding: standard half-up. Applied at write time, once per `CostRecord` write.

For **Gemini**, costs follow the same pattern using:
- `GEMINI_INPUT_PRICE_PER_MILLION_TOKENS`
- `GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS`

### 4.3 Write Logic (Dex implements this, Nadia specifies it)

On each polling cycle (every 60 seconds):

1. Read latest token usage from Anthropic API and parse new log lines since last cursor.
2. For each agent + provider combination active in this cycle:
   a. Compute the current UTC hour bucket: `YYYY-MM-DD-HH`.
   b. Read the existing `cost:hourly:<agentId>:<provider>:<bucket>` key from Replit DB.
   c. If the key exists: add new token counts to existing totals, increment `callCount`, recalculate `costCents`, update `updatedAt`.
   d. If the key does not exist: create a new `CostRecord` with this cycle's values.
   e. Write the updated key back to Replit DB.
3. After all cost writes: recompute `meta:cost:monthly:<YYYY-MM>` and write it.
4. Check budget thresholds:
   a. If new monthly total crosses 40000, 47500, or 50000 cents:
   b. Check whether `alert:budget:<YYYY-MM>:<thresholdCents>` already exists in Replit DB.
   c. If not: write the `BudgetAlert` record, then trigger Telegram notification.
   d. If already exists: do nothing (alert already sent).
5. Update `meta:feed:cursor:<agentId>` for all parsed log lines.

### 4.4 Aggregation at Read Time

`GET /api/costs` and `GET /api/costs/history` aggregate on the fly from `cost:hourly:*` keys. No pre-aggregated daily/weekly totals are stored (except monthly cache). This is acceptable because:

- Maximum keys at 30-day retention: 14 agents × 2 providers × 24 hours × 30 days = 20,160 keys.
- Replit DB key-value reads at this scale are fast enough for 60-second poll intervals.
- If read latency becomes an issue, add daily aggregation caches — but only then.

---

## Part 5 — Data Retention Policy

### 5.1 Retention Table

| Data Type | Replit DB Key Pattern | Retention | Deletion Strategy |
|-----------|----------------------|-----------|-------------------|
| Agent status snapshots | `agent:status:*` | 5 minutes (TTL) | Overwrite on each poll; stale = offline |
| Hourly cost records | `cost:hourly:*` | 90 days | Scheduled cleanup job (see §5.3) |
| Monthly cost summary cache | `meta:cost:monthly:*` | 13 months | Scheduled cleanup job |
| Budget alerts | `alert:budget:*` | 13 months | Scheduled cleanup job |
| Feed entries | `feed:entry:*` | 30 days | Scheduled cleanup job |
| Feed cursors | `meta:feed:cursor:*` | Permanent | Never deleted (small, used for restart recovery) |
| Auth sessions | `auth:session:*` | 24 hours (expiry) | Deleted on logout; stale cleaned up on login |
| Agent roster index | `meta:agent:ids` | Permanent | Updated, never deleted |
| Cost days index | `meta:cost:days` | Permanent | Trimmed when oldest day falls out of 90-day window |
| Session count | `meta:auth:session-count` | Permanent | Reset if inconsistent |

**Rationale:**
- 90-day cost history gives Harvey a full quarter of data — enough for any trend analysis.
- 13 months of monthly summaries and budget alerts provides year-over-year comparison for one cycle.
- 30-day feed keeps today's activity and recent history accessible without unbounded growth.
- Auth sessions expire after 24 hours of inactivity, balancing security against usability.

### 5.2 Storage Estimate

At 90-day retention, maximum Replit DB storage:

| Data Type | Max Keys | Est. Size/Key | Total |
|-----------|----------|--------------|-------|
| Hourly cost records | 20,160 | ~300 bytes | ~6 MB |
| Feed entries | ~86,400 (30d × ~2880/day) | ~400 bytes | ~34 MB |
| Agent status snapshots | 14 | ~500 bytes | ~7 KB |
| Auth sessions | ~5 | ~300 bytes | ~1.5 KB |
| Monthly summaries | 13 | ~200 bytes | ~2.6 KB |
| Budget alerts | ~39 (13mo × 3 thresholds) | ~200 bytes | ~7.8 KB |
| Meta/index keys | ~20 | ~200 bytes | ~4 KB |

**Total estimated maximum: ~40 MB.** Well within Replit DB limits for the Autoscale tier.

Feed entries are the dominant cost. If feed volume is higher than estimated, reduce retention to 14 days. The feed is display-only; historical depth beyond 30 days has no business value for this use case.

### 5.3 Cleanup Strategy

There is no Replit DB TTL API (keys do not auto-expire). Cleanup is event-driven:

**On login (auth cleanup):**
- Scan `auth:session:*` keys. Delete any where `expiresAt` is in the past.
- This keeps the session namespace clean without a cron dependency.

**On every cost write cycle (Dex, hourly cleanup check):**
- Once per hour (not every 60-second tick): scan `cost:hourly:*` keys.
- Delete any key where the date component is older than 90 days from today (UTC).
- Delete any `meta:cost:monthly:*` key where the month is older than 13 months.
- Delete any `alert:budget:*` key where the month is older than 13 months.
- Trim `meta:cost:days` to remove dates older than 90 days.

**On every feed write cycle (Dex, daily cleanup check):**
- Once per day (at UTC midnight, not every tick): scan `feed:entry:*` keys.
- Delete any key where the embedded timestamp is older than 30 days.

**Implementation note for Marcus:** The cleanup logic runs inside Dex's polling service. Marcus's API does not need to run cleanup. If Marcus needs to trigger cleanup manually for testing, expose a `POST /api/admin/cleanup` endpoint gated behind an `ADMIN_SECRET` header — document separately, not part of this spec.

---

## Part 6 — Environment Variables

Marcus must not hardcode any of the following. All are required at runtime.

| Variable | Description |
|----------|-------------|
| `DASHBOARD_PASSWORD_HASH` | bcrypt hash (cost 12) of the dashboard password |
| `ANTHROPIC_API_KEY` | Anthropic API key for usage polling |
| `ANTHROPIC_INPUT_PRICE_PER_MILLION_TOKENS` | e.g., `"3.00"` (USD, string) |
| `ANTHROPIC_OUTPUT_PRICE_PER_MILLION_TOKENS` | e.g., `"15.00"` (USD, string) |
| `GEMINI_INPUT_PRICE_PER_MILLION_TOKENS` | e.g., `"0.075"` (USD, string) |
| `GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS` | e.g., `"0.30"` (USD, string) |
| `TELEGRAM_BOT_TOKEN` | Bot token for Harvey's Telegram alerts |
| `TELEGRAM_CHAT_ID` | Harvey's Telegram chat ID |
| `SESSION_SECRET` | 32+ byte random string for additional HMAC layer (optional but recommended) |
| `REPLIT_DB_URL` | Provided by Replit runtime automatically |

Pricing variables are strings to avoid floating-point representation issues at the environment layer. Parse them as `parseFloat()` in code.

---

## Appendix A — Agent ID Reference

| `AgentId` | Display Name | Emoji | Type |
|-----------|-------------|-------|------|
| `clawdia` | Clawdia | 🦞 | `orchestrator` |
| `security-agent` | Security Agent | 🔒 | `autonomous` |
| `self-improvement-agent` | Self-Improvement Agent | 🌙 | `autonomous` |
| `marcus` | Marcus | ⚙️ | `dev-subagent` |
| `sienna` | Sienna | 🎨 | `dev-subagent` |
| `dex` | Dex | 🔗 | `dev-subagent` |
| `nadia` | Nadia | 🗄️ | `dev-subagent` |
| `eli` | Eli | 🔍 | `dev-subagent` |
| `zara` | Zara | 🧪 | `dev-subagent` |
| `roan` | Roan | 🔒 | `dev-subagent` |
| `imogen` | Imogen | 🖼️ | `dev-subagent` |
| `cass` | Cass | ✍️ | `dev-subagent` |
| `otto` | Otto | 📦 | `dev-subagent` |
| `phoebe` | Phoebe | 📊 | `dev-subagent` |

---

## Appendix B — Key Design Decisions

**Why integer cents, not floats?**
Floating-point accumulation across thousands of hourly records will produce observable drift. $0.00001 per record × 20,000 records = visible rounding errors in the UI. Integer arithmetic eliminates this entirely.

**Why store token counts instead of computed dollar values?**
Anthropic pricing has changed twice in the last 18 months. Storing raw tokens means we can retroactively recompute costs when pricing changes without invalidating historical data. Dollar values are always computed at read time from current pricing environment variables.

**Why cursor-based pagination for the feed?**
Replit DB has no native `LIMIT`/`OFFSET`. Offset pagination would require reading and discarding keys, which is expensive at scale. Cursor pagination (encode last-seen key → use as start point) is O(n) only for the returned page, not the full dataset.

**Why SHA-256 token hash instead of storing the raw token?**
If Replit DB is compromised, raw tokens would allow session hijacking. The hash cannot be reversed to produce a valid token. This is defence-in-depth — the HTTP-only cookie is the first line.

**Why no WebSocket / real-time push?**
The project brief specifies 60-second polling. Replit's Autoscale tier does not guarantee persistent connections. 60-second polling is sufficient for an internal ops dashboard and is the correct choice at this cost envelope.

---

*Spec complete. Hand to Marcus (Phase 4). Any schema changes during implementation require Nadia review before they go to Replit DB.*
