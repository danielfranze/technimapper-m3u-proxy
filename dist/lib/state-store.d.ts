/**
 * Immutable application state store.
 *
 * Release 2 (1.9.0) replaces the mutable `appConfig`/`syncStatus` globals with
 * a single store. Every change builds a new snapshot and commits it atomically,
 * so readers never observe a half-updated state and old snapshots stay valid.
 */
import type { AppState } from './state.js';
declare function deepFreeze<T>(value: T, seen?: WeakSet<object>): T;
export type { AppState } from './state.js';
export declare class StateStore<T = AppState> {
    private state;
    constructor(initial: T);
    get(): T;
    commit(next: T): void;
    update(mutator: (state: T) => void): T;
}
declare function createStateStore<T = AppState>(initial: T): StateStore<T>;
export { deepFreeze, createStateStore };
