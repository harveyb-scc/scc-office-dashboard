/**
 * AgentCard — UX spec §6.2
 * Apple-style card: emoji + name, StatusBadge, plain-English activity, last seen.
 * Click → opens AgentDetailPanel.
 * Running state: subtle border pulse animation.
 */

import { useRef } from 'react';
import type { AgentStatus } from '@/types';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: AgentStatus;
  onClick: (agent: AgentStatus, cardRef: React.RefObject<HTMLDivElement | null>) => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const statusLabel = STATUS_LABELS[agent.state];
  const taskSummary = agent.currentTask ?? 'No active task';
  const lastSeen = formatRelativeTime(agent.lastSeenAt);

  // ARIA label: "Clawdia, Working, Currently reviewing the performance brief"
  const ariaLabel = `${agent.name}, ${statusLabel}, ${taskSummary}`;

  const handleClick = () => onClick(agent, cardRef);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(agent, cardRef);
    }
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        // Base card
        'bg-[#FFFFFF] rounded-2xl p-4 min-h-[120px] lg:min-h-[140px]',
        'flex flex-col gap-3',
        'cursor-pointer select-none',
        // Hover/active
        'hover:shadow-md active:scale-[0.98] active:shadow-none',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
        // Status-specific border
        agent.state === 'error' && 'border-l-4 border-l-[#FF3B30] shadow-sm',
        agent.state !== 'error' && 'shadow-sm',
        // Running: pulse animation on the card border
        agent.state === 'running' && 'ring-1 ring-[#007AFF] card-running'
      )}
    >
      {/* Header row: emoji + name + status badge */}
      <div className="flex items-center gap-2">
        <span
          className="text-2xl leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center"
          aria-hidden="true"
        >
          {agent.emoji}
        </span>

        <span className="text-title-2 font-semibold text-[#000000] flex-1 truncate min-w-0">
          {agent.name}
        </span>

        <StatusBadge status={agent.state} size="sm" className="flex-shrink-0" />
      </div>

      {/* Current task — 2 lines max */}
      <p className="text-body text-[#636366] line-clamp-2 flex-1">
        {taskSummary}
      </p>

      {/* Footer: last seen */}
      <p className="text-caption text-[#A2A2A7]">
        Last seen {lastSeen}
      </p>
    </div>
  );
}
