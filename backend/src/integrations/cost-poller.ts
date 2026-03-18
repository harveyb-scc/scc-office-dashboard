// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Cost Poller
// Hourly background job that ingests OpenClaw log data into Replit DB.
//
// Responsibilities:
//   1. Parse today's logs and ingest token usage into costService
//   2. Ingest new log entries as feed entries into feedService
//   3. Check budget thresholds and fire Telegram alerts via alertService
//   4. Run data retention cleanup (hourly: cost records; daily: feed entries)
//
// Design principles:
//   - A polling failure NEVER crashes the server. All errors are caught.
//   - Polling is idempotent — running it twice is safe.
//   - The poller owns the meta:feed:cursor:<agentId> keys via feedService.
//   - startCostPoller() is called once at server startup. Calling it twice
//     is safe — it detects the existing interval and returns.
//
// Exports:
//   startCostPoller(): Promise<void>
//   stopCostPoller(): void
// ─────────────────────────────────────────────────────────────────────────────

import { ingestTokenUsage } from '../services/costService';
import { ingestFeedEntries } from '../services/feedService';
import { getDb, listKeys } from '../services/dbService';
import { ParsedLogEntry } from './openclaw-logs';
import { getTodaysLogs, getLogsSince } from './openclaw-logs';
import { AgentId, Provider } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How often the poller runs in milliseconds. */
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

/** Replit DB key for persisting lastPollMs across restarts. */
const LAST_POLL_KEY = 'meta:poller:lastPollMs';

/**
 * State — retained across intervals to track the last successful poll time
 * and enable incremental log ingestion (only new lines since last run).
 */
interface PollerState {
  /** Unix timestamp (ms) of last successful poll cycle. 0 = never polled. */
  lastPollMs: number;
  /** Unix timestamp (ms) of last hourly cleanup run. 0 = never run. */
  lastCleanupMs: number;
  /** Unix timestamp (ms) of last daily feed cleanup run. 0 = never run. */
  lastFeedCleanupMs: number;
  /** Whether the poller is currently running (prevents overlapping runs). */
  isRunning: boolean;
}

const state: PollerState = {
  lastPollMs: 0,
  lastCleanupMs: 0,
  lastFeedCleanupMs: 0,
  isRunning: false,
};

let pollerInterval: NodeJS.Timeout | null = null;

// ─── Persisted poll time ──────────────────────────────────────────────────────

/**
 * Restore lastPollMs from Replit DB on startup.
 * Without this, every server restart resets lastPollMs to 0 and re-ingests
 * the full day's logs additively, double-counting all token usage since midnight.
 */
async function loadPersistedPollTime(): Promise<void> {
  try {
    const db = getDb();
    const raw = await db.get(LAST_POLL_KEY).catch(() => null);
    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        state.lastPollMs = parsed;
        console.log(`[cost-poller] Restored lastPollMs from DB: ${new Date(parsed).toISOString()}`);
      }
    }
  } catch {
    // Non-fatal — will re-scan today's logs on first cycle.
    // Safe because ingestTokenUsage is additive per bucket; worst case: slight
    // over-count for the current day if the DB is unavailable on startup.
    console.warn('[cost-poller] Could not restore lastPollMs from DB; full today re-scan will run');
  }
}

// ─── Token usage adapter ──────────────────────────────────────────────────────

/**
 * Convert ParsedLogEntry[] (from the log parser) into the shape that
 * costService.ingestTokenUsage() expects.
 *
 * costService has its own internal parseTokenUsageFromLogs, but we drive it
 * from here using the sinceTimestamp from our incremental cursor rather than
 * having costService scan all files independently. This avoids redundant disk
 * reads and ensures the poller controls the "since" window.
 */
function logEntriesToUsageEvents(
  entries: ParsedLogEntry[],
): Parameters<typeof ingestTokenUsage>[0] {
  return entries
    .filter((e) => e.tokenUsage !== null && e.agentId !== null)
    .map((e) => ({
      agentId: e.agentId as AgentId,
      provider: e.provider ?? ('anthropic' as Provider),
      inputTokens: e.tokenUsage!.inputTokens,
      outputTokens: e.tokenUsage!.outputTokens,
      timestamp: e.timestamp,
      model: e.tokenUsage!.model,
    }));
}

// ─── Data retention cleanup ───────────────────────────────────────────────────

const NINETY_DAYS_MS  = 90 * 24 * 60 * 60 * 1000;
const THIRTEEN_MONTHS_MS = 13 * 31 * 24 * 60 * 60 * 1000; // Approximate
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS     = 60 * 60 * 1000;
const ONE_DAY_MS      = 24 * 60 * 60 * 1000;

