'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../lib/app');
const { createState } = require('../lib/state');
const { createStateStore } = require('../lib/state-store');
const { createValidation } = require('../lib/validation');
const { createLogger } = require('../lib/logger');

const fakeCron = value => typeof value === 'string' && /^\S+ \S+ \S+ \S+ \S+$/.test(value.trim());

function quietLogger() {
    return createLogger({ level: 'error', sink: { info() {}, warn() {}, error() {} } });
}

function baseRuntime(overrides = {}) {
    return {
        playlistPaths: ['/playlist.m3u8', '/playlist.m3u'],
        publicPaths: ['/playlist.m3u8', '/playlist.m3u', '/health', '/health/live', '/health/ready'],
        trustProxy: false,
        hsts: false,
        adminUser: '',
        adminPassword: '',
        authFailureWindowMs: 60000,
        authFailureMax: 100,
        apiRateWindowMs: 60000,
        apiRateMax: 1000,
        maxRateEntries: 100,
        defaultCron: '*/5 * * * *',
        ...overrides
    };
}

function createHarness({ runtime: runtimeOverrides, cron, syncCoordinator, fetchChannels, state: stateOverrides } = {}) {
    const state = createStateStore(createState(stateOverrides || { configured: true, config: { ip: '192.168.1.10', port: '9100', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste', channels: [], mapping: {} } }));
    const configStore = { write() {}, read() { return null; }, ensureDataDir() {} };
    const receiver = {
        async fetchChannels(settings) {
            if (fetchChannels) return fetchChannels(settings);
            return { channels: [], selectedListName: settings.selectedListName, availableLists: ['TV-Liste'], detectedModel: 'STC' };
        },
        close() {}
    };
    const validation = createValidation({ cronValidate: fakeCron });
    const { app, services } = createApp({
        runtime: baseRuntime(runtimeOverrides),
        logger: quietLogger(),
        state,
        configStore,
        receiver,
        validation: { validateSettings: validation.validateSettings, validateMapping: validation.validateMapping },
        cron: cron || { validate: fakeCron, schedule() { return { stop() {}, destroy() {} }; } },
        version: '1.9.0-test',
        hdhrConfig: { enabled: false },
        syncCoordinator
    });
    return { app, services, state };
}

test('runScheduledSync returns early when shutting down', async () => {
    const harness = createHarness({});
    harness.services.beginShutdown();
    await harness.services.runScheduledSync();
});

test('runScheduledSync skips when a sync is already active', async () => {
    const harness = createHarness({
        syncCoordinator: { active: true, backoffRemainingMs: () => 0, request: async () => {}, queueLength: 0, consecutiveFailures: 0, waitForIdle: async () => {} }
    });
    await harness.services.runScheduledSync();
});

test('runScheduledSync skips during backoff', async () => {
    const harness = createHarness({
        syncCoordinator: { active: false, backoffRemainingMs: () => 1000, request: async () => {}, queueLength: 0, consecutiveFailures: 0, waitForIdle: async () => {} }
    });
    await harness.services.runScheduledSync();
});

test('runScheduledSync handles an invalid cron expression through startBackgroundCron', () => {
    const harness = createHarness({ cron: { validate: () => false, schedule() { return { stop() {}, destroy() {} }; } } });
    harness.state.update(s => { s.config.cronExpression = 'not a cron'; });
    const task = harness.services.startBackgroundCron();
    assert.equal(task, null);
});

test('startBackgroundCron handles a throwing scheduler', () => {
    const harness = createHarness({ cron: { validate: () => true, schedule() { throw new Error('boom'); } } });
    const task = harness.services.startBackgroundCron();
    assert.equal(task, null);
});

test('runScheduledSync handles a sync that fails', async () => {
    const harness = createHarness({ fetchChannels: async () => { throw new Error('boom'); } });
    await harness.services.runScheduledSync();
    assert.equal(harness.state.get().sync.consecutiveFailures, 1);
});

test('runScheduledSync handles a sync coordinator that rejects', async () => {
    const harness = createHarness({
        syncCoordinator: {
            active: false,
            backoffRemainingMs: () => 0,
            request: async () => { throw new Error('rejected'); },
            queueLength: 0,
            consecutiveFailures: 0,
            waitForIdle: async () => {}
        }
    });
    await harness.services.runScheduledSync();
});
