declare module 'express-serve-static-core' {
    interface Request {
        requestId?: string;
    }
}
import { createLogger } from './logger.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { createValidation } from './validation.js';
import { createSoapReceiver } from './receiver.js';
import type { StateStore } from './state-store.js';
import { createSyncCoordinator } from './sync-coordinator.js';
import type { ConfigStore } from './config-store.js';
import type { HdhrConfig } from './hdhr.js';
/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 */
type Logger = ReturnType<typeof createLogger>;
type SyncCoordinator = ReturnType<typeof createSyncCoordinator>;
type AppRuntime = ReturnType<typeof loadRuntimeConfig>;
type Receiver = ReturnType<typeof createSoapReceiver>;
type Validation = Pick<ReturnType<typeof createValidation>, 'validateSettings' | 'validateMapping'>;
type CronHandle = {
    stop(): void;
    destroy?(): void;
} | null;
type CronScheduler = {
    validate(expr: string): boolean;
    schedule(pattern: string, fn: () => void): CronHandle;
};
interface AppDeps {
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
declare function createApp({ runtime, logger, state: stateDep, configStore, receiver, validation, cron, version, hdhrConfig, publicDir, syncCoordinator: syncCoordinatorDep }: AppDeps): {
    app: import("express-serve-static-core").Express;
    state: StateStore<import("./state.js").AppState>;
    services: {
        performSync: (candidate: import("./validation.js").ValidatedSettings) => Promise<Awaited<ReturnType<(settings: {
            ip: string;
            port: string | number;
            selectedListName: string;
        }) => Promise<{
            channels: {
                name: string;
                url: string;
            }[];
            selectedListName: string;
            availableLists: string[];
            detectedModel: string;
        }>>> & {
            stale?: boolean;
        }>;
        runScheduledSync: () => Promise<void>;
        startBackgroundCron: () => CronHandle;
        stopBackgroundCron: () => void;
        rebuildViews: () => number;
        waitForSync: () => Promise<void>;
        beginShutdown(): void;
        dispose(): void;
    };
};
export { createApp };
export type { AppDeps, AppRuntime, Receiver, CronHandle, CronScheduler };
