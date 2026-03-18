/**
 * AgentDetailPanel — UX spec §6.4
 * Mobile: bottom sheet (slides up, drag to dismiss)
 * Desktop: right-side panel (400px wide)
 * Focus management: trap on open, restore on close.
 */

import {
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchAgentDetail, queryKeys } from '@/lib/api';
import type { AgentId, AgentStatus, FeedEntry } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime, formatAbsoluteTime, formatFullTimestamp, centsToDisplay } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// MINI FEED ENTRY (inside panel)
// ─────────────────────────────────────────────────────────────────────────────

function MiniFeedEntry({ entry }: { entry: FeedEntry }) {
  const relTime = formatRelativeTime(entry.occurredAt);
  const absTime = formatAbsoluteTime(entry.occurredAt);
  const fullTime = formatFullTimestamp(entry.occurredAt);

  return (
    <li className="flex items-start gap-2 py-2">
      <span className="text-base leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
        {entry.agentEmoji}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <time
            dateTime={entry.occurredAt}
            aria-label={fullTime}
            title={absTime}
            className="text-caption text-[#A2A2A7] flex-shrink-0"
          >
            {relTime}
          </time>
        </div>
        <p className="text-callout text-[#636366] mt-0.5">{entry.summary}</p>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL CONTENT
// ─────────────────────────────────────────────────────────────────────────────

interface PanelContentProps {
  agentId: AgentId;
  onClose: () => void;
}

function PanelContent({ agentId, onClose }: PanelContentProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.agentDetail(agentId),
    queryFn: () => fetchAgentDetail(agentId),
    // Panel data doesn't need 60s auto-refresh — it's a detail view
    refetchInterval: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <SkeletonLoader variant="text" className="h-6 w-48" />
        <SkeletonLoader variant="text" className="h-4 w-32" />
        <SkeletonLoader variant="card" className="h-24" />
        <SkeletonLoader variant="row" count={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        heading={`Couldn't load details`}
        body="The data didn't come through."
        actionLabel="Try again"
        onRetry={() => void refetch()}
      />
    );
  }

  const { agent, recentActivity, costs } = data;
  const lastSeen = formatRelativeTime(agent.lastSeenAt);

  // Section label: "Right now" vs "Last task"
  const taskSectionLabel =
    agent.state === 'active' || agent.state === 'running' ? 'Right now' : 'Last task';

  const taskText = agent.currentTask ?? (
    agent.state === 'idle'
      ? `Nothing to show yet — ${agent.name} hasn't run any tasks today.`
      : 'No active task'
  );

  return (
    <div className="flex flex-col gap-0 overflow-y-auto flex-1">
      {/* Agent header */}
      <div className="px-6 pt-6 pb-4 border-b border-[#E5E5EA]">
        <div className="flex items-start gap-3">
          <span className="text-4xl leading-none flex-shrink-0 mt-1" aria-hidden="true">
            {agent.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-title-1 font-semibold text-[#000000]">{agent.name}</h2>
            <div className="mt-1">
              <StatusBadge status={agent.state} size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* Current / last task */}
      <section className="px-6 py-4 border-b border-[#E5E5EA]">
        <h3 className="text-caption font-semibold text-[#A2A2A7] uppercase tracking-wide mb-2">
          {taskSectionLabel}
        </h3>
        <p className="text-body text-[#000000]">{taskText}</p>
        {agent.state === 'error' && (
          <p className="text-callout text-[#636366] mt-2">
            This agent hit an error on its last task. It may recover on its own — check The Feed for details, or restart the agent if it stays red.
          </p>
        )}
      </section>

      {/* Stats row */}
      <section className="px-6 py-4 border-b border-[#E5E5EA]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-caption font-semibold text-[#A2A2A7] uppercase tracking-wide mb-1">
              Last seen
            </p>
            <p className="text-callout text-[#000000]">{lastSeen}</p>
          </div>
          <div>
            <p className="text-caption font-semibold text-[#A2A2A7] uppercase tracking-wide mb-1">
              Spent today
            </p>
            <p className="text-callout text-[#000000]">{centsToDisplay(costs.today.costCents)}</p>
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="px-6 py-4 flex-1">
        <h3 className="text-caption font-semibold text-[#A2A2A7] uppercase tracking-wide mb-3">
          Recent activity
        </h3>

        {recentActivity.length === 0 ? (
          <EmptyState
            emoji="💤"
            heading={`Nothing to show yet`}
            body={`${agent.name} hasn't run any tasks today.`}
            compact
          />
        ) : (
          <ul className="divide-y divide-[#F2F2F7]" role="list">
            {recentActivity.slice(0, 5).map((entry) => (
              <MiniFeedEntry key={entry.key} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {/* Footer: View full history */}
      <div className="px-6 py-4 border-t border-[#E5E5EA]">
        <Link
          to={`/feed?agent=${agentId}`}
          onClick={onClose}
          className="text-body text-[#007AFF] hover:underline inline-flex items-center gap-1
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] rounded"
        >
          View full history
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FOCUS TRAP HOOK
// ─────────────────────────────────────────────────────────────────────────────

function useFocusTrap(containerRef: RefObject<HTMLElement | null | undefined>, isOpen: boolean) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !containerRef.current) return;
      const container = containerRef.current as HTMLElement;

      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    },
    [containerRef, isOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface AgentDetailPanelProps {
  agent: AgentStatus | null;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLDivElement | null>;
}

export function AgentDetailPanel({ agent, isOpen, onClose, triggerRef }: AgentDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap — cast to satisfy union type
  useFocusTrap(panelRef as RefObject<HTMLElement | null | undefined>, isOpen);

  // Move focus to close button when panel opens; restore to trigger on close
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow animation
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Restore focus to trigger
      triggerRef.current?.focus();
    }
  }, [isOpen, triggerRef]);

  // Escape key closes panel
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent background scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !agent) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 lg:bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} details`}
        className={cn(
          'fixed z-50 bg-[#FFFFFF] flex flex-col',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 rounded-t-2xl max-h-[90vh]',
          'sheet-enter',
          // Desktop: right panel
          'lg:bottom-0 lg:top-0 lg:left-auto lg:right-0 lg:w-[400px]',
          'lg:rounded-none lg:rounded-l-2xl lg:max-h-full lg:h-full',
          'lg:panel-enter',
          'shadow-lg'
        )}
      >
        {/* Drag handle (mobile only) */}
        <div className="lg:hidden flex justify-center pt-3 pb-1" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-[#D1D1D6]" />
        </div>

        {/* Close button */}
        <div className="flex items-center justify-end px-4 pt-2 lg:pt-4">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${agent.name} details`}
            className={cn(
              'w-11 h-11 flex items-center justify-center rounded-full',
              'text-[#636366] hover:bg-[#F2F2F7] hover:text-[#000000]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]'
            )}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <PanelContent agentId={agent.id} onClose={onClose} />
      </div>
    </>
  );
}
