import assert from 'node:assert/strict';
import test from 'node:test';
import { type AppState, applyPersistedState, createState, persistedSnapshot } from '../lib/state.js';
import { createDeps } from '../test-helpers/state-deps.ts';

test('applyPersistedState handles missing and invalid persisted fields', () => {
    const warnings: string[] = [];
    const logger = { warn: (...args: unknown[]) => warnings.push(args.join(' ')), info() {}, error() {} };
    const deps = createDeps(logger);

    const state = createState({
        config: {
            ip: '192.168.1.10',
            port: '9100',
            cronExpression: '*/5 * * * *',
            selectedListName: 'TV-Liste',
        } as AppState['config'],
    });
    const result = applyPersistedState(
        state,
        {
            port: 9100,
            cronExpression: 42,
            selectedListName: null,
            mapping: null,
            channels: 'not an array',
            detectedModel: 123,
            lastSync: 42,
        },
        deps,
    );

    assert.equal(state.config.port, '9100');
    assert.equal(state.config.cronExpression, '*/5 * * * *');
    assert.equal(state.config.selectedListName, 'TV-Liste');
    assert.deepEqual(state.config.channels, []);
    assert.equal(state.config.detectedModel, null);
    assert.equal(state.config.lastSync, null);
    assert.equal(result.droppedMapping, 1);
});

test('persistedSnapshot clones mapping and channels', () => {
    const state = createState({
        config: {
            ip: '192.168.1.10',
            port: '9100',
            cronExpression: '*/5 * * * *',
            selectedListName: 'TV-Liste',
            mapping: { A: 1 },
            channels: [{ name: 'A', url: 'http://x' }],
            lastSync: null,
            detectedModel: null,
        },
    });
    const snapshot = persistedSnapshot(state) as {
        mapping: Record<string, string | number>;
        channels: Array<{ name: string; url: string }>;
    };
    snapshot.mapping.A = 2;
    const snapshotChannel = snapshot.channels[0];
    assert.ok(snapshotChannel);
    snapshotChannel.name = 'B';
    assert.equal(state.config.mapping.A, 1);
    const stateChannel = state.config.channels[0];
    assert.ok(stateChannel);
    assert.equal(stateChannel.name, 'A');
});
