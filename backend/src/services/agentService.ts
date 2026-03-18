// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Agent Service
// Reads OpenClaw logs from /tmp/openclaw/, parses agent activity,
// returns AgentStatus objects. Caches snapshots in Replit DB.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb } from './dbService';
import { config } from '../config';
import { AgentId, AgentStatus } from '../types';
import { AGENT_MAP, AGENT_ROSTER, sortedAgentRoster, isValidAgentId } from '../constants/agents';

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';
const STALE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Log parsing ──────────────────────────────────────────────────────────────

interface ParsedLogLine {
  timestamp: string;
  agentId: AgentId | null;
  sessionId: string | null;
  message: string;
  isTask: boolean;
  isProcessing: boolean;
  rawLine: string;
}

/**
 * Attempt to extract agent ID from a log line.
 * OpenClaw logs follow: [timestamp] [session:agentId] message
 * Falls back to matching known agent IDs in the line.
 */
function extractAgentId(line: string): AgentId | null {
  // JSON log format: { "agentId": "clawdia", ... }
  try {
    const parsed = JSON.parse(line);
    if (parsed.agentId && isValidAgentId(parsed.agentId)) {
      return parsed.agentId as AgentId;
    }
    // Try label or session field
    const label: string | undefined = parsed.label ?? parsed.session ?? '';
    if (label) {
      for (const id of AGENT_MAP.keys()) {
        if (label.toLowerCase().includes(id)) return id;
      }
    }
  } catch {
    // Plain-text log line — search for agent ID in text
  }

  // Search plain text for known agent IDs
  const lower = line.toLowerCase();
  for (const id of AGENT_MAP.keys()) {
    if (lower.includes(id)) return id;
  }

  return null;
}

function extractSessionId(line: string): string | null {
  try {
    const parsed = JSON.parse(line);
    return parsed.sessionId ?? parsed.session ?? null;
  } catch {
    const match = line.match(/session[_-]([a-zA-Z0-9]+)/i);
    return match ? `session_${match[1]}` : null;
  }
}

function isTaskDescription(line: string): boolean {
  const taskKeywords = [
    'task:', 'working on', 'processing', 'executing',
    'starting', 'running', 'implementing', 'building',
    'analysing', 'analyzing', 'reviewing', 'completing',
    'handling', 'responding to',
  ];
  const lower = line.toLowerCase();
  return taskKeywords.some((kw) => lower.includes(kw));
}

function isProcessingIndicator(line: string): boolean {
  try {
    const parsed = JSON.parse(line);
    return parsed.type === 'tool_call' || parsed.type === 'message' || parsed.processing === true;
  } catch {
    return false;
  }
}

/**
 * Extract a human-readable task description from a log line.
 * Strips technical identifiers and returns plain English.
 */
function extractTaskSummary(line: string): string | null {
  try {
    const parsed = JSON.parse(line);
    // Common log fields that contain user-facing descriptions
    const candidate: string =
      parsed.task ?? parsed.currentTask ?? parsed.message ?? parsed.content ?? '';
    if (candidate && candidate.length > 10 && candidate.length < 300) {
      return cleanTaskText(candidate);
    }
  } catch {
    // Plain text — strip timestamps and prefixes
    const cleaned = line
      .replace(/^\[.*?\]\s*/g, '') // Remove bracketed timestamps/prefixes
      .replace(/^(INFO|DEBUG|WARN|ERROR)\s*/i, '')
      .trim();
    if (cleaned.length > 10 && cleaned.length < 300) {
      return cleanTaskText(cleaned);
    }
  }
  return null;
}

