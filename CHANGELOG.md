# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
