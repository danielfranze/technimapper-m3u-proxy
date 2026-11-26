import { type AppDeps, createApp } from '../dist/lib/app.js';
import type { ConfigStore } from '../dist/lib/config-store.js';
import { createLogger } from '../dist/lib/logger.js';
import type { Receiver } from '../dist/lib/receiver.js';
import { createState } from '../dist/lib/state.js';
import type { StateStore } from '../dist/lib/state-store.js';
import { createStateStore } from '../dist/lib/state-store.js';
import type { SyncCoordinator } from '../dist/lib/sync-coordinator.js';
import { createValidation } from '../dist/lib/validation.js';

const fakeCron = (value: string): boolean => typeof value === 'string' && /^\S+ \S+ \S+ \S+ \S+$/.test(value.trim());

function quietLogger(): ReturnType<typeof createLogger> {
    return createLogger({ level: 'error', sink: { info() {}, warn() {}, error() {} } });
}

function baseRuntime(overrides: Record<string, unknown> = {}): AppDeps['runtime'] {
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
        ...overrides,
    } as unknown as AppDeps['runtime'];
}

interface HarnessOptions {
    state?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    fetchChannels?: (settings: Record<string, unknown>) => Promise<Record<string, unknown>>;
    channels?: { name: string; url: string }[];
    syncCoordinator?: SyncCoordinator;
    hdhrEnabled?: boolean;
    version?: string;
}

function createHarness(options: HarnessOptions = {}): {
    app: ReturnType<typeof createApp>['app'];
    services: ReturnType<typeof createApp>['services'];
    state: StateStore;
    writes: unknown[];
    calls: Record<string, unknown>[];
    configStore: ConfigStore;
    scheduled: () => number;
    CHANNELS: { name: string; url: string }[];
} {
    const {
        state: stateOverrides,
        runtime: runtimeOverrides,
        fetchChannels,
        channels,
        syncCoordinator,
        hdhrEnabled,
        version,
    } = options;
    const CHANNELS = channels || [
        { name: 'A', url: 'http://192.168.1.20/a' },
        { name: 'B', url: 'http://192.168.1.20/b' },
    ];
    const state = createStateStore(createState(stateOverrides));
    const writes: unknown[] = [];
    const calls: Record<string, unknown>[] = [];
    let scheduled = 0;

    const configStore: ConfigStore = {
        async write(data) {
            writes.push(data);
        },
        read() {
            return null;
        },
        exists() {
            return false;
        },
        ensureDataDir() {},
    };

    const receiver = {
        async fetchChannels(settings: { ip: string; port: string | number; selectedListName: string }) {
            calls.push({ ...settings });
            if (fetchChannels) return fetchChannels(settings);
            return {
                channels: CHANNELS,
                selectedListName: settings.selectedListName,
                availableLists: ['TV-Liste', 'Radio'],
                detectedModel: 'STC',
            };
        },
        close() {},
    } as unknown as Receiver;

    const cron = {
        validate: fakeCron,
        schedule() {
            scheduled++;
            return { stop() {}, destroy() {} };
        },
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
        version: version || '1.8.0-test',
        hdhrConfig: {
            enabled: hdhrEnabled !== false,
            friendlyName: null,
            deviceId: '12345678',
            tunerCount: 2,
            warnings: [],
        },
        syncCoordinator,
    });

    return { app, services, state, writes, calls, configStore, scheduled: () => scheduled, CHANNELS };
}

export { baseRuntime, createHarness, fakeCron, quietLogger };
