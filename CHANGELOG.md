# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Changed

- Removed the `lib/http-security.ts` compatibility barrel; HTTP middleware now has one canonical import path. `HttpError` is imported directly from `lib/http-error.ts` instead of being re-exported by `lib/validation.ts`.
- Renamed `sync-coordinator` to `sync-queue` and `sync-service` to `sync-runner`, including the exported types/factories and the `AppDeps` field (`syncQueue`).
- Moved `lib/app/types.ts` to `lib/app-types.ts` and generated frontend types to `frontend/generated/api.generated.d.ts`; E2E spec filenames are now purely descriptive (no numeric prefixes).
- Added an ADR index and translated the ADR 0006 title to English.
- `API_RATE_MAX` makes the API request budget configurable (default 60/min); the E2E web server uses 1000 so the suite no longer hits `429 Too many requests`.

## [2.0.0] - 2026-11-26

TechniMapper 2.0 is a modernization release. The feature set is unchanged; the backend and frontend are now TypeScript end-to-end, and the build, test and release pipeline is stricter.

### Added

- OpenAPI 3 documentation (`docs/openapi.yaml`) with generated frontend types (`frontend/api.generated.d.ts`); CI verifies that the generated types are up to date.
- Biome for linting/formatting and knip for unused files/exports, both enforced in CI.
- Property-based tests for input validation, an OpenAPI/route parity test, and a server boot/shutdown integration test.
- E2E smoke test that fails on browser `pageerror`s, catching a broken frontend module graph.
- Graceful shutdown, structured text/JSON logging, health/readiness endpoints and Prometheus metrics.

### Changed

- Backend fully migrated to TypeScript (`strict`, NodeNext ESM, `dist/` build output); Node.js 26 is required.
- Frontend migrated to TypeScript (`frontend/`) and compiled with plain `tsc` to static ESM in `public/app/js/`; no bundler or framework.
- Docker image builds the frontend in the builder stage and copies the generated assets into the runtime image; release builds bypass the layer cache.
- CI and release workflows run type checks, Biome, knip, OpenAPI freshness, tests, coverage, E2E, dependency audit and a container smoke test/Trivy scan.
- Build output (`dist/`, `public/app/js/`) is generated and no longer tracked; `npm run build` starts from a clean state.
- Tests and test helpers import the TypeScript sources directly (`tsx`) instead of compiled `dist/` output, so knip validates the real source graph without a prior build; coverage excludes generated `dist/` accordingly.
- `LOG_FORMAT` defaults to `text` (as documented); set `LOG_FORMAT=json` for structured logs.
- `GET /api/get-config` was renamed to `GET /api/config` (UI and tests updated).

### Fixed

- Docker runtime image was missing `public/app/js/` after the frontend TypeScript migration.
- Frontend race conditions: config and sync state are awaited, sync requests are single-flight, and file import errors are surfaced.
- UI XSS and M3U injection hardening; SSRF protection for receiver targets.
- Copy-menu keyboard navigation no longer calls `.filter()` on a `NodeList`.
- README and OpenAPI spec no longer advertise an unimplemented `/api/docs` Redoc endpoint; the spec now matches the registered routes exactly.

### Upgrade notes

- Node.js 26 or newer is required (the Docker image includes it).
- The default port is `9191` (previously `3000` in 1.x). Update port mappings and media-center addresses.
- Use `GET /api/config` instead of `GET /api/get-config`.
- `dist/` and `public/app/js/` are build artifacts; run `npm ci && npm run build` before `npm start` when running from source.

## [2.0.0-rc.6]

### Added

- **knip `warn`→`error`**; `ignoreExportsUsedInFile`; clean unused re-exports (`AppRuntime`, `CronHandle`, `CronScheduler`, `Logger`, `Receiver`, `Express`, `Server`, …). CI `npm run knip`.
- Frontend TypeScript migration: sources in `frontend/`, emitted ESM in `public/app/js/`, strict flags, no bundler (ADR 0007). `public/app/js/` is generated and gitignored.
- `build:backend` / `build:frontend` scripts; `npm run build` now builds both halves.
- E2E smoke test fails on `pageerror` to catch a broken frontend module graph.

### Changed

