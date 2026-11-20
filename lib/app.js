'use strict';

const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const path = require('path');
const { HttpError, findDuplicateIds, findDuplicateGroups, partitionMapping } = require('./validation');
const { buildM3u8 } = require('./m3u8');
const hdhrModule = require('./hdhr');
const { persistedSnapshot } = require('./state');
const { createStateStore } = require('./state-store');
const { createSyncCoordinator } = require('./sync-coordinator');
const { securityHeaders, createAuth, createRateLimiter, createOriginGuard, createErrorHandler } = require('./http-security');
const { registerHealthRoutes } = require('./routes/health');
const { registerConfigRoutes } = require('./routes/config');
const { registerMappingRoutes } = require('./routes/mapping');
const { registerPlaylistRoutes } = require('./routes/playlist');
const { registerHdhrRoutes } = require('./routes/hdhr');
const { registerMetricsRoutes } = require('./routes/metrics');

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
    const {
        runtime,
        logger,
        state: stateDep,
        configStore,
        receiver,
        validation,
        cron,
        version,
        hdhrConfig = { enabled: false },
        publicDir = path.join(__dirname, '..', 'public'),
        syncCoordinator: syncCoordinatorDep
    } = deps;

    const state = (typeof stateDep?.get === 'function')
        ? stateDep
        : createStateStore(stateDep);

    const { validateSettings, validateMapping } = validation;
    const playlistPaths = runtime.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];
    const publicPaths = runtime.publicPaths || [...playlistPaths, '/health', '/health/live', '/health/ready'];

    const getState = () => state.get();
    const updateState = (mutator) => state.update(mutator);

    let cronTask = null;
    let shuttingDown = false;

    const syncCoordinator = syncCoordinatorDep || createSyncCoordinator({
        maxQueue: 4,
        backoffBaseMs: 5000,
        backoffMaxMs: 300000
    });

    const app = express();
    app.disable('x-powered-by');
    if (runtime.trustProxy !== false && runtime.trustProxy !== undefined) {
        app.set('trust proxy', runtime.trustProxy);
    }

    // Request context: a stable ID for correlating logs and responses.
    app.use((req, res, next) => {
        const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
        logger
    });
    app.use(auth);

    // State-changing API requests must be JSON and same-origin. This also blocks
    // the "empty fetch()" CSRF vector on /api/fetch-channels.
    app.use('/api', createOriginGuard());
    app.use(express.json({ limit: '1mb' }));

    const apiLimiter = createRateLimiter({
        windowMs: runtime.apiRateWindowMs,
        max: runtime.apiRateMax,
        maxEntries: runtime.maxRateEntries
    });
    app.use('/api', apiLimiter);

    app.use(express.static(path.join(__dirname, '..', 'public'), {
        setHeaders: (res, filePath) => {
            // Bundled fonts rarely change: let browsers cache them for a week.
            if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }));

    const metrics = { httpRequests: 0, httpErrors: 0, syncRuns: 0, syncFailures: 0, syncDurationMs: 0 };

    app.use((req, res, next) => {
        const startedAt = Date.now();
        res.on('finish', () => {
            metrics.httpRequests++;
            if (res.statusCode >= 400) metrics.httpErrors++;
            logger.info(`[${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
        });
        next();
    });

    // -----------------------------------------------------------------------
    // State helpers
    // -----------------------------------------------------------------------
    function currentSettings() {
        const { ip, port, cronExpression, selectedListName } = getState().config;
        return { ip, port, cronExpression, selectedListName };
    }

    /** Merges non-empty overrides into the current settings and validates the result. */
    function mergeSettings(overrides = {}) {
        const merged = currentSettings();
        for (const key of Object.keys(merged)) {
            const value = overrides[key];
            if ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number') merged[key] = value;
        }
        return validateSettings(merged);
    }

    function persistState() {
        configStore.write(persistedSnapshot(getState()));
    }

    /** Rebuilds the cached playlist and HDHomeRun lineup from channels + mapping. */
    function rebuildViews() {
        const snapshot = getState();
        const { m3u8, count } = buildM3u8(snapshot.config.channels, snapshot.config.mapping);
        updateState(s => {
            s.cachedM3u8 = count > 0 ? m3u8 : null;
            s.lineupEntries = hdhrModule.buildLineup(s.config.channels, s.config.mapping);
        });
        if (count === 0) logger.warn('No mapped channels - /playlist.m3u8 will answer 503 until channels are mapped.');
        return count;
    }

    /** Fetches from the receiver and commits the new state only if the fetch succeeded. */
    async function performSync(candidate) {
        const startedAt = Date.now();
        updateState(s => { s.sync.lastAttemptAt = new Date().toISOString(); });

        try {
            const result = await receiver.fetchChannels(candidate);

            updateState(s => {
                Object.assign(s.config, {
                    ip: candidate.ip,
                    port: candidate.port,
                    cronExpression: candidate.cronExpression,
                    selectedListName: result.selectedListName,
                    channels: result.channels,
                    detectedModel: hdhrModule.modelLabel(result.detectedModel),
                    lastSync: new Date().toISOString()
                });
                s.configured = true;
                s.sync.lastError = null;
                s.sync.lastErrorAt = null;
                s.sync.consecutiveFailures = 0;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });

            rebuildViews();
            persistState();
            metrics.syncRuns++;
            metrics.syncDurationMs = Date.now() - startedAt;
            return result;
        } catch (err) {
            updateState(s => {
                s.sync.lastError = err.message;
                s.sync.lastErrorAt = new Date().toISOString();
                s.sync.consecutiveFailures++;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });
            metrics.syncFailures++;
            // Last-known-good: cached playlist and channels stay untouched.
            throw err;
        }
    }

    async function runScheduledSync() {
        if (shuttingDown) return;
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
        } catch (err) {
            logger.error(`[Sync] Invalid stored settings: ${err.message}`);
            return;
        }

        try {
            await syncCoordinator.request(() => performSync(candidate));
        } catch (err) {
            logger.error(`[Sync] ${err.message} (consecutive failures: ${syncCoordinator.consecutiveFailures}) - serving last known playlist.`);
        }
    }

    function stopBackgroundCron() {
        if (cronTask) {
            cronTask.stop();
            if (typeof cronTask.destroy === 'function') cronTask.destroy();
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
        } catch (err) {
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

    registerHealthRoutes(app, ctx);
    registerConfigRoutes(app, ctx);
    registerMappingRoutes(app, ctx);
    registerPlaylistRoutes(app, ctx);
    registerHdhrRoutes(app, ctx);
    registerMetricsRoutes(app, ctx);

    // 404 for unknown API routes, then central error handler
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

    app.use(createErrorHandler(logger));

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

module.exports = { createApp };
