'use strict';

const { HttpError } = require('../validation');
const hdhrModule = require('../hdhr');

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerConfigRoutes(app, ctx) {
    const {
        getState,
        updateState,
        currentSettings,
        mergeSettings,
        persistState,
        startBackgroundCron,
        syncCoordinator,
        receiver,
        validation,
        version,
        hdhrConfig,
        logger,
        performSync
    } = ctx;
    const { validateMapping } = validation;

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

        ctx.rebuildViews();
        persistState();
        startBackgroundCron();
        res.json({ success: true, message: 'Configuration imported successfully' });
    });
}

module.exports = { registerConfigRoutes };