- `tsconfig.frontend.json` now compiles TypeScript (`frontend/` → `public/app/js/`); `allowJs`/`checkJs` removed.
- Tests import the TypeScript sources directly (`tsx`); `test/tsconfig.json` gained the DOM libs.
- `scripts/coverage.js` excludes `frontend/**`.
- README documents `frontend/` as source and `public/app/js/` as generated output.
- Dockerfile verifies the frontend build output (`test -f public/app/js/main.js`); release builds run with `no-cache` to prevent stale layers.
- Dockerfile now copies `public/` from the builder stage (not the build context), so generated `app/js/` is included in the runtime image.
- `noPropertyAccessFromIndexSignature`; `dataset['…']`; `@ts-expect-error`, not `@ts-ignore`. No `@ts-ignore`/`@ts-expect-error` needed.
- **OpenAPI types:** `openapi-typescript@7` + `npm run types:openapi` → `frontend/api.generated.d.ts`. `ConfigResponse` = generated `GetConfig`; `FetchChannelsResponse` = generated `FetchChannelsResult`. `docs/openapi.yaml` `FetchChannelsResult` corrected (`channels: string[]`, `mapping`). `SaveSettingsResponse` verified against `/api/save-settings`.
- **P3 quality:** **Biome** (`@biomejs/biome`) `npm run lint` / `lint:fix` / `format` / `format:check`; `biome.json`. **`knip`** `npm run knip`. `biome check` + `format` in CI.
- **Concurrency/frontend robustness:** `await updateSyncTime()`; `loadInitialConfig` + `updateSyncTime` `await`; `setInterval`; **`syncInflight`**; `reader.onerror`; **`ApiError`** + `JsonResult.error`.
- Build/CI hardening: `clean`; `types:openapi` in `build:frontend`; `test:e2e` builds; `.tsc-out`/`.tsbuildinfo`; `.env.example`.

## [2.0.0-rc.5]

### Added

- Frontend MVP: `public/app/lib/` – `model.js` (state + pure logic), `view.js` (DOM rendering), `presenter.js` (business logic); `main.js` only wires DOM events to the presenter.
- `public/app/api.js` – typed endpoint wrappers around `getJson`/`postJson`.
- `public/app/lib/dom.js` – typed DOM access helpers used by view, presenter and main.
- `tsconfig.frontend.json` + `npm run check:frontend` – TypeScript checking/building for the frontend (`frontend/` → `public/app/js/`); runs in CI and the release workflow.
- CSS variables for colors that used to be inline (`--accent-muted`, `--danger-muted`, …); `updateModelBadge` uses classes instead of inline styles.
- Bugfix in the auto-fill logic: `/^\d+/` instead of `/^\\d+/` – IDs are now correctly extracted from names.
- API documentation: `docs/openapi.yaml` (OpenAPI 3.0 spec with full schemas, statuses, examples).
- `lib/shutdown.ts` – graceful-shutdown orchestration (server, sync, cron).
- `test/server-boot.test.ts` – integration test: server boots, serves health endpoints, graceful exit on SIGTERM.
- `test/validation-property.test.ts` – property-based tests (fast-check) for `validateSettings`/`isAllowedReceiverIp`/`validateMapping`.
- `test/openapi.test.ts` – validates `docs/openapi.yaml` + parity with routes in code.
- `npm run check:tests` script (`npx tsc --noEmit -p test && npx tsc --noEmit -p test-helpers`) + CI job "Type checks (tests, helpers, e2e)".

### Changed

- API: `GET /api/get-config` renamed to `GET /api/config` (frontend and tests updated).
- Health: added `GET /health/liveness` (alias for `/health/live`).
- `GET /health/live` kept for compatibility.
- `GET /metrics` is now documented as auth-protected when `ADMIN_USER`/`ADMIN_PASSWORD` are set.
- README HTTP endpoints table expanded (health/live/liveness, metrics, openapi link).
- Architecture: app composition split into `lib/app.ts` + `lib/app/types.ts` + `lib/routes/index.ts`.
- TypeScript: enabled `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noFallthroughCasesInSwitch`; fixed the resulting issues in receiver fallback logging, XML escaping, mapping sorting, Basic-Auth decoding and the test suite.
- Release workflow now runs `npm run check:tests`; `npm run test:all` no longer builds twice.
- Frontend API responses (`config`, `save-settings`, `fetch-channels`, `save-mapping`, `import-config`) are documented with JSDoc typedefs and accessed through typed wrappers.
- Refactoring rounds: rounds 5–8 (OOP, domain modules, middleware split, error helpers, MVP split, app/composition split).
- Tests (`test/ui-*.ts`) adapted to the new frontend structure; consolidated duplicate syntax tests.
- `npm run build && npm test && npm run test:e2e` – all green (167 unit/integration tests + 23 E2E tests).

