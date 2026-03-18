/**
 * Login component tests — React Testing Library
 * UX Spec §5.1, AC-LOGIN-01 through AC-LOGIN-04
 *
 * Test strategy:
 * - User-centric queries: getByRole, getByLabelText, getByText
 * - MSW for API mocking (no jest.mock on fetch)
 * - AAA pattern throughout
 * - No implementation detail testing (no internal state, no class assertions)
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import Login from '../pages/Login';
import { AuthProvider } from '../hooks/useAuth';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';

// ─────────────────────────────────────────────────────────────────────────────
// MSW SERVER SETUP
// ─────────────────────────────────────────────────────────────────────────────

const server = setupServer(
  // Default: successful login
  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      ok: true,
      data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Dummy destination to confirm redirect happened
function DashboardStub() {
  return <div data-testid="dashboard">The Floor</div>;
}

interface RenderOptions {
  initialPath?: string;
}

function renderLogin(options: RenderOptions = {}) {
  const { initialPath = '/login' } = options;
  const user = userEvent.setup();

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<DashboardStub />} />
            <Route path="/ledger" element={<div data-testid="ledger">The Ledger</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );

  return { user };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Login page', () => {
  // ── Renders correctly ────────────────────────────────────────────────────────
  describe('renders correctly', () => {
    test('renders the app title "The Office"', () => {
      // Arrange & Act
      renderLogin();

      // Assert
      expect(screen.getByRole('heading', { name: /the office/i })).toBeInTheDocument();
    });

    test('renders a labelled password field', () => {
      renderLogin();

      const passwordField = screen.getByLabelText(/password/i);
      expect(passwordField).toBeInTheDocument();
      expect(passwordField).toHaveAttribute('type', 'password');
    });

    test('renders a Sign In submit button', () => {
      renderLogin();

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    test('renders the show password toggle button', () => {
      renderLogin();

      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    });

    test('does not render an error message on initial load', () => {
      renderLogin();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('password field has autofocus', () => {
      renderLogin();

      const passwordField = screen.getByLabelText(/password/i);
      expect(passwordField).toHaveFocus();
    });
  });

  // ── Shows error on wrong password ────────────────────────────────────────────
  describe('shows error on wrong password', () => {
    test('displays inline error message when API returns INVALID_CREDENTIALS', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } },
            { status: 400 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/isn't right|invalid/i);
    });

    test('clears the password field after a failed attempt', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } },
            { status: 400 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByLabelText(/password/i)).toHaveValue('');
      });
    });

    test('re-enables the Sign In button after a failed attempt', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } },
            { status: 400 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — button should be re-enabled after error (field is empty, so it may be
      // disabled due to empty value; type something first)
      await waitFor(() => screen.getByRole('alert'));
      await user.type(screen.getByLabelText(/password/i), 'a');
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    });

    test('shows network error message when API is unreachable', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () => HttpResponse.error())
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'somepassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/server|connection/i);
    });
  });

  // ── Shows rate limit message after 5 failures ────────────────────────────────
  describe('rate limit lockout', () => {
    test('shows lockout message with countdown when API returns 429', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' } },
            { status: 429 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const lockoutAlert = alerts.find((a) => /too many|try again/i.test(a.textContent ?? ''));
        expect(lockoutAlert).toBeInTheDocument();
      });
    });

    test('disables the form (field and button) during lockout', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts.' } },
            { status: 429 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — entire fieldset should be disabled (via disabled prop on fieldset)
      await waitFor(() => {
        const lockoutAlerts = screen.getAllByRole('alert');
        expect(lockoutAlerts.length).toBeGreaterThan(0);
      });

      // The field and button inside the disabled fieldset should be disabled
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    test('shows countdown timer text during lockout', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts.' } },
            { status: 429 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — countdown text should include minute(s) or seconds
      await waitFor(() => {
        const pageText = document.body.textContent ?? '';
        expect(/minutes|seconds/i.test(pageText)).toBe(true);
      });
    });
  });

  // ── Redirects on success ─────────────────────────────────────────────────────
  describe('redirects on success', () => {
    test('redirects to "/" (The Floor) on successful login', async () => {
      // Arrange — default handler returns success
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'correctpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    test('redirects to the redirect target from ?redirect= query param on success', async () => {
      // Arrange — navigate to login with redirect param
      const { user } = renderLogin({ initialPath: '/login?redirect=/ledger' });

      // Act
      await user.type(screen.getByLabelText(/password/i), 'correctpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — should land on /ledger, not /
      await waitFor(() => {
        expect(screen.getByTestId('ledger')).toBeInTheDocument();
      });
    });

    test('does NOT navigate on failed login', async () => {
      // Arrange
      server.use(
        http.post('/api/auth/login', () =>
          HttpResponse.json(
            { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } },
            { status: 400 }
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'wrong');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — still on login page
      await waitFor(() => screen.getByRole('alert'));
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /the office/i })).toBeInTheDocument();
    });
  });

  // ── Password show/hide toggle ────────────────────────────────────────────────
  describe('password show/hide toggle', () => {
    test('toggles input type from "password" to "text" when toggle is clicked', async () => {
      // Arrange
      const { user } = renderLogin();
      const passwordField = screen.getByLabelText(/password/i);

      // Act — initial state
      expect(passwordField).toHaveAttribute('type', 'password');

      // Act — click show
      await user.click(screen.getByRole('button', { name: /show password/i }));

      // Assert — now visible
      expect(passwordField).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
    });

    test('toggles back to "password" type when clicked again', async () => {
      // Arrange
      const { user } = renderLogin();

      // Act
      await user.click(screen.getByRole('button', { name: /show password/i }));
      await user.click(screen.getByRole('button', { name: /hide password/i }));

      // Assert
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    });

    test('toggle button has correct aria-label in each state', async () => {
      // Arrange
      const { user } = renderLogin();

      // Assert initial
      expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();

      // Act
      await user.click(screen.getByRole('button', { name: 'Show password' }));

      // Assert after toggle
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
    });
  });

  // ── Keyboard accessibility (tab order) ──────────────────────────────────────
  describe('keyboard accessibility', () => {
    test('tab order is: password field → show/hide toggle → Sign In button', async () => {
      // Arrange
      const { user } = renderLogin();

      // The password field has autoFocus, so it starts focused
      const passwordField = screen.getByLabelText(/password/i);
      expect(passwordField).toHaveFocus();

      // Act & Assert — Tab to show/hide toggle
      await user.tab();
      expect(screen.getByRole('button', { name: /show password/i })).toHaveFocus();

      // Act & Assert — Tab to Sign In
      await user.tab();
      expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
    });

    test('form can be submitted by pressing Enter in the password field', async () => {
      // Arrange — default handler succeeds
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'correctpassword');
      await user.keyboard('{Enter}');

      // Assert — redirect happened
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    test('Sign In button is keyboard-activatable via Enter key when focused', async () => {
      // Arrange
      const { user } = renderLogin();

      // Act — type in field, tab to button, press Enter
      await user.type(screen.getByLabelText(/password/i), 'correctpassword');
      await user.tab(); // to show/hide toggle
      await user.tab(); // to Sign In button
      await user.keyboard('{Enter}');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    test('Sign In button is disabled when password field is empty (prevents empty submission)', () => {
      // Arrange
      renderLogin();

      // Assert
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    test('Sign In button enables after typing in password field', async () => {
      // Arrange
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'a');

      // Assert
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    });
  });

  // ── Loading state ────────────────────────────────────────────────────────────
  describe('loading state (AC-LOGIN-04)', () => {
    test('disables field and button while request is in-flight', async () => {
      // Arrange — delay the response so we can catch the loading state
      let resolveRequest!: (value: unknown) => void;
      server.use(
        http.post('/api/auth/login', () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }).then(() =>
            HttpResponse.json({
              ok: true,
              data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
            })
          )
        )
      );
      const { user } = renderLogin();

      // Act
      await user.type(screen.getByLabelText(/password/i), 'correctpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Assert — loading state
      await waitFor(() => {
        expect(screen.getByLabelText(/password/i)).toBeDisabled();
        expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
      });

      // Cleanup — resolve the pending request
      resolveRequest(undefined);
    });
  });
});
