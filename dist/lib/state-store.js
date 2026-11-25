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
export class StateStore {
    state;
    constructor(initial) {
        this.state = deepFreeze(initial);
    }
    get() {
        return this.state;
    }
    commit(next) {
        this.state = deepFreeze(next);
    }
    // Convenience for the few places that still mutate a draft in place.
    update(mutator) {
        const next = structuredClone(this.state);
        mutator(next);
        this.state = deepFreeze(next);
        return this.state;
    }
}
function createStateStore(initial) {
    return new StateStore(initial);
}
export { deepFreeze, createStateStore };
//# sourceMappingURL=state-store.js.map