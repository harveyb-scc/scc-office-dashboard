// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — OpenClaw Log Parser
// Integration layer for reading and parsing OpenClaw log files.
//
// Log location: /tmp/openclaw/openclaw-YYYY-MM-DD.log
// Format: JSONL (one JSON object per line) with plain-text fallback.
//
// Exports:
//   parseLogsForDate(date: Date): Promise<ParsedLogEntry[]>
//   getTodaysLogs(): Promise<ParsedLogEntry[]>
//   getLogsSince(timestamp: number): Promise<ParsedLogEntry[]>
//
// Design philosophy:
//   - Every line is processed independently. A bad line never kills the batch.
//   - Never throws — all errors are caught and the function returns what it can.
//   - Log format may change; try/catch per line + graceful fallback to plain text.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { isValidAgentId } from '../constants/agents';
import { AgentId, Provider } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** All action types derivable from an OpenClaw log line. */
export type LogActionType =
  | 'tool_call'
  | 'message'
  | 'session_start'
  | 'session_end'
  | 'task_start'
  | 'task_complete'
  | 'token_usage'
  | 'error'
  | 'system'
  | 'unknown';

/** A fully parsed log line with all extractable fields populated. */
export interface ParsedLogEntry {
  /** UTC ISO 8601 timestamp from the log line itself. */
  timestamp: string;
  /** Unix milliseconds — pre-parsed for efficient timestamp comparisons. */
  timestampMs: number;
  /**
   * The agent this log line belongs to.
   * Null if the agent could not be determined from the line.
   */
  agentId: AgentId | null;
  /**
   * OpenClaw session key (e.g. "agent:main:telegram:direct:...").
   * Null if not present in the log line.
   */
  sessionKey: string | null;
  /** Token usage if this line represents an API call completion. */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  } | null;
  /** Provider inferred from the model name. */
  provider: Provider | null;
  /** Categorised action type derived from the log line. */
  actionType: LogActionType;
  /**
   * Plain-English description of what happened.
   * Safe for non-technical users. Max 200 chars. No UUIDs, no paths.
   */
  description: string;
  /**
   * The raw original log line.
   * Retained for debugging; never surfaced directly to Harvey.
   */
  rawLine: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base directory where OpenClaw writes its log files. */
const LOG_DIR = '/tmp/openclaw';

/** Build the expected log file path for a given date. */
function logFilePathForDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return join(LOG_DIR, `openclaw-${yyyy}-${mm}-${dd}.log`);
}

// ─── Provider detection ───────────────────────────────────────────────────────

/**
 * Infer the API provider from a model name string.
 * Returns null if model string is empty or unrecognisable.
 */
function detectProvider(model: string): Provider | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('claude')) return 'anthropic';
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('gpt') || m.includes('openai') || m.includes('o1') || m.includes('o3')) return 'openai';
  return null;
}

// ─── Agent ID extraction ──────────────────────────────────────────────────────

/**
 * Attempt to extract a valid AgentId from structured or plain-text log data.
 *
 * Priority order:
 * 1. `agentId` field in JSON
 * 2. `label` / `session` / `agent` fields in JSON (search for known IDs)
 * 3. Plain-text search for known agent IDs (last resort, lower confidence)
 */
