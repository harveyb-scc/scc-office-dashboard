// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Cost Service
// Reads OpenClaw logs for token usage, calculates costs in integer cents,
// stores hourly snapshots in Replit DB.
//
// Pricing (from env):
//   anthropic claude-sonnet-4-6: input $3/1M, output $15/1M
//   gemini-2.5-flash:            input $0.075/1M, output $0.30/1M
//
// Budget thresholds: $400 alert, $500 critical
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { getDb, listKeys } from './dbService';
import { alertService } from './alertService';
import {
  AgentId,
  Provider,
  CostRecord,
  CostSummary,
  CostWindow,
  AgentCostBreakdown,
  ProviderCostBreakdown,
  BudgetStatus,
  AlertLevel,
  CostHistoryResponse,
  CostHistoryPoint,
  MonthlyCostSummary,
} from '../types';
import { AGENT_MAP, isValidAgentId } from '../constants/agents';

// ─── Pricing helpers ──────────────────────────────────────────────────────────

/**
 * Calculate cost in integer cents from token counts and per-million prices.
 * Standard half-up rounding applied once per record.
 */
function calcCostCents(
  inputTokens: number,
  outputTokens: number,
  inputPriceUsd: number,
  outputPriceUsd: number,
): number {
  const usd =
    (inputTokens / 1_000_000) * inputPriceUsd +
    (outputTokens / 1_000_000) * outputPriceUsd;
  return Math.round(usd * 100);
}

function getPricingForProvider(provider: Provider): {
  inputPrice: number;
  outputPrice: number;
} {
  switch (provider) {
    case 'anthropic':
      return {
        inputPrice: config.ANTHROPIC_INPUT_PRICE_PER_MILLION_TOKENS,
        outputPrice: config.ANTHROPIC_OUTPUT_PRICE_PER_MILLION_TOKENS,
      };
    case 'gemini':
      return {
        inputPrice: config.GEMINI_INPUT_PRICE_PER_MILLION_TOKENS,
        outputPrice: config.GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS,
      };
    case 'openai':
      // Not currently in scope — return zeros so records are stored without cost
      return { inputPrice: 0, outputPrice: 0 };
  }
}

// ─── Log parsing for token usage ──────────────────────────────────────────────

interface TokenUsageEvent {
  agentId: AgentId;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
  model?: string;
}

function detectProvider(model: string): Provider {
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('gemini')) return 'gemini';
  if (model.includes('gpt') || model.includes('openai')) return 'openai';
  return 'anthropic'; // Default assumption for SCC stack
}

/**
 * Parse log files for token usage events.
 * Reads logs from OPENCLAW_LOG_PATH.
 */
