// @ts-check
'use strict';

/**
 * Application state helpers.
 *
 * Release 1 keeps the state as a single mutable object so the HTTP behaviour does
 * not change while the server becomes testable. Release 2 replaces the mutation
 * points with an immutable snapshot store (see the architecture roadmap).
 */

const DEFAULT_CONFIG = Object.freeze({
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: '*/5 * * * *',
    selectedListName: 'TV-Liste',
    mapping: Object.freeze({}),
    channels: Object.freeze([]),
    lastSync: null,
    detectedModel: null
});

/**
 * @param {{ config?: Record<string, unknown>, sync?: Record<string, unknown>, configured?: boolean, cachedM3u8?: string | null, lineupEntries?: unknown[] }} [overrides]
 * @returns {any}
 */
function createState(overrides = {}) {
    const config = {
        ...DEFAULT_CONFIG,
        mapping: {},
        channels: [],
        ...(overrides.config || {})
    };

    return {
        config,
        sync: {
            lastError: null,
            lastErrorAt: null,
            lastAttemptAt: null,
            lastDurationMs: null,
            consecutiveFailures: 0,
            ...(overrides.sync || {})
        },
        configured: Boolean(overrides.configured),
        cachedM3u8: overrides.cachedM3u8 ?? null,
        lineupEntries: Array.isArray(overrides.lineupEntries) ? [...overrides.lineupEntries] : []
    };
}

/**
 * The subset of the state that belongs in mapping.json.
 * @param {any} state
 * @returns {Record<string, unknown>}
 */
function persistedSnapshot(state) {
    const config = state.config;
    return {
        ip: config.ip,
        port: config.port,
        cronExpression: config.cronExpression,
        selectedListName: config.selectedListName,
        mapping: { ...config.mapping },
        channels: config.channels.map(channel => ({ name: channel.name, url: channel.url })),
        lastSync: config.lastSync,
        detectedModel: config.detectedModel
    };
}

/**
 * Replaces invalid persisted values (port, cron, list name) with defaults so that one corrupt
 * field cannot disable background sync. The receiver IP is left untouched (there is no safe default).
 * @param {any} state
 * @param {any} deps
 * @returns {boolean} true if anything was changed
 */
function repairPersistedSettings(state, deps) {
    const { cronValidate, isAllowedReceiverIp, defaultCron = '*/5 * * * *', logger } = deps;
    const config = state.config;
    let changed = false;

    const fix = (field, fallback, reason) => {
        logger.warn(`Persisted ${field} "${config[field]}" is invalid (${reason}) - resetting to "${fallback}".`);
        config[field] = fallback;
        changed = true;
    };

    const portStr = String(config.port).trim();
    const portNum = parseInt(portStr, 10);
    if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) fix('port', '9100', 'not a port number');

    const cronStr = String(config.cronExpression).trim();
    if (cronStr.length > 100 || !cronValidate(cronStr)) fix('cronExpression', defaultCron, 'not a cron expression');

    const listName = String(config.selectedListName).trim();
    if (!listName || listName.length > 200) fix('selectedListName', 'TV-Liste', 'empty or too long');

    if (!isAllowedReceiverIp(config.ip)) {
        logger.warn(`Persisted receiver IP "${config.ip}" is not allowed - please correct it in the UI.`);
    }
    return changed;
}

/**
 * Applies a parsed mapping.json to the state. Invalid values are dropped or repaired;
 * nothing here talks to the receiver or the HTTP layer.
 *
 * @param {any} state
 * @param {unknown} parsed
 * @param {any} deps
 * @returns {{ changed: boolean, droppedMapping: number }}
 */
function applyPersistedState(state, parsed, deps) {
    const { validateMapping, sortMapping, sanitizeModel, logger } = deps;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');

    const { mapping, invalid } = validateMapping(parsed.mapping);
    if (invalid.length) logger.warn(`Dropped ${invalid.length} invalid mapping entries from disk.`);

    const channels = Array.isArray(parsed.channels)
        ? parsed.channels.filter(channel => channel && typeof channel.name === 'string' && typeof channel.url === 'string')
        : [];

    const config = state.config;
    config.ip = typeof parsed.ip === 'string' ? parsed.ip : config.ip;
    config.port = parsed.port !== undefined ? String(parsed.port) : config.port;
    config.cronExpression = typeof parsed.cronExpression === 'string' ? parsed.cronExpression : config.cronExpression;
    config.selectedListName = typeof parsed.selectedListName === 'string' ? parsed.selectedListName : config.selectedListName;
    config.lastSync = typeof parsed.lastSync === 'string' ? parsed.lastSync : null;
    config.detectedModel = sanitizeModel(parsed.detectedModel);
    config.mapping = sortMapping(mapping, channels.map(channel => channel.name));
    config.channels = channels;
    state.configured = true;

    const changed = repairPersistedSettings(state, deps);
    return { changed, droppedMapping: invalid.length };
}

module.exports = {
    DEFAULT_CONFIG,
    createState,
    persistedSnapshot,
    repairPersistedSettings,
    applyPersistedState
};
