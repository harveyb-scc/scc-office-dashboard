/**
 * Auth state management.
 * Uses a simple React Context + sessionStorage for auth status.
 * The actual session is maintained via HTTP-only cookie managed by the backend.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { logout as apiLogout } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

interface AuthContextValue {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getInitialAuthState(): boolean {
  try {
    return sessionStorage.getItem('scc_auth') === 'true';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(getInitialAuthState);

  const login = useCallback(() => {
    setIsAuthenticated(true);
    try {
      sessionStorage.setItem('scc_auth', 'true');
    } catch {
      // sessionStorage may be unavailable in some environments
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Even if the API call fails, clear local state
    } finally {
      setIsAuthenticated(false);
      try {
        sessionStorage.removeItem('scc_auth');
        sessionStorage.removeItem('scc_last_view');
      } catch {
        // sessionStorage may be unavailable
      }
      // Clear all cached query data on logout
      queryClient.clear();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
