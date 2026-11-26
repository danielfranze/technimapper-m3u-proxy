declare module 'express-serve-static-core' {
    interface Request {
        requestId?: string;
    }
}
import type { AppDeps, CronHandle } from './app/types.js';
import type { ValidatedSettings } from './domain/settings.js';
import type { StateStore } from './state-store.js';
/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 */
declare function createApp({ runtime, logger, state: stateDep, configStore, receiver, validation, cron, version, hdhrConfig, publicDir, syncCoordinator: syncCoordinatorDep, }: AppDeps): {
    app: import("express-serve-static-core").Express;
    state: StateStore<import("./state.js").AppState>;
    services: {
        performSync: (candidate: ValidatedSettings) => Promise<Awaited<ReturnType<(settings: {
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
export type { AppDeps };
export { createApp };
