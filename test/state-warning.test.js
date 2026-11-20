'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, applyPersistedState } = require('../lib/state');
const { createValidation, sortMapping } = require('../lib/validation');
const hdhr = require('../lib/hdhr');

const fakeCron = value => typeof value === 'string' && value.trim().split(/\s+/).length === 5;
const validation = createValidation({ cronValidate: fakeCron });

test('repairPersistedSettings warns about a disallowed receiver IP', () => {
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args.join(' ')), info() {}, error() {} };
    const deps = {
        validateMapping: validation.validateMapping,
        sortMapping,
        sanitizeModel: hdhr.sanitizeModel,
        isAllowedReceiverIp: validation.isAllowedReceiverIp,
        cronValidate: fakeCron,
        defaultCron: '*/5 * * * *',
        logger
    };

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
