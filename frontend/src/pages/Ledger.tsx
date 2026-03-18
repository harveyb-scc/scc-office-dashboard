/**
 * The Ledger — UX spec §5.4
 * Budget progress, spend summary, provider breakdown, agent cost table, sparklines.
 * Copy from COPY.md §5.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { fetchCosts, fetchCostsHistory, queryKeys } from '@/lib/api';
import type {
  AlertLevel,
  AgentCostBreakdown,
  ProviderCostBreakdown,
  CostHistoryPoint,
  Provider,
  LedgerSortColumn,
  SortDirection,
} from '@/types';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { LastUpdated } from '@/components/ui/LastUpdated';
import { centsToDisplay, centsToPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET ALERT BANNER
// ─────────────────────────────────────────────────────────────────────────────

interface AlertBannerProps {
  alertLevel: AlertLevel;
  spentCents: number;
  remainingCents: number;
  onDismiss: () => void;
}

function AlertBanner({ alertLevel, spentCents, remainingCents, onDismiss }: AlertBannerProps) {
  if (alertLevel === 'normal') return null;

  const spent = centsToDisplay(spentCents);
  const remaining = centsToDisplay(Math.max(0, remainingCents));

  const configs = {
    amber: {
      icon: '⚠️',
      heading: 'Spending is climbing',
      body: `You've spent ${spent} this month — 80% of your $500 budget. Keep an eye on it.`,
      dismiss: 'Got it',
      classes: 'bg-[#FFF8E6] border-[#FF9500]/20 text-[#B45309]',
      headingClass: 'text-[#92400E]',
    },
    red: {
      icon: '🔴',
      heading: 'Approaching the budget limit',
      body: `${spent} spent this month — ${remaining} left before you hit your $500 limit. The biggest spenders are listed below.`,
      dismiss: 'Got it',
      classes: 'bg-[#FEE2E2] border-[#FF3B30]/20 text-[#B91C1C]',
      headingClass: 'text-[#991B1B]',
    },
    critical: {
      icon: '🚨',
      heading: 'Budget limit reached',
      body: `You've hit ${spent} this month — your $500 limit. Agent activity is continuing, but costs are now over budget. Review the table below to see where spend is concentrated.`,
      dismiss: 'Acknowledged',
      classes: 'bg-[#FEE2E2] border-[#FF3B30]/20 text-[#B91C1C]',
      headingClass: 'text-[#991B1B]',
    },
  };

  const config = configs[alertLevel];

  return (
    <div
      role="alert"
      aria-live={alertLevel === 'critical' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 px-4 py-3 mb-6 border rounded-xl',
        config.classes
      )}
    >
      <span className="text-xl flex-shrink-0" aria-hidden="true">{config.icon}</span>
      <div className="flex-1">
        <p className={cn('text-body font-semibold mb-0.5', config.headingClass)}>
          {config.heading}
        </p>
        <p className="text-callout">{config.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss budget alert"
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 -mt-1 -mr-1',
          'hover:bg-black/10 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current'
        )}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetProgressBarProps {
  spentCents: number;
  budgetCents: number;
  alertLevel: AlertLevel;
}

function BudgetProgressBar({ spentCents, budgetCents, alertLevel }: BudgetProgressBarProps) {
  const spent = centsToDisplay(spentCents);
  const pct = Math.min(100, centsToPercent(spentCents, budgetCents));
  const remaining = centsToDisplay(Math.max(0, budgetCents - spentCents));

  const fillColour = {
    normal: 'bg-[#34C759]',
    amber: 'bg-[#FF9500]',
    red: 'bg-[#FF3B30]',
    critical: 'bg-[#FF3B30] budget-fill-critical',
  }[alertLevel];

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-body font-semibold text-[#000000]">Monthly budget</span>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="text-callout text-[#636366]"
        >
          {spent} of $500
        </div>
      </div>

      {/* Progress track */}
      <div
        role="progressbar"
        aria-valuenow={spentCents}
        aria-valuemin={0}
        aria-valuemax={budgetCents}
        aria-label={`Monthly budget: ${spent} of $500, ${pct}% used`}
        className="h-3 bg-[#E5E5EA] rounded-full overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-[600ms] ease-in-out',
            fillColour
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-caption text-[#A2A2A7]">{remaining} left</span>
        <span className="text-caption text-[#A2A2A7]">{pct}% used</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEND SUMMARY ROW (2×2 on mobile, 4-col on desktop)
// ─────────────────────────────────────────────────────────────────────────────

interface SpendSummaryProps {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  allTimeCents: number;
}

function SpendSummary({ todayCents, weekCents, monthCents, allTimeCents }: SpendSummaryProps) {
  const items = [
    { label: 'Today', value: centsToDisplay(todayCents) },
    { label: 'This week', value: centsToDisplay(weekCents) },
    { label: 'This month', value: centsToDisplay(monthCents) },
    { label: 'All time', value: centsToDisplay(allTimeCents) },
  ];

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-[#FFFFFF] rounded-2xl p-4 shadow-sm">
          <dt className="text-caption text-[#A2A2A7] mb-1">{label}</dt>
          <dd className="text-title-2 font-semibold text-[#000000]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPARKLINE CHART (pure SVG, no chart library)
// ─────────────────────────────────────────────────────────────────────────────

interface SparklineProps {
  points: CostHistoryPoint[];
  provider: Provider;
  width?: number;
  height?: number;
}

function Sparkline({ points, provider, width = 120, height = 40 }: SparklineProps) {
  if (!points || points.length === 0) {
    return (
      <svg
        role="img"
        aria-label={`${provider} hourly spend chart unavailable`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="flex-shrink-0"
      >
        <line
          x1="0" y1={height / 2}
          x2={width} y2={height / 2}
          stroke="#D1D1D6"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const values = points.map((p) => p.costCents);
  const max = Math.max(...values, 1); // avoid div/0
  const min = 0;

  // Build path
  const stepX = width / Math.max(points.length - 1, 1);
  const coords = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / (max - min)) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = coords.length === 1
    ? `M ${coords[0]} L ${coords[0]}`
    : `M ${coords.join(' L ')}`;

  // Area fill
  const areaD = `M ${coords[0]} L ${coords.join(' L ')} L ${(values.length - 1) * stepX},${height} L 0,${height} Z`;

  const strokeColour = {
    anthropic: '#FF6B35',
    gemini: '#4285F4',
    openai: '#10A37F',
  }[provider] ?? '#007AFF';

  const fillColour = strokeColour + '22'; // 13% opacity

  return (
    <svg
      role="img"
      aria-label={`${provider} hourly spend over the last 24 hours`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="flex-shrink-0 overflow-visible"
    >
      {/* Area fill */}
      <path d={areaD} fill={fillColour} />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColour}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER ROW
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_DISPLAY: Record<Provider, { label: string; icon: string }> = {
  anthropic: { label: 'Anthropic', icon: '🤖' },
  gemini: { label: 'Google Gemini', icon: '💫' },
  openai: { label: 'OpenAI', icon: '🧠' },
};

interface ProviderRowProps {
  breakdown: ProviderCostBreakdown;
  sparklinePoints: CostHistoryPoint[];
}

function ProviderRow({ breakdown, sparklinePoints }: ProviderRowProps) {
  const display = PROVIDER_DISPLAY[breakdown.provider] ?? {
    label: breakdown.provider,
    icon: '🔌',
  };

  return (
    <div className="flex items-center gap-4 py-3 border-b border-[#F2F2F7] last:border-none">
      <span className="text-xl flex-shrink-0" aria-hidden="true">{display.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-[#000000] truncate">{display.label}</p>
        <p className="text-callout text-[#636366]">{centsToDisplay(breakdown.costCents)} this month</p>
      </div>
      <Sparkline
        points={sparklinePoints}
        provider={breakdown.provider}
        width={80}
        height={32}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT COST TABLE
// ─────────────────────────────────────────────────────────────────────────────

interface AgentCostTableProps {
  agents: AgentCostBreakdown[];
}

function AgentCostTable({ agents }: AgentCostTableProps) {
  const [sortCol, setSortCol] = useState<LedgerSortColumn>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  const handleSort = (col: LedgerSortColumn) => {
    if (col === sortCol) {
      const newDir = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(newDir);
      setSortAnnouncement(
        `Agent table sorted by ${col}, ${newDir === 'asc' ? 'ascending' : 'descending'}`
      );
    } else {
      setSortCol(col);
      setSortDir('asc');
      setSortAnnouncement(`Agent table sorted by ${col}, ascending`);
    }
  };

  // Sort agents by the appropriate time-windowed cost field or name.
  const sorted = [...agents].sort((a, b) => {
    let comparison: number;
    if (sortCol === 'name') {
      comparison = a.agentName.localeCompare(b.agentName);
    } else if (sortCol === 'today') {
      comparison = a.todayCostCents - b.todayCostCents;
    } else if (sortCol === 'week') {
      comparison = a.weekCostCents - b.weekCostCents;
    } else {
      // 'month'
      comparison = a.monthCostCents - b.monthCostCents;
    }
    return sortDir === 'asc' ? comparison : -comparison;
  });

  const SortIcon = ({ col }: { col: LedgerSortColumn }) => {
    if (sortCol !== col) return <ChevronUp className="w-3 h-3 opacity-30" aria-hidden="true" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3" aria-hidden="true" />
      : <ChevronDown className="w-3 h-3" aria-hidden="true" />;
  };

  const getAriaSort = (col: LedgerSortColumn): 'ascending' | 'descending' | 'none' => {
    if (sortCol !== col) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const SortButton = ({ col, label }: { col: LedgerSortColumn; label: string }) => (
    <th
      scope="col"
      aria-sort={getAriaSort(col)}
      className="text-left"
    >
      <button
        type="button"
        onClick={() => handleSort(col)}
        className={cn(
          'flex items-center gap-1 text-caption font-semibold uppercase tracking-wide',
          'hover:text-[#000000] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] rounded',
          'min-h-[44px] px-2 -mx-2',
          sortCol === col ? 'text-[#000000]' : 'text-[#A2A2A7]'
        )}
      >
        {label}
        <SortIcon col={col} />
      </button>
    </th>
  );

  return (
    <div className="bg-[#FFFFFF] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E5EA]">
        <h2 className="text-title-2 font-semibold text-[#000000]">By agent</h2>
      </div>

      {/* Screen reader sort announcement */}
      <div aria-live="polite" className="sr-only">{sortAnnouncement}</div>

      <div className="table-scroll">
        <table className="w-full min-w-[400px]" role="table">
          <thead>
            <tr className="border-b border-[#E5E5EA]">
              <th scope="col" className="text-left pl-4 pr-2 py-3">
                <span className="text-caption font-semibold uppercase tracking-wide text-[#A2A2A7]">
                  Agent
                </span>
              </th>
              <td className="w-4" />
              <SortButton col="today" label="Today" />
              <SortButton col="week" label="This week" />
              <SortButton col="month" label="This month" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent) => (
              <tr
                key={agent.agentId}
                className="border-b border-[#F2F2F7] last:border-none hover:bg-[#F9F9FB] transition-colors"
              >
                <td className="pl-4 pr-2 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">
                      {agent.agentEmoji}
                    </span>
                    <span className="text-body font-medium text-[#000000] whitespace-nowrap">
                      {agent.agentName}
                    </span>
                  </div>
                </td>
                <td className="w-4" />
                <td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap">
                  {centsToDisplay(agent.todayCostCents)}
                </td>
                <td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap">
                  {centsToDisplay(agent.weekCostCents)}
                </td>
                <td className="px-2 py-3 text-body text-[#636366] whitespace-nowrap pr-4">
                  {centsToDisplay(agent.monthCostCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Ledger() {
  const [alertDismissed, setAlertDismissed] = useState<AlertLevel | null>(() => {
    try {
      return (sessionStorage.getItem('scc_alert_dismissed') as AlertLevel | null);
    } catch {
      return null;
    }
  });

  const {
    data,
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: queryKeys.costs,
    queryFn: fetchCosts,
    refetchInterval: 60_000,
  });

  // Fetch per-provider history for sparklines (last 24 hours).
  // Each provider gets its own query so the sparklines show provider-specific data,
  // not the global aggregate (which would make all three charts identical).
  const { data: anthropicHistory } = useQuery({
    queryKey: queryKeys.costsHistory({ hours: 24, provider: 'anthropic' }),
    queryFn: () => fetchCostsHistory({ hours: 24, provider: 'anthropic' }),
    refetchInterval: 60_000,
    throwOnError: false,
  });
  const { data: geminiHistory } = useQuery({
    queryKey: queryKeys.costsHistory({ hours: 24, provider: 'gemini' }),
    queryFn: () => fetchCostsHistory({ hours: 24, provider: 'gemini' }),
    refetchInterval: 60_000,
    throwOnError: false,
  });
  const { data: openaiHistory } = useQuery({
    queryKey: queryKeys.costsHistory({ hours: 24, provider: 'openai' }),
    queryFn: () => fetchCostsHistory({ hours: 24, provider: 'openai' }),
    refetchInterval: 60_000,
    throwOnError: false,
  });

  const lastSuccessTime = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const handleDismiss = () => {
    const level = data?.budget.alertLevel ?? 'normal';
    setAlertDismissed(level);
    try {
      sessionStorage.setItem('scc_alert_dismissed', level);
    } catch {
      // sessionStorage unavailable
    }
  };

  // Reset dismissed state if alert level changes (e.g. crosses new threshold)
  const currentAlertLevel = data?.budget.alertLevel ?? 'normal';
  const showAlert =
    currentAlertLevel !== 'normal' &&
    alertDismissed !== currentAlertLevel;

  if (isLoading) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
        <h1 className="text-display font-bold text-[#000000] mb-6">The Ledger</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-24" />
          ))}
        </div>
        <SkeletonLoader variant="card" className="h-16 mb-6" />
        <SkeletonLoader variant="card" className="h-40 mb-6" />
        <SkeletonLoader variant="card" className="h-64" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
        <h1 className="text-display font-bold text-[#000000] mb-6">The Ledger</h1>
        <ErrorState
          heading="Couldn't load cost data"
          body="The Ledger can't reach the cost API right now."
          actionLabel="Try again"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // No data at all (new install)
  if (!data) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
        <h1 className="text-display font-bold text-[#000000] mb-6">The Ledger</h1>
        <EmptyState
          emoji="💰"
          heading="No spending yet"
          body="Costs will appear here as agents run tasks."
        />
      </div>
    );
  }

  // Map each provider to its fetched history points.
  // Each provider's sparkline now shows provider-specific spend, not the global aggregate.
  const providerHistoryMap: Record<Provider, CostHistoryPoint[]> = {
    anthropic: anthropicHistory?.points ?? [],
    gemini: geminiHistory?.points ?? [],
    openai: openaiHistory?.points ?? [],
  };

  const getProviderHistory = (provider: Provider): CostHistoryPoint[] => {
    return providerHistoryMap[provider] ?? [];
  };

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-[1200px] mx-auto">
      {/* Page header */}
      <header className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-display font-bold text-[#000000]">The Ledger</h1>
        <LastUpdated dataFreshAt={lastSuccessTime} failed={isError} />
      </header>

      {/* Budget alert banner */}
      {showAlert && (
        <AlertBanner
          alertLevel={currentAlertLevel}
          spentCents={data.budget.spentCents}
          remainingCents={data.budget.remainingCents}
          onDismiss={handleDismiss}
        />
      )}

      {/* Spend summary (2×2 on mobile, 4-col on desktop) */}
      <SpendSummary
        todayCents={data.totals.today.costCents}
        weekCents={data.totals.week.costCents}
        monthCents={data.totals.month.costCents}
        allTimeCents={data.totals.allTime.costCents}
      />

      {/* Budget progress bar */}
      <div className="bg-[#FFFFFF] rounded-2xl shadow-sm p-4 mb-6">
        <BudgetProgressBar
          spentCents={data.budget.spentCents}
          budgetCents={data.budget.budgetCents}
          alertLevel={data.budget.alertLevel}
        />
      </div>

      {/* Two-column layout on desktop */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Provider breakdown */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="bg-[#FFFFFF] rounded-2xl shadow-sm p-4">
            <h2 className="text-title-2 font-semibold text-[#000000] mb-3">By provider</h2>
            {data.byProvider.length === 0 ? (
              <p className="text-callout text-[#636366]">No provider data yet.</p>
            ) : (
              <div>
                {data.byProvider.map((provider) => (
                  <ProviderRow
                    key={provider.provider}
                    breakdown={provider}
                    sparklinePoints={getProviderHistory(provider.provider)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent cost table */}
        <div className="flex-1 min-w-0">
          {data.byAgent.length === 0 ? (
            <div className="bg-[#FFFFFF] rounded-2xl shadow-sm p-4">
              <h2 className="text-title-2 font-semibold text-[#000000] mb-3">By agent</h2>
              <EmptyState
                emoji="📊"
                heading="No agent cost data yet"
                body="Costs will appear here as agents run tasks."
                compact
              />
            </div>
          ) : (
            <AgentCostTable agents={data.byAgent} />
          )}
        </div>
      </div>
    </div>
  );
}
