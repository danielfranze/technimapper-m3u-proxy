export interface SyncCoordinator {
    request(run: () => Promise<unknown>): Promise<unknown>;
    backoffRemainingMs(): number;
    clearBackoff(): void;
    reset(): void;
    waitForIdle(): Promise<void>;
    readonly active: boolean;
    readonly queueLength: number;
    readonly consecutiveFailures: number;
}
declare function createSyncCoordinator({ maxQueue, backoffBaseMs, backoffMaxMs, now }?: {
    maxQueue?: number;
    backoffBaseMs?: number;
    backoffMaxMs?: number;
    now?: () => number;
}): SyncCoordinator;
export { createSyncCoordinator };
