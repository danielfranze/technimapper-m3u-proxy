# ADR 0006 – Stilbepflanzung des REST-API

- Status: Accepted
- Date: 2026-11-25

## Context

The REST API is growing (see `docs/openapi.yaml` and `README.md`). Without a
written style guide, new endpoints drift (e.g. naming, status codes, payload
shapes).

## Decision

Fix the API style:

1. **Base path for all API routes:** `/api/` (see `lib/routes/*.ts`).
2. **HTTP methods:**
   - `GET` – read-only, no side effects (`/health*`, `/api/config`, `/api/export-config`, `/hdhr/*`).
   - `POST` – state-changing or sync operations (`/api/save-settings`, `/api/fetch-channels`, `/api/save-mapping`, `/api/import-config`).
   - `PUT`/`DELETE` are currently **not used** – keep them that way unless a use case arrives.
3. **Status codes** are single-sourced per route (`HttpError` factories in
   `lib/http-error.ts`); new routes reuse the existing set:
   `400`, `401`, `404`, `409`, `413`, `429`, `500`, `502`, `503`.
4. **JSON everywhere** – state-changing requests must send `Content-Type: application/json` (enforced by `createOriginGuard`).
5. **OpenAPI is authoritative:** `docs/openapi.yaml` documents every endpoint, schema, status code and example. CI test `test/openapi.test.ts` checks that routes in code == routes in spec.
6. **Auth:** `/api/*` requires Basic Auth only when `ADMIN_USER`/`ADMIN_PASSWORD` are set (see ADR-0004-followup); public routes are allow-listed.

## Consequences

- New routes follow this ADR; deviations should be discussed before merging.
- `docs/openapi.yaml` is the living reference (no separate code comments needed).
