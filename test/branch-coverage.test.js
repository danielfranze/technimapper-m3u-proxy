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

function createHarness({ state: stateOverrides, runtime: runtimeOverrides, fetchChannels } = {}) {
    const state = createStateStore(createState(stateOverrides || {}));
    const configStore = { write() {}, read() { return null; }, ensureDataDir() {} };
    const receiver = {
        async fetchChannels(settings) {
            if (fetchChannels) return fetchChannels(settings);
            return { channels: [{ name: 'A', url: 'http://192.168.1.20/a' }], selectedListName: settings.selectedListName, availableLists: [], detectedModel: 'STC' };
        },
        close() {}
    };
    const cron = { validate: fakeCron, schedule() { return { stop() {}, destroy() {} }; } };
    const validation = createValidation({ cronValidate: fakeCron });
    const { app, services } = createApp({
        runtime: baseRuntime(runtimeOverrides),
        logger: quietLogger(),
        state,
        configStore,
        receiver,
        validation: { validateSettings: validation.validateSettings, validateMapping: validation.validateMapping },
        cron,
        version: '1.9.0-test',
        hdhrConfig: { enabled: true, friendlyName: null, deviceId: '12345678', tunerCount: 2 }
    });
    return { app, services, state };
}

async function withServer(harness, fn) {
    const server = harness.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.once('listening', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        return await fn(base, harness);
    } finally {
        await new Promise(resolve => {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
            server.close(resolve);
        });
        harness.services.dispose();
    }
}

test('metrics endpoint reflects a configured instance', async () => {
    const state = {
        configured: true,
        config: {
            ip: "192.168.1.10",
            port: "9100",
            cronExpression: "*/5 * * * *",
            selectedListName: "TV-Liste",
            channels: [{ name: "A", url: "http://192.168.1.20/a" }],
            mapping: { A: 1 },
            detectedModel: "DIGIT ISIO STC"
        }
    };
    const harness = createHarness({ state });
    harness.services.rebuildViews();
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/metrics');
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.match(text, /technimapper_configured 1/);
    });
});

test('fetch-channels handles an empty availableLists array', async () => {
    const harness = createHarness({ state: { configured: true, config: { ip: '192.168.1.10', port: '9100', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste', channels: [], mapping: {} } } } );
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/api/fetch-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.deepEqual(body.availableLists, []);
    });
});
