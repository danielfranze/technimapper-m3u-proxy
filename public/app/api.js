'use strict';

/**
 * Typed API client for the backend.
 *
 * Every endpoint wrapper documents its response shape, so the presenter gets
 * checked field access without a build step.
 */

/**
 * @template T
 * @typedef {{ ok: boolean, res: Response, data: T }} JsonResult
 */

/** @typedef {import('./lib/model.js').Mapping} Mapping */
/** @typedef {import('./lib/model.js').DuplicateGroup} DuplicateGroup */

/**
 * @typedef {object} ConfigResponse
 * @property {string} version
 * @property {string} ip
 * @property {string} port
 * @property {string} cronExpression
 * @property {string} selectedListName
 * @property {string | null} lastSync
 * @property {string | null} lastError
 * @property {string | null} lastErrorAt
 * @property {number} consecutiveFailures
 * @property {boolean} hdhrEnabled
 */

/**
 * @typedef {object} SettingsPayload
 * @property {string} ip
 * @property {string} port
 * @property {string} cronExpression
 * @property {string} selectedListName
 */

/**
 * @typedef {SettingsPayload & { success: boolean, error?: string }} SaveSettingsResponse
 */

/**
 * @typedef {object} FetchChannelsResponse
 * @property {string[]} channels
 * @property {string[]} availableLists
 * @property {string} selectedListName
 * @property {Mapping} mapping
 * @property {string} detectedModel
 * @property {string} [error]
 */

/**
 * @typedef {object} SaveMappingResponse
 * @property {boolean} success
 * @property {number} mappedCount
 * @property {string[]} duplicates
 * @property {DuplicateGroup[]} duplicateGroups
 * @property {string[]} orphans
 * @property {string} [error]
 */

/**
 * @typedef {object} ImportConfigResponse
 * @property {boolean} success
 * @property {string} message
 * @property {string} [error]
 */

// Backend origin for all API calls.
export const BACKEND_URL = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

/**
 * @param {Response} res
 * @returns {Promise<unknown>}
 */
function parseJson(res) {
    return res.json().catch(() => ({}));
}

/**
 * Fetch helper: POSTs a JSON body and returns { ok, res, data }.
 * @template T
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<JsonResult<T>>}
 */
export async function postJson(path, body) {
    const res = await fetch(BACKEND_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await parseJson(res);
    return { ok: res.ok, res, data: /** @type {T} */ (data) };
}

/**
 * Fetch helper: GETs and returns { ok, res, data }.
 * @template T
 * @param {string} path
 * @returns {Promise<JsonResult<T>>}
 */
export async function getJson(path) {
    const res = await fetch(BACKEND_URL + path);
    const data = await parseJson(res);
    return { ok: res.ok, res, data: /** @type {T} */ (data) };
}

/** @returns {Promise<JsonResult<ConfigResponse>>} */
export async function getConfig() {
    return getJson('/api/config');
}

/**
 * @param {SettingsPayload} settings
 * @returns {Promise<JsonResult<SaveSettingsResponse>>}
 */
export async function saveSettings(settings) {
    return postJson('/api/save-settings', settings);
}

/**
 * @param {SettingsPayload} settings
 * @returns {Promise<JsonResult<FetchChannelsResponse>>}
 */
export async function fetchChannelsRequest(settings) {
    return postJson('/api/fetch-channels', settings);
}

/**
 * @param {Mapping} mapping
 * @returns {Promise<JsonResult<SaveMappingResponse>>}
 */
export async function saveMappingRequest(mapping) {
    return postJson('/api/save-mapping', { mapping });
}

/**
 * @param {unknown} config
 * @returns {Promise<JsonResult<ImportConfigResponse>>}
 */
export async function importConfig(config) {
    return postJson('/api/import-config', config);
}
