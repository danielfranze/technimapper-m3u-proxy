'use strict';

/**
 * Small dependency-free logger.
 *
 * The text format stays close to the previous output; the JSON format is one
 * object per line so it can be consumed by log collectors (Loki, ELK, ...).
 */

const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2 });

function safeStringify(value: any): string {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return `[unserializable: ${(err as Error).message}]`;
    }
}

function formatValue(value: any) {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    return safeStringify(value);
}

function normalizeLevel(value: any): string {
    const level = String(value || 'info').toLowerCase();
    return Object.hasOwn(LEVELS, level) ? level : 'info';
}

function normalizeFormat(value: any): string {
    return String(value || 'text').toLowerCase() === 'json' ? 'json' : 'text';
}

function defaultSink(): any {
    return {
        info: (...args: any[]) => console.log(...args),
        warn: (...args: any[]) => console.warn(...args),
        error: (...args: any[]) => console.error(...args)
    };
}

/**
 * @param {{ level?: string, format?: string, sink?: { info: Function, warn: Function, error: Function } }} [options]
 */
function createLogger(options: any = {}) {
    const level = normalizeLevel(options.level);
    const format = normalizeFormat(options.format);
    const sink = options.sink || defaultSink();
    const threshold = LEVELS[level];

    function write(kind: any, args: any[]) {
        if (((LEVELS as any)[kind] ?? 99) > threshold) return;

        const text = args.map(formatValue).join(' ');
        const out = sink[kind] || sink.info;
        if (format === 'json') {
            out(safeStringify({ time: new Date().toISOString(), level: kind, msg: text }));
        } else {
            out(`[${kind.toUpperCase()}]`, text);
        }
    }

    return {
        level,
        format,
        info: (...args: any[]) => write('info', args),
        warn: (...args: any[]) => write('warn', args),
        error: (...args: any[]) => write('error', args)
    };
}

export { LEVELS, createLogger, normalizeLevel, normalizeFormat, safeStringify, defaultSink };
