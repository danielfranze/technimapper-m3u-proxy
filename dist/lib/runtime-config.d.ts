declare const DEFAULT_PORT = 9191;
declare const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
declare const DEFAULT_MAX_RESPONSE_BYTES: number;
declare const DEFAULT_CRON = "*/5 * * * *";
declare const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30000;
/**
 * @param {unknown} raw
 * @param {number} fallback
 * @param {{ min?: number, max?: number, name?: string, warnings?: string[] }} [options]
 */
declare function intFromEnv(raw: any, fallback: number, options?: any): number;
/**
 * Express accepts `true`, a hop count, a subnet list or one of the named ranges.
 * Invalid values are downgraded to `false` instead of crashing the process.
 * @param {string|undefined} raw
 * @param {string[]} warnings
 */
declare function parseTrustProxy(raw: any, warnings?: string[]): string | number | boolean;
/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   port: number,
 *   dataDir: string,
 *   configFile: string,
 *   requestTimeoutMs: number,
 *   maxResponseBytes: number,
 *   shutdownTimeoutMs: number,
 *   allowNonPrivateIp: boolean,
 *   adminUser: string,
 *   adminPassword: string,
 *   trustProxy: boolean|number|string,
 *   logLevel: string,
 *   logFormat: string,
 *   hsts: boolean,
 *   defaultCron: string,
 *   playlistPaths: readonly string[],
 *   publicPaths: readonly string[],
 *   authFailureWindowMs: number,
 *   authFailureMax: number,
 *   apiRateWindowMs: number,
 *   apiRateMax: number,
 *   maxRateEntries: number,
 *   warnings: string[]
 * }}
 */
declare function loadRuntimeConfig(env?: any): {
    port: number;
    dataDir: string;
    configFile: string;
    requestTimeoutMs: number;
    maxResponseBytes: number;
    shutdownTimeoutMs: number;
    allowNonPrivateIp: boolean;
    allowLoopbackReceiver: boolean;
    adminUser: any;
    adminPassword: any;
    trustProxy: string | number | boolean;
    logLevel: any;
    logFormat: any;
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
};
export { DEFAULT_PORT, DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_MAX_RESPONSE_BYTES, DEFAULT_CRON, DEFAULT_SHUTDOWN_TIMEOUT_MS, intFromEnv, parseTrustProxy, loadRuntimeConfig };
