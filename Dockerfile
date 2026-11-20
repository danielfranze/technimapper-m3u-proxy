# syntax=docker/dockerfile:1
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

ENV NODE_ENV=production

# tini: proper PID 1 (signal forwarding, zombie reaping) for graceful shutdown
RUN apk add --no-cache tini

WORKDIR /app

# Dependencies first to leverage Docker layer caching (reproducible via package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The runtime only needs the node binary. Remove the package managers that ship with the base image
# (npm, corepack, yarn): they are never used at runtime and carry their own bundled dependencies,
# which show up in vulnerability scans without being part of this application.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*

# Application source (see .dockerignore for what is excluded)
COPY --chown=node:node . .

# Persistent data directory owned by the unprivileged user
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 9191

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-9191}/health/live" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
