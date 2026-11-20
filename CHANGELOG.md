# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
