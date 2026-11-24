import type { Express } from 'express';
import type { AppState } from '../state-store.js';
interface MetricsCtx {
    getState(): AppState;
    metrics: {
        httpRequests: number;
        httpErrors: number;
        syncRuns: number;
        syncFailures: number;
        syncDurationMs: number;
    };
    syncCoordinator: {
        queueLength: number;
    };
}
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerMetricsRoutes(app: Express, ctx: MetricsCtx): void;
export { registerMetricsRoutes };
