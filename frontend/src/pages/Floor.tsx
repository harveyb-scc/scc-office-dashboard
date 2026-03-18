/**
 * The Floor — UX spec §5.2
 * Agent grid, 60s auto-refresh, loading/error/empty/stale states.
 * Copy from COPY.md §3.
 */

import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { fetchAgents, queryKeys } from '@/lib/api';
import type { AgentStatus } from '@/types';
import { AgentCard } from '@/components/AgentCard';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { FloorSkeleton } from '@/components/ui/SkeletonLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { LastUpdated } from '@/components/ui/LastUpdated';
import { Button } from '@/components/ui/Button';
import { cn, formatRelativeTime } from '@/lib/utils';

export default function Floor() {
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    dataUpdatedAt,
    failureCount,
  } = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchAgents,
    refetchInterval: 60_000,
  });

  // Track last successful update time
  const lastSuccessTime = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const hasFailed = isError || failureCount > 0;

  const handleCardClick = useCallback(
    (agent: AgentStatus, cardRef: React.RefObject<HTMLDivElement | null>) => {
      setSelectedAgent(agent);
      setPanelOpen(true);
      // Store the trigger ref for focus restoration
      (triggerRef as React.MutableRefObject<HTMLDivElement | null>).current = cardRef.current;
    },
    []
  );

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false);
    // Focus restoration handled in AgentDetailPanel via triggerRef
  }, []);

  const agents = data?.agents ?? [];
  const isStale = !isLoading && hasFailed && agents.length > 0;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[1600px] mx-auto">
      {/* Page header */}
      <header className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-display font-bold text-[#000000]">The Floor</h1>
            {agents.length > 0 && (
              <span className="text-callout text-[#636366] mt-1">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          {/* Manual refresh button */}
          <button
            type="button"
            onClick={() => { void refetch(); }}
            disabled={isFetching}
            aria-label="Refresh agent status"
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-xl',
              'text-[#636366] hover:bg-[#F2F2F7] hover:text-[#000000]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isFetching && 'animate-spin'
            )}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Last updated */}
          <LastUpdated dataFreshAt={lastSuccessTime} failed={isError && agents.length === 0} />
        </div>
      </header>

      {/* Stale data warning banner */}
      {isStale && (
        <div
          role="status"
          className="flex items-center gap-2 mb-4 px-4 py-3 bg-[#FFF8E6] border border-[#FF9500]/20 rounded-xl"
        >
          <span aria-hidden="true" className="text-[#FF9500]">⚠</span>
          <p className="text-callout text-[#B45309]">
            Data may be outdated — last updated{' '}
            {lastSuccessTime
              ? formatRelativeTime(lastSuccessTime.toISOString()).toLowerCase()
              : 'some time ago'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <FloorSkeleton />}

      {/* Full error state (no data at all) */}
      {isError && agents.length === 0 && (
        <ErrorState
          heading="Couldn't load agent status"
          body="The dashboard lost contact with the server. Your agents are likely still running — this is a display issue, not an outage."
          actionLabel="Try again"
          onRetry={() => void refetch()}
        />
      )}

      {/* Empty state (data loaded but no agents — shouldn't happen with fixed roster) */}
      {!isLoading && !isError && agents.length === 0 && (
        <EmptyState
          emoji="🏢"
          heading="No agents found"
          body="The agent roster hasn't loaded. Try refreshing the page."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Refresh
            </Button>
          }
        />
      )}

      {/* Agent grid */}
      {agents.length > 0 && (
        <ul
          aria-label="Agent status grid"
          aria-busy={isLoading}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 list-none"
          role="list"
        >
          {agents.map((agent) => (
            <li key={agent.id} className="list-none">
              <AgentCard
                agent={agent}
                onClick={handleCardClick}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Agent detail panel */}
      <AgentDetailPanel
        agent={selectedAgent}
        isOpen={panelOpen}
        onClose={handlePanelClose}
        triggerRef={triggerRef}
      />
    </div>
  );
}