function extractAgentId(
  json: Record<string, unknown> | null,
  rawLine: string,
): AgentId | null {
  // 1. Direct agentId field
  if (json) {
    const direct =
      (json.agentId as string | undefined) ??
      (json.agent_id as string | undefined);
    if (direct && isValidAgentId(direct)) return direct as AgentId;

    // 2. Session/label fields — OpenClaw session keys contain the agent ID
    //    e.g. "agent:main:telegram:direct:..." → "clawdia" (the main agent)
    //    e.g. "agent:main:subagent:..." → check label
    const sessionKey =
      (json.sessionKey as string | undefined) ??
      (json.session_key as string | undefined) ??
      (json.session as string | undefined) ??
      (json.label as string | undefined) ??
      '';

    if (sessionKey) {
      // Map well-known session key patterns to agent IDs
      if (sessionKey.includes(':main:') && !sessionKey.includes('subagent')) {
        return 'clawdia';
      }
      if (sessionKey.includes('security')) return 'security-agent';
      if (sessionKey.includes('self-improvement')) return 'self-improvement-agent';

      // Scan for known agent IDs within the session key
      const lower = sessionKey.toLowerCase();
      for (const id of knownAgentIds()) {
        if (lower.includes(id)) return id;
      }
    }

    // 3. Check `agent` field directly
    const agentField = (json.agent as string | undefined) ?? '';
    if (agentField && isValidAgentId(agentField)) return agentField as AgentId;
  }

  // 4. Plain-text scan — lowest confidence, only used when JSON parsing failed
  const lower = rawLine.toLowerCase();
  for (const id of knownAgentIds()) {
    if (lower.includes(id)) return id;
  }

  return null;
}

/** Lazily computed list of all known agent IDs, sorted longest-first to avoid partial matches. */
let _knownAgentIds: AgentId[] | null = null;
function knownAgentIds(): AgentId[] {
  if (_knownAgentIds) return _knownAgentIds;
  // Import here to avoid circular deps — agents constant is stable
  const { AGENT_ROSTER } = require('../constants/agents');
  _knownAgentIds = [...(AGENT_ROSTER as Array<{ id: AgentId }>)]
    .map((a) => a.id)
    .sort((a, b) => b.length - a.length); // Longest first to avoid "dex" matching inside "index"
  return _knownAgentIds;
}

// ─── Session key extraction ───────────────────────────────────────────────────

function extractSessionKey(
  json: Record<string, unknown> | null,
  rawLine: string,
): string | null {
  if (json) {
    const key =
      (json.sessionKey as string | undefined) ??
      (json.session_key as string | undefined) ??
      (json.session as string | undefined);
    if (key && typeof key === 'string' && key.length > 0) return key;
  }

  // Plain-text: look for "agent:main:..." or "session_<alphanumeric>" patterns
  const sessionPatterns = [
    /\bagent:[a-z:]+:[a-zA-Z0-9_.-]+/,
    /\bsession[_-][a-zA-Z0-9]+/i,
  ];
  for (const pattern of sessionPatterns) {
    const match = rawLine.match(pattern);
    if (match) return match[0];
  }

  return null;
}

// ─── Token usage extraction ───────────────────────────────────────────────────

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

function extractTokenUsage(
  json: Record<string, unknown> | null,
): TokenUsage | null {
  if (!json) return null;

  // Common field shapes used by OpenClaw and Anthropic SDK
  const inputTokens: number =
    (json.inputTokens as number | undefined) ??
    (json.input_tokens as number | undefined) ??
    ((json.usage as Record<string, unknown> | undefined)?.input_tokens as number | undefined) ??
    ((json.usage as Record<string, unknown> | undefined)?.inputTokens as number | undefined) ??
    0;

  const outputTokens: number =
    (json.outputTokens as number | undefined) ??
    (json.output_tokens as number | undefined) ??
    ((json.usage as Record<string, unknown> | undefined)?.output_tokens as number | undefined) ??
    ((json.usage as Record<string, unknown> | undefined)?.outputTokens as number | undefined) ??
    0;

  // Only return a usage record if there are actual tokens
  if (inputTokens === 0 && outputTokens === 0) return null;

  const model: string =
    (json.model as string | undefined) ??
    (json.modelId as string | undefined) ??
    (json.model_id as string | undefined) ??
    '';

  return { inputTokens, outputTokens, model };
}

// ─── Action type detection ────────────────────────────────────────────────────

