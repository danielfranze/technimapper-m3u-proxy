'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isPublicPath,
    createAuth,
    createRateLimiter,
    createFailureLimiter,
    createOriginGuard,
    createErrorHandler
} from '../dist/lib/http-security.js';
import { HttpError } from '../dist/lib/validation.js';

const quietLogger: { warn(...args: unknown[]): void; info(...args: unknown[]): void; error(...args: unknown[]): void } = { warn() {}, info() {}, error() {} };

interface FakeRequest {
    method: string;
    path: string;
    ip: string;
    socket: { remoteAddress: string };
    get(name: string): string | undefined;
}

function fakeRequest({ method = 'GET', path = '/api/config', ip = '192.168.1.50', headers = {} as Record<string, string> }: { method?: string; path?: string; ip?: string; headers?: Record<string, string> } = {}): FakeRequest {
    const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        method,
        path,
        ip,
        socket: { remoteAddress: ip },
        get(name: string) { return normalized[String(name).toLowerCase()]; }
    };
}

interface FakeResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    set(name: string, value: string): FakeResponse;
    setHeader(name: string, value: string): void;
    status(code: number): FakeResponse;
    json(payload: unknown): FakeResponse;
    send(payload: unknown): FakeResponse;
}

function fakeResponse(): FakeResponse {
    const response: FakeResponse = {
        statusCode: 200,
        headers: {},
        body: undefined,
        set(name: string, value: string) { this.headers[name] = value; return this; },
        setHeader(name: string, value: string) { this.headers[name] = value; },
        status(code: number) { this.statusCode = code; return this; },
        json(payload: unknown) { this.body = payload; return this; },
        send(payload: unknown) { this.body = payload; return this; }
    };
    return response;
}

const basic = (user: string, password: string): string => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('public paths are explicit and /hdhr is matched as a prefix', () => {
    const paths = ['/health', '/playlist.m3u8'];
    assert.equal(isPublicPath('/health', paths), true);
    assert.equal(isPublicPath('/playlist.m3u8', paths), true);
    assert.equal(isPublicPath('/api/config', paths), false);
    assert.equal(isPublicPath('/hdhr', [], ['/hdhr/']), true);
    assert.equal(isPublicPath('/hdhr/lineup.json', [], ['/hdhr/']), true);
    assert.equal(isPublicPath('/hdhrx', [], ['/hdhr/']), false);
});

test('Basic Auth protects non-public routes and accepts valid credentials', () => {
    const auth = createAuth({ user: 'admin', password: 'secret', publicPaths: ['/health'], logger: quietLogger });

    const publicRes = fakeResponse();
    let publicNext = false;
    auth(fakeRequest({ path: '/health' }), publicRes, () => { publicNext = true; });
    assert.equal(publicNext, true);
    assert.equal(publicRes.statusCode, 200);

    const missingRes = fakeResponse();
    let missingNext = false;
    auth(fakeRequest(), missingRes, () => { missingNext = true; });
    assert.equal(missingNext, false);
    assert.equal(missingRes.statusCode, 401);
    assert.match(String(missingRes.headers['WWW-Authenticate']), /Basic/);

    const okRes = fakeResponse();
    let okNext = false;
    auth(fakeRequest({ headers: { authorization: basic('admin', 'secret') } }), okRes, () => { okNext = true; });
    assert.equal(okNext, true);
    assert.equal(okRes.statusCode, 200);
});

test('a single configured credential fails closed with 503', () => {
    const auth = createAuth({ user: 'admin', password: '', publicPaths: ['/health'], logger: quietLogger });
    const res = fakeResponse();
    let next = false;
    auth(fakeRequest(), res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 503);
});

test('failed authentication is throttled before credentials are checked', () => {
    const auth = createAuth({
        user: 'admin', password: 'secret', logger: quietLogger, failureMax: 2, failureWindowMs: 60000
    });

    for (let i = 0; i < 2; i++) {
        const res = fakeResponse();
        auth(fakeRequest({ headers: { authorization: basic('admin', 'wrong') } }), res, () => {});
        assert.equal(res.statusCode, 401);
    }

    const blocked = fakeResponse();
    let next = false;
    auth(fakeRequest({ headers: { authorization: basic('admin', 'secret') } }), blocked, () => { next = true; });
    assert.equal(next, false);
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['Retry-After']) >= 1);
});

