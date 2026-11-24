'use strict';

/**
 * Immutable application state store.
 *
 * Release 2 (1.9.0) replaces the mutable `appConfig`/`syncStatus` globals with
 * a single store. Every change builds a new snapshot and commits it atomically,
 * so readers never observe a half-updated state and old snapshots stay valid.
 */

import type { AppState } from './state.js';

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return value;
    seen.add(value as object);
    const record = value as Record<string | symbol, unknown>;
    for (const key of Reflect.ownKeys(record)) {
        deepFreeze(record[key], seen);
    }
    return Object.freeze(record) as T;
}

export type { AppState } from './state.js';

export type StateStore<T = AppState> = {
    get(): T;
    commit(next: T): void;
    update(mutator: (state: T) => void): T;
};

function createStateStore<T = AppState>(initial: T): StateStore<T> {
    let state = deepFreeze(initial);

    return {
        get: () => state,
        commit(next: T) {
            state = deepFreeze(next);
        },
        // Convenience for the few places that still mutate a draft in place.
        update(mutator: (state: T) => void): T {
            const next = structuredClone(state);
            mutator(next);
            state = deepFreeze(next);
            return state;
        }
    };
}

export { deepFreeze, createStateStore };
