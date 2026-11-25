# syntax=docker/dockerfile:1
# ---- Build stage ----
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && test -f public/app/js/main.js

# ---- Runtime stage ----
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

# tini: proper PID 1 (signal forwarding, zombie reaping) for graceful shutdown
RUN apk add --no-cache tini

WORKDIR /app

# Dependencies first to leverage Docker layer caching (reproducible via package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove package managers from runtime image
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*

# Copy compiled output and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
RUN chown -R node:node /app/public /app/dist

# Persistent data directory owned by the unprivileged user
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 9191

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-9191}/health/live" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]