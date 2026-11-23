'use strict';

/**
 * Shared domain types.
 *
 * These typedefs are the single source of truth for the core data model. They are
 * written as JSDoc so they work today with `// @ts-check` and can be converted
 * to TypeScript interfaces/types one-to-one later.
 */

/**
 * @typedef {Object} Channel
 * @property {string} name
 * @property {string} url
 */

/**
 * @typedef {Object} UserSettings
 * @property {string} ip
 * @property {string} port
 * @property {string} cronExpression
 * @property {string} selectedListName
 */

/**
 * @typedef {Object} SyncStatus
 * @property {'idle'|'syncing'|'ready'|'failing'} phase
 * @property {string|null} lastAttemptAt
 * @property {string|null} lastSuccessAt
 * @property {string|null} lastError
 * @property {string|null} lastErrorAt
 * @property {number} consecutiveFailures
 * @property {number|null} lastDurationMs
 */

/**
 * @typedef {Object} AppState
 * @property {UserSettings} config
 * @property {SyncStatus} sync
 * @property {boolean} configured
 * @property {string|null} cachedM3u8
 * @property {Array<{guideNumber:string,guideName:string,url:string}>} lineupEntries
 */

/**
 * @typedef {Object} FetchResult
 * @property {Channel[]} channels
 * @property {string} selectedListName
 * @property {string[]} availableLists
 * @property {'STC'|'S'|'S1'|'S2'|'S_SERIES'} detectedModel
 */

export {};
