declare function clientKey(req: any): any;
declare function safeEqual(a: any, b: any): boolean;
/** @param {string} requestPath */
declare function isPublicPath(requestPath: any, publicPaths?: any[], publicPrefixes?: string[]): boolean;
/**
 * Bounded map of failed authentication attempts. Only failures are counted, so
 * a legitimate client is not locked out by successful requests.
 */
declare function createFailureLimiter({ windowMs, max, maxEntries, now }: {
    windowMs: any;
    max: any;
    maxEntries?: number;
    now?: () => number;
}): {
    status: (key: any) => number;
    fail: (key: any) => void;
    clear: (key: any) => void;
    size: () => number;
};
/**
 * Optional HTTP Basic Auth. Public routes must be listed explicitly; everything
 * else is protected as soon as both credentials are configured. If only one
 * credential is present, protected routes fail closed with 503.
 */
declare function createAuth({ user, password, publicPaths, publicPrefixes, failureWindowMs, failureMax, logger, now }?: {
    user?: string;
    password?: string;
    publicPaths?: any[];
    publicPrefixes?: string[];
    failureWindowMs?: number;
    failureMax?: number;
    logger?: Console;
    now?: () => number;
}): {
    (req: any, res: any, next: any): any;
    enabled: boolean;
    misconfigured: boolean;
};
/**
 * Bounded fixed-window limiter. The map never grows without limit; the oldest
 * entry is evicted when `maxEntries` is reached.
 */
declare function createRateLimiter({ windowMs, max, maxEntries, key, now }: {
    windowMs: any;
    max: any;
    maxEntries?: number;
    key?: typeof clientKey;
    now?: () => number;
}): {
    (req: any, res: any, next: any): any;
    consume: (identifier: any) => {
        limited: boolean;
        retryAfter: number;
    };
    size(): number;
};
/**
 * CSRF/origin guard for state-changing API requests.
 *
 * Browsers always send `Origin` for cross-origin POSTs. Requiring JSON also
 * blocks classic HTML form posts and `fetch()` calls without a body, which is
 * the practical CSRF vector for an endpoint that accepts an empty body.
 */
declare function createOriginGuard(): (req: any, res: any, next: any) => any;
/**
 * Static security headers. `Cache-Control: no-store` is applied to API and health
 * responses so proxies and browsers never keep stale configuration or status.
 */
declare function securityHeaders({ hsts }?: {
    hsts?: boolean;
}): (req: any, res: any, next: any) => void;
/**
 * Central Express error handler.
 *
 * Keeping this as a factory makes the status mapping testable without an HTTP
 * route that has to throw a synthetic error in production.
 */
declare function createErrorHandler(logger?: Console): (err: any, req: any, res: any, next: any) => any;
export { clientKey, safeEqual, isPublicPath, createFailureLimiter, createAuth, createRateLimiter, createOriginGuard, securityHeaders, createErrorHandler };
