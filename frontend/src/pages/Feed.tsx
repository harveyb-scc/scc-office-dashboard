/**
 * The Feed — UX spec §5.5
 * Activity timeline, agent filter chips, load-more pagination.
 * Copy from COPY.md §6.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchFeed, queryKeys } from '@/lib/api';
import type { AgentId, FeedEntry } from '@/types';
import { AGENT_ROSTER, formatFeedDate, formatFeedTime, formatAbsoluteTime, formatFullTimestamp } from '@/lib/utils';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// FEED ENTRY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface FeedEntryProps {
  entry: FeedEntry;
  isLast: boolean;
}

function FeedEntryItem({ entry, isLast }: FeedEntryProps) {
  const [showAbsolute, setShowAbsolute] = useState(false);
  const relTime = formatFeedTime(entry.occurredAt);
  const absTime = formatAbsoluteTime(entry.occurredAt);
  const fullTime = formatFullTimestamp(entry.occurredAt);

  return (
    <article
      role="listitem"
      className="flex items-start gap-3 py-3 relative"
    >
      {/* Timeline connector */}
      {!isLast && (
        <div
          className="absolute left-4 top-10 bottom-0 w-0.5 bg-[#E5E5EA]"
          aria-hidden="true"
        />
      )}

      {/* Agent emoji in circle */}
      <div
        className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 z-10"
        aria-hidden="true"
      >
        <span className="text-sm leading-none">{entry.agentEmoji}</span>
      </div>

      {/* Entry content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-body font-semibold text-[#000000]">{entry.agentName}</span>
          <time
            dateTime={entry.occurredAt}
            aria-label={fullTime}
            title={absTime}
            onClick={() => setShowAbsolute((s) => !s)}
            onMouseEnter={() => setShowAbsolute(true)}
            onMouseLeave={() => setShowAbsolute(false)}
            className="text-caption text-[#A2A2A7] cursor-default hover:text-[#636366] transition-colors"
          >
            {showAbsolute ? absTime : relTime}
          </time>
        </div>
        <p className="text-body text-[#636366]">{entry.summary}</p>
        {entry.detail && (
          <p className="text-callout text-[#A2A2A7] mt-0.5">{entry.detail}</p>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER CHIPS
// ─────────────────────────────────────────────────────────────────────────────

interface FilterChipsProps {
  selectedAgent: AgentId | null;
  onSelect: (agentId: AgentId | null) => void;
  resultCount?: number;
}

function FilterChips({ selectedAgent, onSelect, resultCount }: FilterChipsProps) {
  const [announcement, setAnnouncement] = useState('');

  const handleSelect = (agentId: AgentId | null) => {
    onSelect(agentId);
    const agentMeta = agentId ? AGENT_ROSTER.find((a) => a.id === agentId) : null;
    if (agentId && agentMeta) {
      setAnnouncement(`Showing ${resultCount ?? 0} entries for ${agentMeta.name}`);
    } else {
      setAnnouncement(`Showing ${resultCount ?? 0} entries for all agents`);
    }
  };

  // Handle arrow key navigation between chips (ARIA tablist pattern)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    total: number
  ) => {
    const chips = document.querySelectorAll<HTMLElement>('[data-filter-chip]');
    if (e.key === 'ArrowRight' && index < total - 1) {
      e.preventDefault();
      chips[index + 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      chips[index - 1]?.focus();
    }
  };

  const chips = [
    { id: null, label: 'All agents', emoji: null },
    ...AGENT_ROSTER.map((a) => ({ id: a.id as AgentId, label: a.name, emoji: a.emoji })),
  ];

  return (
    <div className="mb-6">
      {/* Screen reader announcement */}
      <div aria-live="polite" className="sr-only">{announcement}</div>

      <div
        role="tablist"
        aria-label="Filter activity by agent"
        className="chips-scroll flex gap-2 pb-2"
      >
        {chips.map(({ id, label, emoji }, index) => {
          const isSelected = id === selectedAgent;
          const chipLabel = emoji ? `${emoji} ${label}` : label;
          const ariaLabel = isSelected
            ? (id ? `${label}, selected` : 'All agents, selected')
            : (id ? `${label}, not selected` : 'All agents, not selected');

          return (
            <button
              key={id ?? 'all'}
              type="button"
              role="tab"
              data-filter-chip
              aria-selected={isSelected}
              aria-label={ariaLabel}
              onClick={() => handleSelect(id)}
              onKeyDown={(e) => handleKeyDown(e, index, chips.length)}
              className={cn(
                'chip-snap flex-shrink-0 inline-flex items-center gap-1.5',
                'px-3 h-9 rounded-full text-callout font-medium whitespace-nowrap',
                'transition-all duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
                'min-w-[44px] min-h-[44px]',
                isSelected
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-[#FFFFFF] text-[#636366] hover:bg-[#F2F2F7] shadow-sm'
              )}
            >
              {emoji && <span aria-hidden="true">{emoji}</span>}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FEED PAGE
// ─────────────────────────────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 50;

export default function Feed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<FeedEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Pre-select agent from ?agent= query param (from AgentDetailPanel "View full history")
  const agentParam = searchParams.get('agent') as AgentId | null;
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(agentParam);

  // Reset pagination when filter changes
  useEffect(() => {
    setCursor(null);
    setAllEntries([]);
    setHasMore(false);
  }, [selectedAgent]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.feed({ agentId: selectedAgent, limit: FEED_PAGE_SIZE, cursor }),
    queryFn: () => fetchFeed({ agentId: selectedAgent, limit: FEED_PAGE_SIZE, cursor }),
    refetchInterval: 60_000,
    // Don't replace previous entries on refetch — append
    placeholderData: (prev) => prev,
  });

  // Append new entries when data arrives
  useEffect(() => {
    if (!data) return;
    if (cursor === null) {
      // First page — reset
      setAllEntries(data.entries);
    } else {
      // Subsequent pages — append
      setAllEntries((prev) => {
        const existingKeys = new Set(prev.map((e) => e.key));
        const newEntries = data.entries.filter((e) => !existingKeys.has(e.key));
        return [...prev, ...newEntries];
      });
    }
    setHasMore(data.nextCursor !== null);
  }, [data, cursor]);

  const handleFilterChange = useCallback((agentId: AgentId | null) => {
    setSelectedAgent(agentId);
    // Update URL query param
    if (agentId) {
      setSearchParams({ agent: agentId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  const selectedAgentMeta = selectedAgent
    ? AGENT_ROSTER.find((a) => a.id === selectedAgent)
    : null;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[800px] mx-auto">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-display font-bold text-[#000000] mb-1">The Feed</h1>
        <p className="text-callout text-[#A2A2A7]">{formatFeedDate()}</p>
      </header>

      {/* Filter chips */}
      <FilterChips
        selectedAgent={selectedAgent}
        onSelect={handleFilterChange}
        resultCount={allEntries.length}
      />

      {/* Loading state — initial */}
      {isLoading && cursor === null && (
        <div aria-busy="true" aria-label="Loading activity">
          <SkeletonLoader variant="row" count={5} />
        </div>
      )}

      {/* Error state */}
      {isError && allEntries.length === 0 && (
        <ErrorState
          heading="Couldn't load activity"
          body="The Feed can't reach the log right now."
          actionLabel="Try again"
          onRetry={() => void refetch()}
        />
      )}

      {/* Empty state */}
      {!isLoading && !isError && allEntries.length === 0 && (
        <>
          {selectedAgent && selectedAgentMeta ? (
            <EmptyState
              emoji="💤"
              heading={`${selectedAgentMeta.name} hasn't logged anything today`}
              body="Switch to All agents to see what the rest of the team has been up to."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFilterChange(null)}
                >
                  All agents
                </Button>
              }
            />
          ) : (
            <EmptyState
              emoji="📭"
              heading="Nothing's happened yet today"
              body="Agent activity will appear here as it happens."
            />
          )}
        </>
      )}

      {/* Feed timeline */}
      {allEntries.length > 0 && (
        <ul role="list" className="divide-y divide-transparent list-none">
          {allEntries.map((entry, i) => (
            <FeedEntryItem
              key={entry.key}
              entry={entry}
              isLast={i === allEntries.length - 1}
            />
          ))}
        </ul>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={handleLoadMore}
            loading={isFetching && cursor !== null}
          >
            Load more
          </Button>
        </div>
      )}

      {/* End of feed */}
      {!hasMore && allEntries.length > 0 && !isFetching && (
        <p className="text-callout text-[#A2A2A7] text-center mt-6">
          That's everything for today
        </p>
      )}
    </div>
  );
}
