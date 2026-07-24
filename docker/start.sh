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

echo "Starting Caddy ..."
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# Wait for whichever process exits first, then shut the other one down.
wait -n
term
wait