export function parseTokenUsageFromLogs(
  sinceTimestamp?: string,
): TokenUsageEvent[] {
  const logPath = config.OPENCLAW_LOG_PATH;
  if (!existsSync(logPath)) return [];

  const events: TokenUsageEvent[] = [];
  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;

  let files: string[] = [];
  try {
    files = readdirSync(logPath)
      .filter((f) => f.startsWith('openclaw-') && f.endsWith('.log'))
      .sort()
      .slice(-7); // Last 7 days of logs
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(logPath, file), 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Look for token usage fields — OpenClaw logs structured usage data
          const inputTokens: number =
            parsed.inputTokens ??
            parsed.input_tokens ??
            parsed.usage?.input_tokens ??
            0;
          const outputTokens: number =
            parsed.outputTokens ??
            parsed.output_tokens ??
            parsed.usage?.output_tokens ??
            0;

          if (inputTokens === 0 && outputTokens === 0) continue;

          const timestamp: string =
            parsed.timestamp ?? parsed.time ?? parsed.ts ?? new Date().toISOString();

          const lineMs = new Date(timestamp).getTime();
          if (lineMs <= sinceMs) continue;

          // Resolve agent ID
          const rawAgentId: string =
            parsed.agentId ?? parsed.agent_id ?? parsed.label ?? '';
          if (!rawAgentId || !isValidAgentId(rawAgentId)) continue;

          const model: string = parsed.model ?? parsed.modelId ?? '';
          const provider = model ? detectProvider(model) : 'anthropic';

          events.push({
            agentId: rawAgentId as AgentId,
            provider,
            inputTokens,
            outputTokens,
            timestamp,
            model,
          });
        } catch {
          // Skip non-JSON or malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return events;
}

// ─── Replit DB key helpers ────────────────────────────────────────────────────

function hourlyKey(
  agentId: AgentId,
  provider: Provider,
  date: string,
  hour: number,
): string {
  const hh = hour.toString().padStart(2, '0');
  return `cost:hourly:${agentId}:${provider}:${date}-${hh}`;
}

function parseHourlyKey(key: string): {
  agentId: AgentId;
  provider: Provider;
  date: string;
  hour: number;
} | null {
  const parts = key.split(':');
  // cost:hourly:<agentId>:<provider>:<YYYY-MM-DD-HH>
  if (parts.length < 5) return null;
  const datePart = parts[4];
  const dateMatch = datePart.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const agentId = parts[2];
  const provider = parts[3] as Provider;
  if (!isValidAgentId(agentId)) return null;

  return {
    agentId: agentId as AgentId,
    provider,
    date: dateMatch[1],
    hour: parseInt(dateMatch[2], 10),
  };
}

// ─── Write cost records ───────────────────────────────────────────────────────

/**
 * Ingest token usage events and write/update hourly CostRecord entries in Replit DB.
 * Called by Dex's polling service every 60 seconds.
 */
export async function ingestTokenUsage(events: TokenUsageEvent[]): Promise<void> {
  if (events.length === 0) return;

  const db = getDb();

  // Group events by agent+provider+hour bucket
  const buckets = new Map<
    string,
    { agentId: AgentId; provider: Provider; date: string; hour: number; events: TokenUsageEvent[] }
  >();

  for (const event of events) {
    const d = new Date(event.timestamp);
    const date = d.toISOString().substring(0, 10);
    const hour = d.getUTCHours();
    const key = hourlyKey(event.agentId, event.provider, date, hour);

    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      buckets.set(key, {
        agentId: event.agentId,
        provider: event.provider,
        date,
        hour,
        events: [event],
      });
    }
  }

  // Write each bucket to Replit DB
  for (const [key, bucket] of buckets) {
    const inputTokens = bucket.events.reduce((s, e) => s + e.inputTokens, 0);
    const outputTokens = bucket.events.reduce((s, e) => s + e.outputTokens, 0);
    const { inputPrice, outputPrice } = getPricingForProvider(bucket.provider);
    const costCents = calcCostCents(inputTokens, outputTokens, inputPrice, outputPrice);

    const existing = (await db.get(key).catch(() => null)) as CostRecord | null;

    const record: CostRecord = existing
      ? {
          ...existing,
          costCents: existing.costCents + costCents,
          inputTokens: existing.inputTokens + inputTokens,
          outputTokens: existing.outputTokens + outputTokens,
          callCount: existing.callCount + bucket.events.length,
          updatedAt: new Date().toISOString(),
        }
      : {
          agentId: bucket.agentId,
          provider: bucket.provider,
          date: bucket.date,
          hour: bucket.hour,
          costCents,
          inputTokens,
          outputTokens,
          callCount: bucket.events.length,
          updatedAt: new Date().toISOString(),
        };

    await db.set(key, record);
  }

  // Recompute monthly cache and check budget thresholds
  await recomputeMonthlySummary();
  await checkBudgetThresholds();
}

// ─── Monthly summary cache ────────────────────────────────────────────────────

async function recomputeMonthlySummary(): Promise<MonthlyCostSummary> {
  const now = new Date();
  const month = now.toISOString().substring(0, 7); // YYYY-MM
  const db = getDb();

  const keys = await listKeys(`cost:hourly:`);
  const monthKeys = keys.filter((k) => k.includes(`:${month}-`));

  let totalCents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let callCount = 0;

  for (const key of monthKeys) {
    const record = (await db.get(key).catch(() => null)) as CostRecord | null;
    if (!record) continue;
    totalCents += record.costCents;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    callCount += record.callCount;
  }

  const summary: MonthlyCostSummary = {
    month,
    totalCents,
    inputTokens,
    outputTokens,
    callCount,
    updatedAt: now.toISOString(),
  };

  await db.set(`meta:cost:monthly:${month}`, summary).catch(() => undefined);
  return summary;
}

