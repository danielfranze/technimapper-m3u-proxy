/**
 * Small dependency-free logger.
 */

const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2 } as const);

export function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return `[unserializable: ${(err as Error).message}]`;
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

export function defaultSink(): { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void } {
    return {
        info: (...args: any[]) => console.log(...args),
        warn: (...args: any[]) => console.warn(...args),
        error: (...args: any[]) => console.error(...args)
    };
}

export interface LoggerOptions {
    level?: string;
    format?: string;
    sink?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export function createLogger(options: LoggerOptions = {}): {
    level: string;
    format: string;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
} {
    const level = normalizeLevel(options.level);
    const format = normalizeFormat(options.format);
    const sink = options.sink || defaultSink();
    const threshold = (LEVELS as any)[level];

    function write(kind: string, args: any[]) {
        if ((LEVELS as any)[kind] > threshold) return;

        const text = args.map(formatValue).join(' ');
        const out = (sink as any)[kind] || sink.info;
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

export { LEVELS };
