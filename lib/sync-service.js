'use strict';

const { persistedSnapshot } = require('./state');
const { buildM3u8 } = require('./m3u8');

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
        const merged = currentSettings();
        for (const key of Object.keys(merged)) {
            const value = overrides[key];
            if ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number') merged[key] = value;
        }
        return validateSettings(merged);
    }

    async function persistState() {
        await configStore.write(persistedSnapshot(getState()));
    }

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
            await persistState();
            if (metrics) {
                metrics.syncRuns++;
                metrics.syncDurationMs = Date.now() - startedAt;
            }
            return result;
        } catch (err) {
            updateState(s => {
                s.sync.lastError = err.message;
                s.sync.lastErrorAt = new Date().toISOString();
                s.sync.consecutiveFailures++;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });
            if (metrics) metrics.syncFailures++;
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

module.exports = { createSyncService };
