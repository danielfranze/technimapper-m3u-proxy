/**
 * Shared AppDeps / RouteContext types for `createApp` and the route modules.
 */

import type { ConfigStore } from './config-store.js';
import type { HdhrConfig } from './hdhr.js';
import type { Logger } from './logger.js';
import type { FetchResult, Receiver } from './receiver.js';
import type { RuntimeConfig } from './runtime-config.js';
import type { AppState, StateStore } from './state-store.js';
import type { SyncQueue } from './sync-queue.js';
import type { createValidation, ValidatedSettings } from './validation.js';

type CronHandle = { stop(): void; destroy?(): void } | null;
type CronScheduler = { validate(expr: string): boolean; schedule(pattern: string, fn: () => void): CronHandle };

type Validation = Pick<ReturnType<typeof createValidation>, 'validateSettings' | 'validateMapping'>;

/** Counters exposed by the Prometheus endpoint. */
export interface Metrics {
    httpRequests: number;
    httpErrors: number;
    syncRuns: number;
    syncFailures: number;
    syncDurationMs: number;
}

export interface AppDeps {
    runtime: RuntimeConfig;
    logger: Logger;
    state: StateStore;
    configStore: ConfigStore;
    receiver: Receiver;
    validation: Validation;
    cron: CronScheduler;
    version: string;
    hdhrConfig?: HdhrConfig | undefined;
    publicDir?: string | undefined;
    syncQueue?: SyncQueue | undefined;
}

/** Shared context passed to the route modules (`lib/routes/*.ts`). */
export interface RouteContext {
    runtime: RuntimeConfig;
    logger: Logger;
    state: StateStore;
    getState: () => AppState;
    updateState: (mutator: (state: AppState) => void) => AppState;
    configStore: ConfigStore;
    receiver: Receiver;
    validation: {
        validateSettings: (raw: unknown) => ValidatedSettings;
        validateMapping: (input: unknown) => { mapping: Record<string, string | number>; invalid: string[] };
    };
    cron: CronScheduler;
    version: string;
    hdhrConfig: HdhrConfig;
    hdhrModule: typeof import('./hdhr.js');
    metrics: Metrics;
    syncQueue: SyncQueue;
    currentSettings: () => ValidatedSettings;
    mergeSettings: (overrides: Record<string, unknown> | null) => ValidatedSettings;
    persistState: () => Promise<void>;
    rebuildViews: () => void;
    performSync: (candidate: ValidatedSettings) => Promise<FetchResult & { stale?: boolean }>;
    runScheduledSync: () => Promise<void>;
    startBackgroundCron: () => unknown;
    stopBackgroundCron: () => void;
    playlistPaths: string[];
}

/** Express server handle (used by lib/shutdown). */
export type { CronHandle, HdhrConfig, SyncQueue };
