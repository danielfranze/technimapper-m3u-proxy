# Architecture Decision Records (ADRs)

This directory contains the architectural decisions for TechniMapper. Numbering starts at 0004; earlier records predate the current repository history and are not available here.

| ADR                                                                            | Title                                                       | Status                            | Date       | Notes                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------- | ---------- | -------------------------------------------------------------- |
| [0004](0004-release-1.8.0-testability-security.md)                             | Release 1.8.0: testable server, security hardening          | Accepted                          | 2026-11-20 | –                                                              |
| [0005](0005-typescript-readiness.md)                                           | TypeScript readiness without a big-bang migration           | Accepted (updated 2026-11-24)     | 2026-11-20 | Backend part still applies; frontend part superseded by 0007.  |
| [0006](0006-api-style.md)                                                      | REST API style                                              | Accepted                          | 2026-11-25 | `docs/openapi.yaml` is the authoritative API reference.        |
| [0007](0007-frontend-typescript.md)                                            | Frontend TypeScript with plain `tsc` (no bundler)           | Accepted                          | 2026-11-25 | Supersedes the frontend part of 0005; shipped in 2.0.0.        |

When adding a new decision, use the next sequential number and add it to this table.
