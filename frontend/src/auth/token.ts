import { create } from 'zustand';

// Bridges the OIDC auth context (React) to consumers that can't use `useAuth`:
// the plain `fetch` helpers in the api layer, and `MapPage`, which renders both
// with and without an AuthProvider above it (`useAuth` throws outside one).
//
// `App` keeps both fields in sync with the current auth state. The token is a
// store rather than a plain variable because the map builds it into its tile
// URLs and so has to re-render when it changes.
interface AuthTokenState {
  accessToken: string | null;
  // `signinSilent`, registered by `App`. Null when auth is disabled.
  renew: (() => Promise<unknown>) | null;
}

const useAuthTokenStore = create<AuthTokenState>(() => ({
  accessToken: null,
  renew: null,
}));

export function setAccessToken(token: string | null): void {
  useAuthTokenStore.setState({ accessToken: token });
}

export function getAccessToken(): string | null {
  return useAuthTokenStore.getState().accessToken;
}

export function useAccessToken(): string | null {
  return useAuthTokenStore((state) => state.accessToken);
}

export function setRenewHandler(renew: (() => Promise<unknown>) | null): void {
  useAuthTokenStore.setState({ renew });
}

// Reads the `exp` claim without verifying the signature — the server does the real
// check. Enough to tell "the token we sent had expired" from "that tile doesn't
// exist". Payloads are base64url, which `atob` doesn't take unmassaged.
function expiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// Renew this far ahead of the stated expiry, to cover clock skew between us and
// the token issuer.
const EXPIRY_SKEW_MS = 30_000;

/**
 * Renews the access token, but only if the one we hold has expired or is about to.
 *
 * For callers that can't see a 401 directly and so can't tell an auth failure from
 * any other: the map's tiles are images, which report a bare error event with no
 * status, and OS legitimately 404s tiles outside the National Grid. Checking the
 * token is what separates the two — renewing on every missing tile would rebuild
 * each tile URL, and re-request the whole viewport, for nothing.
 *
 * A renewal lands via `setAccessToken`, so subscribers re-render off the new token.
 */
export function renewIfExpired(): void {
  const { accessToken, renew } = useAuthTokenStore.getState();
  if (!accessToken || !renew) {
    return;
  }

  const expiry = expiresAt(accessToken);
  // An unreadable token is treated as worth renewing; a live one is left alone.
  if (expiry !== null && Date.now() < expiry - EXPIRY_SKEW_MS) {
    return;
  }

  void renew();
}
