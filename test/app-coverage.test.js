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
    const writes = [];
    const calls = [];
    let scheduled = 0;

    const configStore = {
        write(data) { writes.push(data); },
        read() { return null; },
        ensureDataDir() {}
    };

    const receiver = {
        async fetchChannels(settings) {
            calls.push({ ...settings });
            if (fetchChannels) return fetchChannels(settings);
            return {
                channels: [{ name: 'A', url: 'http://192.168.1.20/a' }],
                selectedListName: settings.selectedListName,
                availableLists: ['TV-Liste'],
                detectedModel: 'STC'
            };
        },
        close() {}
    };

    const cron = {
        validate: fakeCron,
        schedule() {
            scheduled++;
            return { stop() {}, destroy() {} };
        }
    };

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

    return { app, services, state, writes, calls, scheduled: () => scheduled };
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

test('trust proxy setting is applied', async () => {
    const harness = createHarness({ runtime: { trustProxy: 1 } });
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/health');
        assert.equal(res.status, 200);
    });
});

test('bundled fonts are cached for a week', async () => {
    const harness = createHarness();
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/fonts/inter-latin-400.woff2');
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'public, max-age=604800');
    });
});

test('metrics endpoint returns Prometheus text', async () => {
    const harness = createHarness();
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/metrics');
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.match(text, /technimapper_http_requests_total/);
        assert.match(text, /technimapper_configured/);
    });
});

test('beginShutdown marks the app as shutting down', () => {
    const harness = createHarness();
    harness.services.beginShutdown();
});

test('startBackgroundCron disables itself for an invalid cron expression', () => {
    const harness = createHarness();
    harness.state.update(s => { s.config.cronExpression = 'not a cron'; });
    const task = harness.services.startBackgroundCron();
    assert.equal(task, null);
});

test('runScheduledSync handles invalid stored settings', async () => {
    const harness = createHarness();
    harness.state.update(s => { s.config.ip = '8.8.8.8'; });
    await harness.services.runScheduledSync();
    assert.equal(harness.state.get().sync.consecutiveFailures, 0);
});

test('runScheduledSync handles a failed sync', async () => {
    const harness = createHarness({ fetchChannels: async () => { throw new Error('boom'); } });
    await harness.services.runScheduledSync();
    assert.equal(harness.state.get().sync.consecutiveFailures, 1);
    assert.match(harness.state.get().sync.lastError, /boom/);
});

test('playlist endpoint returns 304 for a matching ETag', async () => {
    const state = {
        configured: true,
        config: {
            ip: '192.168.1.10',
            port: '9100',
            cronExpression: '*/5 * * * *',
            selectedListName: 'TV-Liste',
            channels: [{ name: 'A', url: 'http://192.168.1.20/a' }],
            mapping: { A: 1 },
            detectedModel: 'DIGIT ISIO STC'
        }
    };
    const harness = createHarness({ state });
    harness.services.rebuildViews();
    await withServer(harness, async (base) => {
        const first = await fetch(base + '/playlist.m3u8');
        assert.equal(first.status, 200);
        const etag = first.headers.get('etag');
        assert.ok(etag);

        const second = await fetch(base + '/playlist.m3u8', { headers: { 'If-None-Match': etag } });
        assert.equal(second.status, 304);
    });
});
