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
 *   API_RATE_MAX          API requests per IP per minute (default 60)
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
 *   ALLOW_LOOPBACK_RECEIVER
 *                         "true" to allow 127.0.0.1 as a receiver (local mock testing only)
 *   ADMIN_USER / ADMIN_PASSWORD
 *                         Enables HTTP Basic Auth for the UI and /api/*.
 *                         /playlist.m3u8, /health and /hdhr/* stay public.
 * ============================================================================
 */

import path from 'node:path';
import cron from 'node-cron';
import { createApp } from './lib/app.js';
import { type ConfigStore, createJsonConfigStore } from './lib/config-store.js';
import * as hdhr from './lib/hdhr.js';
import { createLogger } from './lib/logger.js';
import { createSoapReceiver } from './lib/receiver.js';
import { loadRuntimeConfig } from './lib/runtime-config.js';
import { installShutdownHandlers, runShutdown } from './lib/shutdown.js';
import { applyPersistedState, createState, persistedSnapshot } from './lib/state.js';
import { createStateStore } from './lib/state-store.js';
import { createValidation, sortMapping } from './lib/validation.js';
import packageJson from './package.json' with { type: 'json' };

const APP_VERSION = packageJson.version;

import { errorMessage } from './lib/error-message.js';

async function main() {
    const runtime = loadRuntimeConfig(process.env);
    const logger = createLogger({ level: runtime.logLevel, format: runtime.logFormat });
    runtime.warnings.forEach((warning) => {
        logger.warn(warning);
    });

    let configStore!: ConfigStore;
    try {
        configStore = createJsonConfigStore({
            dataDir: runtime.dataDir,
            configFile: runtime.configFile,
            logger,
        });
        configStore.ensureDataDir();
    } catch (err) {
        logger.error(errorMessage(err));
        logger.error('If you use a bind mount with a non-root container, run: chown -R 1000:1000 <host-data-dir>');
        process.exit(1);
    }

    const validation = createValidation({
        cronValidate: (expr) => cron.validate(expr),
        allowNonPrivateIp: runtime.allowNonPrivateIp,
        allowLoopback: runtime.allowLoopbackReceiver,
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
                cronValidate: (expr) => cron.validate(expr),
                defaultCron: runtime.defaultCron,
                logger,
            });
            stateStore.commit(draft);
            if (result.changed) {
                try {
                    await configStore.write(persistedSnapshot(stateStore.get()));
                } catch (err) {
                    logger.error('Failed to persist repaired mapping.json:', errorMessage(err));
                }
            }
            logger.info('Configuration loaded from disk.');
        }
    } catch (err) {
        logger.error('Failed to read mapping.json (using defaults):', errorMessage(err));
    }

    const receiver = createSoapReceiver({
        requestTimeoutMs: runtime.requestTimeoutMs,
        maxResponseBytes: runtime.maxResponseBytes,
        logger,
    });

    const hdhrConfig = hdhr.resolveConfig(process.env);
    hdhrConfig.warnings.forEach((warning) => {
        logger.warn(warning);
    });

    const { app, services } = createApp({
        runtime,
        logger,
        state: stateStore,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        cron,
        version: APP_VERSION,
        hdhrConfig,
        publicDir: path.join(process.cwd(), 'public'),
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

    // Fail fast and visibly if the port is already in use or another listen error
    // occurs, instead of relying on the generic uncaught-exception path.
    server.on('error', (err: Error) => {
        logger.error(`Server failed to listen on port ${runtime.port}: ${err.message}`);
        process.exit(1);
    });

    let shuttingDown = false;
    function shutdown(signal: string) {
        if (shuttingDown) return;
        shuttingDown = true;
        services.beginShutdown();
        void runShutdown(signal, {
            server,
            waitForSync: services.waitForSync,
            stopBackgroundCron: services.stopBackgroundCron,
            dispose: services.dispose,
            logger,
            shutdownTimeoutMs: runtime.shutdownTimeoutMs,
        }).finally(() => process.exit(0));
    }

    installShutdownHandlers(shutdown);
    process.on('unhandledRejection', (reason: unknown) => {
        logger.error('Unhandled rejection:', reason);
        // Express 5 forwards rejected route promises, so an unhandled rejection
        // is a real bug: do not keep running in an unknown state.
        process.exit(1);
    });
    process.on('uncaughtException', (err: unknown) => {
        logger.error('Uncaught exception:', err);
        shutdown('uncaughtException');
    });
}

// In ESM, always run main (this file is the entry point).
main().catch((err: unknown) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

export { APP_VERSION, main };
