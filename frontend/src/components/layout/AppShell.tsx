/**
 * AppShell — UX spec §6.1
 * Persistent outer wrapper: navigation + content area.
 * - Mobile/tablet (<1024px): bottom tab bar
 * - Desktop (≥1024px): left nav rail (icon-only at 1024px, labels at 1200px+)
 * Budget indicator in nav (amber/red/pulsing dot based on alert level).
 */

import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, DollarSign, ListChecks, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCosts, queryKeys } from '@/lib/api';
import type { AlertLevel } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ─────────────────────────────────────────────────────────────────────────────
// NAV ITEMS
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    to: '/',
    label: 'The Floor',
    Icon: Building2,
    exact: true,
  },
  {
    to: '/ledger',
    label: 'The Ledger',
    Icon: DollarSign,
    exact: false,
  },
  {
    to: '/feed',
    label: 'The Feed',
    Icon: ListChecks,
    exact: false,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET INDICATOR DOT
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetDotProps {
  alertLevel: AlertLevel;
}

const BUDGET_DOT_ARIA: Record<AlertLevel, string> = {
  normal: '',
  amber: 'Budget warning — spending is high',
  red: 'Budget alert — approaching limit',
  critical: 'Budget limit reached',
};

function BudgetDot({ alertLevel }: BudgetDotProps) {
  if (alertLevel === 'normal') return null;

  const ariaLabel = BUDGET_DOT_ARIA[alertLevel];

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full',
        alertLevel === 'amber' && 'bg-[#FF9500]',
        alertLevel === 'red' && 'bg-[#FF3B30]',
        alertLevel === 'critical' && 'bg-[#FF3B30] animate-pulse'
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT CONFIRMATION MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface LogoutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function LogoutModal({ onConfirm, onCancel, isLoading }: LogoutModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign out?"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative z-10 bg-[#FFFFFF] rounded-2xl shadow-lg p-6 mx-4 w-full max-w-sm">
        <h2 className="text-title-2 font-semibold text-[#000000] mb-1">Sign out?</h2>
        <p className="text-body text-[#636366] mb-6">
          You'll need to sign back in to view the dashboard.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={onConfirm}
            loading={isLoading}
            autoFocus
          >
            Sign out
          </Button>
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { logout } = useAuth();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Fetch cost summary to get budget alert level for nav indicator
  const { data: costsData } = useQuery({
    queryKey: queryKeys.costs,
    queryFn: fetchCosts,
    // Don't throw — nav indicator is optional, silently degrade
    throwOnError: false,
  });

  const alertLevel: AlertLevel = costsData?.budget.alertLevel ?? 'normal';

  const handleLogoutClick = () => setShowLogoutConfirm(true);
  const handleLogoutCancel = () => setShowLogoutConfirm(false);
  const handleLogoutConfirm = async () => {
    setLogoutLoading(true);
    try {
      await logout();
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
    }
  };

  // Helper: is this nav item active?
  const isActive = (to: string, exact: boolean) => {
    if (exact) return currentPath === to;
    return currentPath.startsWith(to);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* ─── Desktop Nav Rail (≥1024px) ─── */}
      <nav
        aria-label="Main navigation"
        className="hidden lg:flex flex-col fixed left-0 top-0 h-full bg-[#FFFFFF] border-r border-[#E5E5EA] z-40
          w-16 xl:w-[220px] transition-all duration-200"
      >
        {/* Logo / App name */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-[#E5E5EA] min-h-[64px]">
          <span className="text-2xl flex-shrink-0" aria-hidden="true">🏢</span>
          <span className="hidden xl:block text-title-2 font-semibold text-[#000000] truncate">
            The Office
          </span>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 p-2 flex-1">
          {NAV_ITEMS.map(({ to, label, Icon, exact }) => {
            const active = isActive(to, exact);
            const isLedger = to === '/ledger';

            return (
              <NavLink
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px]',
                  'transition-all duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
                  active
                    ? 'bg-[#EBF3FF] text-[#007AFF]'
                    : 'text-[#636366] hover:bg-[#F2F2F7] hover:text-[#000000]'
                )}
              >
                <span className="relative flex-shrink-0">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {isLedger && <BudgetDot alertLevel={alertLevel} />}
                </span>
                <span className="hidden xl:block text-body font-medium truncate">{label}</span>
                <span className="xl:hidden sr-only">{label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Budget status indicator — bottom of nav */}
        {alertLevel !== 'normal' && costsData && (
          <div className="px-3 pb-2 hidden xl:block">
            <div
              className={cn(
                'text-caption px-3 py-2 rounded-lg',
                alertLevel === 'amber' && 'bg-[#FFF8E6] text-[#B45309]',
                alertLevel === 'red' && 'bg-[#FEE2E2] text-[#B91C1C]',
                alertLevel === 'critical' && 'bg-[#FEE2E2] text-[#B91C1C] animate-pulse'
              )}
              aria-label="Monthly budget status"
            >
              ${(costsData.budget.spentCents / 100).toFixed(0)} / $500
            </div>
          </div>
        )}

        {/* Logout button */}
        <div className="p-2 border-t border-[#E5E5EA]">
          <button
            type="button"
            onClick={handleLogoutClick}
            aria-label="Sign out"
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl min-h-[44px]',
              'text-[#636366] hover:bg-[#FEE2E2] hover:text-[#B91C1C]',
              'transition-all duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="hidden xl:block text-body font-medium">Sign out</span>
          </button>
        </div>
      </nav>

      {/* ─── Main content area ─── */}
      <main
        id="main-content"
        className={cn(
          // On desktop: offset by nav rail width
          'lg:ml-16 xl:ml-[220px]',
          // On mobile: pad bottom for tab bar
          'pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px)+8px)] lg:pb-0',
          'min-h-screen'
        )}
      >
        <Outlet />
      </main>

      {/* ─── Mobile/Tablet Tab Bar (<1024px) ─── */}
      <nav
        aria-label="Main navigation"
        className={cn(
          'lg:hidden fixed bottom-0 left-0 right-0 z-40',
          'bg-[#FFFFFF]/95 backdrop-blur-sm border-t border-[#E5E5EA]',
          'flex items-center justify-around',
          'tab-bar' // applies pb: env(safe-area-inset-bottom)
        )}
        style={{ height: 'calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        {NAV_ITEMS.map(({ to, label, Icon, exact }) => {
          const active = isActive(to, exact);
          const isLedger = to === '/ledger';

          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5',
                'flex-1 h-full min-h-[44px] px-2',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-inset',
                active ? 'text-[#007AFF]' : 'text-[#8E8E93]'
              )}
            >
              <span className="relative">
                <Icon className="w-6 h-6" aria-hidden="true" />
                {isLedger && <BudgetDot alertLevel={alertLevel} />}
              </span>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* ─── Logout confirmation modal ─── */}
      {showLogoutConfirm && (
        <LogoutModal
          onConfirm={handleLogoutConfirm}
          onCancel={handleLogoutCancel}
          isLoading={logoutLoading}
        />
      )}
    </div>
  );
}
