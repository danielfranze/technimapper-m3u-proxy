'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, persistedSnapshot, applyPersistedState, type AppState } from '../dist/lib/state.js';
import { createDeps } from '../test-helpers/state-deps.ts';

const logger = { warn() {}, info() {}, error() {} };
const deps = createDeps(logger);

test('createState starts with safe defaults and supports overrides', () => {
    const state = createState();
    assert.equal(state.configured, false);
    assert.equal(state.cachedM3u8, null);
    assert.deepEqual(state.config.mapping, {});
    assert.deepEqual(state.config.channels, []);
    assert.equal(state.sync.consecutiveFailures, 0);

    const custom = createState({ configured: true, config: { ip: '10.0.0.5' } as AppState['config'] });
    assert.equal(custom.configured, true);
    assert.equal(custom.config.ip, '10.0.0.5');
    assert.equal(custom.config.port, '9100');
});

test('persistedSnapshot contains only plain data and does not share mapping/channels', () => {
    const state = createState({
        config: {
            ip: '192.168.1.10',
            port: '9100',
            cronExpression: '*/5 * * * *',
            selectedListName: 'TV-Liste',
            mapping: { A: 1 },
            channels: [{ name: 'A', url: 'http://192.168.1.20/a' }],
            lastSync: '2026-01-01T00:00:00.000Z',
            detectedModel: 'DIGIT ISIO STC'
        }
    });

    const snapshot = persistedSnapshot(state) as { mapping: Record<string, number>; channels: Array<{ name: string }> };
    snapshot.mapping.A = 99;
    const snapshotChannel = snapshot.channels[0];
    assert.ok(snapshotChannel);
    snapshotChannel.name = 'changed';
    assert.equal(state.config.mapping.A, 1);
    const stateChannel = state.config.channels[0];
    assert.ok(stateChannel);
    assert.equal(stateChannel.name, 'A');
});

test('applyPersistedState sanitises values, sorts the mapping and repairs invalid settings', () => {
    const state = createState();
    const result = applyPersistedState(state, {
        ip: '192.168.1.10',
        port: 'not-a-port',
        cronExpression: 'not cron',
        selectedListName: '',
        mapping: { '002 B': 2, '001 A': 1, bad: 'has space' },
        channels: [
            { name: '001 A', url: 'http://192.168.1.20/a' },
            { name: '002 B', url: 'http://192.168.1.20/b' },
            { name: 42, url: 'http://invalid' }
        ],
        detectedModel: 'DIGIT ISIO STC'
    }, deps);

    assert.equal(state.configured, true);
    assert.equal(result.changed, true);
    assert.equal(result.droppedMapping, 1);
    assert.deepEqual(Object.keys(state.config.mapping), ['001 A', '002 B']);
    assert.equal(state.config.port, '9100');
    assert.equal(state.config.cronExpression, '*/5 * * * *');
    assert.equal(state.config.selectedListName, 'TV-Liste');
    assert.equal(state.config.channels.length, 2);
    assert.equal(state.config.detectedModel, 'DIGIT ISIO STC');
});

test('applyPersistedState rejects non-object data', () => {
    const state = createState();
    assert.throws(() => applyPersistedState(state, null, deps), /not an object/);
    assert.throws(() => applyPersistedState(state, [], deps), /not an object/);
});
