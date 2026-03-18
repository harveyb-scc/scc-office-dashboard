/**
 * EmptyState — shown when a view has no data.
 * Copy from COPY.md per-view empty state keys.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  emoji?: string;
  heading: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  emoji = '📭',
  heading,
  body,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 py-8 px-4' : 'gap-4 py-16 px-6',
        className
      )}
    >
      {emoji && (
        <span
          aria-hidden="true"
          className={cn('select-none', compact ? 'text-3xl' : 'text-5xl')}
        >
          {emoji}
        </span>
      )}
      <div className="flex flex-col gap-1 max-w-xs">
        <p className={cn('font-semibold text-[#000000]', compact ? 'text-body' : 'text-title-2')}>
          {heading}
        </p>
        {body && (
          <p className={cn('text-[#636366]', compact ? 'text-callout' : 'text-body')}>
            {body}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
