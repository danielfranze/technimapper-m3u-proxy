# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production

# tini: proper PID 1 (signal forwarding, zombie reaping) for graceful shutdown
RUN apk add --no-cache tini

WORKDIR /app

# Dependencies first to leverage Docker layer caching.
# Uses the lockfile (reproducible) if present; otherwise falls back to npm install.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

# Application source (see .dockerignore for what is excluded)
COPY --chown=node:node . .

# Persistent data directory owned by the unprivileged user
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
