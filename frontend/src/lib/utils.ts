/**
 * Utility helpers for the SCC Office Dashboard.
 */

import type { AgentId } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVE TIME FORMATTING
// Matches COPY.md: PANEL_LASTSEEN_* and FEED_TIME_* keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a relative time string from a UTC ISO 8601 timestamp.
 * Used in AgentDetailPanel (PANEL_LASTSEEN_*) and FeedEntry (FEED_TIME_*).
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'Just now';
  }

  if (diffMinutes === 1) {
    return '1 minute ago';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  if (diffHours === 1) {
    return '1 hour ago';
  }

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `Yesterday at ${timeStr}`;
  }

  // Older: "Monday at 09:14"
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${dayName} at ${timeStr}`;
}

/**
 * Shorter relative time for feed entries (FEED_TIME_* keys).
 * "Just now", "3 mins ago", "1 hour ago", "2 hours ago"
 */
export function formatFeedTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes === 60) return '1 hour ago';
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

/**
 * Absolute timestamp for hover/tap reveal: "14:23:07"
 */
export function formatAbsoluteTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Full timestamp for ARIA label: "14 March 2026 at 14:23:07"
 */
export function formatFullTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${day} at ${time}`;
}

/**
 * "Last updated N ago" format for the LastUpdatedIndicator.
 */
export function formatLastUpdated(timestamp: Date | null, failed: boolean): string {
  if (failed) return '⚠ Update failed';
  if (!timestamp) return 'Updated just now';

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffSeconds < 10) return 'Updated just now';
  if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`;
  return `Updated ${diffMinutes}m ago`;
}

/**
 * Format today's date for the feed header: "Today, Monday 17 March"
 */
export function formatFeedDate(): string {
  const now = new Date();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return `Today, ${day} ${date}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COST FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/** Integer cents → "$342.18" */
export function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Integer cents → percentage of $500 budget: 0–100+ */
export function centsToPercent(cents: number, budgetCents = 50_000): number {
  return Math.round((cents / budgetCents) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT ROSTER (static, matches DATA-SCHEMA Appendix A)
// ─────────────────────────────────────────────────────────────────────────────

export const AGENT_ROSTER: ReadonlyArray<{ id: AgentId; name: string; emoji: string; type: 'orchestrator' | 'autonomous' | 'dev-subagent' }> = [
  { id: 'clawdia',                name: 'Clawdia',                  emoji: '🦞', type: 'orchestrator' },
  { id: 'security-agent',         name: 'Security Agent',           emoji: '🔒', type: 'autonomous' },
  { id: 'self-improvement-agent', name: 'Self-Improvement Agent',   emoji: '🌙', type: 'autonomous' },
  { id: 'marcus',                 name: 'Marcus',                   emoji: '⚙️', type: 'dev-subagent' },
  { id: 'sienna',                 name: 'Sienna',                   emoji: '🎨', type: 'dev-subagent' },
  { id: 'dex',                    name: 'Dex',                      emoji: '🔗', type: 'dev-subagent' },
  { id: 'nadia',                  name: 'Nadia',                    emoji: '🗄️', type: 'dev-subagent' },
  { id: 'eli',                    name: 'Eli',                      emoji: '🔍', type: 'dev-subagent' },
  { id: 'zara',                   name: 'Zara',                     emoji: '🧪', type: 'dev-subagent' },
  { id: 'roan',                   name: 'Roan',                     emoji: '🔒', type: 'dev-subagent' },
  { id: 'imogen',                 name: 'Imogen',                   emoji: '🖼️', type: 'dev-subagent' },
  { id: 'cass',                   name: 'Cass',                     emoji: '✍️', type: 'dev-subagent' },
  { id: 'otto',                   name: 'Otto',                     emoji: '📦', type: 'dev-subagent' },
  { id: 'phoebe',                 name: 'Phoebe',                   emoji: '📊', type: 'dev-subagent' },
] as const;

export function getAgentMeta(id: AgentId) {
  return AGENT_ROSTER.find((a) => a.id === id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS NAME UTILITY (minimal, no clsx dependency)
// ─────────────────────────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
