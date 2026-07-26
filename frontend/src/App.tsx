import { useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import WorkoutsPage from './pages/WorkoutsPage.tsx';
import { setAccessToken } from './auth/token.ts';

function Splash({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-300">
      <p className="text-sm">{label}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
        >
          Sign in
        </button>
      )}
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  // Guards the automatic redirect so it fires at most once per page load:
  // without it, StrictMode's double-effect starts two sign-ins (the first one's
  // PKCE state is orphaned), and an error state would retry in a loop.
  const startedSignin = useRef(false);

  // Keep the api layer's token in sync with the current session.
  useEffect(() => {
    setAccessToken(auth.user?.access_token ?? null);
  }, [auth.user?.access_token]);

  const signIn = useCallback(async () => {
    // Discard any expired/failed session first. A stale user in localStorage is
    // what pushes oidc-client-ts into a `prompt=none` silent renew, which
    // Authentik rejects with `login_required` ("The Authorization Server
    // requires End-User authentication"); removing it forces a clean
    // interactive login instead.
    await auth.removeUser();
    await auth.signinRedirect();
  }, [auth]);

  // Send unauthenticated visitors to Authentik's login. This deliberately runs
  // in the error case too, so a failed silent renew recovers by asking the user
  // to log in again rather than stranding the app on an error screen.
  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || startedSignin.current) {
      return;
    }
    startedSignin.current = true;
    void signIn();
  }, [auth.isLoading, auth.isAuthenticated, signIn]);

  if (auth.isLoading) {
    return <Splash label="Loading…" />;
  }

  if (!auth.isAuthenticated) {
    // The automatic attempt above has already run and only fires once, so both
    // branches need a manual escape hatch: an error means the redirect itself
    // failed, and a non-error means we are either mid-navigation (this splash
    // disappears on its own) or the session ended without a page change.
    return (
      <Splash
        label={auth.error ? `Sign-in failed: ${auth.error.message}` : 'Redirecting to sign in…'}
        onRetry={() => void signIn()}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="*" element={<Navigate to="/workouts" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
