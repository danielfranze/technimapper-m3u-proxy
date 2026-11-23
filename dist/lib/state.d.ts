/**
 * Application state helpers.
 *
 * Release 1 keeps the state as a single mutable object so the HTTP behaviour does
 * not change while the server becomes testable. Release 2 replaces the mutation
 * points with an immutable snapshot store (see the architecture roadmap).
 */
declare const DEFAULT_CONFIG: Readonly<{
    ip: "192.168.178.28";
    port: "9100";
    cronExpression: "*/5 * * * *";
    selectedListName: "TV-Liste";
    mapping: Readonly<{}>;
    channels: readonly any[];
    lastSync: any;
    detectedModel: any;
}>;
/**
 * @param {{ config?: Record<string, unknown>, sync?: Record<string, unknown>, configured?: boolean, cachedM3u8?: string | null, lineupEntries?: unknown[] }} [overrides]
 * @returns {any}
 */
declare function createState(overrides?: any): any;
/**
 * The subset of the state that belongs in mapping.json.
 * @param {any} state
 * @returns {Record<string, unknown>}
 */
declare function persistedSnapshot(state: any): any;
/**
 * Replaces invalid persisted values (port, cron, list name) with defaults so that one corrupt
 * field cannot disable background sync. The receiver IP is left untouched (there is no safe default).
 * @param {any} state
 * @param {any} deps
 * @returns {boolean} true if anything was changed
 */
declare function repairPersistedSettings(state: any, deps: any): boolean;
/**
 * Applies a parsed mapping.json to the state. Invalid values are dropped or repaired;
 * nothing here talks to the receiver or the HTTP layer.
 *
 * @param {any} state
 * @param {unknown} parsed
 * @param {any} deps
 * @returns {{ changed: boolean, droppedMapping: number }}
 */
declare function applyPersistedState(state: any, parsed: any, deps: any): {
    changed: boolean;
    droppedMapping: number;
};
export { DEFAULT_CONFIG, createState, persistedSnapshot, repairPersistedSettings, applyPersistedState };
