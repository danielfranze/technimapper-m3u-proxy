import type { Express } from 'express';
import type { ValidatedSettings } from '../validation.js';
import type { StateStore, AppState } from '../state-store.js';
interface PerformSyncResult {
    channels: {
        name: string;
        url: string;
    }[];
    availableLists: string[];
    stale?: boolean;
    detectedModel?: string;
}
interface ConfigCtx {
    getState(): AppState;
    updateState(mutator: (state: AppState) => void): void;
    state: StateStore;
    currentSettings(): ValidatedSettings;
    mergeSettings(overrides: Record<string, unknown> | null): ValidatedSettings;
    persistState(): Promise<void>;
    startBackgroundCron(): unknown;
    syncCoordinator: {
        clearBackoff(): void;
        request(fn: () => Promise<unknown>): Promise<unknown>;
    };
    validation: {
        validateMapping(input: unknown): {
            mapping: Record<string, string | number>;
            invalid: string[];
        };
    };
    version: string;
    hdhrConfig: {
        enabled: boolean;
    };
    logger: {
        error(...args: unknown[]): void;
    };
    performSync(candidate: {
        ip: string;
        port: string | number;
        selectedListName: string;
        cronExpression: string;
    }): Promise<PerformSyncResult>;
    rebuildViews(): void;
}
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerConfigRoutes(app: Express, ctx: ConfigCtx): void;
export { registerConfigRoutes };
