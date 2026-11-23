/**
 * Immutable application state store.
 *
 * Release 2 (1.9.0) replaces the mutable `appConfig`/`syncStatus` globals with
 * a single store. Every change builds a new snapshot and commits it atomically,
 * so readers never observe a half-updated state and old snapshots stay valid.
 */
declare function deepFreeze(value: any, seen?: WeakSet<object>): any;
/**
 * @param {any} initial
 */
declare function createStateStore(initial: any): {
    get(): any;
    commit(next: any): void;
    update(mutator: any): any;
};
export { deepFreeze, createStateStore };
