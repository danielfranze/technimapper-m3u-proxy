'use strict';

/**
 * Frontend MVP – Model: shared state + pure logic without DOM access.
 * View helpers live in `view.js`, presenter logic in `presenter.js`.
 */

/**
 * @typedef {Record<string, string | number>} Mapping
 * @typedef {{ name: string, url: string }} Channel
 * @typedef {'all' | 'mapped' | 'unmapped'} Filter
 * @typedef {'hdhr' | 'm3u8'} CopySource
 * @typedef {{ id: string, channels: string[] }} DuplicateGroup
 */

/**
 * @typedef {object} Model
 * @property {Mapping} currentMapping
 * @property {Mapping} savedMapping
 * @property {string} activeListName
 * @property {string | null | undefined} lastSyncSeen
 * @property {string[]} detectedChannels
 * @property {Filter} currentFilter
 * @property {Record<string, number>} activeOccurrence
 * @property {boolean} hdhrEnabled
 * @property {CopySource} copySource
 * @property {string} searchTerm
 * @property {() => boolean} isDirty
 * @property {() => Mapping} getActiveMapping
 * @property {() => string[]} getOrphans
 * @property {(mapping: Mapping) => DuplicateGroup[]} getDuplicateGroups
 * @property {(value: unknown) => string} escapeHtml
 * @property {(iso: string | null | undefined, locale?: string) => string} formatSync
 * @property {(a: Mapping, b: Mapping) => boolean} mappingsEqual
 * @property {(groups: DuplicateGroup[], limit?: number) => string} describeDuplicates
 */

/** @type {Model} */
export const model = {
    currentMapping: {},
    savedMapping: {},
    activeListName: '',
    lastSyncSeen: undefined,            // undefined: not loaded yet, null: never synced
    detectedChannels: [],
    currentFilter: 'all',
    activeOccurrence: {},               // name -> first index holding the ID (duplicate names)
    hdhrEnabled: true,
    copySource: loadCopySource(),
    searchTerm: '',

    // ---- Pure logic (no DOM) ----

    isDirty() {
        return !mappingsEqual(model.currentMapping, model.savedMapping);
    },

    /** Mapping restricted to channels that currently exist on the receiver. */
    getActiveMapping() {
        if (model.detectedChannels.length === 0) return model.currentMapping;
        const known = new Set(model.detectedChannels);
        return Object.fromEntries(Object.entries(model.currentMapping).filter(([name]) => known.has(name)));
    },

    /** Names that have an ID but are no longer part of the channel list on the receiver. */
    getOrphans() {
        if (model.detectedChannels.length === 0) return [];
        const known = new Set(model.detectedChannels);
        return Object.keys(model.currentMapping).filter(name => !known.has(name));
    },

    getDuplicateGroups(mapping) {
        /** @type {Map<string, string[]>} */
        const byId = new Map();
        for (const [name, id] of Object.entries(mapping)) {
            if (id === '' || id === null || id === undefined) continue;
            const key = String(id);
            if (!byId.has(key)) byId.set(key, []);
            byId.get(key)?.push(name);
        }
        return [...byId].filter(([, names]) => names.length > 1).map(([id, channels]) => ({ id, channels }));
    },

    escapeHtml,
    formatSync,
    mappingsEqual,
    describeDuplicates,
};

/** @returns {CopySource} */
function loadCopySource() {
    try {
        // localStorage is only available in browsers (Node logs an experimental
        // warning when the global is referenced there; it stays undefined).
        const storage = Object.hasOwn(globalThis, 'localStorage') ? globalThis.localStorage : undefined;
        if (storage) {
            const stored = storage.getItem('technimapper.copySource');
            if (stored === 'hdhr' || stored === 'm3u8') return stored;
            if (stored === 'm3u') return 'm3u8';      // value saved by earlier versions
        }
    } catch (e) { /* storage unavailable */ }
    return 'hdhr';
}

/**
 * @param {Mapping} a
 * @param {Mapping} b
 * @returns {boolean}
 */
function mappingsEqual(a, b) {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    return keysA.every(key => Object.hasOwn(b, key) && String(a[key]) === String(b[key]));
}

/** @type {Record<string, string>} */
const ESCAPE_HTML = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

/**
 * Escapes text for safe use in HTML content and double-quoted attributes.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ESCAPE_HTML[c] ?? c);
}

/**
 * Formats an ISO timestamp for display; falls back to "Never".
 * @param {string | null | undefined} iso
 * @param {string} [locale]
 * @returns {string}
 */
function formatSync(iso, locale) {
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Never';
    return d.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Short human-readable summary, e.g. "1 (Das Erste HD, Das Erste SD); 3 (3sat, Drei) ...".
 * @param {DuplicateGroup[]} groups
 * @param {number} [limit]
 * @returns {string}
 */
function describeDuplicates(groups, limit = 3) {
    const shown = groups.slice(0, limit).map(g =>
        `${g.id} (${g.channels.slice(0, 3).join(', ')}${g.channels.length > 3 ? ', …' : ''})`);
    return shown.join('; ') + (groups.length > limit ? ` … +${groups.length - limit} more` : '');
}

export { escapeHtml, formatSync, mappingsEqual, describeDuplicates, loadCopySource };