### Fixed

- Copy-menu keyboard navigation called `.filter()` on a `NodeList`, which browsers do not provide; it now uses the typed DOM helper (`Array.from`). Found by the new frontend type check.

## [2.0.0-rc.4]

### Changed

- OOP adjustments: `HttpError` with factory methods (`badRequest`, `notFound`, …), `StateStore` as class.
- Architecture: middleware in `lib/http/middleware.ts`, domain modules in `lib/domain/{ids,settings,mapping}.ts`; `lib/validation.ts` and `lib/http-security.ts` as facades.
- `noImplicitAny` removed from `tsconfig.json` (full `strict` mode).
- E2E tests and global setup/teardown converted to TypeScript (`.ts`).
- README updated (new module overview).

### Added

- `lib/error-message.ts` (shared error-to-string helper).
- `lib/http-error.ts` (`HttpError` with status factories).

## [2.0.0-rc.3]

### Added

- Strong typing for `lib/state.ts` and `lib/validation.ts` (interfaces, explicit return types).
- TypeScript build step (`tsc` → `dist/`) with `strict: true`.

### Changed

- All backend files converted to `.ts`.
- Test imports updated to `dist/lib/*.js`.

### Fixed

- Dockerfile multi-stage build (data dir path, static assets).
- `formatSync` test made locale-independent.

## [2.0.0-rc.2]

### Added

- TypeScript migration (Phase 1-4): Backend converted to `.ts` with `tsc` build step.
- `tsconfig.json` with Node16 module resolution and strict mode (initially `strict: false`).
- Multi-stage Docker build (build stage + runtime stage).

### Changed

- `package.json`: `main` → `dist/server.js`, scripts updated (`build`, `start`, `test`, `check`).
- Test imports updated to `dist/lib/*.js`.
- App `publicDir` resolved via `process.cwd()` for compiled output.

### Fixed

- None.

## [2.0.0-rc.1]

### Added

- TypeScript migration (Phase 1-4): Backend converted to `.ts` with `tsc` build step.
- `tsconfig.json` with Node16 module resolution and strict mode (initially `strict: false`).
- Multi-stage Docker build (build stage + runtime stage).

### Changed

- `package.json`: `main` → `dist/server.js`, scripts updated (`build`, `start`, `test`, `check`).
- Test imports updated to `dist/lib/*.js`.
- App `publicDir` resolved via `process.cwd()` for compiled output.

### Fixed

- None.

## [1.9.6]

### Added

- Development Tools section in README (scripts overview).
- Screenshots moved to `docs/images/`.
- E2E tests expanded: mock-receiver sync flow, UI interactions (search, filter, dirty-state, parse, dropdown, copy menu).
- Unit tests: persistence rollback, S1/S2/STC mock tests, autoFill leading-zeros and sequential IDs.
- Shared test harnesses (`test-helpers/`) and coverage threshold enforcement.

### Changed

- Folder structure cleaned up (`.playwright-data` removed, `assets/` → `docs/images/`).
- Coverage-only tests removed; meaningful edge-case tests retained.

### Fixed

- None.

## [1.9.5]

### Added

- Receiver probe script now inspects both STC and S-series paths.
- STC mock test reflects real structure (Astra-TV-Liste + TV-Liste).

### Changed

- None.

### Fixed

- None.

## [1.9.4]

### Added

- AutoFill ("Parse") assigns sequential IDs in visible/filter order; leading zeros are stripped.
- Duplicate channel names: only the first occurrence holds the ID, editing moves it between occurrences.
- Target channel list dropdown shows only containers that contain channels (TV lists).
- Table re-sorts by channel ID after changes; stable column layout (fixed table layout + scrollbar gutter).

