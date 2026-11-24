import type { Express } from 'express';
import type { AppState } from '../state-store.js';
interface HealthCtx {
    getState(): AppState;
    version: string;
    syncCoordinator: {
        queueLength: number;
        backoffRemainingMs(): number;
    };
}
/**
 * Health endpoints.
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerHealthRoutes(app: Express, ctx: HealthCtx): void;
export { registerHealthRoutes };
