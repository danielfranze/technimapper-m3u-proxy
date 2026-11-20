'use strict';
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");

/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 */

const path = require('path');
const { HttpError, findDuplicateIds, findDuplicateGroups, partitionMapping } = require('./validation');
const { buildM3u8 } = require('./m3u8');
const hdhrModule = require('./hdhr');
const { persistedSnapshot } = require('./state');
const { createStateStore } = require('./state-store');
const { createSyncCoordinator } = require('./sync-coordinator');
const { securityHeaders, createAuth, createRateLimiter, createOriginGuard } = require('./http-security');

/**
 * @param {{
 *   runtime: object,
 *   logger: object,
 *   state: object | { get: Function, commit: Function, update: Function },
 *   configStore: { write: Function },
 *   receiver: { fetchChannels: Function },
 *   validation: { validateSettings: Function, validateMapping: Function },
 *   cron: { validate: Function, schedule: Function },
 *   version: string,
 *   hdhrConfig?: object,
 *   publicDir?: string,
 *   syncCoordinator?: object
 * }} deps
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

    // Accept either an already-created store or a plain snapshot for backwards
    // compatibility with older callers and tests.
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

    app.use(express.static(publicDir, {
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
    // Health
    // -----------------------------------------------------------------------
    function healthPayload() {
        const snapshot = getState();
        const hasPlaylist = snapshot.cachedM3u8 !== null;
        const status = !snapshot.configured || (hasPlaylist && snapshot.sync.consecutiveFailures < 3) ? 'ok' : 'degraded';
        return {
            status,
            version,
            configured: snapshot.configured,
            playlistAvailable: hasPlaylist,
            lastSync: snapshot.config.lastSync,
            lastAttemptAt: snapshot.sync.lastAttemptAt,
            lastError: snapshot.sync.lastError,
            lastErrorAt: snapshot.sync.lastErrorAt,
            lastDurationMs: snapshot.sync.lastDurationMs,
            consecutiveFailures: snapshot.sync.consecutiveFailures,
            channels: snapshot.config.channels.length,
            mappedChannels: Object.keys(snapshot.config.mapping).length,
            uptimeSeconds: Math.round(process.uptime()),
            syncQueueLength: syncCoordinator.queueLength,
            syncBackoffMs: syncCoordinator.backoffRemainingMs()
        };
    }

    app.get('/health', (req, res) => res.json(healthPayload()));

    app.get('/health/live', (req, res) => {
        res.json({ status: 'ok', version, uptimeSeconds: Math.round(process.uptime()) });
    });

    app.get('/health/ready', (req, res) => {
        const payload = healthPayload();
        const ready = !getState().configured || (payload.playlistAvailable && payload.status === 'ok');
        res.status(ready ? 200 : 503).json({ ...payload, status: ready ? payload.status : 'degraded' });
    });

    // -----------------------------------------------------------------------
    // REST API
    // -----------------------------------------------------------------------
    app.get('/api/get-config', (req, res) => {
        const snapshot = getState();
        res.json({
            version,
            ip: snapshot.config.ip,
            port: snapshot.config.port,
            cronExpression: snapshot.config.cronExpression,
            selectedListName: snapshot.config.selectedListName,
            lastSync: snapshot.config.lastSync,
            lastError: snapshot.sync.lastError,
            lastErrorAt: snapshot.sync.lastErrorAt,
            consecutiveFailures: snapshot.sync.consecutiveFailures,
            hdhrEnabled: hdhrConfig.enabled
        });
    });

    app.post('/api/save-settings', (req, res) => {
        const settings = mergeSettings(req.body || {});
        updateState(s => {
            Object.assign(s.config, settings);
            s.configured = true;
        });
        persistState();
        startBackgroundCron();
        res.json({ success: true, ...currentSettings() });
    });

    app.post('/api/fetch-channels', async (req, res, next) => {
        try {
            const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
            const candidate = mergeSettings(body);

            // Changing the receiver target is a separate settings operation. A sync
            // must not be usable as a general-purpose LAN port scanner.
            if (getState().configured && (body.ip !== undefined || body.port !== undefined)) {
                const snapshot = getState();
                if (candidate.ip !== snapshot.config.ip || candidate.port !== snapshot.config.port) {
                    throw new HttpError(409, 'Receiver address changed. Save the settings first, then fetch channels.');
                }
            }

            const result = await syncCoordinator.request(() => performSync(candidate));
            startBackgroundCron();

            const snapshot = getState();
            res.json({
                channels: snapshot.config.channels.map(channel => channel.name),
                availableLists: result.availableLists,
                selectedListName: snapshot.config.selectedListName,
                mapping: snapshot.config.mapping,
                detectedModel: hdhrModule.modelLabel(result.detectedModel)
            });
        } catch (err) {
            if (err instanceof HttpError) return next(err);
            logger.error('[fetch-channels]', err.message);
            return next(new HttpError(502, err.message || 'Receiver request failed'));
        }
    });

    app.post('/api/save-mapping', (req, res) => {
        const { mapping, invalid } = validateMapping(req.body?.mapping);
        if (invalid.length) {
            throw new HttpError(400, `Invalid channel ID for: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', ...' : ''}. Allowed: letters, digits, "_", "-", "." (max. 32 chars, not "." or "..").`);
        }

        updateState(s => { s.config.mapping = mapping; });
        rebuildViews();
        persistState();

        // Only channels that currently exist on the receiver can collide in the playlist;
        // entries of vanished channels are reported separately as "orphans".
        const snapshot = getState();
        const { active, orphans } = partitionMapping(mapping, snapshot.config.channels.map(channel => channel.name));
        res.json({
            success: true,
            mappedCount: Object.keys(mapping).length,
            duplicates: findDuplicateIds(active),
            duplicateGroups: findDuplicateGroups(active),
            orphans
        });
    });

    app.get('/api/export-config', (req, res) => {
        const snapshot = getState();
        res.setHeader('Content-Disposition', 'attachment; filename="technimapper-config.json"');
        res.json({
            version,
            exportedAt: new Date().toISOString(),
            config: currentSettings(),
            mapping: snapshot.config.mapping || {}
        });
    });

    app.post('/api/import-config', (req, res) => {
        const data = req.body;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Invalid JSON payload');

        // Validate everything first, apply afterwards (all-or-nothing).
        const settings = data.config ? mergeSettings(data.config) : null;
        let mapping = null;
        if (data.mapping !== undefined) {
            const checked = validateMapping(data.mapping);
            if (checked.invalid.length) throw new HttpError(400, `Invalid channel ID in import for: ${checked.invalid.slice(0, 5).join(', ')}`);
            mapping = checked.mapping;
        }

        updateState(s => {
            if (settings) Object.assign(s.config, settings);
            if (mapping) s.config.mapping = mapping;
            s.configured = true;
        });

        rebuildViews();
        persistState();
        startBackgroundCron();
        res.json({ success: true, message: 'Configuration imported successfully' });
    });

    const servePlaylist = (req, res) => {
        const snapshot = getState();
        if (snapshot.cachedM3u8 === null) {
            // Never serve an empty playlist: clients that clean up missing channels would delete all of them.
            res.set('Retry-After', '60');
            return res.status(503).type('text/plain').send('Playlist not available: no channels synced or mapped yet.');
        }
        res.set('Cache-Control', 'no-cache');
        return res.type('audio/x-mpegurl; charset=utf-8').send(snapshot.cachedM3u8);
    };
    playlistPaths.forEach(route => app.get(route, servePlaylist));

    // -----------------------------------------------------------------------
    // HDHomeRun emulation (Plex / Jellyfin): everything below /hdhr, public by design.
    // Streams are not proxied: the client is redirected (302) to the receiver.
    // -----------------------------------------------------------------------
    if (hdhrConfig.enabled) {
        const hdhrRouter = express.Router();

        // Absolute URLs are built from the Host header of the request (works behind any port mapping).
        const withBaseUrl = handler => (req, res) => {
            const baseUrl = hdhrModule.baseUrlFrom(req.protocol, req.get('host'));
            if (!baseUrl) return res.status(400).json({ error: 'Invalid Host header' });
            return handler(req, res, baseUrl);
        };

        hdhrRouter.use((req, res, next) => {
            res.setHeader('Cache-Control', 'no-store');
            next();
        });

        hdhrRouter.get('/discover.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.discoverPayload(baseUrl, hdhrConfig, getState().config.detectedModel))));
        hdhrRouter.get('/lineup_status.json', (req, res) => res.json(hdhrModule.LINEUP_STATUS));
        hdhrRouter.get('/lineup.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.lineupPayload(getState().lineupEntries, baseUrl))));

        // Clients call this to start a channel scan. The lineup comes from the mapping, so there is nothing to scan.
        hdhrRouter.post('/lineup.post', (req, res) => res.sendStatus(200));

        hdhrRouter.get('/stream/:id', (req, res) => {
            const entry = getState().lineupEntries.find(item => item.guideNumber === req.params.id);
            if (!entry) return res.status(404).type('text/plain').send('Stream not found');
            return res.redirect(302, entry.url);
        });

        app.use('/hdhr', hdhrRouter);
    }

    app.get('/metrics', (req, res) => {
        const snapshot = getState();
        res.type('text/plain; version=0.0.4');
        res.send(
            `# HELP technimapper_http_requests_total Total HTTP requests\n` +
            `# TYPE technimapper_http_requests_total counter\n` +
            `technimapper_http_requests_total ${metrics.httpRequests}\n` +
            `# HELP technimapper_http_errors_total Total HTTP responses with status >= 400\n` +
            `# TYPE technimapper_http_errors_total counter\n` +
            `technimapper_http_errors_total ${metrics.httpErrors}\n` +
            `# HELP technimapper_sync_runs_total Successful sync runs\n` +
            `# TYPE technimapper_sync_runs_total counter\n` +
            `technimapper_sync_runs_total ${metrics.syncRuns}\n` +
            `# HELP technimapper_sync_failures_total Failed sync runs\n` +
            `# TYPE technimapper_sync_failures_total counter\n` +
            `technimapper_sync_failures_total ${metrics.syncFailures}\n` +
            `# HELP technimapper_sync_duration_ms Last sync duration in milliseconds\n` +
            `# TYPE technimapper_sync_duration_ms gauge\n` +
            `technimapper_sync_duration_ms ${metrics.syncDurationMs}\n` +
            `# HELP technimapper_configured Whether a receiver configuration exists\n` +
            `# TYPE technimapper_configured gauge\n` +
            `technimapper_configured ${snapshot.configured ? 1 : 0}\n` +
            `# HELP technimapper_channels_total Receiver channels in the last sync\n` +
            `# TYPE technimapper_channels_total gauge\n` +
            `technimapper_channels_total ${snapshot.config.channels.length}\n` +
            `# HELP technimapper_sync_queue_length Pending sync requests\n` +
            `# TYPE technimapper_sync_queue_length gauge\n` +
            `technimapper_sync_queue_length ${syncCoordinator.queueLength}\n`
        );
    });

    // 404 for unknown API routes, then central error handler
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON payload' });
        if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
            return res.status(err.status).json({ error: 'Invalid request' });
        }
        logger.error('Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    });

    // Need crypto for request IDs.
    const crypto = require('crypto');

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
