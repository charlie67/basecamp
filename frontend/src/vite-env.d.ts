/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base path. Defaults to the same-origin `/api` proxy. */
  readonly VITE_API_BASE?: string;
  /** Authentik OIDC issuer URL (the provider's issuer, ends in a trailing slash). */
  readonly VITE_AUTH_AUTHORITY: string;
  /** OAuth2 client id of the Authentik application for this frontend (public client). */
  readonly VITE_AUTH_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
