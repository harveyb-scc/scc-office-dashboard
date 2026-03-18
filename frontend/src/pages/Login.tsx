/**
 * Login page — UX spec §5.1
 * Apple-style centred card. Password field with show/hide.
 * Rate limit lockout with live countdown.
 * Copy from COPY.md §2.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { login, isRateLimitError, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMIT COUNTDOWN
// ─────────────────────────────────────────────────────────────────────────────

interface CountdownProps {
  seconds: number;
  onComplete: () => void;
}

function Countdown({ seconds: initialSeconds, onComplete }: CountdownProps) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  const formatTime = (s: number) => {
    if (s >= 120) return `${Math.ceil(s / 60)} minutes`;
    if (s >= 60) return '1 minute';
    return `${s} seconds`;
  };

  return <span>{formatTime(remaining)}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT SUCCESS BANNER
// ─────────────────────────────────────────────────────────────────────────────

function LogoutBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <p role="status" className="text-callout text-[#636366] text-center mb-4">
      You've signed out.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Login() {
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Validate the redirect parameter to prevent open redirect attacks.
  // Only relative paths starting with '/' are accepted.
  // '//...' is rejected because it can be treated as a protocol-relative URL.
  // Any value containing ':' is rejected because it could be a protocol (http:, javascript:).
  const rawRedirect = searchParams.get('redirect');
  const redirectTo =
    rawRedirect &&
    rawRedirect.startsWith('/') &&
    !rawRedirect.startsWith('//') &&
    !rawRedirect.includes(':')
      ? rawRedirect
      : '/';
  const justLoggedOut = searchParams.get('loggedOut') === '1';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [slowConnection, setSlowConnection] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const errorId = 'login-error';
  const passwordId = 'login-password';

  // Show slow connection message after 3s
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isSubmitting) {
      timer = setTimeout(() => setSlowConnection(true), 3000);
    } else {
      setSlowConnection(false);
    }
    return () => clearTimeout(timer);
  }, [isSubmitting]);

  const isDisabled = isSubmitting || isLockedOut;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim() || isDisabled) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(password);
      authLogin();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Clear field and refocus on error
      setPassword('');
      setTimeout(() => passwordRef.current?.focus(), 50);

      if (isRateLimitError(err)) {
        setIsLockedOut(true);
        setLockoutSeconds(15 * 60);
        return;
      }

      if (err instanceof ApiClientError) {
        switch (err.code) {
          case 'INVALID_CREDENTIALS':
          case 'MISSING_PASSWORD':
            setErrorMessage("That password isn't right. Try again.");
            break;
          default:
            setErrorMessage("Can't reach the server. Check your connection and try again.");
        }
      } else {
        setErrorMessage("Can't reach the server. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px]">
        {/* Logged-out confirmation */}
        {justLoggedOut && <LogoutBanner />}

        <div className="bg-[#FFFFFF] rounded-2xl shadow-md p-8">
          {/* App identity */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4" aria-hidden="true">🏢</div>
            <h1 className="text-display font-bold text-[#000000] mb-2">
              The Office
            </h1>
            <p className="text-body text-[#636366]">
              Every agent. Every pound. Right now.
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <fieldset disabled={isDisabled} className="border-none p-0 m-0 space-y-6">
              {/* Password field */}
              <div className="flex flex-col gap-1">
                {/* Always-visible label */}
                <label
                  htmlFor={passwordId}
                  className="text-body font-semibold text-[#000000]"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    ref={passwordRef}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoFocus
                    disabled={isDisabled}
                    aria-describedby={errorMessage ? errorId : undefined}
                    aria-invalid={errorMessage ? true : undefined}
                    className={cn(
                      'w-full h-11 px-4 pr-12 text-body bg-[#FFFFFF] text-[#000000]',
                      'border border-[#D1D1D6] rounded-xl',
                      'transition-all duration-150 ease-out',
                      'focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent',
                      'disabled:bg-[#F2F2F7] disabled:text-[#AEAEB2] disabled:cursor-not-allowed',
                      errorMessage && 'border-[#FF3B30] focus:ring-[#FF3B30]'
                    )}
                  />

                  {/* Show/hide password toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={isDisabled}
                    className={cn(
                      'absolute right-1 top-0 h-full w-11',
                      'flex items-center justify-center rounded-r-xl',
                      'text-[#8E8E93] hover:text-[#636366]',
                      'transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Eye className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {/* Error message */}
                {errorMessage && (
                  <p
                    id={errorId}
                    role="alert"
                    className="text-callout text-[#FF3B30]"
                  >
                    {errorMessage}
                  </p>
                )}

                {/* Lockout message */}
                {isLockedOut && (
                  <p role="alert" className="text-callout text-[#FF3B30]">
                    Too many attempts. Try again in{' '}
                    <Countdown
                      seconds={lockoutSeconds}
                      onComplete={() => {
                        setIsLockedOut(false);
                        setLockoutSeconds(0);
                        setErrorMessage(null);
                      }}
                    />
                    .
                  </p>
                )}

                {/* Slow connection message */}
                {slowConnection && isSubmitting && (
                  <p role="status" className="text-callout text-[#636366]">
                    This is taking longer than usual. Still trying…
                  </p>
                )}
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={isSubmitting}
                disabled={isDisabled || !password.trim()}
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}
