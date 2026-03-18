/**
 * Base Input component — used by PasswordField and any future form inputs.
 * Always has a visible label. Placeholder text is never used as a label.
 */

import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  rightElement?: ReactNode;
  labelClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, error, hint, rightElement, labelClassName, className, id, ...props },
    ref
  ) {
    const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    const describedBy = [
      error ? errorId : null,
      hint ? hintId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1">
        {/* Always-visible label — placeholder text is not a label */}
        <label
          htmlFor={inputId}
          className={cn(
            'text-body font-semibold text-[#000000]',
            labelClassName
          )}
        >
          {label}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(
              // Base
              'w-full h-11 px-4 text-body bg-[#FFFFFF] text-[#000000]',
              'border border-[#D1D1D6] rounded-xl',
              'transition-all duration-150 ease-out',
              // Focus
              'focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent',
              // Placeholder
              'placeholder:text-[#A2A2A7]',
              // Disabled
              'disabled:bg-[#F2F2F7] disabled:text-[#AEAEB2] disabled:cursor-not-allowed',
              // Error state
              error && 'border-[#FF3B30] focus:ring-[#FF3B30]',
              // Right padding when there's a right element (e.g. show/hide toggle)
              rightElement && 'pr-12',
              className
            )}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-0 top-0 h-full flex items-center pr-1">
              {rightElement}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-callout text-[#FF3B30] mt-0.5"
          >
            {error}
          </p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p id={hintId} className="text-callout text-[#636366]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
