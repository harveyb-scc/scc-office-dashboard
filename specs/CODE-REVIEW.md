# Code Review — SCC Office Dashboard
**Reviewer:** Eli (Senior Code Reviewer, SCC Dev Team)
**Date:** 2026-03-17
**Verdict:** ⛔ REQUEST CHANGES

---

## 1. Overall Assessment

This is a well-structured, thoughtfully documented codebase that shows serious engineering intent. The security foundations are solid — no hardcoded secrets, proper Helmet/CSP/CORS, HTTP-only session cookies, bcrypt auth, rate limiting, and input validation throughout. The architecture follows clean patterns: config validation at startup, consistent API envelopes, proper error handling, and graceful degradation when integrations are unavailable.

However, **this code is not ready to ship.** There are four correctness bugs that would surface immediately in production — two of which directly affect the financial data Harvey depends on. There are also zero application tests, which is non-negotiable for a dashboard whose primary purpose is budget tracking with Telegram alerts tied to real spending thresholds.

The bones are good. The issues are fixable. But they need to be fixed before this hits production.

---

## 2. Architecture Review

**Does it follow the spec?**

Mostly yes. Three views (Floor, Ledger, Feed), password authentication, 60-second polling, cost thresholds with Telegram alerts, Replit DB persistence — all present. The data schema implementation (Nadia's work) is clean and well-typed throughout. The integration layer is properly isolated.

**Hidden coupling or wrong abstractions?**

One architectural smell worth flagging: **two independent log-reading paths exist for the same files.** The cost poller reads logs via `getLogsSince()` / `getTodaysLogs()` from the integrations layer. Feed ingestion in `feedService.ingestFeedEntries()` reads the same log files independently using its own DB-persisted cursor. These two paths are running from the same scheduling loop in `cost-poller.ts`, but they have separate state management and separate file I/O. This isn't wrong, but it means any change to log format requires updates in two places. Worth acknowledging as a maintenance liability.

The Anthropic API reconciliation logic (`reconcileAnthropicApiUsage()`) has a conceptual design flaw that produces incorrect data — see [MUST] §3.4 below.

The agent cost table in the Ledger exposes a backend limitation awkwardly in the UI — see [MUST] §3.3.

---

## 3. [MUST] Issues — Fix Before Deploy

### 3.1 — Double-count on restart: `lastPollMs` is not persisted

**File:** `backend/src/integrations/cost-poller.ts`
**Severity:** Data integrity — costs will be overstated after every server restart

**What's happening:**

```typescript
const state: PollerState = {
  lastPollMs: 0, // reset to 0 on every server start
  ...
};
```

On startup, `lastPollMs === 0`, so the first poll calls `getTodaysLogs()` (entire day's logs). The `ingestTokenUsage()` function then does this for every matching bucket:

```typescript
const record: CostRecord = existing
  ? {
      ...existing,
      costCents: existing.costCents + costCents,  // ← additive!
      inputTokens: existing.inputTokens + inputTokens,
      ...
    }
  : { ... };
```

This is correct *when* you're genuinely ingesting new events since the last poll. But on restart, you're re-ingesting all of today's events on top of whatever's already in the DB. Every restart double-counts all token usage from that day.

**Exact fix:**

Persist `lastPollMs` to Replit DB. On startup, load the persisted value before the first poll cycle runs:

```typescript
// In cost-poller.ts, add:
const LAST_POLL_KEY = 'meta:poller:lastPollMs';

async function loadPersistedState(): Promise<void> {
  try {
    const db = getDb();
    const raw = await db.get(LAST_POLL_KEY).catch(() => null);
    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        state.lastPollMs = parsed;
      }
    }
  } catch {
    // Non-fatal — will re-ingest today's logs but that's safe if we make ingest idempotent
  }
}

// At end of runPollCycle(), after state.lastPollMs = cycleStart:
await db.set(LAST_POLL_KEY, String(state.lastPollMs)).catch(() => undefined);
```

Call `await loadPersistedState()` at the top of `startCostPoller()` before the first `runPollCycle()` call. This ensures the first poll after restart only processes events since the last known successful poll.

**Note from Dex:** This is the bug Dex flagged. Classification: **data integrity regression** on every server restart or Replit cold start. With Replit Autoscale, cold starts are routine. This will produce inflated cost numbers and potentially false Telegram alerts.

---

### 3.2 — Anthropic API reconciliation double-counts entire org usage as Clawdia

**File:** `backend/src/integrations/cost-poller.ts`, `reconcileAnthropicApiUsage()`
**Severity:** Data integrity — inflated Anthropic costs, particularly on Clawdia's row

**What's happening:**

The reconciliation function ingests the Anthropic API org-level token total and attributes it entirely to `clawdia`:

```typescript
await ingestTokenUsage([{
  agentId: 'clawdia' as AgentId,
  provider: 'anthropic' as Provider,
  inputTokens: usage.inputTokens,  // ← ALL org tokens
  outputTokens: usage.outputTokens,
  ...
}]);
```

The comment says "attribute the delta to clawdia" but no delta is computed — it adds the full org total. Since log-based ingestion is *also* capturing per-agent usage (including Clawdia's), this results in:

- Clawdia's Anthropic cost = log-derived Clawdia tokens + ALL org-level Anthropic tokens
- The monthly total = per-agent log totals + duplicate full org total

This would cause budget alerts to fire at roughly half the real spend threshold.

**Exact fix:**

Either (a) remove the reconciliation entirely until a proper delta-based approach is designed, or (b) implement a true delta:

```typescript
async function reconcileAnthropicApiUsage(): Promise<void> {
  try {
    const usage = await getAnthropicUsage();
    if (!usage) return;

    // Get current log-derived total for this period from DB
    const db = getDb();
    const month = new Date().toISOString().substring(0, 7);
    const summaryRaw = await db.get(`meta:cost:monthly:${month}`).catch(() => null);
    const summary = summaryRaw as MonthlyCostSummary | null;

    const anthropicLogTotal = summary
      ? (await loadAnthropicOnlyTotal()) // sum cost:hourly:*:anthropic:* for current month
      : 0;

    const delta = Math.max(0, usage.inputTokens - anthropicLogTotal.inputTokens);
    if (delta === 0) return; // Logs already captured everything

    // Only ingest the gap — and only if meaningful
    await ingestTokenUsage([{ agentId: 'clawdia', ... delta tokens ... }]);
  } catch (err) { ... }
}
```

Given the complexity of implementing this correctly, **option (a) — remove the reconciliation for v1** is the safer choice. The Anthropic API endpoint isn't even publicly documented yet (acknowledged in `anthropic-usage.ts`). Log-based costs are sufficient for the current use case.

---

### 3.3 — Ledger agent cost table shows the same value in all three columns

**File:** `frontend/src/pages/Ledger.tsx`, `AgentCostTable` component
**Severity:** Incorrect data displayed to Harvey — the primary user

**What's happening:**

```tsx
<td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap">
  {centsToDisplay(agent.costCents)}  {/* Today column */}
</td>
<td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap">
  {centsToDisplay(agent.costCents)}  {/* This week column */}
</td>
<td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap pr-4">
  {centsToDisplay(agent.costCents)}  {/* This month column */}
</td>
```

All three columns display `agent.costCents`, which is the all-time aggregate returned by `getCostSummary().byAgent`. Harvey sees the same number in "Today," "This week," and "This month" — which is both confusing and wrong.

The backend `GET /api/agents/:id` route also acknowledges this limitation:
```typescript
week: emptyWindow,  // Filtered history queries are served by /api/costs/history?agentId=
```

**Exact fix — two options:**

**Option A (quick — simplest correct UI):** Drop the Today/Week/Month columns from the agent table in v1. Show only "All-time cost" with a note: "Per-window breakdown coming soon." This is honest and ships fast.

**Option B (proper — requires backend work):** Update `getCostSummary()` to return per-agent breakdowns for today, week, and month separately. The backend already loads all cost records from DB — it's a matter of filtering `byAgent` for each time window separately instead of aggregating across all records.

The `AgentCostBreakdown` type would become:
```typescript
export interface AgentCostBreakdown {
  agentId: AgentId;
  agentName: string;
  agentEmoji: string;
  todayCents: number;
  weekCents: number;
  monthCents: number;
  allTimeCents: number;
  // ... token totals
}
```

Option A ships faster and is honest. Option B is correct but adds scope. Either is acceptable — but the current state (showing the same number in three columns) must not ship.

---

### 3.4 — Sparkline data not filtered by provider

**File:** `frontend/src/pages/Ledger.tsx`, `getProviderHistory()`
**Severity:** Incorrect data displayed — all sparklines show identical charts

**What's happening:**

```typescript
const getProviderHistory = (provider: Provider): CostHistoryPoint[] => {
  if (!historyData) return [];
  return historyData.points; // ← ignores `provider` parameter entirely
};
```

Every provider row (Anthropic, Gemini, OpenAI) receives the same global aggregate sparkline. The charts in the "By provider" section are all identical.

**Exact fix:**

The history endpoint supports `?provider=` filtering. Fetch per-provider history separately:

```typescript
// In Ledger.tsx, replace the single historyData query with per-provider queries:
const { data: anthropicHistory } = useQuery({
  queryKey: queryKeys.costsHistory({ hours: 24, provider: 'anthropic' }),
  queryFn: () => fetchCostsHistory({ hours: 24, provider: 'anthropic' }),
  refetchInterval: 60_000,
});
const { data: geminiHistory } = useQuery({
  queryKey: queryKeys.costsHistory({ hours: 24, provider: 'gemini' }),
  queryFn: () => fetchCostsHistory({ hours: 24, provider: 'gemini' }),
  refetchInterval: 60_000,
});

// Then:
const historyByProvider: Record<Provider, CostHistoryPoint[]> = {
  anthropic: anthropicHistory?.points ?? [],
  gemini: geminiHistory?.points ?? [],
  openai: [],
};
```

Or keep a single history fetch and filter client-side — but the API already supports per-provider filtering, so use it.

---

### 3.5 — Zero application tests

**Severity:** Confidence/reliability — budget alerts and cost tracking require test coverage

There are no application-authored tests anywhere in the codebase. For a general CRUD app this might be a [SHOULD]. For a dashboard whose core function is tracking real money and firing Telegram alerts to Harvey at financial thresholds, it's a [MUST].

The paths that require tests before deploy:

**Critical:**
- `calcCostCents()` — math correctness with edge cases (zero tokens, fractional cents)
- `ingestTokenUsage()` — idempotency; verify no double-counting on duplicate events
- `checkBudgetThresholds()` — alert deduplication (same threshold only fires once per month)
- `requireAuth` middleware — valid token, expired token, missing cookie
- `loginRateLimiter` — 5 attempts then lockout

**High value:**
- `parseTokenUsageFromLogs()` — JSON and plain-text log formats
- `getFeed()` pagination — cursor encoding/decoding, invalid cursor rejection
- `detectCategory()` in feedService — category mapping correctness
- Config validation — missing required env vars should exit

A minimum viable test suite that covers the five critical paths above is required before shipping. One bug in `calcCostCents` could send Harvey a false Telegram alert at 2am.

---

## 4. [SHOULD] Issues — Strong Recommendations

### 4.1 — N+1 DB reads in `getAllAgentStatuses()` and `loadAllCostRecords()`

**File:** `backend/src/services/agentService.ts`, `backend/src/services/costService.ts`

All Replit DB reads in these functions are sequential `await db.get()` calls inside `for` loops. With 14 agents, `getAllAgentStatuses()` makes 14 sequential round-trips to a hosted database on every `GET /api/agents` request.

```typescript
// Current — 14 sequential DB round-trips:
for (const meta of sortedAgentRoster()) {
  const cachedRaw = await db.get(`agent:status:${meta.id}`).catch(() => null);
  ...
}

// Fix — parallel:
const agentIds = sortedAgentRoster().map((m) => m.id);
const cachedStatuses = await Promise.all(
  agentIds.map((id) => db.get(`agent:status:${id}`).catch(() => null))
);
```

Same pattern applies in `loadAllCostRecords()` and `recomputeMonthlySummary()`. The `getFeed()` function also reads entries sequentially. Parallelise all of these with `Promise.all()`.

This won't matter at low request volumes, but the 60-second polling from the frontend means these run constantly. Under any load spike (multiple browser tabs, multiple users), this will be the first bottleneck.

---

### 4.2 — `require()` used for lazy circular dependency avoidance

**File:** `backend/src/integrations/openclaw-logs.ts`

```typescript
// Lazily computed list of all known agent IDs...
function knownAgentIds(): AgentId[] {
  if (_knownAgentIds) return _knownAgentIds;
  const { AGENT_ROSTER } = require('../constants/agents'); // ← CommonJS require in TS
  ...
}
```

The comment explains this is to avoid circular dependencies. But `require()` in a TypeScript project compiled to ESM is fragile and won't work in strict ESM mode. The correct fix is to break the circular dependency properly.

The actual problem: `openclaw-logs.ts` needs `AGENT_ROSTER`, and `agents.ts` imports from `types/index.ts`. There's no real circular dependency here — it's a concern about import time ordering. The fix is straightforward:

```typescript
// Instead of the lazy require pattern, just import at the top:
// If there truly is a circular dep, extract the knownAgentIds logic
// into a shared utility that neither file depends on.

// opclaw-logs.ts can import directly from the types:
import { AGENT_IDS } from '../constants/agents';
// (AGENT_IDS is already exported from agents.ts — use it directly)
```

The current code works in practice because `ts-node-dev` handles `require()` transparently, but it's a ticking clock.

---

### 4.3 — Frontend has unused production dependencies

**File:** `frontend/package.json`

```json
"react-hook-form": "^7.54.2",
"@hookform/resolvers": "^3.9.1",
"zustand": "^5.0.2"
```

None of these appear anywhere in the frontend source. The Login form uses plain React state, not `react-hook-form`. There's no Zustand store anywhere. These add ~45KB to the bundle (pre-minification) and are a maintenance liability (version bumps, audit surface).

**Fix:** Remove all three from `dependencies`.

---

### 4.4 — Feed ingestion cursor race condition in `ingestFeedEntries()`

**File:** `backend/src/services/feedService.ts`

Inside the ingestion loop:

```typescript
for (const { agentId, event, rawLine, timestamp } of rawEntries) {
  const cursorKey = `meta:feed:cursor:${agentId}`;
  const cursorRaw = await db.get(cursorKey).catch(() => null); // ← read cursor per entry
  ...
  await db.set(entryKey, entry);
  ...
  await db.set(cursorKey, timestamp); // ← write cursor per entry
}
```

This is one DB read + two DB writes per log entry, inside a loop that processes potentially hundreds of entries. For a file with 500 log lines, that's 1,500 sequential Replit DB operations per poll cycle.

**Fix:** Read all cursors upfront (one pass), process all entries in memory, then write cursors and entries in a batched final pass. Something like:

```typescript
// Read all cursors once
const cursorKeys = [...new Set(rawEntries.map(e => `meta:feed:cursor:${e.agentId}`))];
const cursors = await Promise.all(cursorKeys.map(k => db.get(k).catch(() => null)));
const cursorMap = new Map(cursorKeys.map((k, i) => [k, cursors[i]]));

// Process in memory, collect writes
const writes: Array<{ key: string; value: unknown }> = [];
// ... process ...

// Batch write
await Promise.all(writes.map(({ key, value }) => db.set(key, value)));
```

---

### 4.5 — Session count is a non-atomic read-modify-write

**File:** `backend/src/routes/auth.ts`

```typescript
const countRaw = await db.get('meta:auth:session-count').catch(() => '0');
const count = parseInt(...);
await db.set('meta:auth:session-count', String(count + 1)).catch(() => undefined);
```

This read-modify-write has no locking. Concurrent logins (two tabs, two users) can both read the same value and both write the same count+1, resulting in an undercount. Not a security issue, but if this counter is ever used for anything meaningful (session limits, audit), it will be wrong.

Since there's no evidence this counter is used for anything beyond observability, either:
- Accept the inaccuracy and add a comment, or
- Remove it entirely (it has no bearing on session validity or security)

---

## 5. [CONSIDER] Items — Optional Improvements

### 5.1 — Feed pagination cursor is predictable

The cursor is just a base64-encoded DB key:
```typescript
const nextCursor = Buffer.from(pageKeys[pageKeys.length - 1]).toString('base64');
```

Since authenticated users can decode this (it's not encrypted), they can see the internal DB key structure. Not a security risk for an internal dashboard, but a HMAC-signed cursor would be more robust if external access is ever added.

---

### 5.2 — In-memory agent status cache would reduce log-file reads

`getAllAgentStatuses()` and `getAgentStatus()` both call `parseRecentLogs()`, which reads log files from disk synchronously. If both are called in quick succession (e.g., `GET /api/agents` followed immediately by `GET /api/agents/clawdia`), the log files are read twice within milliseconds.

A 30-second in-memory LRU cache keyed on the file modification time would eliminate redundant reads. Worth considering if dashboard tab-switching becomes noticeably slow.

---

### 5.3 — `__Host-` cookie prefix for defense-in-depth

The session cookie could use the `__Host-` prefix in production:
```typescript
res.cookie('__Host-scc_session', rawToken, {
  httpOnly: true,
  sameSite: 'strict',
  secure: true, // required for __Host-
  // no domain attribute — required for __Host-
  maxAge: SESSION_TTL_MS,
});
```

This prevents the cookie being set by a subdomain if the domain is ever shared. Minor for a single-deployment internal tool, but good practice.

---

### 5.4 — `formatFeedTime` has a redundant branch

**File:** `frontend/src/lib/utils.ts`

```typescript
if (diffMinutes === 60) return '1 hour ago'; // redundant
if (diffMinutes < 60) return `${diffMinutes} mins ago`;
if (diffHours === 1) return '1 hour ago'; // same case, different check
```

`diffMinutes === 60` and `diffHours === 1` cover the same scenario. The first check is never wrong but it's confusing. Simplify to:

```typescript
if (diffSeconds < 60) return 'Just now';
if (diffMinutes < 60) return `${diffMinutes} mins ago`;
if (diffHours < 2) return '1 hour ago';
return `${diffHours} hours ago`;
```

---

### 5.5 — Health route has dynamic imports in request handler

**File:** `backend/src/routes/health.ts`

```typescript
const { existsSync } = await import('fs');
const { config: cfg } = await import('../config');
```

Dynamic imports inside a request handler add overhead on every health check. These modules are already loaded at startup. Move them to top-level imports.

---

## 6. Security Checklist

| Check | Result | Notes |
|-------|--------|-------|
| No hardcoded secrets/credentials | ✅ Pass | All via env vars, validated by Zod at startup |
| All user inputs validated and sanitised | ✅ Pass | Zod schemas on all routes; query params validated |
| Auth checks on every protected route | ✅ Pass | `requireAuth` applied at router level; no route bypasses found |
| No raw SQL without parameterised queries | ✅ N/A | No SQL — uses Replit DB (key-value) |
| No sensitive data in logs | ✅ Pass | `errorHandler` never logs request data; log parser strips UUIDs and session IDs |
| New dependencies scanned | ⚠️ Unverified | `npm audit` must be run before deploy. Dependencies look reasonable but cannot verify. |
| No `eval()` / `Function()` / unsafe dynamic execution | ✅ Pass | None found |
| No internal stack traces in API error responses | ✅ Pass | `errorHandler` returns only message strings, never `err.stack` |
| CORS not `*` on authenticated endpoints | ✅ Pass | Regex allowlist for `.replit.app` and `.repl.co`; `credentials: true` |
| Rate limiting on auth and sensitive endpoints | ✅ Pass | Login: 5/15min; General API: 120/min |

**Overall security posture: Good.** The session implementation (bcrypt, random tokens stored as hashes, HTTP-only cookies, constant-time comparison) is correctly implemented. CSP headers via Helmet are appropriately restrictive.

**One recommendation before deploy:** Run `npm audit --audit-level=high` in both `/backend` and `/frontend` and resolve any high/critical findings. This is a non-negotiable pre-deploy step per SCC policy.

---

## 7. Test Coverage Assessment

**Current coverage: 0%**

There are no application-authored tests in this codebase.

This is the biggest gap. The paths that carry the highest risk are:

| Priority | Path | Risk if untested |
|----------|------|-----------------|
| P0 | `calcCostCents()` | Wrong math → Harvey sees wrong numbers and gets wrong Telegram alerts |
| P0 | `ingestTokenUsage()` idempotency | Double-count on re-ingest → inflated costs |
| P0 | `checkBudgetThresholds()` deduplication | Alert fires multiple times for same crossing |
| P1 | `requireAuth` middleware | Auth bypass if logic is wrong |
| P1 | `loginRateLimiter` | Brute-force risk if limiter misconfigured |
| P2 | `getFeed()` pagination | Invalid cursors accepted → information leak of key structure |
| P2 | `parseTokenUsageFromLogs()` | Log format changes silently break cost tracking |

A minimum viable test suite could be written with Vitest (or Jest) in a day. It should cover at least the P0 paths before this ships.

Good news: the code is structured in a way that makes testing tractable. Services are pure functions over data; integrations are isolated; the `asyncHandler` pattern makes route logic easy to unit test. The architecture hasn't painted itself into an untestable corner — it just has no tests yet.

---

## 8. The Double-Count Bug (Dex's Flag) — Classification and Fix

**Classification:** Data integrity regression on every cold start / server restart.

**Mechanism (detailed):**

1. `cost-poller.ts` initialises `state.lastPollMs = 0` in module scope — this is lost on every process restart.
2. On first `runPollCycle()`, `sinceMs === 0`, so `getTodaysLogs()` is called instead of `getLogsSince(sinceMs)`.
3. `getTodaysLogs()` returns ALL log entries from today's log file.
4. `ingestTokenUsage(usageEvents)` is called with all of today's events.
5. For each event, `ingestTokenUsage` checks if a DB record exists for that `agentId:provider:date:hour` bucket.
6. If yes: `existing.costCents + costCents`, `existing.inputTokens + inputTokens`, etc.
7. If the server ran for 4 hours this morning, collected 1000 tokens, then restarted — those 1000 tokens get added *again* to the existing DB record, making it 2000 tokens.

**Severity context:** With Replit Autoscale, cold starts happen regularly — on any deploy, on any inactivity timeout. This isn't a theoretical edge case; it happens constantly in normal operations.

**Exact fix:**

```typescript
// backend/src/integrations/cost-poller.ts

const DB_LAST_POLL_KEY = 'meta:poller:lastPollMs';

// Add this function:
async function loadPersistedPollTime(): Promise<void> {
  try {
    const raw = await getDb().get(DB_LAST_POLL_KEY).catch(() => null);
    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        state.lastPollMs = parsed;
        console.log(`[cost-poller] Restored lastPollMs from DB: ${new Date(parsed).toISOString()}`);
      }
    }
  } catch {
    // Non-fatal — will process today's full logs on first cycle
    console.warn('[cost-poller] Could not restore lastPollMs from DB; full today re-scan will run');
  }
}

// Update startCostPoller() to await the restore before first cycle:
export async function startCostPoller(): Promise<void> {
  if (pollerInterval) {
    console.warn('[cost-poller] Poller already running — startCostPoller() called twice');
    return;
  }

  console.log('[cost-poller] Starting cost poller (interval: 60 minutes)');

  // Restore persisted poll time before first cycle to avoid double-counting on restart
  await loadPersistedPollTime();

  runPollCycle().catch((err) => { ... });

  pollerInterval = setInterval(() => { ... }, POLL_INTERVAL_MS);
  ...
}

// Update state.lastPollMs persistence at end of runPollCycle():
// After: state.lastPollMs = cycleStart;
// Add:
await getDb().set(DB_LAST_POLL_KEY, String(cycleStart)).catch(() => undefined);
```

Note: `startCostPoller()` becomes `async` — update the call site in `index.ts` accordingly (`startCostPoller().catch(...)` instead of `startCostPoller()`). The server startup comment already handles this pattern.

**Secondary fix required:** Once `lastPollMs` is persisted, the Anthropic reconciliation double-count ([MUST] §3.2) must also be resolved — otherwise you have a different accumulation path.

---

## 9. Acknowledgements — What's Done Well

Before the verdict, it's worth calling out what's genuinely well done:

- **Config validation at startup** (`config/index.ts`) — the right pattern. App refuses to start on bad config rather than silently failing.
- **`asyncHandler` wrapper** — eliminates try/catch boilerplate cleanly across all routes.
- **Error handler doesn't leak internals** — `errorHandler.ts` is correct; no `err.stack` ever hits the client.
- **Session token design** — raw token never stored; only the SHA-256 hash is in the DB. Correct.
- **`ingestFeedEntries` cursor design** — the per-agent cursor stored in DB (not in-memory) is the right approach. The feed service survives restarts correctly. This is what `lastPollMs` should also be doing.
- **CORS configuration** — not `*`; properly handles no-origin requests; credentials correctly set.
- **Frontend accessibility** — focus management in `AgentDetailPanel`, ARIA labels on progress bars, skip links, keyboard navigation in filter chips. This is well done.
- **Apple HIG compliance** — the design implementation is clean and matches the spec.
- **`apiFetch` wrapper** — consistent error handling and auth error detection in the frontend. Good pattern.

---

## 10. Final Verdict

⛔ **REQUEST CHANGES**

**What blocks approval:**

| # | Issue | Blocker |
|---|-------|---------|
| 1 | `lastPollMs` restart bug → double-counted costs | Data integrity |
| 2 | Anthropic reconciliation adds full org total to Clawdia | Data integrity |
| 3 | Ledger agent table shows same value in Today/Week/Month | Incorrect display |
| 4 | Sparkline `getProviderHistory` not filtered by provider | Incorrect display |
| 5 | Zero application tests on financial/alert-critical paths | Confidence |

**Path to approval:**

1. Fix [MUST] §3.1 (persist `lastPollMs`) — required
2. Fix [MUST] §3.2 (remove or redesign Anthropic reconciliation) — required
3. Fix [MUST] §3.3 (Ledger agent table — Option A or B) — required
4. Fix [MUST] §3.4 (filter sparklines by provider) — required
5. Write tests covering P0 paths in §7 — required
6. Run `npm audit --audit-level=high` in both packages and resolve findings — required
7. Address [SHOULD] §4.1 (parallelise DB reads) — recommended alongside above

[SHOULD] items 4.2–4.5 can ship as follow-on work. [CONSIDER] items are optional.

When the [MUST] items are resolved and test coverage is confirmed for the P0 paths, I'll approve on a re-review within 4 hours of the author's response.

---

*Eli / Senior Code Reviewer, SCC Dev Team*
*cc: Dex (integration issues §3.1, §3.2), Nadia (data schema implications §3.3), Roan (security checklist §6)*
