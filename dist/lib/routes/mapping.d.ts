import type { Express } from 'express';
import type { StateStore } from '../state-store.js';
interface MappingCtx {
    getState(): ReturnType<StateStore['get']>;
    updateState(mutator: (state: ReturnType<StateStore['get']>) => void): void;
    state: StateStore;
    persistState(): Promise<void>;
    rebuildViews(): void;
    validation: {
        validateMapping(input: unknown): {
            mapping: Record<string, string | number>;
            invalid: string[];
        };
    };
}
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerMappingRoutes(app: Express, ctx: MappingCtx): void;
export { registerMappingRoutes };
