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

'use strict';

const cron = require('node-cron');
const packageJson = require('./package.json');
const { createLogger } = require('./lib/logger');
const { loadRuntimeConfig } = require('./lib/runtime-config');
const { createJsonConfigStore } = require('./lib/config-store');
const { createSoapReceiver } = require('./lib/receiver');
const { createState, applyPersistedState, persistedSnapshot } = require('./lib/state');
const { createStateStore } = require('./lib/state-store');
const { createValidation, sortMapping } = require('./lib/validation');
const hdhr = require('./lib/hdhr');
const { createApp } = require('./lib/app');

const APP_VERSION = packageJson.version;

async function main() {
    const runtime = loadRuntimeConfig(process.env);
    const logger = createLogger({ level: runtime.logLevel, format: runtime.logFormat });
    runtime.warnings.forEach(warning => logger.warn(warning));

    let configStore;
    try {
        configStore = createJsonConfigStore({
            dataDir: runtime.dataDir,
            configFile: runtime.configFile,
            logger
        });
        configStore.ensureDataDir();
    } catch (err) {
        logger.error(err.message);
        logger.error('If you use a bind mount with a non-root container, run: chown -R 1000:1000 <host-data-dir>');
        process.exit(1);
    }

    const validation = createValidation({
        cronValidate: expr => cron.validate(expr),
        allowNonPrivateIp: runtime.allowNonPrivateIp
    });
    const { validateMapping, validateSettings, isAllowedReceiverIp } = validation;

    const stateStore = createStateStore(createState());
    try {
        const parsed = configStore.read();
        if (parsed) {
            const draft = structuredClone(stateStore.get());
            const result = applyPersistedState(draft, parsed, {
                validateMapping,
                sortMapping,
                sanitizeModel: hdhr.sanitizeModel,
                isAllowedReceiverIp,
                cronValidate: expr => cron.validate(expr),
                defaultCron: runtime.defaultCron,
                logger
            });
            stateStore.commit(draft);
            if (result.changed) {
                try {
                    await configStore.write(persistedSnapshot(stateStore.get()));
                } catch (err) {
                    logger.error('Failed to persist repaired mapping.json:', err.message);
                }
            }
            logger.info('Configuration loaded from disk.');
        }
    } catch (err) {
        logger.error('Failed to read mapping.json (using defaults):', err.message);
    }

    const receiver = createSoapReceiver({
        requestTimeoutMs: runtime.requestTimeoutMs,
        maxResponseBytes: runtime.maxResponseBytes,
        logger
    });

    const hdhrConfig = hdhr.resolveConfig(process.env);
    hdhrConfig.warnings.forEach(warning => logger.warn(warning));

    const { app, services } = createApp({
        runtime,
        logger,
        state: stateStore,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        cron,
        version: APP_VERSION,
        hdhrConfig
    });

    if (stateStore.get().configured) services.rebuildViews(); // serve the last known playlist immediately

    const server = app.listen(runtime.port, () => {
        logger.info(`TechniMapper v${APP_VERSION} listening on port ${runtime.port}`);
        if (hdhrConfig.enabled) logger.info(`HDHomeRun emulation enabled at /hdhr (device ${hdhrConfig.deviceId})`);
        if (stateStore.get().configured) {
            services.startBackgroundCron();
            setTimeout(() => services.runScheduledSync(), 500); // refresh possibly stale URLs right after (re)start
        }
    });

    let shuttingDown = false;
    function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`${signal} received - shutting down gracefully.`);
        services.beginShutdown();

        // Hard stop if something still hangs. The budget is larger than the
        // maximum SOAP sync duration so a running sync can persist its result.
        const hardStop = setTimeout(() => {
            logger.error('Graceful shutdown timed out - forcing exit.');
            process.exit(1);
        }, runtime.shutdownTimeoutMs);
        hardStop.unref();

        server.close(async () => {
            try {
                await services.waitForSync(); // let a running sync finish (and persist) first
            } catch (err) {
                logger.error('Running sync failed during shutdown:', err.message);
            }
            try { receiver.close(); } catch (err) { /* ignore */ }
            services.dispose();
            clearTimeout(hardStop);
            process.exit(0);
        });
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', reason => logger.error('Unhandled rejection:', reason));
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception:', err);
        shutdown('uncaughtException');
    });
}

if (require.main === module) main();

module.exports = { main, APP_VERSION };
