import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger, defaultSink, safeStringify } from '../lib/logger.js';

function recordingLogger(
    level: string = 'info',
    format: string = 'text',
): { logger: ReturnType<typeof createLogger>; calls: [string, unknown[]][] } {
    const calls: [string, unknown[]][] = [];
    const logger = createLogger({
        level,
        format,
        sink: {
            info: (...args: unknown[]) => calls.push(['info', args]),
            warn: (...args: unknown[]) => calls.push(['warn', args]),
            error: (...args: unknown[]) => calls.push(['error', args]),
        },
    });
    return { logger, calls };
}

test('safeStringify returns a readable fallback for circular values', () => {
    const circular: Record<string, unknown> = {};
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
    const captured: unknown[][] = [];
    console.log = (...args: unknown[]) => captured.push(args);
    try {
        const logger = createLogger({ level: 'info' });
        logger.info({ ok: 1 });
    } finally {
        console.log = originalLog;
    }
    assert.equal(captured.length, 1);
    const capturedEntry = captured[0];
    assert.ok(capturedEntry);
    assert.match(String(capturedEntry[1]), /"ok":1/);
});

test('non-string values are serialized through a custom sink', () => {
    const calls: unknown[][] = [];
    const logger = createLogger({
        level: 'info',
        sink: { info: (...args: unknown[]) => calls.push(args), warn() {}, error() {} },
    });
    logger.info({ ok: 1 });
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.match(String(call[1]), /"ok":1/);
});

test('the logger filters levels and supports text and JSON output', () => {
    const { logger: textLogger, calls: textCalls } = recordingLogger('warn');
    textLogger.info('should be hidden');
    textLogger.warn('visible');
    assert.deepEqual(
        textCalls.map((call: [string, unknown[]]) => call[0]),
        ['warn'],
    );
    const textEntry = textCalls[0];
    assert.ok(textEntry);
    assert.equal(textEntry[1][1], 'visible');

    const { logger: jsonLogger, calls: jsonCalls } = recordingLogger('info', 'json');
    jsonLogger.error(new Error('boom'));
    assert.equal(jsonCalls.length, 1);
    const jsonEntry = jsonCalls[0];
    assert.ok(jsonEntry);
    const payload = JSON.parse(String(jsonEntry[1][0]));
    assert.equal(payload.level, 'error');
    assert.match(payload.msg, /boom/);
});
