# Threat model (release 1.8.0)

## Scope

TechniMapper is intended for a trusted home/office LAN. It is not intended for
exposure to untrusted networks. The server talks UPnP/SOAP to a TechniSat
receiver, serves a playlist and an HDHomeRun emulator to local clients.

## Trust zones

1. **Network:** clients on the LAN.
2. **Admin boundary:** Basic Auth for `/api/*` and the UI when both
   `ADMIN_USER` and `ADMIN_PASSWORD` are configured; public endpoints are
   `/health`, `/health/live`, `/health/ready`, `/playlist.m3u8` and `/hdhr/*`.
3. **Receiver:** only a private IPv4 target (RFC1918 by default).

## Identified threats and mitigations

| Threat                                       | Mitigation in 1.8.0                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| LAN SSRF/port scan via `/api/fetch-channels` | Receiver target changes go through authenticated `POST /api/save-settings`; sync uses stored settings. Private-IP validation remains. |
| CSRF on state-changing `/api/*`              | JSON content-type required; same-origin `Origin`/`Referer` guard.                                                                     |
| Auth brute force                             | Failed auth attempts are throttled before credentials are checked.                                                                    |
| API abuse                                    | Bounded in-memory rate limiter for all `/api` routes.                                                                                 |
| XML entity/size abuse                        | UPnP response size limit (2 MiB, configurable); parser rejects non-http(s) URLs.                                                      |
| Information disclosure                       | No external fonts/CDNs, `Permissions-Policy`, HSTS option, no-store for API/health.                                                   |
| Receiver standby/failure                     | Last known playlist is retained; health/readiness expose degraded state.                                                              |
| Abusive client memory growth                 | Rate limits, JSON body limit, UPnP size limit, bounded maps.                                                                          |
| Graceful shutdown while syncing              | Shutdown waits for the active sync and uses a larger hard deadline.                                                                   |
| Startup crash from bad env                   | `TRUST_PROXY=false`/`0` are accepted; invalid values downgrade to `false`.                                                            |

## Known accepted risks

- Without configured auth, LAN clients can change/read settings. This is the
  documented trust model.
- Receiver stream URLs are exposed by public endpoints by design for M3U8
  and HDHomeRun clients.
- Obsolete threat: none known in this release.
