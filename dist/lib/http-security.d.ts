/** Minimal request shape used by the middleware (structurally compatible with express.Request). */
interface RequestLike {
    ip?: string;
    socket?: {
        remoteAddress?: string;
    } | null;
    path: string;
    method: string;
    get(name: string): string | undefined;
}
/** Minimal response shape used by the middleware (structurally compatible with express.Response). */
interface ResponseLike {
    setHeader(name: string, value: string): void;
    set(name: string, value: string): unknown;
    status(code: number): ResponseLike;
    json(payload: unknown): ResponseLike;
    send(payload?: unknown): ResponseLike;
}
type NextLike = (err?: unknown) => void;
declare function clientKey(req: RequestLike): string;
declare function safeEqual(a: string, b: string): boolean;
declare function isPublicPath(requestPath: string | undefined, publicPaths?: string[], publicPrefixes?: string[]): boolean;
interface FailureLimiterResult {
    status(key: string): number;
    fail(key: string): void;
    clear(key: string): void;
    size(): number;
}
/**
 * Bounded map of failed authentication attempts. Only failures are counted, so
 * a legitimate client is not locked out by successful requests.
 */
declare function createFailureLimiter({ windowMs, max, maxEntries, now }: {
    windowMs: number;
    max: number;
    maxEntries?: number;
    now?: () => number;
}): FailureLimiterResult;
/**
 * Optional HTTP Basic Auth. Public routes must be listed explicitly; everything
 * else is protected as soon as both credentials are configured. If only one
 * credential is present, protected routes fail closed with 503.
 */
declare function createAuth({ user, password, publicPaths, publicPrefixes, failureWindowMs, failureMax, logger, now }?: {
    user?: string | undefined;
    password?: string | undefined;
    publicPaths?: string[] | undefined;
    publicPrefixes?: string[] | undefined;
    failureWindowMs?: number | undefined;
    failureMax?: number | undefined;
    logger?: {
        warn(...args: unknown[]): void;
        info(...args: unknown[]): void;
        error(...args: unknown[]): void;
    } | undefined;
    now?: (() => number) | undefined;
}): {
    (req: RequestLike, res: ResponseLike, next: NextLike): void;
    enabled: boolean;
    misconfigured: boolean;
};
interface RateLimitResult {
    limited: boolean;
    retryAfter: number;
}
/**
 * Bounded fixed-window limiter. The map never grows without limit; the oldest
 * entry is evicted when `maxEntries` is reached.
 */
declare function createRateLimiter({ windowMs, max, maxEntries, key, now }: {
    windowMs: number;
    max: number;
    maxEntries?: number;
    key?: (req: RequestLike) => string;
    now?: () => number;
}): {
    (req: RequestLike, res: ResponseLike, next: NextLike): void;
    consume(identifier: string): RateLimitResult;
    size(): number;
};
/**
 * CSRF/origin guard for state-changing API requests.
 *
 * Browsers always send `Origin` for cross-origin POSTs. Requiring JSON also
 * blocks classic HTML form posts and `fetch()` calls without a body, which is
 * the practical CSRF vector for an endpoint that accepts an empty body.
 */
declare function createOriginGuard(): (req: RequestLike, res: ResponseLike, next: NextLike) => void;
/**
 * Static security headers. `Cache-Control: no-store` is applied to API and health
 * responses so proxies and browsers never keep stale configuration or status.
 */
declare function securityHeaders({ hsts }?: {
    hsts?: boolean;
}): (req: RequestLike, res: ResponseLike, next: NextLike) => void;
interface HttpSecurityErrorLike {
    type?: string;
    status?: number;
    message?: string;
}
interface HttpSecurityLogger {
    error(prefix: string, err: unknown): void;
}
/**
 * Central Express error handler.
 *
 * Keeping this as a factory makes the status mapping testable without an HTTP
 * route that has to throw a synthetic error in production.
 */
declare function createErrorHandler(logger?: HttpSecurityLogger): (err: HttpSecurityErrorLike | unknown, _req: RequestLike, res: ResponseLike, _next: NextLike) => ResponseLike;
export { clientKey, safeEqual, isPublicPath, createFailureLimiter, createAuth, createRateLimiter, createOriginGuard, securityHeaders, createErrorHandler };
