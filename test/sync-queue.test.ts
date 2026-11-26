import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncQueue } from '../lib/sync-queue.js';

test('sync queue serializes work and clears backoff after a later success', async () => {
    let active = 0;
    let maxActive = 0;
    const queue = createSyncQueue({ backoffBaseMs: 10, backoffMaxMs: 100 });

    const first = queue.request(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
        throw new Error('boom');
    });

    const second = queue.request(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return 'ok';
    });

    await assert.rejects(first, /boom/);
    assert.equal(await second, 'ok');
    assert.equal(maxActive, 1);
    assert.equal(queue.backoffRemainingMs(), 0);
    assert.equal(queue.consecutiveFailures, 0);
});

test('sync queue rejects when the queue is full', async () => {
    const queue = createSyncQueue({ maxQueue: 1 });
    let resolveFirst!: (value?: unknown) => void;
    const first = queue.request(
        () =>
            new Promise((resolve) => {
                resolveFirst = resolve;
            }),
    );
    const second = queue.request(() => new Promise((resolve) => setTimeout(() => resolve('queued done'), 0)));
    await assert.rejects(
        queue.request(async () => 'third'),
        /Sync queue is full/,
    );
    resolveFirst('done');
    assert.equal(await first, 'done');
    assert.equal(await second, 'queued done');
});

test('sync queue waits for idle work', async () => {
    const queue = createSyncQueue();
    const done = queue.request(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
    });
    await queue.waitForIdle();
    assert.equal(await done, 'done');
});

test('sync queue rejects a new request while in backoff', async () => {
    const queue = createSyncQueue({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    const failing = queue.request(async () => {
        throw new Error('boom');
    });
    await assert.rejects(failing, /boom/);
    await assert.rejects(
        queue.request(async () => 'later'),
        /Sync is in backoff/,
    );
});

test('sync queue clearBackoff removes an active backoff', async () => {
    const queue = createSyncQueue({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    const failing = queue.request(async () => {
        throw new Error('boom');
    });
    await assert.rejects(failing, /boom/);
    assert.ok(queue.backoffRemainingMs() > 0);
    queue.clearBackoff();
    assert.equal(queue.backoffRemainingMs(), 0);
    assert.equal(queue.consecutiveFailures, 0);
    assert.equal(await queue.request(async () => 'later'), 'later');
});

test('sync queue reset rejects queued work and clears state', async () => {
    const queue = createSyncQueue({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    let resolveFirst!: (value?: unknown) => void;
    const first = queue.request(
        () =>
            new Promise((resolve) => {
                resolveFirst = resolve;
            }),
    );
    const queued = queue.request(async () => 'queued done');

    queue.reset();
    await assert.rejects(queued, /reset/);
    resolveFirst('done');
    assert.equal(await first, 'done');
    assert.equal(queue.backoffRemainingMs(), 0);
    assert.equal(queue.consecutiveFailures, 0);
    assert.equal(queue.queueLength, 0);
});
