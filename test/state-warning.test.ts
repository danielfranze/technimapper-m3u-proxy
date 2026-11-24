'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, applyPersistedState } = require('../dist/lib/state.js');
const { createDeps, fakeCron } = require('../test-helpers/state-deps.ts');

test('repairPersistedSettings warns about a disallowed receiver IP', () => {
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args.join(' ')), info() {}, error() {} };
    const deps = createDeps(logger);

    const state = createState();
    applyPersistedState(state, {
        ip: '8.8.8.8',
        port: '9100',
        cronExpression: '*/5 * * * *',
        selectedListName: 'TV-Liste',
        mapping: {},
        channels: []
    }, deps);

    assert.ok(warnings.some(w => /not allowed/.test(w)));
});
