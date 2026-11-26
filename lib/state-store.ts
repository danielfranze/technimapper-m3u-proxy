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

export class StateStore<T = AppState> {
    private state: T;

    constructor(initial: T) {
        this.state = deepFreeze(initial);
    }

    get(): T {
        return this.state;
    }

    commit(next: T): void {
        this.state = deepFreeze(next);
    }

    // Convenience for the few places that still mutate a draft in place.
    update(mutator: (state: T) => void): T {
        const next = structuredClone(this.state);
        mutator(next);
        this.state = deepFreeze(next);
        return this.state;
    }
}

function createStateStore<T = AppState>(initial: T): StateStore<T> {
    return new StateStore<T>(initial);
}

export { createStateStore, deepFreeze };
