'use strict';

const { createState } = require('../dist/lib/state.js');
const { createStateStore } = require('../dist/lib/state-store.js');
const { createValidation } = require('../dist/lib/validation.js');
const { createLogger } = require('../dist/lib/logger.js');

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

/**
 * Builds the standard integration-test harness used by the app-level tests.
 * @param {{ state?: object, runtime?: object, fetchChannels?: Function, channels?: any[], syncCoordinator?: any, hdhrEnabled?: boolean, version?: string }} [options]
 */
function createHarness({ state: stateOverrides, runtime: runtimeOverrides, fetchChannels, channels, syncCoordinator, hdhrEnabled, version } = {}) {
    const CHANNELS = channels || [{ name: 'A', url: 'http://192.168.1.20/a' }, { name: 'B', url: 'http://192.168.1.20/b' }];
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
                channels: CHANNELS,
                selectedListName: settings.selectedListName,
                availableLists: ['TV-Liste', 'Radio'],
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
    const { createApp } = require('../dist/lib/app.js');
    const { app, services } = createApp({
        runtime: baseRuntime(runtimeOverrides),
        logger: quietLogger(),
        state,
        configStore,
        receiver,
        validation: { validateSettings: validation.validateSettings, validateMapping: validation.validateMapping },
        cron,
        version: version || '1.8.0-test',
        hdhrConfig: { enabled: hdhrEnabled !== false, friendlyName: null, deviceId: '12345678', tunerCount: 2 },
        syncCoordinator
    });

    return { app, services, state, writes, calls, configStore, scheduled: () => scheduled, CHANNELS };
}

module.exports = { createHarness, baseRuntime, quietLogger, fakeCron };
