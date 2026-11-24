/**
 * Small dependency-free logger.
 */
declare const LEVELS: Readonly<{
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
}>;
export declare function safeStringify(value: unknown): string;
export declare function formatValue(value: unknown): string;
export declare function normalizeLevel(value: unknown): string;
export declare function normalizeFormat(value: unknown): string;
export declare function defaultSink(): {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export interface LoggerOptions {
    level?: string;
    format?: string;
    sink?: {
        info: (...args: any[]) => void;
        warn: (...args: any[]) => void;
        error: (...args: any[]) => void;
    };
}
export declare function createLogger(options?: LoggerOptions): {
    level: string;
    format: string;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export { LEVELS };
