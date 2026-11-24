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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConfigRoutes = registerConfigRoutes;
const validation_js_1 = require("../validation.js");
const hdhrModule = __importStar(require("../hdhr.js"));
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerConfigRoutes(app, ctx) {
    const { getState, updateState, state: stateStore, currentSettings, mergeSettings, persistState, startBackgroundCron, syncCoordinator, receiver, validation, version, hdhrConfig, logger, performSync } = ctx;
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
    app.post('/api/save-settings', async (req, res) => {
        const settings = mergeSettings(req.body || {});
        const before = getState();
        updateState(s => {
            Object.assign(s.config, settings);
            s.configured = true;
        });
        try {
            await persistState();
        }
        catch (err) {
            if (stateStore && typeof stateStore.commit === 'function')
                stateStore.commit(before);
            throw err;
        }
        if (typeof syncCoordinator.clearBackoff === 'function')
            syncCoordinator.clearBackoff();
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
                    throw new validation_js_1.HttpError(409, 'Receiver address changed. Save the settings first, then fetch channels.');
                }
            }
            const result = await syncCoordinator.request(() => performSync(candidate));
            if (result && result.stale) {
                throw new validation_js_1.HttpError(409, 'Receiver settings changed during sync. Please retry.');
            }
            startBackgroundCron();
            const snapshot = getState();
            res.json({
                channels: snapshot.config.channels.map(channel => channel.name),
                availableLists: result.availableLists,
                selectedListName: snapshot.config.selectedListName,
                mapping: snapshot.config.mapping,
                detectedModel: hdhrModule.modelLabel(result.detectedModel)
            });
        }
        catch (err) {
            const e = err;
            if (e instanceof validation_js_1.HttpError)
                return next(e);
            logger.error('[fetch-channels]', e.message);
            return next(new validation_js_1.HttpError(502, e.message || 'Receiver request failed'));
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
    app.post('/api/import-config', async (req, res) => {
        const data = req.body;
        if (!data || typeof data !== 'object' || Array.isArray(data))
            throw new validation_js_1.HttpError(400, 'Invalid JSON payload');
        const settings = data.config ? mergeSettings(data.config) : null;
        let mapping = null;
        if (data.mapping !== undefined) {
            const checked = validateMapping(data.mapping);
            if (checked.invalid.length)
                throw new validation_js_1.HttpError(400, `Invalid channel ID in import for: ${checked.invalid.slice(0, 5).join(', ')}`);
            mapping = checked.mapping;
        }
        const beforeImport = getState();
        updateState(s => {
            if (settings)
                Object.assign(s.config, settings);
            if (mapping)
                s.config.mapping = mapping;
            s.configured = true;
        });
        ctx.rebuildViews();
        try {
            await persistState();
        }
        catch (err) {
            if (stateStore && typeof stateStore.commit === 'function')
                stateStore.commit(beforeImport);
            throw err;
        }
        if (typeof syncCoordinator.clearBackoff === 'function')
            syncCoordinator.clearBackoff();
        startBackgroundCron();
        res.json({ success: true, message: 'Configuration imported successfully' });
    });
}
//# sourceMappingURL=config.js.map