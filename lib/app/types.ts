'use strict';

/**
 * Shared AppDeps interface for `createApp` + `lib/app/wiring.ts`.
 */

import type { Server } from 'http';
import type { Express } from 'express';
import { createLogger } from '../logger.js';
import { type RuntimeConfig } from '../runtime-config.js';
import { type Receiver } from '../receiver.js';
import { createValidation, type ValidatedSettings } from '../validation.js';
import type { SyncCoordinator } from '../sync-coordinator.js';
import { type ConfigStore } from '../config-store.js';
import { type StateStore } from '../state-store.js';
import { type HdhrConfig } from '../hdhr.js';

type Logger = ReturnType<typeof createLogger>;
type AppRuntime = RuntimeConfig;

type CronHandle = { stop(): void; destroy?(): void } | null;
type CronScheduler = { validate(expr: string): boolean; schedule(pattern: string, fn: () => void): CronHandle };

type Validation = Pick<ReturnType<typeof createValidation>, 'validateSettings' | 'validateMapping'>;

export interface AppDeps {
    runtime: AppRuntime;
    logger: Logger;
    state: StateStore;
    configStore: ConfigStore;
    receiver: Receiver;
    validation: Validation;
    cron: CronScheduler;
    version: string;
    hdhrConfig?: HdhrConfig;
    publicDir?: string;
    syncCoordinator?: SyncCoordinator;
}

/** Shared context passed to the route modules (`lib/routes/*.ts`). */
export interface RouteContext {
    runtime: AppDeps['runtime'];
    logger: AppDeps['logger'];
    state: StateStore;
    getState: () => ReturnType<StateStore['get']>;
    updateState: (mutator: (state: ReturnType<StateStore['get']>) => void) => ReturnType<StateStore['update']>;
    configStore: AppDeps['configStore'];
    receiver: AppDeps['receiver'];
    validation: {
        validateSettings: (raw: unknown) => ValidatedSettings;
        validateMapping: (input: unknown) => { mapping: Record<string, string | number>; invalid: string[] };
    };
    cron: AppDeps['cron'];
    version: string;
    hdhrConfig: NonNullable<AppDeps['hdhrConfig']>;
    hdhrModule: typeof import('../hdhr.js');
    metrics: { httpRequests: number; httpErrors: number; syncRuns: number; syncFailures: number; syncDurationMs: number };
    syncCoordinator: SyncCoordinator;
    currentSettings: () => ValidatedSettings;
    mergeSettings: (overrides: Record<string, unknown> | null) => ValidatedSettings;
    persistState: () => Promise<void>;
    rebuildViews: () => void;
    performSync: (candidate: ValidatedSettings) => Promise<{
        channels: { name: string; url: string }[];
        availableLists: string[];
        detectedModel: string;
        stale?: boolean;
    }>;
    runScheduledSync: () => Promise<void>;
    startBackgroundCron: () => unknown;
    stopBackgroundCron: () => void;
    playlistPaths: string[];
}

/** Express server handle (used by lib/shutdown). */
export type { Express, Server };
export type { HdhrConfig, SyncCoordinator, CronHandle, CronScheduler, Logger, AppRuntime, Receiver };
