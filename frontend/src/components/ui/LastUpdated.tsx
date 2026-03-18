/**
 * LastUpdatedIndicator — UX spec §6.15
 * Shows when data was last successfully fetched.
 * Updates each poll cycle. aria-live="polite".
 * Copy from COPY.md: FLOOR_LAST_UPDATED_* keys.
 */

import { useState, useEffect } from 'react';
import { formatLastUpdated } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface LastUpdatedProps {
  dataFreshAt: Date | null;
  failed?: boolean;
  className?: string;
}

export function LastUpdated({ dataFreshAt, failed = false, className }: LastUpdatedProps) {
  const [, forceUpdate] = useState(0);

  // Re-render every 10 seconds to keep relative time fresh
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const text = formatLastUpdated(dataFreshAt, failed);
  const isFailed = failed || text.includes('failed');

  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Last updated ${text}`}
      className={cn(
        'text-caption',
        isFailed ? 'text-[#FF9500]' : 'text-[#A2A2A7]',
        className
      )}
    >
      {text}
    </p>
  );
}
