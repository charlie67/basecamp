#!/usr/bin/env bash
# Launch the Spring Boot backend and Caddy together in a single container.
# If either process exits, tear the other one down so the container stops too.
set -euo pipefail

term() {
	kill -TERM "${BACKEND_PID:-}" "${CADDY_PID:-}" 2>/dev/null || true
}
trap term SIGTERM SIGINT

echo "Starting backend (Spring Boot) ..."
java ${JAVA_OPTS:-} -jar /app/app.jar &
BACKEND_PID=$!

# Inject the frontend's runtime config from environment variables. This
# overwrites the empty placeholder baked into the static bundle, letting one
# image be reconfigured per-deployment without rebuilding the JS. The app reads
# these via window.__APP_CONFIG__ (see frontend/src/config.ts).
echo "Writing frontend runtime config ..."
cat > /srv/www/config.js <<EOF
window.__APP_CONFIG__ = {
  authAuthority: "${FRONTEND_AUTH_AUTHORITY:-}",
  authClientId: "${FRONTEND_AUTH_CLIENT_ID:-}",
  apiBase: "${FRONTEND_API_BASE:-/api}",
  osMapApiKey: "${FRONTEND_OS_MAP_API_KEY:-}"
};
EOF

echo "Starting Caddy ..."
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# Wait for whichever process exits first, then shut the other one down.
wait -n
term
wait
