'use strict';

/**
 * Serialises sync work and applies backoff after failures.
 *
 * Only one sync runs at a time. Additional requests are queued up to `maxQueue`;
 * when the queue is full the caller receives a "Sync queue is full" error.
 */
function createSyncCoordinator({ maxQueue = 4, backoffBaseMs = 5000, backoffMaxMs = 300000, now = Date.now } = {}) {
    let active = false;
    let queue: any[] = [];
    let consecutiveFailures = 0;
    let nextAllowedAt = 0;
    let idleWaiters: any[] = [];

    async function runOne(item: any) {
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
                waiters.forEach((resolve: any) => resolve());
            }
        }
    }

    function processQueue() {
        if (active || queue.length === 0) return;
        const item = queue.shift();
        runOne(item);
    }

    function request(run: any) {
        if (queue.length >= maxQueue) {
            return Promise.reject(new Error('Sync queue is full'));
        }
        if (now() < nextAllowedAt) {
            return Promise.reject(new Error('Sync is in backoff'));
        }
        return new Promise((resolve: any, reject: any) => {
            queue.push({ run, resolve, reject });
            processQueue();
        });
    }

    function backoffRemainingMs() {
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
        waiters.forEach((resolve: any) => resolve());
        // Reject any work that was queued but never ran, so callers do not hang.
        queued.forEach((item: any) => {
            try { item.reject(new Error('Sync coordinator reset')); } catch (err) { /* ignore */ }
        });
    }

    function waitForIdle() {
        if (!active && queue.length === 0) return Promise.resolve();
        return new Promise((resolve: any) => {
            idleWaiters.push(resolve);
        });
    }

    return {
        request,
        backoffRemainingMs,
        clearBackoff,
        reset,
        waitForIdle,
        get active() { return active; },
        get queueLength() { return queue.length; },
        get consecutiveFailures() { return consecutiveFailures; }
    };
}

export { createSyncCoordinator };