/**
 * Hourly cleanup: remove cost records and budget alerts older than retention limits.
 * Per DATA-SCHEMA.md §5.3.
 */
async function runHourlyCleanup(): Promise<void> {
  const now = Date.now();
  if (now - state.lastCleanupMs < ONE_HOUR_MS) return; // Already ran this hour

  try {
    const db = getDb();
    const cutoffCostDate = new Date(now - NINETY_DAYS_MS).toISOString().substring(0, 10);
    const cutoffMonthly  = new Date(now - THIRTEEN_MONTHS_MS).toISOString().substring(0, 7);
    const cutoffAlert    = cutoffMonthly;

    // ── Hourly cost records ──────────────────────────────────────────────────
    const costKeys = await listKeys('cost:hourly:').catch(() => []);
    let costDeleted = 0;
    for (const key of costKeys) {
      // Key format: cost:hourly:<agentId>:<provider>:<YYYY-MM-DD-HH>
      const datePart = key.split(':')[4] ?? '';
      const date = datePart.substring(0, 10); // YYYY-MM-DD
      if (date && date < cutoffCostDate) {
        await db.delete(key).catch(() => undefined);
        costDeleted++;
      }
    }

    // ── Monthly cost summaries ───────────────────────────────────────────────
    const monthlyKeys = await listKeys('meta:cost:monthly:').catch(() => []);
    for (const key of monthlyKeys) {
      const month = key.replace('meta:cost:monthly:', '');
      if (month < cutoffMonthly) {
        await db.delete(key).catch(() => undefined);
      }
    }

    // ── Budget alerts ────────────────────────────────────────────────────────
    const alertKeys = await listKeys('alert:budget:').catch(() => []);
    for (const key of alertKeys) {
      // Key format: alert:budget:<YYYY-MM>:<thresholdCents>
      const month = key.split(':')[2] ?? '';
      if (month && month < cutoffAlert) {
        await db.delete(key).catch(() => undefined);
      }
    }

    // ── Trim meta:cost:days index ────────────────────────────────────────────
    const daysRaw = await db.get('meta:cost:days').catch(() => null) as unknown;
    if (Array.isArray(daysRaw)) {
      const trimmedDays = (daysRaw as string[]).filter((d) => d >= cutoffCostDate);
      await db.set('meta:cost:days', trimmedDays).catch(() => undefined);
    }

    if (costDeleted > 0) {
      console.log(`[cost-poller] Hourly cleanup: removed ${costDeleted} expired cost record(s)`);
    }

    state.lastCleanupMs = now;
  } catch (err) {
    // Cleanup failure is non-fatal — data retention is best-effort
    console.warn('[cost-poller] Hourly cleanup error:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Daily cleanup: remove feed entries older than 30 days.
 * Per DATA-SCHEMA.md §5.3.
 */
async function runDailyFeedCleanup(): Promise<void> {
  const now = Date.now();
  if (now - state.lastFeedCleanupMs < ONE_DAY_MS) return; // Already ran today

  // Only run at or after UTC midnight (i.e., within the first hour of the UTC day)
  const utcHour = new Date().getUTCHours();
  if (utcHour !== 0 && state.lastFeedCleanupMs !== 0) return;

  try {
    const db = getDb();
    const cutoffMs = now - THIRTY_DAYS_MS;
    const cutoffPadded = cutoffMs.toString().padStart(16, '0');

    const feedKeys = await listKeys('feed:entry:').catch(() => []);
    let feedDeleted = 0;

    for (const key of feedKeys) {
      // Key format: feed:entry:<agentId>:<timestamp-ms-padded>:<nanoid6>
      const parts = key.split(':');
      const timestampPart = parts[3] ?? '0';
      if (timestampPart < cutoffPadded) {
        await db.delete(key).catch(() => undefined);
        feedDeleted++;
      }
    }

    if (feedDeleted > 0) {
      console.log(`[cost-poller] Daily feed cleanup: removed ${feedDeleted} expired feed entry(ies)`);
    }

    state.lastFeedCleanupMs = now;
  } catch (err) {
    console.warn('[cost-poller] Daily feed cleanup error:', err instanceof Error ? err.message : String(err));
  }
}

// ─── Core poll cycle ──────────────────────────────────────────────────────────

/**
 * Execute one full poll cycle.
 *
 * Steps:
 *   1. Get new log entries since the last poll
 *   2. Ingest token usage into costService (updates hourly cost records + monthly cache + budget alerts)
 *   3. Ingest feed entries into feedService (cursor-based; deduplicated by feedService)
 *   4. Run scheduled cleanup tasks
 *
 * Note: Anthropic API reconciliation has been removed for v1. The Anthropic billing
 * API is not publicly documented and the previous implementation was incorrectly
 * attributing all org-level token usage to 'clawdia', producing inflated cost data.
 * Log-based costs are the authoritative source for v1.
 *
 * Any step that fails is caught individually — partial success is always
 * better than a complete failure that stalls all downstream data.
 */
async function runPollCycle(): Promise<void> {
  if (state.isRunning) {
    console.warn('[cost-poller] Skipping cycle — previous cycle still running');
    return;
  }

  state.isRunning = true;
  const cycleStart = Date.now();

  console.log('[cost-poller] Starting poll cycle...');

  try {
    // ── Step 1: Fetch new log entries since last poll ─────────────────────────
    const sinceMs = state.lastPollMs;
    let newEntries: ParsedLogEntry[] = [];

    try {
      newEntries = sinceMs > 0
        ? await getLogsSince(sinceMs)
        : await getTodaysLogs();
    } catch (err) {
      console.error('[cost-poller] Log parse failed:', err instanceof Error ? err.message : String(err));
      // Continue — we can still try feed ingestion with feedService's own cursor
    }

    // ── Step 2: Ingest token usage ────────────────────────────────────────────
    try {
      const usageEvents = logEntriesToUsageEvents(newEntries);
      if (usageEvents.length > 0) {
        await ingestTokenUsage(usageEvents);
        console.log(`[cost-poller] Ingested ${usageEvents.length} token usage event(s)`);
      }
    } catch (err) {
      console.error('[cost-poller] Token usage ingestion failed:', err instanceof Error ? err.message : String(err));
      // Continue — feed ingestion is independent
    }

    // ── Step 3: Ingest feed entries ───────────────────────────────────────────
    // feedService.ingestFeedEntries() reads logs itself using its own cursor,
    // so it handles deduplication independently. We call it here to keep the
    // two ingestion paths in sync from the same scheduling loop.
    try {
      const written = await ingestFeedEntries();
      if (written > 0) {
        console.log(`[cost-poller] Wrote ${written} new feed entry(ies)`);
      }
    } catch (err) {
      console.error('[cost-poller] Feed ingestion failed:', err instanceof Error ? err.message : String(err));
    }

    // ── Step 4: Cleanup ───────────────────────────────────────────────────────
    await runHourlyCleanup();
    await runDailyFeedCleanup();

    // ── Update state and persist ──────────────────────────────────────────────
    state.lastPollMs = cycleStart;

    // Persist lastPollMs to Replit DB so it survives server restarts.
    // This prevents cost double-counting on cold starts / Autoscale restarts.
    await getDb().set(LAST_POLL_KEY, String(cycleStart)).catch(() => {
      console.warn('[cost-poller] Failed to persist lastPollMs to DB');
    });

    const elapsed = Date.now() - cycleStart;
    console.log(`[cost-poller] Poll cycle complete in ${elapsed}ms`);
  } catch (err) {
    // Outer catch: should never reach here if individual steps are wrapped,
    // but ensures the poller survives any unexpected error path.
    console.error('[cost-poller] Unexpected error in poll cycle:', err instanceof Error ? err.message : String(err));
  } finally {
    state.isRunning = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the hourly cost poller.
 *
 * Safe to call multiple times — subsequent calls are no-ops if the poller
 * is already running.
 *
 * Restores persisted lastPollMs from Replit DB before the first cycle to
 * prevent cost double-counting on server restart (Autoscale cold starts).
 *
 * Runs an immediate first cycle on startup so the dashboard has data
 * without waiting 60 minutes for the first interval.
 */
export async function startCostPoller(): Promise<void> {
  if (pollerInterval) {
    console.warn('[cost-poller] Poller already running — startCostPoller() called twice');
    return;
  }

  console.log('[cost-poller] Starting cost poller (interval: 60 minutes)');

  // Restore persisted poll time before the first cycle to avoid double-counting
  // on restart. Must await before first runPollCycle() call.
  await loadPersistedPollTime();

  // Run immediately on startup — do not await; errors caught inside runPollCycle
  runPollCycle().catch((err) => {
    console.error('[cost-poller] Initial poll cycle failed:', err instanceof Error ? err.message : String(err));
  });

  // Schedule subsequent cycles
  pollerInterval = setInterval(() => {
    runPollCycle().catch((err) => {
      console.error('[cost-poller] Scheduled poll cycle failed:', err instanceof Error ? err.message : String(err));
    });
  }, POLL_INTERVAL_MS);

  // Ensure the interval does not prevent the Node.js process from exiting
  if (pollerInterval.unref) pollerInterval.unref();
}

/**
 * Stop the cost poller and clean up the interval.
 * Safe to call when poller is not running.
 */
export function stopCostPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[cost-poller] Cost poller stopped');
  }
}
