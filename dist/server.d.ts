/**
 * ============================================================================
 * TechniMapper - M3U8 Proxy & Channel Mapping Server
 * ============================================================================
 * Node.js Express backend that talks to TechniSat receivers via UPnP/SOAP,
 * reads the live TV channel list and serves it as a stable M3U8 playlist and as an HDHomeRun tuner.
 *
 * This file is the composition root: it reads the environment, creates the
 * adapters, loads the persisted state and owns the process lifecycle. HTTP
 * routes and sync logic live in lib/app.js.
 *
 * Environment variables (all optional):
 *   PORT                  HTTP port the server listens on (default 9191)
 *   DATA_DIR              Directory for mapping.json (default ./data)
 *   REQUEST_TIMEOUT_MS    Idle timeout per SOAP request (default 5000)
 *   MAX_RESPONSE_BYTES    Maximum UPnP response size (default 2 MiB)
 *   SHUTDOWN_TIMEOUT_MS   Hard shutdown deadline (default 30000)
 *   LOG_LEVEL             error | warn | info (default info)
 *   LOG_FORMAT            text | json (default text)
 *   TRUST_PROXY           Reverse-proxy hops (number) or "true"; needed for correct client IPs
 *   HSTS                  "true" adds Strict-Transport-Security (only behind TLS)
 *   HDHR_ENABLED          "false" disables the HDHomeRun emulation below /hdhr (default: enabled)
 *   HDHR_FRIENDLY_NAME    Tuner name in Plex/Jellyfin. Default "-" = automatic: "TechniSat <detected model>"
 *   HDHR_DEVICE_ID        8 hex digits, must be unique per tuner on your network (default 12345678)
 *   HDHR_TUNER_COUNT      Number of tuners reported to the client, 1-16 (default 2)
 *   ALLOW_NON_PRIVATE_IP  "true" to allow receiver IPs outside RFC1918 ranges
 *                         (e.g. VPN/CGNAT such as 100.64.0.0/10)
 *   ADMIN_USER / ADMIN_PASSWORD
 *                         Enables HTTP Basic Auth for the UI and /api/*.
 *                         /playlist.m3u8, /health and /hdhr/* stay public.
 * ============================================================================
 */
declare const APP_VERSION: string;
declare function main(): Promise<void>;
export { APP_VERSION, main };