### Changed

- AutoFill overwrites existing IDs (Save button adopts or discards).
- `sortMapping` keeps stale/unknown entries in their current order.

### Fixed

- CSP no longer blocks inline styles generated by JavaScript (style-src allows unsafe-inline, script-src stays strict).
- Font paths corrected after CSS extraction to `public/app/styles.css`.

## [1.9.3]

### Added

- CSP hardening: `script-src` and `style-src` now only allow `'self'` (no `unsafe-inline`).
- Extracted `public/app/api.js` (backend URL + fetch helpers) as first UI module.
- Event delegation via `data-action` attributes instead of inline handlers.

### Changed

- Inline styles replaced by CSS utility classes; inline `style="..."` attributes removed.
- `public/app/main.js` loaded as ES module (`type="module"`).

### Fixed

- None.

### Coverage

- 169 tests passing, 100 % line coverage across `lib/`.

## [1.9.2]

### Added

- Persistence-failure rollback semantics (P0.6): in-memory state is restored when a write to `mapping.json` fails (`save-settings`, `save-mapping`, `import-config`, sync).
- Probe helpers under `scripts/` for inspecting receiver UPnP/ContentDirectory structure (STC, S, S1, S2).

### Changed

- SOAP receiver keeps connections non-persistent (keep-alive disabled) to avoid HTTP 412 on S-series receivers.

### Fixed

- S1/S2 generation detection is now verified against two independent S2 devices; fingerprint logic confirmed.

### Coverage

- 166+ tests passing.

## [1.9.1]

### Added

- End-to-end smoke tests with Playwright (`e2e/smoke.spec.js`) and CI integration.
- TypeScript readiness layer: `lib/types.js`, `lib/ports.js`, `jsconfig.json`, ADR 0005.
- Extracted HTTP route modules under `lib/routes/` (`health`, `config`, `mapping`, `playlist`, `hdhr`, `metrics`).
- Extracted application sync service (`lib/sync-service.js`) and central error handler (`createErrorHandler`).
- Immutable state store (`lib/state-store.js`) and sync coordinator (`lib/sync-coordinator.js`).
- Request context with `X-Request-Id`, request logging and Prometheus-style `/metrics`.
- Playlist ETag and `304 Not Modified` support.
- Additional unit/integration tests for SOAP flows, coverage branches, sync coordination, state repair, HTTP security and logger.

### Changed

- `lib/app.js` is now a thin composition/wiring layer around the sync service and route modules.
- Config persistence is asynchronous (`fs.promises`) to avoid blocking the event loop on the request path.
- Inline UI JavaScript moved from `public/index.html` to `public/app/main.js`.
- Sync execution is serialized with bounded queueing and backoff.
- Health endpoint now reports queue length and backoff.
- CI test job name now includes the Node version.

### Fixed

- `TRUST_PROXY=false`/`0` no longer risks startup issues.
- Logger test assertions and stray test artifacts removed.
- Config store tests now mock the asynchronous rename path correctly.
- UI tests updated for the externalized script.

### Coverage

- 155+ tests passing.
- 100 % line coverage across `lib/`.
- Branch coverage improved to ~92 %.

## [1.9.0]

### Added

- Immutable application state store (`lib/state-store.js`) with deep-frozen snapshots and copy-on-write updates.
- Sync coordinator (`lib/sync-coordinator.js`) with single-flight execution, bounded queue, backoff and idle waiting.
- Request context with `X-Request-Id`, request logging and a Prometheus-style `/metrics` endpoint.
- Sync queue length and backoff information in `/health`.
- Tests for the state store and sync coordinator.

### Changed

- `createApp()` now uses the state store instead of mutating global state directly.
- Persistence is applied to a mutable draft before being committed.
- Graceful shutdown waits for the sync coordinator to become idle.

## [1.8.0]

### Added

