# ADR 0004 – Release 1.8.0: testable server, security hardening

- Status: Accepted
- Date: 2026-11-20
- Release: [1.8.0]

## Context

The product is a small self-hosted LAN tool (`server.js`, 752 lines). The audit
showed the main risks: no direct tests for `server.js`, an unauthenticated sync
that can scan the LAN, CSRF on the empty-body sync endpoint, unbounded rate
limiter maps, graceful shutdown that could cut off syncs, and missing observability.

## Decision

Release 1.8.0 does **not** restructure the whole application. It:

- splits the process entry point (`server.js`) from HTTP wiring (`lib/app.js`),
- adds `createApp(deps)` so integration tests can run the Express app with
  fake receiver/persistence/scheduler implementations,
- hardens the HTTP boundary first: Basic Auth (secure by default for `/api/*`),
  CSRF/origin guard, bounded rate limiting, security headers,
- separates the receiver target from sync: `POST /api/save-settings`,
- keeps the JSON monitor format, adds new health endpoints,
- keeps Node runtime modules CommonJS until TypeScript/ESM migration.

TypeScript, UI extraction, immutable state snapshots and the full modular
monolith are later releases (see the roadmap).

## Consequences

- Tests can cover the API without network access.
- Security fixes are reviewable and releasable independently of the
  architecture refactor.
- The full refactor (Sprint 3) can proceed on a stable, tested baseline.
- Some SSRF surface remains until settings are a separate authenticated
  operation; with auth configured, the target is still privately validated and
  stored. Without auth on a LAN, only authenticated-by-network access applies,
  as documented.
