/**
 * Serialises sync work and applies backoff after failures.
 *
 * Only one sync runs at a time. Additional requests are queued up to `maxQueue`;
 * when the queue is full the caller receives a "Sync queue is full" error.
 */
declare function createSyncCoordinator({ maxQueue, backoffBaseMs, backoffMaxMs, now }?: {
    maxQueue?: number;
    backoffBaseMs?: number;
    backoffMaxMs?: number;
    now?: () => number;
}): {
    request: (run: any) => Promise<unknown>;
    backoffRemainingMs: () => number;
    clearBackoff: () => void;
    reset: () => void;
    waitForIdle: () => Promise<unknown>;
    readonly active: boolean;
    readonly queueLength: number;
    readonly consecutiveFailures: number;
};
export { createSyncCoordinator };
