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
declare function createState(overrides?: Partial<AppState>): AppState;
/** The subset of the state that belongs in mapping.json. */
declare function persistedSnapshot(state: AppState): Record<string, unknown>;
interface RepairDeps {
    cronValidate(expr: string): boolean;
    isAllowedReceiverIp(ip: string): boolean;
    defaultCron?: string;
    logger: {
        warn(...args: unknown[]): void;
    };
}
interface ApplyPersistedDeps extends RepairDeps {
    validateMapping(input: unknown): {
        mapping: Record<string, string | number>;
        invalid: string[];
    };
    sortMapping(mapping: Record<string, string | number>, channelNames: string[]): Record<string, string | number>;
    sanitizeModel(model: unknown): string | null;
}
/**
 * Replaces invalid persisted values (port, cron, list name) with defaults so that one corrupt
 * field cannot disable background sync. The receiver IP is left untouched (there is no safe default).
 * Returns true if anything was changed.
 */
declare function repairPersistedSettings(state: AppState, deps: RepairDeps): boolean;
/**
 * Applies a parsed mapping.json to the state. Invalid values are dropped or repaired;
 * nothing here talks to the receiver or the HTTP layer.
 */
declare function applyPersistedState(state: AppState, parsed: unknown, deps: ApplyPersistedDeps): {
    changed: boolean;
    droppedMapping: number;
};
export { createState, persistedSnapshot, repairPersistedSettings, applyPersistedState };