// ─── Budget thresholds ────────────────────────────────────────────────────────

const BUDGET_THRESHOLDS_CENTS = [40000, 47500, 50000] as const;
const BUDGET_CAP_CENTS = 50000;

async function checkBudgetThresholds(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const month = now.toISOString().substring(0, 7);

  const summaryRaw = await db
    .get(`meta:cost:monthly:${month}`)
    .catch(() => null);
  const summary = summaryRaw as MonthlyCostSummary | null;
  if (!summary) return;

  for (const threshold of BUDGET_THRESHOLDS_CENTS) {
    if (summary.totalCents < threshold) continue;

    const alertKey = `alert:budget:${month}:${threshold}`;
    const existing = await db.get(alertKey).catch(() => null);
    if (existing) continue; // Already alerted this month

    const alert = {
      month,
      thresholdCents: threshold,
      spendAtCrossingCents: summary.totalCents,
      crossedAt: now.toISOString(),
      telegramSent: false,
      telegramSentAt: null,
    };

    await db.set(alertKey, alert);

    // Send Telegram alert
    const sent = await alertService.sendBudgetAlert(
      threshold,
      summary.totalCents,
    );

    if (sent) {
      await db.set(alertKey, {
        ...alert,
        telegramSent: true,
        telegramSentAt: now.toISOString(),
      });
    }
  }
}

// ─── Read / aggregation ───────────────────────────────────────────────────────

async function loadAllCostRecords(): Promise<CostRecord[]> {
  const db = getDb();
  const keys = await listKeys('cost:hourly:');
  const records: CostRecord[] = [];

  for (const key of keys) {
    const record = (await db.get(key).catch(() => null)) as CostRecord | null;
    if (record) records.push(record);
  }

  return records;
}

function sumWindow(records: CostRecord[]): CostWindow {
  return records.reduce(
    (acc, r) => ({
      costCents: acc.costCents + r.costCents,
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      callCount: acc.callCount + r.callCount,
    }),
    { costCents: 0, inputTokens: 0, outputTokens: 0, callCount: 0 },
  );
}

function alertLevel(spentCents: number): AlertLevel {
  if (spentCents >= 50000) return 'critical';
  if (spentCents >= 47500) return 'red';
  if (spentCents >= 40000) return 'amber';
  return 'normal';
}