function cleanTaskText(text: string): string {
  return text
    .replace(/session[_-][a-zA-Z0-9]+/gi, '')
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse today's and yesterday's log files, returning the most recent
 * activity per agent within the last 5 minutes.
 */
function parseRecentLogs(): Map<AgentId, ParsedLogLine[]> {
  const activityMap = new Map<AgentId, ParsedLogLine[]>();
  const logPath = config.OPENCLAW_LOG_PATH;

  if (!existsSync(logPath)) {
    return activityMap;
  }

  // Read last 2 log files (today + yesterday for continuity)
  let files: string[] = [];
  try {
    files = readdirSync(logPath)
      .filter((f) => f.startsWith('openclaw-') && f.endsWith('.log'))
      .sort()
      .slice(-2);
  } catch {
    return activityMap;
  }

  const cutoffTime = Date.now() - STALE_MS;

  for (const file of files) {
    try {
      const content = readFileSync(join(logPath, file), 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        const agentId = extractAgentId(line);
        if (!agentId) continue;

        // Extract timestamp from line
        let lineTime: number = Date.now();
        try {
          const parsed = JSON.parse(line);
          if (parsed.timestamp || parsed.time || parsed.ts) {
            lineTime = new Date(parsed.timestamp ?? parsed.time ?? parsed.ts).getTime();
          }
        } catch {
          const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          if (match) {
            lineTime = new Date(match[0]).getTime();
          }
        }

        if (lineTime < cutoffTime) continue;

        const entry: ParsedLogLine = {
          timestamp: new Date(lineTime).toISOString(),
          agentId,
          sessionId: extractSessionId(line),
          message: line,
          isTask: isTaskDescription(line),
          isProcessing: isProcessingIndicator(line),
          rawLine: line,
        };

        const existing = activityMap.get(agentId) ?? [];
        existing.push(entry);
        activityMap.set(agentId, existing);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return activityMap;
}

// ─── State derivation ─────────────────────────────────────────────────────────

function deriveState(lines: ParsedLogLine[]): AgentStatus['state'] {
  if (lines.length === 0) return 'offline';

  const now = Date.now();
  const latestTime = Math.max(
    ...lines.map((l) => new Date(l.timestamp).getTime()),
  );
  const ageMs = now - latestTime;

  if (ageMs > 2 * 60 * 1000) return 'idle'; // >2 min since last log = idle
  if (lines.some((l) => l.isProcessing)) return 'active';
  if (lines.some((l) => l.isTask)) return 'running';
  return 'idle';
}

function extractCurrentTask(lines: ParsedLogLine[]): string | null {
  // Find most recent task-related line
  const taskLines = [...lines]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .filter((l) => l.isTask);

  for (const line of taskLines) {
    const summary = extractTaskSummary(line.rawLine);
    if (summary) return summary;
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the current status of all agents.
 * Reads Replit DB for cached snapshots, enriches with fresh log data.
 */
export async function getAllAgentStatuses(): Promise<{
  agents: AgentStatus[];
  dataFreshAt: string;
}> {
  const db = getDb();
  const now = new Date().toISOString();
  const recentActivity = parseRecentLogs();

  const agents: AgentStatus[] = [];

  for (const meta of sortedAgentRoster()) {
    const lines = recentActivity.get(meta.id) ?? [];
    const cachedRaw = await db.get(`agent:status:${meta.id}`).catch(() => null);
    const cached = cachedRaw as AgentStatus | null;

    const state = lines.length > 0 ? deriveState(lines) : (cached?.state ?? 'offline');
    const latestLine = lines.sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    )[0];

    const status: AgentStatus = {
      id: meta.id,
      name: meta.name,
      emoji: meta.emoji,
      state,
      currentTask: extractCurrentTask(lines) ?? cached?.currentTask ?? null,
      summary: cached?.summary ?? null,
      lastSeenAt: latestLine?.timestamp ?? cached?.lastSeenAt ?? EPOCH_ISO,
      snapshotAt: now,
      isProcessing: lines.some((l) => l.isProcessing),
      sessionId: latestLine?.sessionId ?? cached?.sessionId ?? null,
    };

    // Write fresh snapshot — fire and forget
    db.set(`agent:status:${meta.id}`, status).catch(() => undefined);
    agents.push(status);
  }

  return { agents, dataFreshAt: now };
}

/**
 * Returns the status of a single agent.
 * Returns an offline default if the agent is not in the roster.
 */
export async function getAgentStatus(agentId: AgentId): Promise<AgentStatus | null> {
  const meta = AGENT_MAP.get(agentId);
  if (!meta) return null;

  const db = getDb();
  const recentActivity = parseRecentLogs();
  const lines = recentActivity.get(agentId) ?? [];
  const cachedRaw = await db.get(`agent:status:${agentId}`).catch(() => null);
  const cached = cachedRaw as AgentStatus | null;
  const now = new Date().toISOString();

  const state = lines.length > 0 ? deriveState(lines) : (cached?.state ?? 'offline');
  const latestLine = lines.sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  )[0];

  return {
    id: meta.id,
    name: meta.name,
    emoji: meta.emoji,
    state,
    currentTask: extractCurrentTask(lines) ?? cached?.currentTask ?? null,
    summary: cached?.summary ?? null,
    lastSeenAt: latestLine?.timestamp ?? cached?.lastSeenAt ?? EPOCH_ISO,
    snapshotAt: now,
    isProcessing: lines.some((l) => l.isProcessing),
    sessionId: latestLine?.sessionId ?? cached?.sessionId ?? null,
  };
}

export { AGENT_ROSTER };
