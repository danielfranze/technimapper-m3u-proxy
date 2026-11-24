'use strict';
/**
 * Immutable application state store.
 *
 * Release 2 (1.9.0) replaces the mutable `appConfig`/`syncStatus` globals with
 * a single store. Every change builds a new snapshot and commits it atomically,
 * so readers never observe a half-updated state and old snapshots stay valid.
 */
function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object')
        return value;
    if (seen.has(value))
        return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
        deepFreeze(value[key], seen);
    }
    return Object.freeze(value);
}
/**
 * @param {any} initial
 */
function createStateStore(initial) {
    let state = deepFreeze(initial);
    return {
        get() {
            return state;
        },
        commit(next) {
            state = deepFreeze(next);
        },
        // Convenience for the few places that still mutate a draft in place.
        update(mutator) {
            const next = structuredClone(state);
            mutator(next);
            state = deepFreeze(next);
            return state;
        }
    };
}
export { deepFreeze, createStateStore };
//# sourceMappingURL=state-store.js.map