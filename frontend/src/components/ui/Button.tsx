/**
 * PrimaryButton and variants — maps to UX spec §6.14
 * Apple HIG: full-width CTA, loading state with spinner, min 44px touch target.
 */

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#007AFF] text-white hover:bg-[#0071E3] active:bg-[#0062CC] disabled:bg-[#AEAEB2] disabled:text-white',
  secondary:
    'bg-[#F2F2F7] text-[#000000] hover:bg-[#E5E5EA] active:bg-[#D1D1D6] disabled:bg-[#F2F2F7] disabled:text-[#AEAEB2]',
  ghost:
    'bg-transparent text-[#007AFF] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:text-[#AEAEB2]',
  danger:
    'bg-[#FF3B30] text-white hover:bg-[#E0352B] active:bg-[#C72E25] disabled:bg-[#AEAEB2] disabled:text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-callout rounded-md',
  md: 'h-11 px-4 text-body rounded-xl min-h-[44px]',
  lg: 'h-12 px-6 text-body font-semibold rounded-xl min-h-[44px]',
};

/**
 * Inline spinner SVG — does not shift button width.
 */
function Spinner() {
  return (
    <svg
      className="animate-spin mr-2 h-4 w-4 flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  type,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        // Base
        'inline-flex items-center justify-center font-semibold',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        'select-none',
        // Active press
        !isDisabled && 'active:scale-[0.98]',
        // Variants + sizes
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
