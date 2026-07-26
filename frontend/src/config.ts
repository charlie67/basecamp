// App configuration resolved in two tiers:
//   1. window.__APP_CONFIG__ — injected at container startup from environment
//      variables (docker/start.sh writes /srv/www/config.js), so a deployed
//      image can be reconfigured without rebuilding the JS bundle.
//   2. import.meta.env.VITE_* — Vite build-time vars, used for local dev via
//      frontend/.env.local.
// Runtime values win when present; otherwise fall back to the build-time vars.

interface RuntimeConfig {
  authAuthority: string;
  authClientId: string;
  apiBase: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<RuntimeConfig>;
  }
}

const runtime = window.__APP_CONFIG__ ?? {};

export const appConfig = {
  authAuthority: runtime.authAuthority || import.meta.env.VITE_AUTH_AUTHORITY || '',
  authClientId: runtime.authClientId || import.meta.env.VITE_AUTH_CLIENT_ID || '',
  apiBase: runtime.apiBase || import.meta.env.VITE_API_BASE || '/api',
};

if (!appConfig.authAuthority) {
  // Surface a clear message instead of oidc-client-ts's opaque
  // "No authority or metadataUrl configured on settings".
  console.error(
    'Auth is not configured: set VITE_AUTH_AUTHORITY + VITE_AUTH_CLIENT_ID in ' +
      'frontend/.env.local (local dev), or provide runtime config via the ' +
      'container (docker/start.sh writes /srv/www/config.js from env vars).',
  );
}
