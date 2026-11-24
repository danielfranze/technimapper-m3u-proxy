'use strict';
function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object')
        return value;
    if (seen.has(value))
        return value;
    seen.add(value);
    const record = value;
    for (const key of Reflect.ownKeys(record)) {
        deepFreeze(record[key], seen);
    }
    return Object.freeze(record);
}
function createStateStore(initial) {
    let state = deepFreeze(initial);
    return {
        get: () => state,
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