// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Feed Service
// Parses OpenClaw logs into plain-English activity feed entries.
// No technical jargon. Summaries a non-technical person understands.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { config } from '../config';
import { getDb, listKeys } from './dbService';
import {
  AgentId,
  FeedEntry,
  FeedEntryCategory,
  FeedResponse,
} from '../types';
import { AGENT_MAP, isValidAgentId } from '../constants/agents';

// ─── Category detection ───────────────────────────────────────────────────────

interface RawLogEvent {
  type?: string;
  event?: string;
  level?: string;
  message?: string;
  task?: string;
  content?: string;
  agentId?: string;
  sessionId?: string;
  timestamp?: string;
  time?: string;
  model?: string;
  error?: string;
}

function detectCategory(event: RawLogEvent, rawLine: string): FeedEntryCategory {
  const type = (event.type ?? event.event ?? '').toLowerCase();
  const level = (event.level ?? '').toLowerCase();
  const message = (event.message ?? rawLine ?? '').toLowerCase();

  if (type === 'session_start' || message.includes('session started') || message.includes('agent started')) {
    return 'session-started';
  }
  if (type === 'session_end' || message.includes('session ended') || message.includes('agent stopped')) {
    return 'session-ended';
  }
  if (type === 'agent_online' || message.includes('agent online') || message.includes('came online')) {
    return 'agent-online';
  }
  if (type === 'agent_offline' || message.includes('agent offline') || message.includes('went offline')) {
    return 'agent-offline';
  }
  if (type === 'task_complete' || message.includes('task complete') || message.includes('finished')) {
    return 'task-completed';
  }
  if (level === 'error' || type === 'error' || message.includes('failed') || message.includes('error')) {
    return 'task-failed';
  }
  if (type === 'tool_call' || type === 'tool_use' || message.includes('using tool') || message.includes('tool:')) {
    return 'tool-call';
  }
  if (type === 'task_start' || message.includes('task:') || message.includes('working on') || message.includes('starting')) {
    return 'task-started';
  }
  return 'system';
}

// ─── Plain-English summary generation ────────────────────────────────────────

/**
 * Maps technical tool names and events to plain English.
 * A non-technical person should understand every summary.
 */
const TOOL_LABEL_MAP: Record<string, string> = {
  exec: 'ran a command',
  read: 'read a file',
  write: 'saved a file',
  edit: 'edited a file',
  web_search: 'searched the web',
  web_fetch: 'fetched a web page',
  image: 'analysed an image',
  'gh-issues': 'checked GitHub issues',
  github: 'used GitHub',
  himalaya: 'checked emails',
  'things-mac': 'updated a task list',
};

function humaniseToolName(toolName: string): string {
  return TOOL_LABEL_MAP[toolName] ?? `used ${toolName}`;
}

function buildSummary(
  event: RawLogEvent,
  category: FeedEntryCategory,
  agentName: string,
): string {
  const msg = event.message ?? event.content ?? event.task ?? '';

  switch (category) {
    case 'session-started':
      return `${agentName} started a new work session`;
    case 'session-ended':
      return `${agentName} finished their work session`;
    case 'agent-online':
      return `${agentName} came online`;
    case 'agent-offline':
      return `${agentName} went offline`;
    case 'task-completed': {
      const taskDesc = cleanForDisplay(msg);
      return taskDesc
        ? `${agentName} completed: ${taskDesc}`
        : `${agentName} completed a task`;
    }
    case 'task-failed': {
      const errDesc = cleanForDisplay(event.error ?? msg);
      return errDesc
        ? `${agentName} ran into a problem: ${errDesc}`
        : `${agentName} encountered an error`;
    }
    case 'tool-call': {
      const toolName = cleanForDisplay(event.type ?? '').replace('tool_call:', '').trim();
      const toolLabel = humaniseToolName(toolName);
      return `${agentName} ${toolLabel}`;
    }
    case 'task-started': {
      const taskDesc = cleanForDisplay(msg);
      return taskDesc
        ? `${agentName} started working on: ${taskDesc}`
        : `${agentName} picked up a new task`;
    }
    case 'cost-alert':
      return `Budget alert: monthly AI spend has crossed a threshold`;
    default: {
      const systemMsg = cleanForDisplay(msg);
      return systemMsg
        ? `${agentName}: ${systemMsg}`
        : `${agentName} did something`;
    }
  }
}

function buildDetail(event: RawLogEvent, _category: FeedEntryCategory): string | null {
  const raw = event.message ?? event.content ?? event.task ?? null;
  if (!raw) return null;

  const cleaned = cleanForDisplay(raw);
  if (!cleaned || cleaned.length < 20) return null;

  // Truncate at 500 chars per spec
  return cleaned.length > 500 ? cleaned.substring(0, 497) + '…' : cleaned;
}

/**
 * Strip technical identifiers (UUIDs, session IDs, file paths, etc.)
 * and make the text safe for Harvey to read.
 */
function cleanForDisplay(text: string): string {
  return text
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '')
    .replace(/session[_-][a-zA-Z0-9]+/gi, '')
    .replace(/\b(INFO|DEBUG|WARN|ERROR|FATAL)\b/g, '')
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[:\-–]\s*/, '')
    .trim()
    .substring(0, 200);
}

function nanoid6(): string {
  return randomBytes(4).toString('base64url').substring(0, 6);
}

