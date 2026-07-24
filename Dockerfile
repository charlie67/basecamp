FROM eclipse-temurin:25-jre AS runtime

# Caddy is a static Go binary; copy it out of the official image.
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

# curl is used by the container healthcheck below.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-built backend jar (classifier 'exec').
COPY application/target/basecamp-application-*-exec.jar /app/app.jar

# Pre-built static frontend bundle served by Caddy.
COPY frontend/dist /srv/www

# Config + launcher
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Caddy serves the whole app on :80. The backend's :8080 stays internal.
EXPOSE 80

# Go through Caddy (:80 -> /api strip -> backend) so this exercises the full path.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS http://localhost:80/api/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["/app/start.sh"]
