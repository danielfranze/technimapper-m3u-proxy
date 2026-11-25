'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncCoordinator } from '../dist/lib/sync-coordinator.js';

test('sync coordinator serializes work and clears backoff after a later success', async () => {
    let active = 0;
    let maxActive = 0;
    const coordinator = createSyncCoordinator({ backoffBaseMs: 10, backoffMaxMs: 100 });

    const first = coordinator.request(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
        throw new Error('boom');
    });

    const second = coordinator.request(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return 'ok';
    });

    await assert.rejects(first, /boom/);
    assert.equal(await second, 'ok');
    assert.equal(maxActive, 1);
    assert.equal(coordinator.backoffRemainingMs(), 0);
    assert.equal(coordinator.consecutiveFailures, 0);
});

test('sync coordinator rejects when the queue is full', async () => {
    const coordinator = createSyncCoordinator({ maxQueue: 1 });
    let resolveFirst!: (value?: unknown) => void;
    const first = coordinator.request(() => new Promise(resolve => { resolveFirst = resolve; }));
    const second = coordinator.request(() => new Promise(resolve => setTimeout(() => resolve('queued done'), 0)));
    await assert.rejects(coordinator.request(async () => 'third'), /Sync queue is full/);
    resolveFirst('done');
    assert.equal(await first, 'done');
    assert.equal(await second, 'queued done');
});

test('sync coordinator waits for idle work', async () => {
    const coordinator = createSyncCoordinator();
    const done = coordinator.request(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
    });
    await coordinator.waitForIdle();
    assert.equal(await done, 'done');
});

test('sync coordinator rejects a new request while in backoff', async () => {
    const coordinator = createSyncCoordinator({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    const failing = coordinator.request(async () => { throw new Error('boom'); });
    await assert.rejects(failing, /boom/);
    await assert.rejects(coordinator.request(async () => 'later'), /Sync is in backoff/);
});

test('sync coordinator clearBackoff removes an active backoff', async () => {
    const coordinator = createSyncCoordinator({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    const failing = coordinator.request(async () => { throw new Error('boom'); });
    await assert.rejects(failing, /boom/);
    assert.ok(coordinator.backoffRemainingMs() > 0);
    coordinator.clearBackoff();
    assert.equal(coordinator.backoffRemainingMs(), 0);
    assert.equal(coordinator.consecutiveFailures, 0);
    assert.equal(await coordinator.request(async () => 'later'), 'later');
});

test('sync coordinator reset rejects queued work and clears state', async () => {
    const coordinator = createSyncCoordinator({ backoffBaseMs: 1000, backoffMaxMs: 1000 });
    let resolveFirst!: (value?: unknown) => void;
    const first = coordinator.request(() => new Promise(resolve => { resolveFirst = resolve; }));
    const queued = coordinator.request(async () => 'queued done');

    coordinator.reset();
    await assert.rejects(queued, /reset/);
    resolveFirst('done');
    assert.equal(await first, 'done');
    assert.equal(coordinator.backoffRemainingMs(), 0);
    assert.equal(coordinator.consecutiveFailures, 0);
    assert.equal(coordinator.queueLength, 0);
});
