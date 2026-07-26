import { WebStorageStateStore } from 'oidc-client-ts';
import type { AuthProviderProps } from 'react-oidc-context';
import { appConfig } from '../config.ts';

// Authentik does NOT send CORS headers on its OIDC discovery document
// (`.well-known/openid-configuration`), so a browser fetch of it is blocked and
// oidc-client-ts fails with a "Network Error" before login can even start. We
// therefore supply the metadata directly (derived from the authority) so the
// library skips discovery entirely. Everything else is CORS-safe: the token and
// jwks endpoints send CORS headers, and the authorize step is a top-level
// redirect. userinfo is disabled — the id_token already carries the claims from
// the requested scopes. This mirrors Authentik's real discovery output and works
// the same in dev and prod (both are cross-origin to Authentik).
function authentikMetadata(authority: string) {
  const url = new URL(authority); // e.g. http://localhost:9000/application/o/basecamp/
  const base = `${url.origin}/application/o`;
  const slug = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const issuer = authority.endsWith('/') ? authority : `${authority}/`;
  return {
    issuer,
    authorization_endpoint: `${base}/authorize/`,
    token_endpoint: `${base}/token/`,
    userinfo_endpoint: `${base}/userinfo/`,
    jwks_uri: `${base}/${slug}/jwks/`,
    end_session_endpoint: `${base}/${slug}/end-session/`,
  };
}

// OIDC/PKCE configuration for logging in against Authentik. PKCE is applied
// automatically for `response_type: 'code'`; `offline_access` + automatic silent
// renew keep the access token fresh in the background so calls rarely hit a 401.
export const oidcConfig: AuthProviderProps = {
  authority: appConfig.authAuthority,
  metadata: appConfig.authAuthority ? authentikMetadata(appConfig.authAuthority) : undefined,
  client_id: appConfig.authClientId,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid profile email offline_access',
  // Skip the cross-origin userinfo call; profile/email come from the id_token.
  loadUserInfo: false,
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  // Strip the ?code&state params from the URL once the callback is processed.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
