/**
 * Application state helpers.
 *
 * Release 1 keeps the state as a single mutable object so the HTTP behaviour does
 * not change while the server becomes testable. Release 2 replaces the mutation
 * points with an immutable snapshot store (see the architecture roadmap).
 */

import type { LineupEntry } from './hdhr.js';

interface Channel {
    name: string;
    url: string;
}

interface StateConfig {
    ip: string;
    port: string;
    cronExpression: string;
    selectedListName: string;
    mapping: Record<string, string | number>;
    channels: Channel[];
    lastSync: string | null;
    detectedModel: string | null;
    [key: string]: unknown;
}

interface StateSync {
    lastError: string | null;
    lastErrorAt: string | null;
    lastAttemptAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    [key: string]: unknown;
}

export interface AppState {
    config: StateConfig;
    sync: StateSync;
    configured: boolean;
    cachedM3u8: string | null;
    lineupEntries: LineupEntry[];
}

const DEFAULT_LIST_NAME = 'TV-Liste';

const DEFAULT_CONFIG = Object.freeze({
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: '*/5 * * * *',
    selectedListName: DEFAULT_LIST_NAME,
    mapping: Object.freeze({}),
    channels: Object.freeze([]),
    lastSync: null,
    detectedModel: null,
});

function createState(overrides: Partial<AppState> = {}): AppState {
    const config = {
        ...DEFAULT_CONFIG,
        mapping: {},
        channels: [],
        ...(overrides.config || {}),
    } as StateConfig;

    return {
        config,
        sync: {
            lastError: null,
            lastErrorAt: null,
            lastAttemptAt: null,
            lastDurationMs: null,
            consecutiveFailures: 0,
            ...(overrides.sync || {}),
        },
        configured: Boolean(overrides.configured),
        cachedM3u8: overrides.cachedM3u8 ?? null,
        lineupEntries: Array.isArray(overrides.lineupEntries) ? [...overrides.lineupEntries] : [],
    };
}

/** The subset of the state that belongs in mapping.json. */
function persistedSnapshot(state: AppState): Record<string, unknown> {
    const config = state.config;
    return {
        ip: config.ip,
        port: config.port,
        cronExpression: config.cronExpression,
        selectedListName: config.selectedListName,
        mapping: { ...config.mapping },
        channels: config.channels.map((channel) => ({ name: channel.name, url: channel.url })),
        lastSync: config.lastSync,
        detectedModel: config.detectedModel,
    };
}

interface RepairDeps {
    cronValidate(expr: string): boolean;
    isAllowedReceiverIp(ip: string): boolean;
    defaultCron?: string;
    logger: { warn(...args: unknown[]): void };
}

interface ApplyPersistedDeps extends RepairDeps {
    validateMapping(input: unknown): { mapping: Record<string, string | number>; invalid: string[] };
    sortMapping(mapping: Record<string, string | number>, channelNames: string[]): Record<string, string | number>;
    sanitizeModel(model: unknown): string | null;
}

/**
 * Replaces invalid persisted values (port, cron, list name) with defaults so that one corrupt
 * field cannot disable background sync. The receiver IP is left untouched (there is no safe default).
 * Returns true if anything was changed.
 */
function repairPersistedSettings(state: AppState, deps: RepairDeps): boolean {
    const { cronValidate, isAllowedReceiverIp, defaultCron = '*/5 * * * *', logger } = deps;
    const config = state.config;
    let changed = false;

    const fix = (field: string, fallback: string, reason: string) => {
        logger.warn(
            `Persisted ${field} "${String(config[field])}" is invalid (${reason}) - resetting to "${fallback}".`,
        );
        config[field] = fallback;
        changed = true;
    };

    const portStr = String(config.port).trim();
    const portNum = parseInt(portStr, 10);
    if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) fix('port', '9100', 'not a port number');

    const cronStr = String(config.cronExpression).trim();
    if (cronStr.length > 100 || !cronValidate(cronStr)) fix('cronExpression', defaultCron, 'not a cron expression');

    const listName = String(config.selectedListName).trim();
    if (!listName || listName.length > 200) fix('selectedListName', DEFAULT_LIST_NAME, 'empty or too long');

    if (!isAllowedReceiverIp(config.ip)) {
        logger.warn(`Persisted receiver IP "${config.ip}" is not allowed - please correct it in the UI.`);
    }
    return changed;
}

/**
 * Applies a parsed mapping.json to the state. Invalid values are dropped or repaired;
 * nothing here talks to the receiver or the HTTP layer.
 */
function applyPersistedState(
    state: AppState,
    parsed: unknown,
    deps: ApplyPersistedDeps,
): { changed: boolean; droppedMapping: number } {
    const { validateMapping, sortMapping, sanitizeModel, logger } = deps;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');

    const record = parsed as Record<string, unknown>;
    const { mapping, invalid } = validateMapping(record.mapping);
    if (invalid.length) logger.warn(`Dropped ${invalid.length} invalid mapping entries from disk.`);

    const rawChannels = record.channels;
    const channels: Channel[] = Array.isArray(rawChannels)
        ? rawChannels.filter(
              (c): c is Channel =>
                  !!c &&
                  typeof c === 'object' &&
                  typeof (c as Channel).name === 'string' &&
                  typeof (c as Channel).url === 'string',
          )
        : [];

    const config = state.config;
    config.ip = typeof record.ip === 'string' ? record.ip : config.ip;
    config.port = record.port !== undefined ? String(record.port) : config.port;
    config.cronExpression = typeof record.cronExpression === 'string' ? record.cronExpression : config.cronExpression;
    config.selectedListName =
        typeof record.selectedListName === 'string' ? record.selectedListName : config.selectedListName;
    config.lastSync = typeof record.lastSync === 'string' ? record.lastSync : null;
    config.detectedModel = sanitizeModel(record.detectedModel);
    config.mapping = sortMapping(
        mapping,
        channels.map((channel) => channel.name),
    );
    config.channels = channels;
    state.configured = true;

    const changed = repairPersistedSettings(state, deps);
    return { changed, droppedMapping: invalid.length };
}

export { applyPersistedState, createState, persistedSnapshot, repairPersistedSettings };
