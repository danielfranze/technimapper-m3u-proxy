/**
 * Small dependency-free logger.
 *
 * The text format stays close to the previous output; the JSON format is one
 * object per line so it can be consumed by log collectors (Loki, ELK, ...).
 */
declare const LEVELS: Readonly<{
    error: 0;
    warn: 1;
    info: 2;
}>;
declare function safeStringify(value: any): string;
declare function normalizeLevel(value: any): string;
declare function normalizeFormat(value: any): string;
declare function defaultSink(): any;
/**
 * @param {{ level?: string, format?: string, sink?: { info: Function, warn: Function, error: Function } }} [options]
 */
declare function createLogger(options?: any): {
    level: string;
    format: string;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export { LEVELS, createLogger, normalizeLevel, normalizeFormat, safeStringify, defaultSink };