// ─── Log parsing into feed entries ────────────────────────────────────────────

function parseFeedEntriesFromFile(
  content: string,
  sinceTimestamp?: string,
): { agentId: AgentId; event: RawLogEvent; rawLine: string; timestamp: string }[] {
  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;
  const results: { agentId: AgentId; event: RawLogEvent; rawLine: string; timestamp: string }[] = [];

  for (const line of content.split('\n').filter(Boolean)) {
    let event: RawLogEvent = {};
    try {
      event = JSON.parse(line) as RawLogEvent;
    } catch {
      // Plain text — wrap in minimal event
      event = { message: line };
    }

    const timestamp =
      event.timestamp ?? event.time ?? new Date().toISOString();
    const lineMs = new Date(timestamp).getTime();
    if (lineMs <= sinceMs) continue;

    // Resolve agent ID
    const rawId =
      event.agentId ??
      (() => {
        // Fall back: scan line for known IDs
        const lower = line.toLowerCase();
        for (const id of AGENT_MAP.keys()) {
          if (lower.includes(id)) return id;
        }
        return null;
      })();

    if (!rawId || !isValidAgentId(rawId)) continue;

    results.push({
      agentId: rawId as AgentId,
      event,
      rawLine: line,
      timestamp,
    });
  }

  return results;
}

/**
 * Parse recent logs and write new feed entries to Replit DB.
 * Called by Dex's polling service every 60 seconds.
 */
export async function ingestFeedEntries(): Promise<number> {
  const logPath = config.OPENCLAW_LOG_PATH;
  if (!existsSync(logPath)) return 0;

  const db = getDb();
  let files: string[] = [];
  try {
    files = readdirSync(logPath)
      .filter((f) => f.startsWith('openclaw-') && f.endsWith('.log'))
      .sort()
      .slice(-2); // Today + yesterday
  } catch {
    return 0;
  }

  let written = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(logPath, file), 'utf-8');

      // Get cursor for each agent from DB
      const rawEntries = parseFeedEntriesFromFile(content);

      for (const { agentId, event, rawLine, timestamp } of rawEntries) {
        // Check cursor to avoid re-ingesting
        const cursorKey = `meta:feed:cursor:${agentId}`;
        const cursorRaw = await db.get(cursorKey).catch(() => null) as unknown;
        const cursor = typeof cursorRaw === 'string' ? cursorRaw : null;

        if (cursor && timestamp <= cursor) continue;

        const meta = AGENT_MAP.get(agentId);
        if (!meta) continue;

        const category = detectCategory(event, rawLine);
        const summary = buildSummary(event, category, meta.name).substring(0, 200);
        const detail = buildDetail(event, category);

        const occurredMs = new Date(timestamp).getTime();
        const paddedMs = occurredMs.toString().padStart(16, '0');
        const entryKey = `feed:entry:${agentId}:${paddedMs}:${nanoid6()}`;

        const entry: FeedEntry = {
          key: entryKey,
          agentId,
          agentName: meta.name,
          agentEmoji: meta.emoji,
          category,
          summary,
          detail,
          occurredAt: new Date(occurredMs).toISOString(),
          createdAt: new Date().toISOString(),
        };

        await db.set(entryKey, entry);

        // Update cursor to latest timestamp seen for this agent
        const existingCursor = await db.get(cursorKey).catch(() => null) as unknown;
        if (
          !existingCursor ||
          typeof existingCursor !== 'string' ||
          timestamp > existingCursor
        ) {
          await db.set(cursorKey, timestamp);
        }

        written++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  return written;
}

// ─── Read feed entries ────────────────────────────────────────────────────────

export async function getFeed(opts: {
  agentId?: AgentId;
  limit: number;
  cursor?: string;
}): Promise<FeedResponse> {
  const { agentId, limit, cursor } = opts;
  const db = getDb();
  const now = new Date().toISOString();

  // Determine key prefix to scan
  const prefix = agentId ? `feed:entry:${agentId}:` : 'feed:entry:';
  const allKeys = await listKeys(prefix);

  // Sort descending (newest first) — lexicographic sort on timestamp prefix
  const sortedKeys = allKeys.sort((a, b) => b.localeCompare(a));

  // Apply cursor — decode and find start position
  let startIndex = 0;
  if (cursor) {
    try {
      const decodedKey = Buffer.from(cursor, 'base64').toString('utf-8');
      const idx = sortedKeys.indexOf(decodedKey);
      if (idx === -1) {
        // Invalid cursor
        throw new Error('INVALID_CURSOR');
      }
      startIndex = idx + 1;
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_CURSOR') throw err;
      throw new Error('INVALID_CURSOR');
    }
  }

  const totalCount = sortedKeys.length;
  const pageKeys = sortedKeys.slice(startIndex, startIndex + limit);

  const entries: FeedEntry[] = [];
  for (const key of pageKeys) {
    const entry = (await db.get(key).catch(() => null)) as FeedEntry | null;
    if (entry) entries.push(entry);
  }

  const hasMore = startIndex + limit < totalCount;
  const nextCursor = hasMore
    ? Buffer.from(pageKeys[pageKeys.length - 1]).toString('base64')
    : null;

  return {
    computedAt: now,
    totalCount,
    entries,
    nextCursor,
  };
}
