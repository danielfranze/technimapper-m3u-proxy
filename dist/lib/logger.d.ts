/**
 * Small dependency-free logger.
 */
declare const LEVELS: Readonly<{
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
}>;
type LogSink = {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};
type LogFunction = (...args: unknown[]) => void;
export declare function safeStringify(value: unknown): string;
export declare function formatValue(value: unknown): string;
export declare function normalizeLevel(value: unknown): string;
export declare function normalizeFormat(value: unknown): string;
export declare function defaultSink(): LogSink;
export interface LoggerOptions {
    level?: string;
    format?: string;
    sink?: LogSink;
}
export declare function createLogger(options?: LoggerOptions): {
    level: string;
    format: string;
    info: LogFunction;
    warn: LogFunction;
    error: LogFunction;
};
export { LEVELS };
