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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_VERSION = void 0;
exports.main = main;
const node_cron_1 = __importDefault(require("node-cron"));
const node_path_1 = __importDefault(require("node:path"));
const package_json_1 = __importDefault(require("./package.json"));
const logger_js_1 = require("./lib/logger.js");
const runtime_config_js_1 = require("./lib/runtime-config.js");
const config_store_js_1 = require("./lib/config-store.js");
const receiver_js_1 = require("./lib/receiver.js");
const state_js_1 = require("./lib/state.js");
const state_store_js_1 = require("./lib/state-store.js");
const validation_js_1 = require("./lib/validation.js");
const hdhr = __importStar(require("./lib/hdhr.js"));
const app_js_1 = require("./lib/app.js");
const APP_VERSION = package_json_1.default.version;
exports.APP_VERSION = APP_VERSION;
async function main() {
    const runtime = (0, runtime_config_js_1.loadRuntimeConfig)(process.env);
    const logger = (0, logger_js_1.createLogger)({ level: runtime.logLevel, format: runtime.logFormat });
    runtime.warnings.forEach(warning => logger.warn(warning));
    let configStore;
    try {
        configStore = (0, config_store_js_1.createJsonConfigStore)({
            dataDir: runtime.dataDir,
            configFile: runtime.configFile,
            logger
        });
        configStore.ensureDataDir();
    }
    catch (err) {
        logger.error(err.message);
        logger.error('If you use a bind mount with a non-root container, run: chown -R 1000:1000 <host-data-dir>');
        process.exit(1);
    }
    const validation = (0, validation_js_1.createValidation)({
        cronValidate: expr => node_cron_1.default.validate(expr),
        allowNonPrivateIp: runtime.allowNonPrivateIp,
        allowLoopback: runtime.allowLoopbackReceiver
    });
    const { validateMapping, validateSettings, isAllowedReceiverIp } = validation;
    const stateStore = (0, state_store_js_1.createStateStore)((0, state_js_1.createState)());
    try {
        const parsed = configStore.read();
        if (parsed) {
            const draft = structuredClone(stateStore.get());
            const result = (0, state_js_1.applyPersistedState)(draft, parsed, {
                validateMapping,
                sortMapping: validation_js_1.sortMapping,
                sanitizeModel: hdhr.sanitizeModel,
                isAllowedReceiverIp,
                cronValidate: expr => node_cron_1.default.validate(expr),
                defaultCron: runtime.defaultCron,
                logger
            });
            stateStore.commit(draft);
            if (result.changed) {
                try {
                    await configStore.write((0, state_js_1.persistedSnapshot)(stateStore.get()));
                }
                catch (err) {
                    logger.error('Failed to persist repaired mapping.json:', err.message);
                }
            }
            logger.info('Configuration loaded from disk.');
        }
    }
    catch (err) {
        logger.error('Failed to read mapping.json (using defaults):', err.message);
    }
    const receiver = (0, receiver_js_1.createSoapReceiver)({
        requestTimeoutMs: runtime.requestTimeoutMs,
        maxResponseBytes: runtime.maxResponseBytes,
        logger
    });
    const hdhrConfig = hdhr.resolveConfig(process.env);
    hdhrConfig.warnings.forEach(warning => logger.warn(warning));
    const { app, services } = (0, app_js_1.createApp)({
        runtime,
        logger,
        state: stateStore,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        cron: node_cron_1.default,
        version: APP_VERSION,
        hdhrConfig,
        publicDir: node_path_1.default.join(process.cwd(), 'public')
    });
    if (stateStore.get().configured)
        services.rebuildViews(); // serve the last known playlist immediately
    const server = app.listen(runtime.port, () => {
        logger.info(`TechniMapper v${APP_VERSION} listening on port ${runtime.port}`);
        if (hdhrConfig.enabled)
            logger.info(`HDHomeRun emulation enabled at /hdhr (device ${hdhrConfig.deviceId})`);
        if (stateStore.get().configured) {
            services.startBackgroundCron();
            setTimeout(() => services.runScheduledSync(), 500); // refresh possibly stale URLs right after (re)start
        }
    });
    // Fail fast and visibly if the port is already in use or another listen error
    // occurs, instead of relying on the generic uncaught-exception path.
    server.on('error', (err) => {
        logger.error(`Server failed to listen on port ${runtime.port}: ${err.message}`);
        process.exit(1);
    });
    let shuttingDown = false;
    function shutdown(signal, exitCode = 0) {
        if (shuttingDown)
            return;
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
            }
            catch (err) {
                logger.error('Running sync failed during shutdown:', err.message);
            }
            try {
                receiver.close();
            }
            catch (err) { /* ignore */ }
            try {
                services.dispose();
            }
            catch (err) { /* ignore */ }
            clearTimeout(hardStop);
            process.exit(exitCode);
        });
        if (typeof server.closeIdleConnections === 'function')
            server.closeIdleConnections();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM', 0));
    process.on('SIGINT', () => shutdown('SIGINT', 0));
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection:', reason);
        // Express 5 forwards rejected route promises, so an unhandled rejection
        // is a real bug: do not keep running in an unknown state.
        process.exit(1);
    });
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception:', err);
        shutdown('uncaughtException', 1);
    });
}
if (require.main === module) {
    main().catch((err) => {
        console.error('Fatal startup error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map