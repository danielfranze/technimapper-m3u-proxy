/**
 * HTTP middleware factories: security headers, Basic Auth, CSRF/origin checks and
 * bounded in-memory rate limiting.
 *
 * Everything here is transport-level policy. Business routes only register
 * themselves and rely on these middleware functions.
 */
/** Minimal request shape used by the middleware (structurally compatible with express.Request). */
export interface RequestLike {
    ip?: string | undefined;
    socket?: {
        remoteAddress?: string | undefined;
    } | null | undefined;
    path: string;
    method: string;
    get(name: string): string | undefined;
}
/** Minimal response shape used by the middleware (structurally compatible with express.Response). */
export interface ResponseLike {
    setHeader(name: string, value: string): void;
    set(name: string, value: string): unknown;
    status(code: number): ResponseLike;
    json(payload: unknown): ResponseLike;
    send(payload?: unknown): ResponseLike;
}
export type NextLike = (err?: unknown) => void;
export declare function clientKey(req: RequestLike): string;
export declare function isPublicPath(requestPath: string | undefined, publicPaths?: string[], publicPrefixes?: string[]): boolean;
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
export declare function createFailureLimiter({ windowMs, max, maxEntries, now, }: {
    windowMs: number;
    max: number;
    maxEntries?: number;
    now?: () => number;
}): FailureLimiterResult;
interface AuthLogger {
    warn(...args: unknown[]): void;
    info?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
}
/**
 * Optional HTTP Basic Auth. Public routes must be listed explicitly; everything
 * else is protected as soon as both credentials are configured. If only one
 * credential is present, protected routes fail closed with 503.
 */
export declare function createAuth({ user, password, publicPaths, publicPrefixes, failureWindowMs, failureMax, logger, now, }?: {
    user?: string;
    password?: string;
    publicPaths?: string[];
    publicPrefixes?: string[];
    failureWindowMs?: number;
    failureMax?: number;
    logger?: AuthLogger;
    now?: () => number;
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
export declare function createRateLimiter({ windowMs, max, maxEntries, key, now, }: {
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
export declare function createOriginGuard(): (req: RequestLike, res: ResponseLike, next: NextLike) => void;
/**
 * Static security headers. `Cache-Control: no-store` is applied to API and health
 * responses so proxies and browsers never keep stale configuration or status.
 */
export declare function securityHeaders({ hsts, }?: {
    hsts?: boolean;
}): (req: RequestLike, res: ResponseLike, next: NextLike) => void;
interface HttpSecurityErrorLike {
    type?: string;
    status?: number;
    message?: string;
}
/**
 * Central Express error handler.
 *
 * Keeping this as a factory makes the status mapping testable without an HTTP
 * route that has to throw a synthetic error in production.
 */
export declare function createErrorHandler(logger?: {
    error(prefix: string, err: unknown): void;
}): (err: HttpSecurityErrorLike | unknown, _req: RequestLike, res: ResponseLike, _next: NextLike) => ResponseLike;
export {};
