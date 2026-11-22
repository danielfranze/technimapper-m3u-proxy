'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, applyPersistedState } = require('../lib/state');
const { createDeps, fakeCron } = require('../test-helpers/state-deps');

function deps(logger) {
    return createDeps(logger);
}

test('repairPersistedSettings repairs port, cron and list name', () => {
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args.join(' ')), info() {}, error() {} };
    const state = createState();
    applyPersistedState(state, {
        ip: '192.168.1.10',
        port: '70000',
        cronExpression: 'bad',
        selectedListName: '',
        mapping: {},
        channels: []
    }, deps(logger));

    assert.equal(state.config.port, '9100');
    assert.equal(state.config.cronExpression, '*/5 * * * *');
    assert.equal(state.config.selectedListName, 'TV-Liste');
    assert.ok(warnings.length >= 3);
});
