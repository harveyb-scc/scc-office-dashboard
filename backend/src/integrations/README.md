# SCC Office Dashboard — Integrations

**Owner:** Dex (Senior Integration Engineer)  
**Status:** Phase 6 complete  
**Last updated:** 2026-03-17

---

## Overview

This directory contains the integration layer between the SCC Office Dashboard backend and two external data sources:

1. **OpenClaw log files** — the primary source of per-agent activity and token usage data
2. **Anthropic API** — optional org-level usage cross-check

The integration layer is entirely one-directional: it **reads** from these sources and **writes** into the backend's internal services (`costService`, `feedService`). It owns no API endpoints and holds no persistent state of its own.

---

## Files

| File | Purpose |
|------|---------|
| `openclaw-logs.ts` | Log file parser — reads JSONL/plain-text log files, extracts structured events |
| `cost-poller.ts` | Hourly background job — orchestrates log ingestion into cost and feed services |
| `anthropic-usage.ts` | Anthropic API usage client — optional org-level reconciliation |
| `index.ts` | Clean re-exports for all public functions and types |
| `README.md` | This file |

---

## How Log Parsing Works

### Log file location

```
/tmp/openclaw/openclaw-YYYY-MM-DD.log
```

One file per UTC day. The parser reads today's and yesterday's files to handle the midnight boundary gracefully.

### Supported formats

The parser handles both **JSONL** (one JSON object per line) and **plain text** (one event per line). Both formats are supported simultaneously — each line is tried as JSON first, then falls back to plain-text extraction if parsing fails. A bad line never kills the rest of the file.

**JSONL example (preferred):**
```json
{"timestamp":"2026-03-17T14:00:00.000Z","agentId":"clawdia","sessionKey":"agent:main:telegram:direct:...","type":"token_usage","model":"claude-sonnet-4-6","input_tokens":1250,"output_tokens":480,"message":"Reviewed Marcus's PR"}
```

**Plain-text example (supported):**
```
[2026-03-17T14:00:00Z] [clawdia] task: Reviewing Marcus PR for cost aggregation endpoint
```

### What gets extracted per line

| Field | Source (JSON) | Fallback (plain text) |
|-------|--------------|----------------------|
| `timestamp` | `timestamp` / `time` / `ts` / `created_at` | ISO 8601 pattern match |
| `agentId` | `agentId` / `agent_id` / `label` / `session` | Keyword scan for known agent IDs |
| `sessionKey` | `sessionKey` / `session_key` / `session` | Regex: `agent:main:...` or `session_<id>` |
| `tokenUsage` | `input_tokens` / `output_tokens` / `usage.*` | Not extracted from plain text |
| `provider` | Inferred from `model` field | Not inferred without model name |
| `actionType` | `type` / `event` / `level` fields | Keyword heuristics |
| `description` | `message` / `task` / `content` / `description` | Sanitised line content |

### Agent ID resolution

Priority order:
1. Direct `agentId` / `agent_id` field
2. Session key field (e.g. `agent:main:telegram:direct:...` → `clawdia`)
3. Plain-text scan for known agent IDs (longest match first, to avoid `dex` matching inside `index`)

The session key patterns map as follows:
- `agent:main:` (non-subagent) → `clawdia`
- Contains `security` → `security-agent`
- Contains `self-improvement` → `self-improvement-agent`
- Otherwise: scan for known IDs within the key

---

## How the Cost Poller Works

The poller runs on a 60-minute `setInterval`. On each cycle:

1. **Log parse** — calls `getLogsSince(lastPollMs)` to get only new entries since the last successful cycle
2. **Token ingestion** — extracts token usage events and calls `costService.ingestTokenUsage()`
3. **Feed ingestion** — calls `feedService.ingestFeedEntries()` (which manages its own per-agent cursor in Replit DB)
4. **Anthropic reconciliation** — optionally calls `getAnthropicUsage()` and ingests org-level totals
5. **Cleanup** — hourly: removes cost records >90 days old; daily (UTC midnight): removes feed entries >30 days old

An immediate first cycle runs on server startup so the dashboard has data without waiting 60 minutes.

### Error handling

- Each step is wrapped in its own try/catch
- Poller failures are logged at `console.error` but never throw
- The Node.js server never crashes due to a poller error
- Partial success is always preferred — if token ingestion fails, feed ingestion still runs

### Overlap prevention

