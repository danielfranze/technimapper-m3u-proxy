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
exports.createApp = createApp;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const compression = require('compression');
const node_path_1 = __importDefault(require("node:path"));
const hdhrModule = __importStar(require("./hdhr.js"));
const state_store_js_1 = require("./state-store.js");
const sync_coordinator_js_1 = require("./sync-coordinator.js");
const http_security_js_1 = require("./http-security.js");
const health_js_1 = require("./routes/health.js");
const config_js_1 = require("./routes/config.js");
const mapping_js_1 = require("./routes/mapping.js");
const playlist_js_1 = require("./routes/playlist.js");
const hdhr_js_1 = require("./routes/hdhr.js");
const metrics_js_1 = require("./routes/metrics.js");
const sync_service_js_1 = require("./sync-service.js");
/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 *
 * @param {any} deps
 */
function createApp(deps) {
    const { runtime, logger, state: stateDep, configStore, receiver, validation, cron, version, hdhrConfig = { enabled: false }, publicDir = node_path_1.default.join(__dirname, '..', 'public'), syncCoordinator: syncCoordinatorDep } = deps;
    const state = (typeof stateDep?.get === 'function')
        ? stateDep
        : (0, state_store_js_1.createStateStore)(stateDep);
    const { validateSettings, validateMapping } = validation;
    const playlistPaths = runtime.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];
    const publicPaths = runtime.publicPaths || [...playlistPaths, '/health', '/health/live', '/health/ready'];
    let cronTask = null;
    let shuttingDown = false;
    const syncCoordinator = syncCoordinatorDep || (0, sync_coordinator_js_1.createSyncCoordinator)({
        maxQueue: 4,
        backoffBaseMs: 5000,
        backoffMaxMs: 300000
    });
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    if (runtime.trustProxy !== false && runtime.trustProxy !== undefined) {
        app.set('trust proxy', runtime.trustProxy);
    }
    // Request context: a stable ID for correlating logs and responses.
    app.use((req, res, next) => {
        const requestId = (typeof crypto_1.default !== 'undefined' && crypto_1.default.randomUUID)
            ? crypto_1.default.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);
        next();
    });
    app.use((0, http_security_js_1.securityHeaders)({ hsts: runtime.hsts }));
    app.use(compression());
    const auth = (0, http_security_js_1.createAuth)({
        user: runtime.adminUser,
        password: runtime.adminPassword,
        publicPaths,
        failureWindowMs: runtime.authFailureWindowMs,
        failureMax: runtime.authFailureMax,
        logger
    });
    app.use(auth);
    // State-changing API requests must be JSON and same-origin. This also blocks
    // the "empty fetch()" CSRF vector on /api/fetch-channels.
    app.use('/api', (0, http_security_js_1.createOriginGuard)());
    app.use(express_1.default.json({ limit: '1mb' }));
    const apiLimiter = (0, http_security_js_1.createRateLimiter)({
        windowMs: runtime.apiRateWindowMs,
        max: runtime.apiRateMax,
        maxEntries: runtime.maxRateEntries
    });
    app.use('/api', apiLimiter);
    app.use(express_1.default.static(publicDir, {
        setHeaders: (res, filePath) => {
            // Bundled fonts rarely change: let browsers cache them for a week.
            if (filePath.endsWith('.woff2'))
                res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }));
    const metrics = { httpRequests: 0, httpErrors: 0, syncRuns: 0, syncFailures: 0, syncDurationMs: 0 };
    app.use((req, res, next) => {
        const startedAt = Date.now();
        res.on('finish', () => {
            metrics.httpRequests++;
            if (res.statusCode >= 400)
                metrics.httpErrors++;
            logger.info(`[${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
        });
        next();
    });
    // -----------------------------------------------------------------------
    // Application service (state, sync, persistence)
    // -----------------------------------------------------------------------
    const syncService = (0, sync_service_js_1.createSyncService)({
        state,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        hdhrModule,
        logger,
        metrics
    });
    const { getState, updateState, currentSettings, mergeSettings, persistState, rebuildViews, performSync } = syncService;
    async function runScheduledSync() {
        if (shuttingDown)
            return;
        if (syncCoordinator.active) {
            logger.warn('Previous sync still running - skipping this run.');
            return;
        }
        if (syncCoordinator.backoffRemainingMs() > 0) {
            logger.warn(`Sync is in backoff for ${syncCoordinator.backoffRemainingMs()} ms - skipping this run.`);
            return;
        }
        const snapshot = getState();
        let candidate;
        try {
            candidate = validateSettings(snapshot.config && {
                ip: snapshot.config.ip,
                port: snapshot.config.port,
                cronExpression: snapshot.config.cronExpression,
                selectedListName: snapshot.config.selectedListName
            });
        }
        catch (err) {
            logger.error(`[Sync] Invalid stored settings: ${err.message}`);
            return;
        }
        try {
            await syncCoordinator.request(() => performSync(candidate));
        }
        catch (err) {
            logger.error(`[Sync] ${err.message} (consecutive failures: ${syncCoordinator.consecutiveFailures}) - serving last known playlist.`);
        }
    }
    function stopBackgroundCron() {
        if (cronTask) {
            cronTask.stop();
            if (typeof cronTask.destroy === 'function')
                cronTask.destroy();
            cronTask = null;
        }
    }
    function startBackgroundCron() {
        stopBackgroundCron();
        const pattern = getState().config.cronExpression || runtime.defaultCron;
        if (!cron.validate(pattern)) {
            logger.error(`Invalid cron expression "${pattern}" - background sync disabled.`);
            return null;
        }
        try {
            cronTask = cron.schedule(pattern, runScheduledSync);
        }
        catch (err) {
            logger.error(`Failed to schedule background sync: ${err.message}`);
            cronTask = null;
        }
        return cronTask;
    }
    // -----------------------------------------------------------------------
    // Route registration (kept in separate modules for readability)
    // -----------------------------------------------------------------------
    const ctx = {
        runtime,
        logger,
        state,
        getState,
        updateState,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        cron,
        version,
        hdhrConfig,
        hdhrModule,
        metrics,
        syncCoordinator,
        currentSettings,
        mergeSettings,
        persistState,
        rebuildViews,
        performSync,
        runScheduledSync,
        startBackgroundCron,
        stopBackgroundCron,
        playlistPaths
    };
    (0, health_js_1.registerHealthRoutes)(app, ctx);
    (0, config_js_1.registerConfigRoutes)(app, ctx);
    (0, mapping_js_1.registerMappingRoutes)(app, ctx);
    (0, playlist_js_1.registerPlaylistRoutes)(app, ctx);
    (0, hdhr_js_1.registerHdhrRoutes)(app, ctx);
    (0, metrics_js_1.registerMetricsRoutes)(app, ctx);
    // 404 for unknown API routes, then central error handler
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((0, http_security_js_1.createErrorHandler)(logger));
    return {
        app,
        state,
        services: {
            performSync,
            runScheduledSync,
            startBackgroundCron,
            stopBackgroundCron,
            rebuildViews,
            waitForSync: () => syncCoordinator.waitForIdle(),
            beginShutdown() {
                shuttingDown = true;
                stopBackgroundCron();
            },
            dispose() {
                stopBackgroundCron();
            }
        }
    };
}
//# sourceMappingURL=app.js.map