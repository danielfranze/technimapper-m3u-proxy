'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createValidation } = require('../lib/validation');

const fakeCron = s => typeof s === 'string' && s.trim().split(/\s+/).length === 5;
const strict = createValidation({ cronValidate: fakeCron });

test('validation covers remaining branches', () => {
    assert.equal(strict.isAllowedReceiverIp('8.8.8.8'), false);
    assert.throws(() => strict.validateSettings({ ip: '192.168.1.10', port: '9100', cronExpression: 'a'.repeat(101), selectedListName: 'x' }), /cron/i);
    const { invalid } = strict.validateMapping({ A: 'x'.repeat(33) });
    assert.deepEqual(invalid, ['A']);
});
