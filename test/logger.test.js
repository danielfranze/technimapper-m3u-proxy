'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, safeStringify } = require('../lib/logger');

function recordingLogger(level = 'info', format = 'text') {
    const calls = [];
    const logger = createLogger({
        level,
        format,
        sink: {
            info: (...args) => calls.push(['info', args]),
            warn: (...args) => calls.push(['warn', args]),
            error: (...args) => calls.push(['error', args])
        }
    });
    return { logger, calls };
}

test('safeStringify returns a readable fallback for circular values', () => {
    const circular = {};
    circular.self = circular;
    assert.match(safeStringify(circular), /unserializable/);
    assert.equal(safeStringify({ ok: 1 }), JSON.stringify({ ok: 1 }));
});

test('the logger filters levels and supports text and JSON output', () => {
    const { logger: textLogger, calls: textCalls } = recordingLogger('warn');
    textLogger.info('should be hidden');
    textLogger.warn('visible');
    assert.deepEqual(textCalls.map(call => call[0]), ['warn']);
    assert.equal(textCalls[0][1][0], 'visible');

    const { logger: jsonLogger, calls: jsonCalls } = recordingLogger('info', 'json');
    jsonLogger.error(new Error('boom'));
    assert.equal(jsonCalls.length, 1);
    const payload = JSON.parse(jsonCalls[0][1][0]);
    assert.equal(payload.level, 'error');
    assert.match(payload.msg, /boom/);
});
