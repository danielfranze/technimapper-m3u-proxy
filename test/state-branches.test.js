'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, applyPersistedState, persistedSnapshot } = require('../lib/state.js');
const { createDeps, fakeCron } = require('../test-helpers/state-deps.js');

test('applyPersistedState handles missing and invalid persisted fields', () => {
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args.join(' ')), info() {}, error() {} };
    const deps = createDeps(logger);

    const state = createState({ config: { ip: '192.168.1.10', port: '9100', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste' } });
    const result = applyPersistedState(state, {
        port: 9100,
        cronExpression: 42,
        selectedListName: null,
        mapping: null,
        channels: 'not an array',
        detectedModel: 123,
        lastSync: 42
    }, deps);

    assert.equal(state.config.port, '9100');
    assert.equal(state.config.cronExpression, '*/5 * * * *');
    assert.equal(state.config.selectedListName, 'TV-Liste');
    assert.deepEqual(state.config.channels, []);
    assert.equal(state.config.detectedModel, null);
    assert.equal(state.config.lastSync, null);
    assert.equal(result.droppedMapping, 1);
});

test('persistedSnapshot clones mapping and channels', () => {
    const state = createState({ config: { ip: '192.168.1.10', port: '9100', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste', mapping: { A: 1 }, channels: [{ name: 'A', url: 'http://x' }], lastSync: null, detectedModel: null } });
    const snapshot = persistedSnapshot(state);
    snapshot.mapping.A = 2;
    snapshot.channels[0].name = 'B';
    assert.equal(state.config.mapping.A, 1);
    assert.equal(state.config.channels[0].name, 'A');
});