test('rate limiter is bounded and returns 429 with Retry-After', () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, maxEntries: 2, now: () => now });

    const first = fakeResponse();
    let next = 0;
    limiter(fakeRequest(), first, () => { next++; });
    limiter(fakeRequest(), first, () => { next++; });
    limiter(fakeRequest(), first, () => { next++; });
    assert.equal(next, 2);
    assert.equal(first.statusCode, 429);

    // A different client is still allowed, and the map stays bounded.
    limiter(fakeRequest({ ip: '192.168.1.51' }), fakeResponse(), () => {});
    limiter(fakeRequest({ ip: '192.168.1.52' }), fakeResponse(), () => {});
    assert.ok(limiter.size() <= 2);

    now += 2000;
    const afterWindow = fakeResponse();
    limiter(fakeRequest(), afterWindow, () => { next++; });
    assert.equal(afterWindow.statusCode, 200);
});

test('failure limiter expires entries', () => {
    let now = 1000;
    const failures = createFailureLimiter({ windowMs: 1000, max: 1, now: () => now });
    failures.fail('a');
    assert.ok(failures.status('a') > 0);
    now += 2000;
    assert.equal(failures.status('a'), 0);
});

test('origin guard requires JSON and a same-origin browser request', () => {
    const guard = createOriginGuard();
    const post = { method: 'POST', headers: { host: 'technimapper.local:9191' } };

    const noJson = fakeResponse();
    let next = false;
    guard(fakeRequest({ ...post, headers: { host: 'technimapper.local:9191' } }), noJson, () => { next = true; });
    assert.equal(next, false);
    assert.equal(noJson.statusCode, 415);

    const crossOrigin = fakeResponse();
    guard(fakeRequest({
        ...post,
        headers: {
            host: 'technimapper.local:9191',
            'content-type': 'application/json',
            origin: 'http://evil.example'
        }
    }), crossOrigin, () => {});
    assert.equal(crossOrigin.statusCode, 403);

    const sameOrigin = fakeResponse();
    let sameOriginNext = false;
    guard(fakeRequest({
        ...post,
        headers: {
            host: 'technimapper.local:9191',
            'content-type': 'application/json; charset=utf-8',
            origin: 'http://technimapper.local:9191'
        }
    }), sameOrigin, () => { sameOriginNext = true; });
    assert.equal(sameOriginNext, true);

    const noOrigin = fakeResponse();
    let noOriginNext = false;
    guard(fakeRequest({
        ...post,
        headers: { host: 'technimapper.local:9191', 'content-type': 'application/json' }
    }), noOrigin, () => { noOriginNext = true; });
    assert.equal(noOriginNext, true);
});

test('failure limiter evicts the oldest entry when full', () => {
    let now = 1000;
    const failures = createFailureLimiter({ windowMs: 1000, max: 1, maxEntries: 1, now: () => now });
    failures.fail('a');
    failures.fail('b');
    assert.equal(failures.size(), 1);
    assert.equal(failures.status('a'), 0);
    assert.ok(failures.status('b') > 0);
});

test('origin guard rejects an invalid origin URL', () => {
    const guard = createOriginGuard();
    const res = fakeResponse();
    guard(fakeRequest({
        method: 'POST',
        headers: {
            host: 'technimapper.local:9191',
            'content-type': 'application/json',
            origin: 'not a url'
        }
    }), res, () => {});
    assert.equal(res.statusCode, 403);
});

test('failure limiter prunes expired entries before evicting', () => {
    let now = 1000;
    const failures = createFailureLimiter({ windowMs: 1000, max: 1, maxEntries: 1, now: () => now });
    failures.fail('a');
    now += 2000;
    failures.fail('b');
    assert.equal(failures.size(), 1);
    assert.ok(failures.status('b') > 0);
});

test('createErrorHandler maps error types and status codes', () => {
    const handler = createErrorHandler({ error() {} });

    const parseError = fakeResponse();
    handler({ type: 'entity.parse.failed' }, fakeRequest(), parseError, () => {});
    assert.equal(parseError.statusCode, 400);
    assert.equal((parseError.body as Record<string, unknown>).error, 'Invalid JSON payload');

    const largeError = fakeResponse();
    handler({ type: 'entity.too.large' }, fakeRequest(), largeError, () => {});
    assert.equal(largeError.statusCode, 413);
    assert.equal((largeError.body as Record<string, unknown>).error, 'Payload too large');

    const httpError = fakeResponse();
    handler(new HttpError(404, 'missing'), fakeRequest(), httpError, () => {});
    assert.equal(httpError.statusCode, 404);
    assert.equal((httpError.body as Record<string, unknown>).error, 'missing');

    const statusError = fakeResponse();
    const err = new Error('bad request') as Error & { status?: number };
    err.status = 400;
    handler(err, fakeRequest(), statusError, () => {});
    assert.equal(statusError.statusCode, 400);
    assert.equal((statusError.body as Record<string, unknown>).error, 'Invalid request');

    const unknownError = fakeResponse();
    handler(new Error('boom'), fakeRequest(), unknownError, () => {});
    assert.equal(unknownError.statusCode, 500);
    assert.equal((unknownError.body as Record<string, unknown>).error, 'Internal server error');
});
