/**
 * Frontend MVP – Model: shared state + pure logic without DOM access.
 * View helpers live in `view.ts`, presenter logic in `presenter.ts`.
 */

export type Mapping = Record<string, string | number>;
export type Filter = 'all' | 'mapped' | 'unmapped';
export type CopySource = 'hdhr' | 'm3u8';
export interface DuplicateGroup {
    id: string;
    channels: string[];
}

export interface Model {
    currentMapping: Mapping;
    savedMapping: Mapping;
    activeListName: string;
    lastSyncSeen: string | null | undefined;
    detectedChannels: string[];
    currentFilter: Filter;
    activeOccurrence: Record<string, number>;
    hdhrEnabled: boolean;
    copySource: CopySource;
    isDirty: () => boolean;
    getActiveMapping: () => Mapping;
    getOrphans: () => string[];
    getDuplicateGroups: (mapping: Mapping) => DuplicateGroup[];
    escapeHtml: (value: unknown) => string;
    formatSync: (iso: string | null | undefined, locale?: string) => string;
    mappingsEqual: (a: Mapping, b: Mapping) => boolean;
    describeDuplicates: (groups: DuplicateGroup[], limit?: number) => string;
}

export const model: Model = {
    currentMapping: {},
    savedMapping: {},
    activeListName: '',
    lastSyncSeen: undefined, // undefined: not loaded yet, null: never synced
    detectedChannels: [],
    currentFilter: 'all',
    activeOccurrence: {}, // name -> first index holding the ID (duplicate names)
    hdhrEnabled: true,
    copySource: loadCopySource(),

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
        return Object.keys(model.currentMapping).filter((name) => !known.has(name));
    },

    getDuplicateGroups(mapping: Mapping): DuplicateGroup[] {
        const byId = new Map<string, string[]>();
        for (const [name, id] of Object.entries(mapping)) {
            if (id === '') continue;
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

export function loadCopySource(): CopySource {
    try {
        // localStorage is only available in browsers (Node logs an experimental
        // warning when the global is referenced there; it stays undefined).
        const storage = Object.hasOwn(globalThis, 'localStorage') ? globalThis.localStorage : undefined;
        if (storage) {
            const stored = storage.getItem('technimapper.copySource');
            if (stored === 'hdhr' || stored === 'm3u8') return stored;
            if (stored === 'm3u') return 'm3u8'; // value saved by earlier versions
        }
    } catch {
        /* storage unavailable */
    }
    return 'hdhr';
}

function mappingsEqual(a: Mapping, b: Mapping): boolean {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    return keysA.every((key) => Object.hasOwn(b, key) && String(a[key]) === String(b[key]));
}

const ESCAPE_HTML: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value: unknown): string {
    return String(value).replace(/[&<>"']/g, (c) => ESCAPE_HTML[c] ?? c);
}

function formatSync(iso: string | null | undefined, locale?: string): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Never';
    return d.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function describeDuplicates(groups: DuplicateGroup[], limit = 3): string {
    const shown = groups
        .slice(0, limit)
        .map((g) => `${g.id} (${g.channels.slice(0, 3).join(', ')}${g.channels.length > 3 ? ', …' : ''})`);
    return shown.join('; ') + (groups.length > limit ? ` … +${groups.length - limit} more` : '');
}

export { describeDuplicates, escapeHtml, formatSync, mappingsEqual };
