import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { errorMessage } from './error-message.js';
import * as hdhrModule from './hdhr.js';
import { createAuth, createOriginGuard, createRateLimiter, securityHeaders } from './http-security.js';
import { registerAllRoutes } from './routes/index.js';
import { createSyncCoordinator } from './sync-coordinator.js';
import { createSyncService } from './sync-service.js';
/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 */
function createApp({ runtime, logger, state: stateDep, configStore, receiver, validation, cron, version, hdhrConfig = { enabled: false, friendlyName: null, deviceId: '00000000', tunerCount: 0, warnings: [] }, publicDir = path.join(__dirname, '..', 'public'), syncCoordinator: syncCoordinatorDep, }) {
    const state = stateDep;
    const { validateSettings, validateMapping } = validation;
    const playlistPaths = runtime.playlistPaths
        ? [...runtime.playlistPaths]
        : ['/playlist.m3u8', '/playlist.m3u'];
    const publicPaths = runtime.publicPaths
        ? [...runtime.publicPaths]
        : [...playlistPaths, '/health', '/health/live', '/health/ready'];
    let cronTask = null;
    let shuttingDown = false;
    const syncCoordinator = syncCoordinatorDep ||
        createSyncCoordinator({
            maxQueue: 4,
            backoffBaseMs: 5000,
            backoffMaxMs: 300000,
        });
    const app = express();
    app.disable('x-powered-by');
    if (runtime.trustProxy !== false && runtime.trustProxy !== undefined) {
        app.set('trust proxy', runtime.trustProxy);
    }
    // Request context: a stable ID for correlating logs and responses.
    app.use((req, res, next) => {
        const requestId = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);
        next();
    });
    app.use(securityHeaders({ hsts: runtime.hsts }));
    app.use(compression());
    const auth = createAuth({
        user: runtime.adminUser,
        password: runtime.adminPassword,
        publicPaths,
        failureWindowMs: runtime.authFailureWindowMs,
        failureMax: runtime.authFailureMax,
        logger,
    });
    app.use(auth);
    // State-changing API requests must be JSON and same-origin. This also blocks
    // the "empty fetch()" CSRF vector on /api/fetch-channels.
    app.use('/api', createOriginGuard());
    app.use(express.json({ limit: '1mb' }));
    const apiLimiter = createRateLimiter({
        windowMs: runtime.apiRateWindowMs,
        max: runtime.apiRateMax,
        maxEntries: runtime.maxRateEntries,
    });
    app.use('/api', apiLimiter);
    app.use(express.static(publicDir, {
        setHeaders: (res, filePath) => {
            // Bundled fonts rarely change: let browsers cache them for a week.
            if (filePath.endsWith('.woff2'))
                res.setHeader('Cache-Control', 'public, max-age=604800');
        },
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
    const syncService = createSyncService({
        state,
        configStore,
        receiver,
        validation: { validateSettings, validateMapping },
        hdhrModule,
        logger,
        metrics,
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
                selectedListName: snapshot.config.selectedListName,
            });
        }
        catch (err) {
            logger.error(`[Sync] Invalid stored settings: ${errorMessage(err)}`);
            return;
        }
        try {
            await syncCoordinator.request(() => performSync(candidate));
        }
        catch (err) {
            logger.error(`[Sync] ${errorMessage(err)} (consecutive failures: ${syncCoordinator.consecutiveFailures}) - serving last known playlist.`);
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
            logger.error(`Failed to schedule background sync: ${errorMessage(err)}`);
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
        playlistPaths,
    };
    registerAllRoutes(app, ctx);
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
            },
        },
    };
}
export { createApp };
//# sourceMappingURL=app.js.map