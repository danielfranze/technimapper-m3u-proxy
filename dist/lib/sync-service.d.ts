import type { AppState, StateStore } from './state-store.js';
import { type ValidatedSettings } from './validation.js';
import type { LineupEntry } from './hdhr.js';
/**
 * Application service for receiver sync and playlist state.
 *
 * Extracting this from the HTTP layer keeps route handlers thin and makes the
 * sync flow reusable and testable without Express.
 */
interface SyncServiceMetrics {
    syncRuns: number;
    syncFailures: number;
    syncDurationMs: number;
}
interface SyncServiceDeps {
    state: StateStore;
    configStore: {
        write(data: unknown): Promise<void>;
    };
    receiver: {
        fetchChannels(settings: {
            ip: string;
            port: string | number;
            selectedListName: string;
        }): Promise<{
            channels: {
                name: string;
                url: string;
            }[];
            selectedListName: string;
            availableLists: string[];
            detectedModel: string;
        }>;
    };
    validation: {
        validateSettings(raw: unknown): ValidatedSettings;
        validateMapping?(input: unknown): unknown;
    };
    hdhrModule: {
        buildLineup(channels: {
            name: string;
            url: string;
        }[], mapping: Record<string, string | number>): LineupEntry[];
        modelLabel(deviceType: string | null): string;
    };
    logger: {
        warn(...args: unknown[]): void;
    };
    metrics?: SyncServiceMetrics;
}
declare function createSyncService({ state, configStore, receiver, validation, hdhrModule, logger, metrics }: SyncServiceDeps): {
    getState: () => AppState;
    updateState: (mutator: (state: AppState) => void) => AppState;
    currentSettings: () => ValidatedSettings;
    mergeSettings: (overrides?: Record<string, unknown> | null) => ValidatedSettings;
    persistState: () => Promise<void>;
    rebuildViews: () => number;
    performSync: (candidate: ValidatedSettings) => Promise<Awaited<ReturnType<typeof receiver.fetchChannels>> & {
        stale?: boolean;
    }>;
};
export { createSyncService, type SyncServiceMetrics };
