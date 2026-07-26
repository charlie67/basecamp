// Bridges the OIDC auth context (React) to the plain `fetch` helpers in the api
// layer. `App` keeps this in sync with the current access token; `fetchWorkouts`
// reads it to set the Authorization header without needing hook access.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}
