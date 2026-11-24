'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVELS = void 0;
exports.createLogger = createLogger;
exports.normalizeLevel = normalizeLevel;
exports.normalizeFormat = normalizeFormat;
exports.safeStringify = safeStringify;
exports.defaultSink = defaultSink;
/**
 * Small dependency-free logger.
 *
 * The text format stays close to the previous output; the JSON format is one
 * object per line so it can be consumed by log collectors (Loki, ELK, ...).
 */
const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2 });
exports.LEVELS = LEVELS;
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch (err) {
        return `[unserializable: ${err.message}]`;
    }
}
function formatValue(value) {
    if (value instanceof Error)
        return value.stack || value.message;
    if (typeof value === 'string')
        return value;
    return safeStringify(value);
}
function normalizeLevel(value) {
    const level = String(value || 'info').toLowerCase();
    return Object.hasOwn(LEVELS, level) ? level : 'info';
}
function normalizeFormat(value) {
    return String(value || 'text').toLowerCase() === 'json' ? 'json' : 'text';
}
function defaultSink() {
    return {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };
}
/**
 * @param {{ level?: string, format?: string, sink?: { info: Function, warn: Function, error: Function } }} [options]
 */
function createLogger(options = {}) {
    const level = normalizeLevel(options.level);
    const format = normalizeFormat(options.format);
    const sink = options.sink || defaultSink();
    const threshold = LEVELS[level];
    function write(kind, args) {
        if ((LEVELS[kind] ?? 99) > threshold)
            return;
        const text = args.map(formatValue).join(' ');
        const out = sink[kind] || sink.info;
        if (format === 'json') {
            out(safeStringify({ time: new Date().toISOString(), level: kind, msg: text }));
        }
        else {
            out(`[${kind.toUpperCase()}]`, text);
        }
    }
    return {
        level,
        format,
        info: (...args) => write('info', args),
        warn: (...args) => write('warn', args),
        error: (...args) => write('error', args)
    };
}
//# sourceMappingURL=logger.js.map