function detectActionType(
  json: Record<string, unknown> | null,
  rawLine: string,
  tokenUsage: TokenUsage | null,
): LogActionType {
  // Token usage events are their own category
  if (tokenUsage) return 'token_usage';

  if (json) {
    const type = ((json.type as string | undefined) ?? '').toLowerCase();
    const event = ((json.event as string | undefined) ?? '').toLowerCase();
    const level = ((json.level as string | undefined) ?? '').toLowerCase();
    const combined = type || event;

    if (combined.includes('session_start') || combined.includes('session-start')) return 'session_start';
    if (combined.includes('session_end') || combined.includes('session-end')) return 'session_end';
    if (combined.includes('task_complete') || combined.includes('task-complete') || combined.includes('task_finished')) return 'task_complete';
    if (combined.includes('task_start') || combined.includes('task-start') || combined.includes('task_begin')) return 'task_start';
    if (combined.includes('tool_call') || combined.includes('tool_use') || combined.includes('tool-call')) return 'tool_call';
    if (combined.includes('message') || combined.includes('response') || combined.includes('assistant')) return 'message';
    if (level === 'error' || combined.includes('error') || combined.includes('fail')) return 'error';
  }

  // Plain-text heuristics
  const lower = rawLine.toLowerCase();
  if (lower.includes('session started') || lower.includes('new session')) return 'session_start';
  if (lower.includes('session ended') || lower.includes('session complete')) return 'session_end';
  if (lower.includes('task complete') || lower.includes('finished task')) return 'task_complete';
  if (lower.includes('starting task') || lower.includes('task:')) return 'task_start';
  if (lower.includes('tool:') || lower.includes('using tool')) return 'tool_call';
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error';

  return 'unknown';
}

// ─── Description generation ───────────────────────────────────────────────────

/**
 * Build a plain-English description from parsed log data.
 * Maximum 200 characters. No UUIDs, file paths, or session IDs.
 */
function buildDescription(
  json: Record<string, unknown> | null,
  actionType: LogActionType,
  tokenUsage: TokenUsage | null,
  rawLine: string,
): string {
  // Token usage — specific and informative
  if (tokenUsage && actionType === 'token_usage') {
    const modelLabel = tokenUsage.model || 'AI model';
    return `Used ${modelLabel}: ${tokenUsage.inputTokens.toLocaleString()} input + ${tokenUsage.outputTokens.toLocaleString()} output tokens`;
  }

  // Extract the best candidate message from JSON
  if (json) {
    const candidate: string =
      (json.message as string | undefined) ??
      (json.task as string | undefined) ??
      (json.content as string | undefined) ??
      (json.description as string | undefined) ??
      (json.summary as string | undefined) ??
      '';

    if (candidate && candidate.length > 5) {
      return sanitiseDescription(candidate);
    }
  }

  // Fallback: action type labels
  switch (actionType) {
    case 'session_start': return 'Agent session started';
    case 'session_end':   return 'Agent session ended';
    case 'task_start':    return 'Agent picked up a new task';
    case 'task_complete': return 'Agent completed a task';
    case 'tool_call':     return 'Agent called an external tool';
    case 'message':       return 'Agent generated a response';
    case 'error':         return 'Agent encountered an error';
    case 'system':        return 'System event';
    default: {
      // Last resort: try to extract something legible from plain text
      const cleaned = sanitiseDescription(rawLine);
      return cleaned.length > 5 ? cleaned : 'Agent activity';
    }
  }
}

/** Strip technical noise from user-facing text. */
function sanitiseDescription(text: string): string {
  return text
    // Remove UUIDs
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '')
    // Remove session key patterns
    .replace(/\bagent:[a-z:]+:[a-zA-Z0-9_.-]+/g, '')
    .replace(/\bsession[_-][a-zA-Z0-9]+/gi, '')
    // Remove log level prefixes
    .replace(/\b(INFO|DEBUG|WARN|WARNING|ERROR|FATAL|TRACE)\b\s*/g, '')
    // Remove bracketed timestamps/prefixes
    .replace(/^\[.*?\]\s*/g, '')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    .replace(/^[:\-–]\s*/, '')
    .trim()
    .substring(0, 200);
}

// ─── Timestamp extraction ─────────────────────────────────────────────────────

