/**
 * ErrorState — full-view or inline error with retry button.
 * Uses copy from COPY.md §7.
 */

import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  heading?: string;
  body?: string;
  actionLabel?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  heading = 'Something didn\'t load',
  body = 'There was a problem fetching this data.',
  actionLabel = 'Try again',
  onRetry,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="status"
      aria-label={heading}
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 py-6 px-4' : 'gap-4 py-16 px-6',
        className
      )}
    >
      <div
        className={cn(
          'rounded-full bg-[#FEE2E2] flex items-center justify-center flex-shrink-0',
          compact ? 'w-10 h-10' : 'w-14 h-14'
        )}
        aria-hidden="true"
      >
        <AlertTriangle
          className={cn('text-[#B91C1C]', compact ? 'w-5 h-5' : 'w-7 h-7')}
        />
      </div>

      <div className="flex flex-col gap-1 max-w-xs">
        <p className={cn('font-semibold text-[#000000]', compact ? 'text-body' : 'text-title-2')}>
          {heading}
        </p>
        <p className={cn('text-[#636366]', compact ? 'text-callout' : 'text-body')}>
          {body}
        </p>
      </div>

      {onRetry && (
        <Button
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          onClick={onRetry}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
