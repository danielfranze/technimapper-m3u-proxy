'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSyncService = createSyncService;
const state_js_1 = require("./state.js");
const m3u8_js_1 = require("./m3u8.js");
const validation_js_1 = require("./validation.js");
/**
 * Application service for receiver sync and playlist state.
 *
 * Extracting this from the HTTP layer keeps route handlers thin and makes the
 * sync flow reusable and testable without Express.
 *
 * @param {object} deps
 */
function createSyncService({ state, configStore, receiver, validation, hdhrModule, logger, metrics }) {
    const { validateSettings } = validation;
    function getState() {
        return state.get();
    }
    function updateState(mutator) {
        return state.update(mutator);
    }
    function currentSettings() {
        const { ip, port, cronExpression, selectedListName } = getState().config;
        return { ip, port, cronExpression, selectedListName };
    }
    function mergeSettings(overrides = {}) {
        if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
            throw new validation_js_1.HttpError(400, 'Invalid settings payload');
        }
        const merged = currentSettings();
        // A key that is explicitly present overrides the stored value, even when
        // it is empty: validateSettings() then rejects it instead of silently
        // keeping the old value. Keys that are absent leave the stored value.
        for (const key of Object.keys(merged)) {
            if (Object.prototype.hasOwnProperty.call(overrides, key)) {
                merged[key] = overrides[key];
            }
        }
        return validateSettings(merged);
    }
    async function persistState() {
        await configStore.write((0, state_js_1.persistedSnapshot)(getState()));
    }
    function rebuildViews() {
        const snapshot = getState();
        const { m3u8, count } = (0, m3u8_js_1.buildM3u8)(snapshot.config.channels, snapshot.config.mapping);
        updateState(s => {
            s.cachedM3u8 = count > 0 ? m3u8 : null;
            s.lineupEntries = hdhrModule.buildLineup(s.config.channels, s.config.mapping);
        });
        if (count === 0)
            logger.warn('No mapped channels - /playlist.m3u8 will answer 503 until channels are mapped.');
        return count;
    }
    async function performSync(candidate) {
        const startedAt = Date.now();
        updateState(s => { s.sync.lastAttemptAt = new Date().toISOString(); });
        // Snapshot taken after the attempt timestamp is recorded but before any
        // receiver result is applied. Used to roll back in-memory state if
        // persistence fails, so memory and disk stay consistent.
        let preApplySnapshot = null;
        try {
            const result = await receiver.fetchChannels(candidate);
            // Compare-and-set: if the receiver target changed while this sync was
            // in flight (another save-settings/import-config/fetch-channels), the
            // result belongs to the old target and must not overwrite the new
            // settings or be persisted. The newer operation will run next.
            const current = currentSettings();
            const stale = current.ip !== candidate.ip
                || current.port !== candidate.port
                || current.cronExpression !== candidate.cronExpression
                || current.selectedListName !== candidate.selectedListName;
            if (stale) {
                logger.warn('[Sync] Receiver settings changed during sync - discarding result.');
                return { ...result, stale: true };
            }
            preApplySnapshot = getState();
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
            try {
                await persistState();
            }
            catch (persistErr) {
                // Roll back the in-memory changes so a failed write does not leave
                // phantom state that differs from what is stored on disk.
                if (preApplySnapshot && typeof state.commit === 'function') {
                    state.commit(preApplySnapshot);
                }
                throw persistErr;
            }
            if (metrics) {
                metrics.syncRuns++;
                metrics.syncDurationMs = Date.now() - startedAt;
            }
            return result;
        }
        catch (err) {
            updateState(s => {
                s.sync.lastError = err.message;
                s.sync.lastErrorAt = new Date().toISOString();
                s.sync.consecutiveFailures++;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });
            if (metrics)
                metrics.syncFailures++;
            // Last-known-good: cached playlist and channels stay untouched.
            throw err;
        }
    }
    return {
        getState,
        updateState,
        currentSettings,
        mergeSettings,
        persistState,
        rebuildViews,
        performSync
    };
}
//# sourceMappingURL=sync-service.js.map