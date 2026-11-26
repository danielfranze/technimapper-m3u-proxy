/**
 * Single-flight queue with bounded backoff for sync work.
 *
 * Only one sync runs at a time. Additional requests are queued up to `maxQueue`;
 * when the queue is full the caller receives a "Sync queue is full" error.
 */

interface SyncQueueItem {
    run: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (err: unknown) => void;
}

export interface SyncQueue {
    request(run: () => Promise<unknown>): Promise<unknown>;
    backoffRemainingMs(): number;
    clearBackoff(): void;
    reset(): void;
    waitForIdle(): Promise<void>;
    readonly active: boolean;
    readonly queueLength: number;
    readonly consecutiveFailures: number;
}

function createSyncQueue({
    maxQueue = 4,
    backoffBaseMs = 5000,
    backoffMaxMs = 300000,
    now = Date.now,
}: {
    maxQueue?: number;
    backoffBaseMs?: number;
    backoffMaxMs?: number;
    now?: () => number;
} = {}): SyncQueue {
    let active = false;
    let queue: SyncQueueItem[] = [];
    let consecutiveFailures = 0;
    let nextAllowedAt = 0;
    let idleWaiters: Array<() => void> = [];

    async function runOne(item: SyncQueueItem) {
        active = true;
        try {
            const result = await item.run();
            // A successful run clears any accumulated backoff so the next
            // failure starts from the base delay again.
            consecutiveFailures = 0;
            nextAllowedAt = 0;
            item.resolve(result);
        } catch (err) {
            consecutiveFailures++;
            const delay = Math.min(backoffBaseMs * 2 ** (consecutiveFailures - 1), backoffMaxMs);
            nextAllowedAt = now() + delay;
            item.reject(err);
        } finally {
            active = false;
            processQueue();
            if (!active && queue.length === 0) {
                const waiters = idleWaiters;
                idleWaiters = [];
                waiters.forEach((resolve) => {
                    resolve();
                });
            }
        }
    }

    function processQueue() {
        if (active || queue.length === 0) return;
        const item = queue.shift();
        if (item) void runOne(item);
    }

    function request(run: () => Promise<unknown>): Promise<unknown> {
        if (queue.length >= maxQueue) {
            return Promise.reject(new Error('Sync queue is full'));
        }
        if (now() < nextAllowedAt) {
            return Promise.reject(new Error('Sync is in backoff'));
        }
        return new Promise<unknown>((resolve, reject) => {
            queue.push({ run, resolve, reject });
            processQueue();
        });
    }

    function backoffRemainingMs(): number {
        return Math.max(0, nextAllowedAt - now());
    }

    function clearBackoff() {
        consecutiveFailures = 0;
        nextAllowedAt = 0;
    }

    function reset() {
        const queued = queue;
        queue = [];
        consecutiveFailures = 0;
        nextAllowedAt = 0;
        const waiters = idleWaiters;
        idleWaiters = [];
        waiters.forEach((resolve) => {
            resolve();
        });
        // Reject any work that was queued but never ran, so callers do not hang.
        queued.forEach((item) => {
            try {
                item.reject(new Error('Sync coordinator reset'));
            } catch {
                /* ignore */
            }
        });
    }

    function waitForIdle(): Promise<void> {
        if (!active && queue.length === 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
            idleWaiters.push(resolve);
        });
    }

    return {
        request,
        backoffRemainingMs,
        clearBackoff,
        reset,
        waitForIdle,
        get active() {
            return active;
        },
        get queueLength() {
            return queue.length;
        },
        get consecutiveFailures() {
            return consecutiveFailures;
        },
    };
}

export { createSyncQueue };
