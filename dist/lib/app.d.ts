declare module 'express-serve-static-core' {
    interface Request {
        requestId?: string;
    }
}
/**
 * HTTP application factory.
 *
 * `createApp()` wires the HTTP boundary around an application state store.
 * It never starts a listener, which is what makes integration tests possible:
 * tests can call it with fake receiver, persistence and cron implementations.
 *
 * @param {any} deps
 */
declare function createApp(deps: any): {
    app: import("express-serve-static-core").Express;
    state: any;
    services: {
        performSync: (candidate: any) => Promise<any>;
        runScheduledSync: () => Promise<void>;
        startBackgroundCron: () => any;
        stopBackgroundCron: () => void;
        rebuildViews: () => number;
        waitForSync: () => any;
        beginShutdown(): void;
        dispose(): void;
    };
};
export { createApp };
