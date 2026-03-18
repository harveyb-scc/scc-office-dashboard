import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/layout/AppShell';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

// Code-split at route level — each page loaded on demand
const Login = lazy(() => import('@/pages/Login'));
const Floor = lazy(() => import('@/pages/Floor'));
const Ledger = lazy(() => import('@/pages/Ledger'));
const Feed = lazy(() => import('@/pages/Feed'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" aria-busy="true" aria-label="Loading page">
      <div className="space-y-3 w-full max-w-sm px-4">
        <SkeletonLoader variant="text" className="h-8 w-48" />
        <SkeletonLoader variant="card" className="h-32" />
        <SkeletonLoader variant="card" className="h-32" />
      </div>
    </div>
  );
}

/**
 * Protected route — redirects to /login if not authenticated.
 * Passes the attempted route as ?redirect= query param.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const redirectTo = location.pathname !== '/' ? `?redirect=${encodeURIComponent(location.pathname)}` : '';
    return <Navigate to={`/login${redirectTo}`} replace />;
  }

  return <>{children}</>;
}

/**
 * Public route — redirects authenticated users away from /login to /.
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      {/* Skip to main content — first focusable element on every page (WCAG) */}
      <a href="#main-content" className="skip-link" aria-label="Skip to main content">
        Skip to main content
      </a>

      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Suspense fallback={<PageFallback />}>
                <Login />
              </Suspense>
            </PublicRoute>
          }
        />

        {/* Protected — wrapped in AppShell navigation */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<PageFallback />}>
                <Floor />
              </Suspense>
            }
          />
          <Route
            path="/ledger"
            element={
              <Suspense fallback={<PageFallback />}>
                <Ledger />
              </Suspense>
            }
          />
          <Route
            path="/feed"
            element={
              <Suspense fallback={<PageFallback />}>
                <Feed />
              </Suspense>
            }
          />
        </Route>

        {/* Catch-all — redirect to floor */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
