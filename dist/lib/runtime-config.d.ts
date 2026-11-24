/**
 * Reads and validates the process environment once at startup.
 */
export interface RuntimeConfig {
    port: number;
    dataDir: string;
    configFile: string;
    requestTimeoutMs: number;
    maxResponseBytes: number;
    shutdownTimeoutMs: number;
    allowNonPrivateIp: boolean;
    allowLoopbackReceiver: boolean;
    adminUser: string;
    adminPassword: string;
    trustProxy: number | boolean | string;
    logLevel: string;
    logFormat: string;
    hsts: boolean;
    defaultCron: string;
    playlistPaths: readonly string[];
    publicPaths: readonly string[];
    authFailureWindowMs: number;
    authFailureMax: number;
    apiRateWindowMs: number;
    apiRateMax: number;
    maxRateEntries: number;
    warnings: string[];
}
export declare function intFromEnv(raw: unknown, fallback: number, options?: {
    min?: number;
    max?: number;
    name?: string;
    warnings?: string[];
}): number;
export declare function parseTrustProxy(raw: unknown, warnings?: string[]): number | boolean | string;
export declare function loadRuntimeConfig(env?: Record<string, string | undefined>): RuntimeConfig;