The `isRunning` flag prevents concurrent cycles. If a cycle takes longer than 60 minutes (shouldn't happen, but possible on a very loaded Replit instance), the next scheduled tick is silently skipped.

---

## How to Test Locally

### 1. Create a test log file

```bash
mkdir -p /tmp/openclaw
TODAY=$(date -u +%Y-%m-%d)
cat > /tmp/openclaw/openclaw-$TODAY.log << 'EOF'
{"timestamp":"2026-03-17T14:00:00.000Z","agentId":"clawdia","type":"token_usage","model":"claude-sonnet-4-6","input_tokens":1500,"output_tokens":620,"message":"Reviewed PR #42"}
{"timestamp":"2026-03-17T14:01:00.000Z","agentId":"marcus","type":"task_start","message":"Building the costs aggregation endpoint"}
{"timestamp":"2026-03-17T14:02:00.000Z","agentId":"clawdia","type":"session_start","sessionKey":"agent:main:telegram:direct:123"}
Plain text line from dex working on integrations
EOF
```

### 2. Test the log parser directly

```typescript
import { getTodaysLogs, getLogsSince } from './integrations/openclaw-logs';

// All of today's entries
const all = await getTodaysLogs();
console.log(all.length, 'entries');
console.log(all.filter(e => e.tokenUsage !== null).length, 'token usage entries');

// Entries since 1 hour ago
const recent = await getLogsSince(Date.now() - 3_600_000);
console.log(recent.length, 'recent entries');
```

### 3. Test the full poller manually

In `src/index.ts`, the poller starts automatically with the server. To trigger a manual cycle from the REPL or a test script:

```typescript
// Import directly — not exported from index to avoid confusion with the interval-based API
import { startCostPoller, stopCostPoller } from './integrations/cost-poller';
startCostPoller(); // Runs first cycle immediately, then every 60 min
// ...
stopCostPoller();
```

### 4. Verify Replit DB writes

After a cycle, check Replit DB for cost records:

```typescript
import { listKeys, getDb } from './services/dbService';
const costKeys = await listKeys('cost:hourly:');
console.log(costKeys); // Should contain keys like cost:hourly:clawdia:anthropic:2026-03-17-14
```

### 5. Test Anthropic client in isolation

```typescript
import { getAnthropicUsage } from './integrations/anthropic-usage';
const result = await getAnthropicUsage(); // Returns null if ANTHROPIC_API_KEY not set
console.log(result);
```

---

## Known Limitations

### Log format may vary

OpenClaw's log format is not formally versioned. The parser is defensive, but if the format changes significantly (e.g. switching from JSONL to a structured binary format), `openclaw-logs.ts` will need updating. The most common fields (`timestamp`, `agentId`, `input_tokens`, `output_tokens`) are unlikely to change, but the field names themselves could.

**Mitigation:** The parser tries multiple field name variants (e.g. both `input_tokens` and `inputTokens`) and falls back gracefully when fields are missing.

### Agent ID attribution confidence

Plain-text log line attribution is low confidence. If a log line says "dex reviewed the PR written by clawdia", the first-match scan may attribute it to `dex`. JSONL logs with explicit `agentId` fields are required for reliable per-agent cost tracking.

**Mitigation:** The `agentId` is null in the `ParsedLogEntry` when it cannot be determined confidently. Null entries are excluded from cost ingestion.

### Anthropic usage API availability

There is no publicly documented Anthropic usage endpoint as of March 2026. `anthropic-usage.ts` probes two candidate URLs and returns null if neither works. Log-based cost attribution is always the authoritative source — the Anthropic API is reconciliation-only.

**Mitigation:** When the API becomes available, add the correct URL to `candidateEndpoints` in `anthropic-usage.ts`.

### Timestamp accuracy on plain-text lines

If a plain-text log line has no parseable timestamp, the parser uses the current time as a fallback. This means plain-text entries may appear in the feed with incorrect timestamps.

**Mitigation:** Strongly prefer JSONL logging in OpenClaw. The timestamp fallback is a last resort.

### Duplicate ingestion on restart

If the server restarts mid-cycle, `state.lastPollMs` resets to 0, causing `getTodaysLogs()` to re-parse the full day. `feedService.ingestFeedEntries()` deduplicates via its per-agent cursor in Replit DB. `costService.ingestTokenUsage()` accumulates additively — re-ingesting the same token events will inflate cost records.

**Mitigation (future):** Persist `lastPollMs` to Replit DB (e.g. `meta:poller:lastPollMs`) so the cursor survives restarts. Not implemented in Phase 6 due to scope; the risk is bounded to server restart events and self-corrects at the next hourly cycle.

---

## How to Extend for New Providers

### Adding a new AI provider (e.g. OpenAI)

1. **Add the provider to `types.ts`:**
   ```typescript
   type Provider = 'anthropic' | 'gemini' | 'openai'; // Already defined — just verify
   ```

2. **Add pricing env vars** to the `config` module and `DATA-SCHEMA.md §Part 6`:
   ```
   OPENAI_INPUT_PRICE_PER_MILLION_TOKENS
   OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS
   ```

3. **Update `costService.getPricingForProvider()`** to handle the new provider:
   ```typescript
   case 'openai':
     return {
       inputPrice: config.OPENAI_INPUT_PRICE_PER_MILLION_TOKENS,
       outputPrice: config.OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS,
     };
   ```

4. **Update `openclaw-logs.ts` `detectProvider()`:**
   ```typescript
   if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'openai';
   ```
   (This is already in place — verify it matches the model names OpenClaw will log.)

5. **Create a new usage client** (e.g. `openai-usage.ts`) following the same pattern as `anthropic-usage.ts`:
   - Reads `process.env.OPENAI_API_KEY`
   - Returns `null` on any failure
   - Never throws
   - Exports a single `getOpenAIUsage()` function

6. **Wire up in `cost-poller.ts`** `reconcileAnthropicApiUsage()` → add a `reconcileOpenAIApiUsage()` call.

7. **Export from `index.ts`.**

8. **Document in `DATA-SCHEMA.md`** — add the provider to the environment variables table and cost calculation section.

---

## Coordination Notes

Per Dex's SOUL.md coordination protocol:

| Dependency | Status |
|-----------|--------|
| Data schema | ✅ Coordinated with Nadia (Phase 3) |
| `costService`, `feedService`, `alertService` interfaces | ✅ Built against Marcus's Phase 4 services |
| Token storage / credentials | No OAuth involved; API keys via env vars only |
| Monitoring instrumentation | 🔜 Hand to Phoebe (Phase 7) — key events: `poll.cycle.complete`, `poll.cycle.failed`, `feed.entries.written`, `cost.records.updated` |
| Testing | 🔜 Hand to Zara (Phase 9) with edge cases: missing log dir, empty log, malformed JSON lines, midnight boundary, Replit DB write failure mid-cycle |
| Code review | 🔜 Hand to Eli (Phase 10) |
