/**
 * Small dependency-free logger.
 */

const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2 } as const);

type LogLevel = keyof typeof LEVELS;
type LogSink = { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
type LogFunction = (...args: unknown[]) => void;

export function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return `[unserializable: ${(err instanceof Error ? err : new Error(String(err))).message}]`;
    }
}

export function formatValue(value: unknown): string {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    return safeStringify(value);
}

export function normalizeLevel(value: unknown): string {
    const level = String(value || 'info').toLowerCase();
    return Object.hasOwn(LEVELS, level) ? level : 'info';
}

export function normalizeFormat(value: unknown): string {
    return String(value || 'text').toLowerCase() === 'json' ? 'json' : 'text';
}

export function defaultSink(): LogSink {
    return {
        info: (...args: unknown[]) => console.log(...args),
        warn: (...args: unknown[]) => console.warn(...args),
        error: (...args: unknown[]) => console.error(...args),
    };
}

export interface LoggerOptions {
    level?: string;
    format?: string;
    sink?: LogSink;
}

export interface Logger {
    level: string;
    format: string;
    info: LogFunction;
    warn: LogFunction;
    error: LogFunction;
}

export function createLogger(options: LoggerOptions = {}): Logger {
    const level = normalizeLevel(options.level);
    const format = normalizeFormat(options.format);
    const sink = options.sink || defaultSink();
    const threshold = LEVELS[level as LogLevel];

    function write(kind: LogLevel, args: unknown[]) {
        if (LEVELS[kind] > threshold) return;

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
        info: (...args: unknown[]) => write('info', args),
        warn: (...args: unknown[]) => write('warn', args),
        error: (...args: unknown[]) => write('error', args),
    };
}

export { LEVELS };
