/**
 * Reads and validates the process environment once at startup.
 */
import net from 'node:net';
import path from 'node:path';
const DEFAULT_PORT = 9191;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CRON = '*/5 * * * *';
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30000;
const DEFAULT_PLAYLIST_PATHS = Object.freeze(['/playlist.m3u8', '/playlist.m3u']);
const TRUST_PROXY_TOKENS = new Set(['loopback', 'linklocal', 'uniquelocal']);
export function intFromEnv(raw, fallback, options = {}) {
    const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, name = 'value', warnings = [] } = options;
    if (raw === undefined || raw === null || String(raw).trim() === '')
        return fallback;
    const text = String(raw).trim();
    const n = Number(text);
    if (!Number.isInteger(n)) {
        warnings.push(`${name} "${text}" is not a whole number - using ${fallback}.`);
        return fallback;
    }
    if (n < min || n > max) {
        warnings.push(`${name} "${text}" is outside ${min}-${max} - using ${fallback}.`);
        return fallback;
    }
    return n;
}
function booleanFromEnv(raw) {
    return String(raw || '').trim().toLowerCase() === 'true';
}
export function parseTrustProxy(raw, warnings = []) {
    const text = String(raw || '').trim();
    if (text === '')
        return false;
    if (text === '0')
        return false;
    if (/^\d+$/.test(text))
        return parseInt(text, 10);
    if (text === 'true')
        return true;
    if (text === 'false')
        return false;
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    const valid = parts.length > 0 && parts.every((part) => TRUST_PROXY_TOKENS.has(part) || net.isIP(part) !== 0);
    if (valid)
        return text;
    warnings.push(`TRUST_PROXY "${text}" is not a valid hop count, subnet or named range - using false.`);
    return false;
}
export function loadRuntimeConfig(env = process.env) {
    const warnings = [];
    const port = intFromEnv(env.PORT, DEFAULT_PORT, { min: 1, max: 65535, name: 'PORT', warnings });
    const requestTimeoutMs = intFromEnv(env.REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, { min: 500, max: 120000, name: 'REQUEST_TIMEOUT_MS', warnings });
    const maxResponseBytes = intFromEnv(env.MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, { min: 64 * 1024, max: 32 * 1024 * 1024, name: 'MAX_RESPONSE_BYTES', warnings });
    const rawShutdown = intFromEnv(env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS, { min: 1000, max: 300000, name: 'SHUTDOWN_TIMEOUT_MS', warnings });
    const shutdownTimeoutMs = Math.max(rawShutdown, requestTimeoutMs * 3 + 1000);
    const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(process.cwd(), 'data');
    const adminUser = (env.ADMIN_USER || '').trim();
    const adminPassword = (env.ADMIN_PASSWORD || '').trim();
    if (adminUser && !adminPassword)
        warnings.push('Only one of ADMIN_USER / ADMIN_PASSWORD is set - protected routes will answer 503.');
    if (!adminUser && adminPassword)
        warnings.push('Only one of ADMIN_USER / ADMIN_PASSWORD is set - protected routes will answer 503.');
    if (!adminUser && !adminPassword)
        warnings.push('No ADMIN_USER/ADMIN_PASSWORD set - the UI and API are unauthenticated. Do not expose this service to the internet.');
    const trustProxy = parseTrustProxy(env.TRUST_PROXY, warnings);
    const hsts = booleanFromEnv(env.HSTS);
    const publicPaths = Object.freeze([...DEFAULT_PLAYLIST_PATHS, '/health', '/health/live', '/health/ready']);
    const playlistPaths = Object.freeze([...DEFAULT_PLAYLIST_PATHS]);
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
        trustProxy,
        logLevel: env.LOG_LEVEL || 'info',
        logFormat: env.LOG_FORMAT || 'json',
        hsts,
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
//# sourceMappingURL=runtime-config.js.map