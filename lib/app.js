'use strict';

/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an already-created state object.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 */

const express = require('express');
const compression = require('compression');
const path = require('path');
const { HttpError, findDuplicateIds, findDuplicateGroups, partitionMapping } = require('./validation');
const { buildM3u8 } = require('./m3u8');
const hdhrModule = require('./hdhr');
const { persistedSnapshot } = require('./state');
const { securityHeaders, createAuth, createRateLimiter, createOriginGuard } = require('./http-security');

/**
 * @param {{
 *   runtime: object,
 *   logger: object,
 *   state: object,
 *   configStore: { write: Function },
 *   receiver: { fetchChannels: Function },
 *   validation: { validateSettings: Function, validateMapping: Function },
 *   cron: { validate: Function, schedule: Function },
 *   version: string,
 *   hdhrConfig?: object,
 *   publicDir?: string
 * }} deps
 */
function createApp(deps) {
    const {
        runtime,
        logger,
        state,
        configStore,
        receiver,
        validation,
        cron,
        version,
        hdhrConfig = { enabled: false },
        publicDir = path.join(__dirname, '..', 'public')
    } = deps;

    const { validateSettings, validateMapping } = validation;
    const playlistPaths = runtime.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];
    const publicPaths = runtime.publicPaths || [...playlistPaths, '/health', '/health/live', '/health/ready'];

    let cronTask = null;
    let shuttingDown = false;
    let syncActive = false;
    let syncLock = Promise.resolve();

    const app = express();
    app.disable('x-powered-by');
    if (runtime.trustProxy !== false && runtime.trustProxy !== undefined) {
        app.set('trust proxy', runtime.trustProxy);
    }

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

    // -----------------------------------------------------------------------
    // State helpers
    // -----------------------------------------------------------------------
    function currentSettings() {
        const { ip, port, cronExpression, selectedListName } = state.config;
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
        configStore.write(persistedSnapshot(state));
    }

    /** Rebuilds the cached playlist and HDHomeRun lineup from channels + mapping. */
    function rebuildViews() {
        const { m3u8, count } = buildM3u8(state.config.channels, state.config.mapping);
        state.cachedM3u8 = count > 0 ? m3u8 : null;
        state.lineupEntries = hdhrModule.buildLineup(state.config.channels, state.config.mapping);
        if (count === 0) logger.warn('No mapped channels - /playlist.m3u8 will answer 503 until channels are mapped.');
        return count;
    }

    /** Fetches from the receiver and commits the new state only if the fetch succeeded. */
    async function performSync(candidate) {
        const startedAt = Date.now();
        state.sync.lastAttemptAt = new Date().toISOString();

        try {
            const result = await receiver.fetchChannels(candidate);

            Object.assign(state.config, {
                ip: candidate.ip,
                port: candidate.port,
                cronExpression: candidate.cronExpression,
                selectedListName: result.selectedListName,
                channels: result.channels,
                detectedModel: hdhrModule.modelLabel(result.detectedModel),
                lastSync: new Date().toISOString()
            });
            state.configured = true;
            state.sync.lastError = null;
            state.sync.lastErrorAt = null;
            state.sync.consecutiveFailures = 0;
            state.sync.lastDurationMs = Date.now() - startedAt;

            rebuildViews();
            persistState();
            return result;
        } catch (err) {
            state.sync.lastError = err.message;
            state.sync.lastErrorAt = new Date().toISOString();
            state.sync.consecutiveFailures++;
            state.sync.lastDurationMs = Date.now() - startedAt;
            // Last-known-good: cached playlist and channels stay untouched.
            throw err;
        }
    }

    function withSyncLock(fn) {
        const run = syncLock.then(async () => {
            syncActive = true;
            try {
                return await fn();
            } finally {
                syncActive = false;
            }
        });
        syncLock = run.catch(() => {});
        return run;
    }

    async function runScheduledSync() {
        if (shuttingDown) return;
        if (syncActive) {
            logger.warn('Previous sync still running - skipping this run.');
            return;
        }

        let candidate;
        try {
            candidate = validateSettings(currentSettings());
        } catch (err) {
            logger.error(`[Sync] Invalid stored settings: ${err.message}`);
            return;
        }

        try {
            await withSyncLock(() => performSync(candidate));
        } catch (err) {
            logger.error(`[Sync] ${err.message} (consecutive failures: ${state.sync.consecutiveFailures}) - serving last known playlist.`);
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
        const pattern = state.config.cronExpression || runtime.defaultCron;
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
        const hasPlaylist = state.cachedM3u8 !== null;
        const status = !state.configured || (hasPlaylist && state.sync.consecutiveFailures < 3) ? 'ok' : 'degraded';
        return {
            status,
            version,
            configured: state.configured,
            playlistAvailable: hasPlaylist,
            lastSync: state.config.lastSync,
            lastAttemptAt: state.sync.lastAttemptAt,
            lastError: state.sync.lastError,
            lastErrorAt: state.sync.lastErrorAt,
            lastDurationMs: state.sync.lastDurationMs,
            consecutiveFailures: state.sync.consecutiveFailures,
            channels: state.config.channels.length,
            mappedChannels: Object.keys(state.config.mapping).length,
            uptimeSeconds: Math.round(process.uptime())
        };
    }

    app.get('/health', (req, res) => res.json(healthPayload()));

    app.get('/health/live', (req, res) => {
        res.json({ status: 'ok', version, uptimeSeconds: Math.round(process.uptime()) });
    });

    app.get('/health/ready', (req, res) => {
        const payload = healthPayload();
        const ready = !state.configured || (payload.playlistAvailable && payload.status === 'ok');
        res.status(ready ? 200 : 503).json({ ...payload, status: ready ? payload.status : 'degraded' });
    });

    // -----------------------------------------------------------------------
    // REST API
    // -----------------------------------------------------------------------
    app.get('/api/get-config', (req, res) => {
        res.json({
            version,
            ip: state.config.ip,
            port: state.config.port,
            cronExpression: state.config.cronExpression,
            selectedListName: state.config.selectedListName,
            lastSync: state.config.lastSync,
            lastError: state.sync.lastError,
            lastErrorAt: state.sync.lastErrorAt,
            consecutiveFailures: state.sync.consecutiveFailures,
            hdhrEnabled: hdhrConfig.enabled
        });
    });

    app.post('/api/save-settings', (req, res) => {
        const settings = mergeSettings(req.body || {});
        Object.assign(state.config, settings);
        state.configured = true;
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
            if (state.configured && (body.ip !== undefined || body.port !== undefined)) {
                if (candidate.ip !== state.config.ip || candidate.port !== state.config.port) {
                    throw new HttpError(409, 'Receiver address changed. Save the settings first, then fetch channels.');
                }
            }

            const result = await withSyncLock(() => performSync(candidate));
            startBackgroundCron();

            res.json({
                channels: state.config.channels.map(channel => channel.name),
                availableLists: result.availableLists,
                selectedListName: state.config.selectedListName,
                mapping: state.config.mapping,
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

        state.config.mapping = mapping;
        rebuildViews();
        persistState();

        // Only channels that currently exist on the receiver can collide in the playlist;
        // entries of vanished channels are reported separately as "orphans".
        const { active, orphans } = partitionMapping(mapping, state.config.channels.map(channel => channel.name));
        res.json({
            success: true,
            mappedCount: Object.keys(mapping).length,
            duplicates: findDuplicateIds(active),
            duplicateGroups: findDuplicateGroups(active),
            orphans
        });
    });

    app.get('/api/export-config', (req, res) => {
        res.setHeader('Content-Disposition', 'attachment; filename="technimapper-config.json"');
        res.json({
            version,
            exportedAt: new Date().toISOString(),
            config: currentSettings(),
            mapping: state.config.mapping || {}
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

        if (settings) Object.assign(state.config, settings);
        if (mapping) state.config.mapping = mapping;
        state.configured = true;

        rebuildViews();
        persistState();
        startBackgroundCron();
        res.json({ success: true, message: 'Configuration imported successfully' });
    });

    const servePlaylist = (req, res) => {
        if (state.cachedM3u8 === null) {
            // Never serve an empty playlist: clients that clean up missing channels would delete all of them.
            res.set('Retry-After', '60');
            return res.status(503).type('text/plain').send('Playlist not available: no channels synced or mapped yet.');
        }
        res.set('Cache-Control', 'no-cache');
        return res.type('audio/x-mpegurl; charset=utf-8').send(state.cachedM3u8);
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

        hdhrRouter.get('/discover.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.discoverPayload(baseUrl, hdhrConfig, state.config.detectedModel))));
        hdhrRouter.get('/lineup_status.json', (req, res) => res.json(hdhrModule.LINEUP_STATUS));
        hdhrRouter.get('/lineup.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.lineupPayload(state.lineupEntries, baseUrl))));

        // Clients call this to start a channel scan. The lineup comes from the mapping, so there is nothing to scan.
        hdhrRouter.post('/lineup.post', (req, res) => res.sendStatus(200));

        hdhrRouter.get('/stream/:id', (req, res) => {
            const entry = state.lineupEntries.find(item => item.guideNumber === req.params.id);
            if (!entry) return res.status(404).type('text/plain').send('Stream not found');
            return res.redirect(302, entry.url);
        });

        app.use('/hdhr', hdhrRouter);
    }

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

    return {
        app,
        state,
        services: {
            performSync,
            runScheduledSync,
            startBackgroundCron,
            stopBackgroundCron,
            rebuildViews,
            waitForSync: () => syncLock,
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