export async function getCostSummary(): Promise<CostSummary> {
  const allRecords = await loadAllCostRecords();
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  const monthStr = now.toISOString().substring(0, 7);

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayRecords = allRecords.filter((r) => r.date === todayStr);
  const weekRecords = allRecords.filter(
    (r) => new Date(`${r.date}T00:00:00Z`) >= weekAgo,
  );
  const monthRecords = allRecords.filter((r) => r.date.startsWith(monthStr));

  const monthCents = sumWindow(monthRecords).costCents;

  // Pre-build per-agent time-windowed record sets for O(n) breakdowns
  const todayRecordsByAgent = new Map<AgentId, CostRecord[]>();
  const weekRecordsByAgent = new Map<AgentId, CostRecord[]>();
  const monthRecordsByAgent = new Map<AgentId, CostRecord[]>();

  for (const record of todayRecords) {
    const arr = todayRecordsByAgent.get(record.agentId) ?? [];
    arr.push(record);
    todayRecordsByAgent.set(record.agentId, arr);
  }
  for (const record of weekRecords) {
    const arr = weekRecordsByAgent.get(record.agentId) ?? [];
    arr.push(record);
    weekRecordsByAgent.set(record.agentId, arr);
  }
  for (const record of monthRecords) {
    const arr = monthRecordsByAgent.get(record.agentId) ?? [];
    arr.push(record);
    monthRecordsByAgent.set(record.agentId, arr);
  }

  // Per-agent breakdown — all-time aggregate plus per-window costs
  const agentMap = new Map<AgentId, AgentCostBreakdown>();
  for (const record of allRecords) {
    const existing = agentMap.get(record.agentId);
    const meta = AGENT_MAP.get(record.agentId);
    if (!meta) continue;

    if (existing) {
      existing.costCents += record.costCents;
      existing.inputTokens += record.inputTokens;
      existing.outputTokens += record.outputTokens;
      existing.callCount += record.callCount;
    } else {
      const todayCostCents = sumWindow(todayRecordsByAgent.get(record.agentId) ?? []).costCents;
      const weekCostCents = sumWindow(weekRecordsByAgent.get(record.agentId) ?? []).costCents;
      const monthCostCents = sumWindow(monthRecordsByAgent.get(record.agentId) ?? []).costCents;

      agentMap.set(record.agentId, {
        agentId: record.agentId,
        agentName: meta.name,
        agentEmoji: meta.emoji,
        costCents: record.costCents,
        todayCostCents,
        weekCostCents,
        monthCostCents,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        callCount: record.callCount,
      });
    }
  }

  // Per-provider breakdown
  const providerMap = new Map<Provider, ProviderCostBreakdown>();
  for (const record of allRecords) {
    const existing = providerMap.get(record.provider);
    if (existing) {
      existing.costCents += record.costCents;
      existing.inputTokens += record.inputTokens;
      existing.outputTokens += record.outputTokens;
      existing.callCount += record.callCount;
    } else {
      providerMap.set(record.provider, {
        provider: record.provider,
        costCents: record.costCents,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        callCount: record.callCount,
      });
    }
  }

  const budget: BudgetStatus = {
    budgetCents: BUDGET_CAP_CENTS,
    spentCents: monthCents,
    remainingCents: BUDGET_CAP_CENTS - monthCents,
    fractionUsed: Math.min(monthCents / BUDGET_CAP_CENTS, 1),
    alertLevel: alertLevel(monthCents),
  };

  return {
    computedAt: now.toISOString(),
    totals: {
      today: sumWindow(todayRecords),
      week: sumWindow(weekRecords),
      month: sumWindow(monthRecords),
      allTime: sumWindow(allRecords),
    },
    byAgent: [...agentMap.values()].sort((a, b) => b.costCents - a.costCents),
    byProvider: [...providerMap.values()].sort(
      (a, b) => b.costCents - a.costCents,
    ),
    budget,
  };
}

export async function getCostHistory(
  windowHours: number,
  agentId: AgentId | null,
  provider: Provider | null,
): Promise<CostHistoryResponse> {
  const allRecords = await loadAllCostRecords();
  const now = new Date();

  // Filter to requested window
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  let filtered = allRecords.filter((r) => {
    const recordTime = new Date(
      `${r.date}T${r.hour.toString().padStart(2, '0')}:00:00Z`,
    );
    return recordTime >= windowStart;
  });

  if (agentId) filtered = filtered.filter((r) => r.agentId === agentId);
  if (provider) filtered = filtered.filter((r) => r.provider === provider);

  // Build a dense hourly map (zero-filled)
  const pointMap = new Map<string, CostHistoryPoint>();

  // Pre-fill all hour buckets with zeros
  for (let h = 0; h < windowHours; h++) {
    const bucketTime = new Date(
      windowStart.getTime() + h * 60 * 60 * 1000,
    );
    // Round to the hour
    bucketTime.setUTCMinutes(0, 0, 0);
    const key = bucketTime.toISOString();
    pointMap.set(key, {
      timestamp: key,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  }

  // Add actual data
  for (const record of filtered) {
    const bucketTime = new Date(
      `${record.date}T${record.hour.toString().padStart(2, '0')}:00:00Z`,
    );
    const key = bucketTime.toISOString();
    const existing = pointMap.get(key);
    if (existing) {
      existing.costCents += record.costCents;
      existing.inputTokens += record.inputTokens;
      existing.outputTokens += record.outputTokens;
    } else {
      pointMap.set(key, {
        timestamp: key,
        costCents: record.costCents,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      });
    }
  }

  const points = [...pointMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  return {
    computedAt: now.toISOString(),
    windowHours,
    agentId,
    provider,
    points,
  };
}

export { parseHourlyKey };
