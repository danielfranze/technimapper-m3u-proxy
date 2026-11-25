'use strict';
/**
 * HTTP middleware factories: security headers, Basic Auth, CSRF/origin checks and
 * bounded in-memory rate limiting.
 *
 * Everything here is transport-level policy. Business routes only register
 * themselves and rely on these middleware functions.
 */
import crypto from 'crypto';
import { HttpError } from '../http-error.js';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function clientKey(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
}
function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}
export function isPublicPath(requestPath, publicPaths = [], publicPrefixes = ['/hdhr/']) {
    const path = String(requestPath || '');
    if (publicPaths.includes(path))
        return true;
    return publicPrefixes.some(prefix => path === prefix.slice(0, -1) || path.startsWith(prefix));
}
/**
 * Bounded map of failed authentication attempts. Only failures are counted, so
 * a legitimate client is not locked out by successful requests.
 */
export function createFailureLimiter({ windowMs, max, maxEntries = 5000, now = Date.now }) {
    const entries = new Map();
    function prune(currentTime) {
        for (const [key, entry] of entries) {
            if (entry.reset <= currentTime)
                entries.delete(key);
        }
    }
    function status(key) {
        const currentTime = now();
        const entry = entries.get(key);
        if (!entry)
            return 0;
        if (entry.reset <= currentTime) {
            entries.delete(key);
            return 0;
        }
        return entry.count >= max ? Math.max(1, Math.ceil((entry.reset - currentTime) / 1000)) : 0;
    }
    function fail(key) {
        const currentTime = now();
        if (entries.size >= maxEntries)
            prune(currentTime);
        if (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined)
                entries.delete(oldest);
        }
        const entry = entries.get(key);
        if (!entry || entry.reset <= currentTime) {
            entries.set(key, { count: 1, reset: currentTime + windowMs });
            return;
        }
        entry.count++;
    }
    function clear(key) {
        entries.delete(key);
    }
    return { status, fail, clear, size: () => entries.size };
}
/**
 * Optional HTTP Basic Auth. Public routes must be listed explicitly; everything
 * else is protected as soon as both credentials are configured. If only one
 * credential is present, protected routes fail closed with 503.
 */
export function createAuth({ user = '', password = '', publicPaths = [], publicPrefixes = ['/hdhr/'], failureWindowMs = 15 * 60 * 1000, failureMax = 20, logger = console, now = Date.now } = {}) {
    const hasUser = typeof user === 'string' && user.length > 0;
    const hasPassword = typeof password === 'string' && password.length > 0;
    const enabled = hasUser && hasPassword;
    const misconfigured = hasUser !== hasPassword;
    const failures = createFailureLimiter({ windowMs: failureWindowMs, max: failureMax, now });
    function readCredentials(req) {
        const header = String(req.get('authorization') || '');
        const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header);
        if (!match)
            return null;
        const decoded = Buffer.from(match[1], 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        if (separator < 0)
            return null;
        return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
    }
    function middleware(req, res, next) {
        if (isPublicPath(req.path, publicPaths, publicPrefixes))
            return next();
        if (misconfigured) {
            res.set('Cache-Control', 'no-store');
            res.status(503).json({ error: 'Authentication is misconfigured' });
            return;
        }
        if (!enabled)
            return next();
        const key = clientKey(req);
        const retryAfter = failures.status(key);
        if (retryAfter > 0) {
            res.set('Retry-After', String(retryAfter));
            res.status(429).json({ error: 'Too many failed authentication attempts' });
            return;
        }
        const credentials = readCredentials(req);
        if (credentials && safeEqual(credentials.user, user) && safeEqual(credentials.password, password)) {
            failures.clear(key);
            return next();
        }
        failures.fail(key);
        logger.warn(`Authentication failed from ${key}.`);
        res.set('WWW-Authenticate', 'Basic realm="TechniMapper", charset="UTF-8"');
        res.status(401).send('Authentication required');
    }
    middleware.enabled = enabled;
    middleware.misconfigured = misconfigured;
    return middleware;
}
/**
 * Bounded fixed-window limiter. The map never grows without limit; the oldest
 * entry is evicted when `maxEntries` is reached.
 */
export function createRateLimiter({ windowMs, max, maxEntries = 5000, key = clientKey, now = Date.now }) {
    const hits = new Map();
    function consume(identifier) {
        const currentTime = now();
        let entry = hits.get(identifier);
        if (!entry || entry.reset <= currentTime) {
            if (!entry && hits.size >= maxEntries) {
                const oldest = hits.keys().next().value;
                if (oldest !== undefined)
                    hits.delete(oldest);
            }
            entry = { count: 1, reset: currentTime + windowMs };
            hits.set(identifier, entry);
            return { limited: false, retryAfter: 0 };
        }
        entry.count++;
        if (entry.count <= max)
            return { limited: false, retryAfter: 0 };
        return { limited: true, retryAfter: Math.max(1, Math.ceil((entry.reset - currentTime) / 1000)) };
    }
    function middleware(req, res, next) {
        const result = consume(key(req));
        if (!result.limited)
            return next();
        res.set('Retry-After', String(result.retryAfter));
        res.status(429).json({ error: 'Too many requests' });
    }
    middleware.consume = consume;
    middleware.size = () => hits.size;
    return middleware;
}
/**
 * CSRF/origin guard for state-changing API requests.
 *
 * Browsers always send `Origin` for cross-origin POSTs. Requiring JSON also
 * blocks classic HTML form posts and `fetch()` calls without a body, which is
 * the practical CSRF vector for an endpoint that accepts an empty body.
 */
export function createOriginGuard() {
    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method))
            return next();
        const contentType = String(req.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
            res.status(415).json({ error: 'Content-Type application/json required' });
            return;
        }
        const host = req.get('host');
        if (!host) {
            res.status(400).json({ error: 'Missing Host header' });
            return;
        }
        const origin = req.get('origin');
        const referer = req.get('referer');
        const source = origin || referer;
        if (!source)
            return next();
        let sourceHost;
        try {
            sourceHost = new URL(source).host;
        }
        catch {
            res.status(403).json({ error: 'Invalid origin' });
            return;
        }
        if (sourceHost.toLowerCase() !== host.toLowerCase()) {
            res.status(403).json({ error: 'Cross-origin request blocked' });
            return;
        }
        return next();
    };
}
/**
 * Static security headers. `Cache-Control: no-store` is applied to API and health
 * responses so proxies and browsers never keep stale configuration or status.
 */
export function securityHeaders({ hsts = false } = {}) {
    return (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; " +
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        if (hsts)
            res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
        const requestPath = String(req.path || '');
        if (requestPath === '/api' || requestPath.startsWith('/api/') || requestPath === '/health' || requestPath.startsWith('/health/')) {
            res.setHeader('Cache-Control', 'no-store');
        }
        next();
    };
}
/**
 * Central Express error handler.
 *
 * Keeping this as a factory makes the status mapping testable without an HTTP
 * route that has to throw a synthetic error in production.
 */
export function createErrorHandler(logger = { error: () => undefined }) {
    return (err, _req, res, _next) => {
        const e = err;
        if (e?.type === 'entity.parse.failed')
            return res.status(400).json({ error: 'Invalid JSON payload' });
        if (e?.type === 'entity.too.large')
            return res.status(413).json({ error: 'Payload too large' });
        if (e instanceof HttpError)
            return res.status(e.status).json({ error: e.message });
        if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
            return res.status(e.status).json({ error: 'Invalid request' });
        }
        logger.error('Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    };
}
//# sourceMappingURL=middleware.js.map