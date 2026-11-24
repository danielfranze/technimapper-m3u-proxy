/**
 * Small dependency-free logger.
 */
const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2 });
export function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch (err) {
        return `[unserializable: ${err.message}]`;
    }
}
export function formatValue(value) {
    if (value instanceof Error)
        return value.stack || value.message;
    if (typeof value === 'string')
        return value;
    return safeStringify(value);
}
export function normalizeLevel(value) {
    const level = String(value || 'info').toLowerCase();
    return Object.hasOwn(LEVELS, level) ? level : 'info';
}
export function normalizeFormat(value) {
    return String(value || 'text').toLowerCase() === 'json' ? 'json' : 'text';
}
export function defaultSink() {
    return {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };
}
export function createLogger(options = {}) {
    const level = normalizeLevel(options.level);
    const format = normalizeFormat(options.format);
    const sink = options.sink || defaultSink();
    const threshold = LEVELS[level];
    function write(kind, args) {
        if (LEVELS[kind] > threshold)
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
export { LEVELS };
//# sourceMappingURL=logger.js.map