- `createApp()` application factory and a split between server startup (`server.js`) and HTTP wiring (`lib/app.js`), so the full API can be tested without starting a real listener.
- Unit tests for the new modules and HTTP integration tests using a fake receiver, an in-memory config store and a fake scheduler.
- `npm run coverage` (Node's built-in coverage report) and a coverage step in CI.
- Structured `lib/logger.js` with text/JSON output and safe serialisation.
- `lib/runtime-config.js` with validated environment parsing, including a safe `TRUST_PROXY` parser.
- `lib/config-store.js` with atomic `mapping.json` writes and an explicit non-atomic fallback for single-file bind mounts.
- `lib/receiver.js` as a UPnP/SOAP adapter with bounded responses, timeouts and testable DIDL parsing.
- `lib/http-security.js` with Basic Auth, bounded rate limiting, a CSRF/origin guard and security headers.
- `GET /health/live` and `GET /health/ready`; `/health` now also reports `lastAttemptAt`, `lastErrorAt`, `lastDurationMs`, channel and mapping counts.
- `POST /api/save-settings` to change the receiver target separately from a sync.
- `Cache-Control: no-store` for API and health responses, `Permissions-Policy`, and optional HSTS (`HSTS=true`).
- Log rotation and a `pids_limit` in `docker-compose.yml`.
- Documentation for the new endpoints, environment variables and module layout.

### Changed

- The API now fails closed when only one of `ADMIN_USER` / `ADMIN_PASSWORD` is set: public routes keep working, protected routes answer `503`.
- Authentication failures and API requests use bounded rate-limit maps; auth failures are throttled before credentials are checked.
- State-changing `/api/*` requests require `Content-Type: application/json` and a same-origin `Origin`/`Referer` when one is sent.
- The receiver address is saved through `/api/save-settings`; `/api/fetch-channels` only syncs with the configured target.
- `MAX_RESPONSE_BYTES` defaults to 2 MiB (was a hard-coded 5 MiB) and is configurable.
- Graceful shutdown waits up to `SHUTDOWN_TIMEOUT_MS` (default 30 s, always at least the maximum sync duration) and handles `uncaughtException`.
- The Docker health check and compose health check use `/health/live`.
- `npm run check` now checks `server.js` and every module in `lib/`.
- Channel IDs `.` and `..` are rejected; the UI keeps leading zeros (for example `001`) and treats ID `0` as mapped.

### Fixed

- `TRUST_PROXY=false` and `TRUST_PROXY=0` no longer risk a startup crash.
- The UI no longer truncates IDs such as `001` or `12abc` through `parseInt`.
- The README now names `lib/m3u8.js` correctly.

## [1.7.2]

### Changed

- Upgraded Express to 5.3.0, including the API rate-limit route syntax required by Express 5.
- Updated the container base image to Node 26 Alpine with a pinned image digest.
- Updated GitHub Actions to current major versions and Node 26 in the CI and release workflows.

## [1.7.1]

### Changed

- The playlist is now called M3U8 everywhere: it is served at `/playlist.m3u8` (the former `/playlist.m3u` keeps working as an
  alias), and the UI, README, tests and modules say M3U8. The `#EXTM3U` header line stays, as the format requires. The image and
  container name `technimapper-m3u-proxy` is unchanged.
- UI (header): when space runs out, the copy button first drops " URL", then the word "Copy" (the source name HDHR/M3U8 always
  stays), and only then the "Last sync:" label.
- UI: "Target Channel List" is now a custom dropdown that looks like the copy menu, instead of the native select, which looked
  different in every browser. It works with the keyboard (arrows, Home/End, type-ahead, Esc), shortens long names, and choosing a
  list still starts "Apply & Fetch" (including the unsaved-changes prompt).
- UI: the arrow of the copy button turns upwards while its menu is open (like the channel list dropdown), and the arrow part is
  wider (36 px, 42 px on phones and tablets) so it is easier to hit. On narrow screens the button text shortens a bit earlier.
- The copy button remembers its source as `hdhr` or `m3u8`; the value `m3u` saved by earlier versions is converted automatically.

## [1.7.0]

First stable release with the HDHomeRun emulation. It contains everything from the release candidates 1.7.0-rc.1 and 1.7.0-rc.2.

### Breaking changes

- The server now listens on port **9191** by default (was 3000). The Dockerfile (`EXPOSE`, health check), the compose file, the CI
  smoke test and all examples use `9191:9191`. If your stack publishes `3000:3000` and does not set `PORT`, change the mapping to
  `9191:9191` or set `PORT=3000`. The health checks follow `PORT`.

### Added

- HDHomeRun emulation below `/hdhr` for Plex and Jellyfin: `discover.json`, `lineup_status.json`, `lineup.json` (built from the
  mapping) and `stream/:id`, which redirects (HTTP 302) to the receiver's stream URL. Public like the playlist; can be disabled with
  `HDHR_ENABLED=false`. Settings: `HDHR_FRIENDLY_NAME`, `HDHR_DEVICE_ID`, `HDHR_TUNER_COUNT`.
- The tuner is named after the detected receiver ("TechniSat DIGIT ISIO STC") unless `HDHR_FRIENDLY_NAME` is set; the default tuner
  count is 2. The detected model is stored in `mapping.json`.
- UI (header): the "Copy M3U URL" button is now a split button. The left part copies the selected URL, the menu on the right
  switches between the HDHomeRun tuner address (default) and the M3U playlist URL, shows both addresses and remembers the choice.
  Choosing an entry copies it right away. The menu works with the keyboard and offers only the M3U URL if `HDHR_ENABLED=false`.

### Changed

- Docs: Dispatcharr is no longer part of the documentation; Plex and Jellyfin are the documented clients. The `/playlist.m3u`
  endpoint stays available for other M3U players.
- `GET /api/get-config` also reports `hdhrEnabled`.

## [1.7.0-rc.2]

Second release candidate with the changes after the first Plex tests. It does not move the `latest` image tag; use the exact tag `1.7.0-rc.2` to try it.

### Breaking changes

- The server now listens on port **9191** by default (was 3000). The Dockerfile (`EXPOSE`, health check), the compose file, the CI
  smoke test and all examples use `9191:9191`. If your stack publishes `3000:3000` and does not set `PORT`, change the mapping to
  `9191:9191` or set `PORT=3000`. The health checks follow `PORT`.

### Changed

- HDHomeRun emulation: the default tuner count is now 2 (was 4). `HDHR_FRIENDLY_NAME` defaults to `-`: without a custom name the
  tuner is called "TechniSat <detected model>" (e.g. "TechniSat DIGIT ISIO STC", just "TechniSat" before the first successful
  sync). The detected model is stored in `mapping.json`.
- Docs: the quick start uses `9191:9191`. Dispatcharr is no longer part of the documentation; Plex and Jellyfin are the documented
  clients. The `/playlist.m3u` endpoint stays available for other M3U players.

## [1.7.0-rc.1]

Release candidate for testing the HDHomeRun emulation with Plex and Jellyfin. It does not move the `latest` image tag; use the exact tag `1.7.0-rc.1` to try it.

### Added

- HDHomeRun emulation below `/hdhr` for Plex and Jellyfin: `discover.json`, `lineup_status.json`, `lineup.json` (built from the
  mapping) and `stream/:id`, which redirects (HTTP 302) to the receiver's stream URL. Public like the playlist; can be disabled with
  `HDHR_ENABLED=false`. New settings: `HDHR_FRIENDLY_NAME`, `HDHR_DEVICE_ID`, `HDHR_TUNER_COUNT`.

## [1.6.1]

### Changed

- UI (header): "Last sync" shows the time without seconds, and a new sync is acknowledged by a calm pulse (the icon turns once,
  a green ring fades out) instead of a green flash; it respects "reduce motion" and no longer shifts the layout. After
  "Apply & Fetch" the badge updates immediately.
- UI (header): if the version badge would wrap below the title (screens up to about 360 px), it becomes smaller and moves to the
  top-right corner of the title; it returns to its normal place as soon as there is room again.
- UI (header): "Last sync" and "Copy M3U URL" stay on one line. If there is not enough room, the button text is shortened
  step by step and only as far as needed ("Copy M3U", "Copy", and finally the "Last sync:" label is dropped).
- UI (mobile): the receiver badge drops the "Detected:" prefix only when there is not enough room (the gap to "Export" would be
  smaller than the gap between "Export" and "Import"), and "Export"/"Import" show only their icons on very narrow screens, so
  nothing touches or overflows on small phones such as the iPhone SE.

## [1.6.0]

### Added

- UI: protection against losing unsaved ID changes. A dot on "Save" shows pending changes, and "Apply & Fetch" (also when
  switching the channel list) and "Import" ask whether to save, discard or cancel. The browser warns before closing the
  tab with unsaved changes.

### Changed

- UI: "Clean" shows the number of stale entries as a small badge in the corner of the button instead of text in brackets.
- UI: the channel ID and search fields have `id`, `name` and an accessible label (fixes the browser's form-field hint).
- UI: the unsaved-changes dialog is centered on narrow screens; its buttons are stacked at full width with equal margins.
- Docs: the quick start uses the `latest` image and a named volume (no permission setup needed), and the README has a new "Updating" section and a troubleshooting entry for the restart loop caused by a bind mount that is not writable.

## [1.5.0]

Hardening and quality release (includes all changes since 1.3.0; 1.4.0 was an internal working version).

### Breaking changes

- The container now runs as the unprivileged user `node` (UID 1000). Bind-mounted data directories must be
  writable for that user: `chown -R 1000:1000 ./data`.
- Node.js 24 or newer is required (`engines`), the image is based on `node:24-alpine`.
- `/playlist.m3u` answers **503** instead of an empty playlist while no channels are synced or mapped
  (prevents Dispatcharr's orphan cleanup from deleting all channels).
- Channel IDs may only contain letters, digits, `_`, `-`, `.` (max. 32 characters).
- Receiver IPs must be private IPv4 addresses (override: `ALLOW_NON_PRIVATE_IP=true`).
- Default cron expression is now `*/5 * * * *` (was `*/60 * * * *`).

### Added

- Optional HTTP Basic Auth (`ADMIN_USER`, `ADMIN_PASSWORD`), security headers (CSP etc.), rate limiting.
- `/health` endpoint, Docker `HEALTHCHECK`, graceful shutdown, `tini` as PID 1.
- `lastError` / `consecutiveFailures` in `/api/get-config`; sync errors visible in the UI.
- Environment variables `PORT`, `DATA_DIR`, `REQUEST_TIMEOUT_MS`, `TRUST_PROXY`, `LOG_LEVEL`, `LOG_FORMAT`.
- The release workflow also creates the GitHub release automatically, using the matching section of this changelog as release notes.
- Unit tests (`npm test`), GitHub Actions CI (tests, `npm audit`, Trivy scan, smoke test) and a release
  pipeline (multi-arch image, SBOM, provenance, cosign signature), Dependabot.
- UI: duplicate channel IDs are reported in a single warning that names the channels, affected rows are highlighted, and "Smart Parsing" no longer assigns an ID that is already in use. Only channels that currently exist on the receiver count; stale mapping entries of vanished channels are reported separately and can be removed with the new "Clean" button, which shows their number and saves immediately.
- UI: fonts (Inter) and icons (Material Icons Outlined) are bundled in `public/fonts/`; the UI no longer contacts Google (privacy/GDPR, works offline). The Content-Security-Policy no longer allows external hosts.
- UI (mobile): the status message stays on one line next to "Apply & Fetch" (list name hidden on small screens), filter chips sit next to the search field, "Parse"/"Clean" and "Save" share the row below.
- UI: header with version and last-sync badge, "Copy M3U URL" button (with fallback for plain-HTTP origins).

### Changed

- The runtime image no longer contains npm, corepack and yarn (not needed at runtime; keeps vulnerability scans free of findings in tooling that is not part of the application).
- Validation and playlist generation moved to `lib/` (testable); a failed sync keeps the last known good playlist.
- Syncs (cron and manual) can no longer overlap; configuration is only applied after a successful fetch.
- Settings are validated strictly; invalid persisted values are repaired automatically on startup.
- `mapping.json` is saved atomically, with a fallback for single-file bind mounts, and its entries are written in the order of the receiver's channel list (stale entries last, alphabetically).

### Fixed

- UI was missing document structure and header markup; the initial config load could fail silently.
- XSS via channel names / error messages in the UI; M3U injection via line breaks or quotes.
- SSRF possibilities through unvalidated receiver IP and port.
