/**
 * SkeletonLoader — UX spec §6.16
 * Shimmer placeholder shown while content loads. Prevents layout shift.
 * Respects prefers-reduced-motion (static grey if motion reduced).
 */

import { cn } from '@/lib/utils';

export type SkeletonVariant = 'card' | 'row' | 'text' | 'chart';

interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  className?: string;
  /**
   * Number of rows to render (for row variant in lists).
   */
  count?: number;
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton rounded-lg', className)}
    />
  );
}

/**
 * AgentCard skeleton — matches card layout (emoji + name row, task text, footer).
 */
function CardSkeleton() {
  return (
    <div className="bg-[#FFFFFF] rounded-2xl shadow-sm p-4 min-h-[120px] flex flex-col gap-3">
      {/* Header row: emoji + name + badge */}
      <div className="flex items-center gap-2">
        <SkeletonBlock className="w-8 h-8 rounded-lg flex-shrink-0" />
        <SkeletonBlock className="h-4 w-32 flex-shrink-0" />
        <SkeletonBlock className="h-5 w-16 rounded-full ml-auto flex-shrink-0" />
      </div>
      {/* Task text lines */}
      <div className="flex flex-col gap-2 flex-1">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-3/4" />
      </div>
      {/* Footer */}
      <SkeletonBlock className="h-3 w-24" />
    </div>
  );
}

/**
 * FeedEntry / AgentCostRow skeleton.
 */
function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3" aria-hidden="true">
      <SkeletonBlock className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-3 w-16 ml-auto" />
        </div>
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/**
 * Inline text placeholder.
 */
function TextSkeleton({ className }: { className?: string }) {
  return <SkeletonBlock className={cn('h-4', className)} />;
}

/**
 * Sparkline chart placeholder.
 */
function ChartSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonBlock
      className={cn('w-[120px] h-[40px] md:w-[80px] md:h-[32px]', className)}
    />
  );
}

export function SkeletonLoader({ variant = 'card', className, count = 1 }: SkeletonLoaderProps) {
  if (variant === 'card') {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </>
    );
  }

  if (variant === 'row') {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </>
    );
  }

  if (variant === 'chart') {
    return <ChartSkeleton className={className} />;
  }

  // text
  return <TextSkeleton className={className} />;
}

/**
 * Grid of 14 skeleton cards for The Floor loading state.
 */
export function FloorSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading agent status, please wait"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4"
    >
      {Array.from({ length: 14 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
