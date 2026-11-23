'use strict';

/**
 * Reads and validates the process environment once at startup.
 *
 * Keeping this in one place avoids the classic `parseInt(process.env.X) || default`
 * trap (e.g. `PORT=0` silently becomes the default) and makes the runtime
 * configuration easy to test without touching `process.env`.
 */

import net from 'net';
import path from 'node:path';

const DEFAULT_PORT = 9191;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CRON = '*/5 * * * *';
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30000;
const DEFAULT_PLAYLIST_PATHS = Object.freeze(['/playlist.m3u8', '/playlist.m3u']);
const TRUST_PROXY_TOKENS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @param {{ min?: number, max?: number, name?: string, warnings?: string[] }} [options]
 */
function intFromEnv(raw: any, fallback: number, options: any = {}) {
    const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, name = 'value', warnings = [] } = options;
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;

    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) {
        warnings.push(`${name} "${text}" is not a whole number - using ${fallback}.`);
        return fallback;
    }

    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        warnings.push(`${name} "${text}" is outside ${min}-${max} - using ${fallback}.`);
        return fallback;
    }
    return value;
}

/**
 * Express accepts `true`, a hop count, a subnet list or one of the named ranges.
 * Invalid values are downgraded to `false` instead of crashing the process.
 * @param {string|undefined} raw
 * @param {string[]} warnings
 */
function parseTrustProxy(raw, warnings = []) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return false;

    const text = String(raw).trim();
    if (text === 'false' || text === '0') return false;
    if (text === 'true') return true;
    if (/^\d+$/.test(text)) return Number(text);

    const parts = text.split(',').map(part => part.trim()).filter(Boolean);
    const valid = parts.length > 0 && parts.every(part => TRUST_PROXY_TOKENS.has(part) || net.isIP(part) !== 0);
    if (valid) return text;

    warnings.push(`TRUST_PROXY "${text}" is not a valid hop count, subnet or named range - using false.`);
    return false;
}

/** @param {string|undefined} raw */
function booleanFromEnv(raw) {
    return String(raw || '').trim().toLowerCase() === 'true';
}

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
function loadRuntimeConfig(env: any = process.env) {
    const warnings = [];

    const port = intFromEnv(env.PORT, DEFAULT_PORT, { min: 1, max: 65535, name: 'PORT', warnings });
    const requestTimeoutMs = intFromEnv(env.REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, {
        min: 500, max: 120000, name: 'REQUEST_TIMEOUT_MS', warnings
    });
    const maxResponseBytes = intFromEnv(env.MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, {
        min: 64 * 1024, max: 32 * 1024 * 1024, name: 'MAX_RESPONSE_BYTES', warnings
    });

    // A sync can take up to 3 * REQUEST_TIMEOUT_MS. The shutdown budget must be larger
    // so a running sync can still finish and persist its result.
    const minimumShutdownMs = requestTimeoutMs * 3 + 5000;
    const configuredShutdownMs = intFromEnv(env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS, {
        min: 1000, max: 300000, name: 'SHUTDOWN_TIMEOUT_MS', warnings
    });
    const shutdownTimeoutMs = Math.max(configuredShutdownMs, minimumShutdownMs);
    if (shutdownTimeoutMs !== configuredShutdownMs) {
        warnings.push(`SHUTDOWN_TIMEOUT_MS is smaller than the maximum sync duration - using ${shutdownTimeoutMs} ms.`);
    }

    const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(__dirname, '..', 'data');
    const adminUser = typeof env.ADMIN_USER === 'string' ? env.ADMIN_USER : '';
    const adminPassword = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';

    if (Boolean(adminUser) !== Boolean(adminPassword)) {
        warnings.push('Only one of ADMIN_USER / ADMIN_PASSWORD is set - protected routes will answer 503 until both are configured.');
    } else if (!adminUser) {
        warnings.push('No ADMIN_USER/ADMIN_PASSWORD set - the UI and API are unauthenticated. Do not expose this service to the internet.');
    }

    const playlistPaths = Object.freeze([...DEFAULT_PLAYLIST_PATHS]);
    const publicPaths = Object.freeze([
        ...playlistPaths,
        '/health',
        '/health/live',
        '/health/ready'
    ]);

    return {
        port,
        dataDir,
        configFile: path.join(dataDir, 'mapping.json'),
        requestTimeoutMs,
        maxResponseBytes,
        shutdownTimeoutMs,
        allowNonPrivateIp: booleanFromEnv(env.ALLOW_NON_PRIVATE_IP),
        allowLoopbackReceiver: booleanFromEnv(env.ALLOW_LOOPBACK_RECEIVER),
        adminUser,
        adminPassword,
        trustProxy: parseTrustProxy(env.TRUST_PROXY, warnings),
        logLevel: env.LOG_LEVEL || 'info',
        logFormat: env.LOG_FORMAT || 'text',
        hsts: booleanFromEnv(env.HSTS),
        defaultCron: DEFAULT_CRON,
        playlistPaths,
        publicPaths,
        authFailureWindowMs: 15 * 60 * 1000,
        authFailureMax: 20,
        apiRateWindowMs: 60 * 1000,
        apiRateMax: 60,
        maxRateEntries: 5000,
        warnings
    };
}

export {
    DEFAULT_PORT,
    DEFAULT_REQUEST_TIMEOUT_MS,
    DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_CRON,
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    intFromEnv,
    parseTrustProxy,
    loadRuntimeConfig
};
