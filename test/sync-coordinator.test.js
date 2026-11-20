'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncCoordinator } = require('../lib/sync-coordinator');

test('sync coordinator serializes work and reports backoff after failures', async () => {
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
    assert.ok(coordinator.backoffRemainingMs() > 0);
    assert.equal(coordinator.consecutiveFailures, 1);
});

test('sync coordinator rejects when the queue is full', async () => {
    const coordinator = createSyncCoordinator({ maxQueue: 1 });
    let resolveFirst;
    const first = coordinator.request(() => new Promise(resolve => { resolveFirst = resolve; }));
    const second = coordinator.request(() => new Promise(resolve => setTimeout(() => resolve('queued done'), 0)));
    await assert.rejects(coordinator.request(() => 'third'), /Sync queue is full/);
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
