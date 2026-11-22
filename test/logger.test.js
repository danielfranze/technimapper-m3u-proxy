'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, safeStringify, defaultSink } = require('../lib/logger.js');

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

test('defaultSink returns console-backed functions', () => {
    const sink = defaultSink();
    assert.equal(typeof sink.info, 'function');
    assert.equal(typeof sink.warn, 'function');
    assert.equal(typeof sink.error, 'function');
});

test('the default sink is used when none is provided and non-string values are serialized', () => {
    const originalLog = console.log;
    const captured = [];
    console.log = (...args) => captured.push(args);
    try {
        const logger = createLogger({ level: 'info' });
        logger.info({ ok: 1 });
    } finally {
        console.log = originalLog;
    }
    assert.equal(captured.length, 1);
    assert.match(captured[0][1], /"ok":1/);
});

test('non-string values are serialized through a custom sink', () => {
    const calls = [];
    const logger = createLogger({ level: 'info', sink: { info: (...args) => calls.push(args), warn() {}, error() {} } });
    logger.info({ ok: 1 });
    assert.equal(calls.length, 1);
    assert.match(calls[0][1], /"ok":1/);
});

test('the logger filters levels and supports text and JSON output', () => {
    const { logger: textLogger, calls: textCalls } = recordingLogger('warn');
    textLogger.info('should be hidden');
    textLogger.warn('visible');
    assert.deepEqual(textCalls.map(call => call[0]), ['warn']);
    assert.equal(textCalls[0][1][1], 'visible');

    const { logger: jsonLogger, calls: jsonCalls } = recordingLogger('info', 'json');
    jsonLogger.error(new Error('boom'));
    assert.equal(jsonCalls.length, 1);
    const payload = JSON.parse(jsonCalls[0][1][0]);
    assert.equal(payload.level, 'error');
    assert.match(payload.msg, /boom/);
});
