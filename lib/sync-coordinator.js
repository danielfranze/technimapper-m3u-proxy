'use strict';

/**
 * Serialises sync work and applies backoff after failures.
 *
 * Only one sync runs at a time. Additional requests are queued up to `maxQueue`;
 * when the queue is full the caller receives a "Sync queue is full" error.
 */

function createSyncCoordinator({ maxQueue = 4, backoffBaseMs = 5000, backoffMaxMs = 300000, now = Date.now } = {}) {
    let active = false;
    let queue = [];
    let consecutiveFailures = 0;
    let nextAllowedAt = 0;

    async function runOne(item) {
        active = true;
        try {
            const result = await item.run();
            item.resolve(result);
        } catch (err) {
            consecutiveFailures++;
            const delay = Math.min(backoffBaseMs * 2 ** (consecutiveFailures - 1), backoffMaxMs);
            nextAllowedAt = now() + delay;
            item.reject(err);
        } finally {
            active = false;
            processQueue();
        }
    }

    function processQueue() {
        if (active || queue.length === 0) return;
        const item = queue.shift();
        runOne(item);
    }

    function request(run) {
        if (queue.length >= maxQueue) {
            return Promise.reject(new Error('Sync queue is full'));
        }
        if (now() < nextAllowedAt) {
            return Promise.reject(new Error('Sync is in backoff'));
        }
        return new Promise((resolve, reject) => {
            queue.push({ run, resolve, reject });
            processQueue();
        });
    }

    function backoffRemainingMs() {
        return Math.max(0, nextAllowedAt - now());
    }

    function reset() {
        consecutiveFailures = 0;
        nextAllowedAt = 0;
        queue = [];
    }

    function waitForIdle() {
        return new Promise((resolve) => {
            const check = () => {
                if (!active && queue.length === 0) resolve();
                else setImmediate(check);
            };
            check();
        });
    }

    return { request, backoffRemainingMs, reset, waitForIdle, get active() { return active; }, get queueLength() { return queue.length; }, get consecutiveFailures() { return consecutiveFailures; } };
}

module.exports = { createSyncCoordinator };
