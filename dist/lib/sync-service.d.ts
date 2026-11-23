/**
 * Application service for receiver sync and playlist state.
 *
 * Extracting this from the HTTP layer keeps route handlers thin and makes the
 * sync flow reusable and testable without Express.
 *
 * @param {object} deps
 */
declare function createSyncService({ state, configStore, receiver, validation, hdhrModule, logger, metrics }: {
    state: any;
    configStore: any;
    receiver: any;
    validation: any;
    hdhrModule: any;
    logger: any;
    metrics: any;
}): {
    getState: () => any;
    updateState: (mutator: any) => any;
    currentSettings: () => {
        ip: any;
        port: any;
        cronExpression: any;
        selectedListName: any;
    };
    mergeSettings: (overrides?: {}) => any;
    persistState: () => Promise<void>;
    rebuildViews: () => number;
    performSync: (candidate: any) => Promise<any>;
};
export { createSyncService };
