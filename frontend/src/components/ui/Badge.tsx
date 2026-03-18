/**
 * StatusBadge — UX spec §6.3
 * Pill-shaped badge for agent status. Status conveyed via both colour AND text.
 * Never colour alone (WCAG 1.4.1 / AC-A11Y-02).
 * Contrast fix: use dark text on green/amber (not white — both fail at < 3:1).
 */

import type { AgentState } from '@/types';
import { cn } from '@/lib/utils';

// Badge label copy from COPY.md §3 STATUS_* keys
const STATUS_LABELS: Record<AgentState, string> = {
  active: 'Working',
  running: 'Running',
  idle: 'Idle',
  error: 'Error',
  offline: 'Offline',
};

// Colour config — carefully checked against WCAG 2.2 AA
// - Green (#34C759): white text fails (2.2:1). Use #248A3D text on white bg, or dark text on green bg
// - Amber (#FF9500): white text fails (2.8:1). Use dark text on amber bg
// - Red (#FF3B30): white text = 3.9:1 — fails for small text. Use white only if badge is large; else dark.
// Decision: Use coloured text on tinted backgrounds for all — safe, consistent, accessible.
const STATUS_STYLES: Record<AgentState, { badge: string; dot: string }> = {
  active: {
    badge: 'bg-[#D1FAE5] text-[#248A3D]',     // green tint bg + dark green text (passes AA)
    dot: 'bg-[#34C759]',
  },
  running: {
    badge: 'bg-[#DBEAFE] text-[#1D4ED8]',     // blue tint bg + dark blue text
    dot: 'bg-[#007AFF]',
  },
  idle: {
    badge: 'bg-[#F2F2F7] text-[#636366]',     // grey bg + secondary text
    dot: 'bg-[#8E8E93]',
  },
  error: {
    badge: 'bg-[#FEE2E2] text-[#B91C1C]',     // red tint bg + dark red text (passes AA)
    dot: 'bg-[#FF3B30]',
  },
  offline: {
    badge: 'bg-[#F2F2F7] text-[#8E8E93]',     // muted grey
    dot: 'bg-[#C7C7CC]',
  },
};

interface StatusBadgeProps {
  status: AgentState;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status];
  const styles = STATUS_STYLES[status];

  return (
    <span
      aria-label={`Status: ${label}`}
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-3 py-1 text-callout',
        styles.badge,
        className
      )}
    >
      {/* Dot indicator — decorative, colour reinforces text label */}
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full flex-shrink-0',
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
          styles.dot
        )}
      />
      {label}
    </span>
  );
}

// Also export the status labels for use in ARIA strings
export { STATUS_LABELS };