function extractTimestamp(
  json: Record<string, unknown> | null,
  rawLine: string,
): { iso: string; ms: number } {
  if (json) {
    const raw =
      (json.timestamp as string | undefined) ??
      (json.time as string | undefined) ??
      (json.ts as string | undefined) ??
      (json.created_at as string | undefined);
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return { iso: d.toISOString(), ms: d.getTime() };
      }
    }
  }

  // Plain-text: scan for ISO 8601 patterns
  const isoMatch = rawLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) {
      return { iso: d.toISOString(), ms: d.getTime() };
    }
  }

  // No timestamp found — use now (parse time), note this is imprecise
  const now = Date.now();
  return { iso: new Date(now).toISOString(), ms: now };
}

// ─── Core line parser ─────────────────────────────────────────────────────────

/**
 * Parse a single log line into a ParsedLogEntry.
 * Never throws — returns null if the line is empty or unparseable.
 */
function parseLine(rawLine: string): ParsedLogEntry | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  // Attempt JSON parse first; gracefully fall through to plain-text mode
  let json: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      json = parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — proceed with plain-text extraction
  }

  const { iso: timestamp, ms: timestampMs } = extractTimestamp(json, trimmed);
  const agentId = extractAgentId(json, trimmed);
  const sessionKey = extractSessionKey(json, trimmed);
  const tokenUsage = extractTokenUsage(json);
  const provider = tokenUsage?.model ? detectProvider(tokenUsage.model) : null;
  const actionType = detectActionType(json, trimmed, tokenUsage);
  const description = buildDescription(json, actionType, tokenUsage, trimmed);

  return {
    timestamp,
    timestampMs,
    agentId,
    sessionKey,
    tokenUsage,
    provider,
    actionType,
    description,
    rawLine: trimmed,
  };
}

// ─── File-level parsing ───────────────────────────────────────────────────────

/**
 * Read and parse a single log file.
 * Returns all successfully parsed entries; silently skips bad lines.
 * Returns empty array if file does not exist or cannot be read.
 */
function parseLogFile(filePath: string): ParsedLogEntry[] {
  if (!existsSync(filePath)) return [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    // File unreadable (permissions, corruption, etc.) — not a crash condition
    console.warn(`[openclaw-logs] Could not read log file: ${filePath}`, err instanceof Error ? err.message : String(err));
    return [];
  }

  const entries: ParsedLogEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    try {
      const entry = parseLine(line);
      if (entry) entries.push(entry);
    } catch (err) {
      // Per-line catch: one bad line never kills the batch
      // Silent — logging every bad line would be very noisy
    }
  }

  return entries;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse all log entries for a specific UTC date.
 * Reads the corresponding log file at /tmp/openclaw/openclaw-YYYY-MM-DD.log.
 *
 * Never throws.
 */
export async function parseLogsForDate(date: Date): Promise<ParsedLogEntry[]> {
  const filePath = logFilePathForDate(date);
  return parseLogFile(filePath);
}

/**
 * Parse today's log entries (UTC date).
 * Convenience wrapper around parseLogsForDate.
 *
 * Never throws.
 */
export async function getTodaysLogs(): Promise<ParsedLogEntry[]> {
  return parseLogsForDate(new Date());
}

/**
 * Return all log entries from today and yesterday with timestamps
 * strictly after the given Unix timestamp (milliseconds).
 *
 * Reads both today's and yesterday's log files to handle the case where
 * the server restarts near midnight and needs recent entries from the previous day.
 *
 * @param timestamp Unix milliseconds. Only entries with timestampMs > timestamp are returned.
 *
 * Never throws.
 */
export async function getLogsSince(timestamp: number): Promise<ParsedLogEntry[]> {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const [todayEntries, yesterdayEntries] = await Promise.all([
    parseLogsForDate(today),
    parseLogsForDate(yesterday),
  ]);

  const all = [...yesterdayEntries, ...todayEntries];
  return all.filter((entry) => entry.timestampMs > timestamp);
}
