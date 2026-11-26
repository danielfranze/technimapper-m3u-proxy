import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { intFromEnv, loadRuntimeConfig, parseTrustProxy } from '../dist/lib/runtime-config.js';

test('runtime config uses safe defaults and warns about missing authentication', () => {
    const config = loadRuntimeConfig({});
    assert.equal(config.port, 9191);
    assert.equal(config.requestTimeoutMs, 5000);
    assert.equal(config.maxResponseBytes, 2 * 1024 * 1024);
    assert.equal(config.trustProxy, false);
    assert.equal(config.adminUser, '');
    assert.equal(config.adminPassword, '');
    assert.equal(config.hsts, false);
    assert.equal(config.logLevel, 'info');
    assert.equal(config.logFormat, 'text');
    assert.ok(config.warnings.some((w) => /unauthenticated/.test(w)));
    assert.equal(config.configFile, path.join(config.dataDir, 'mapping.json'));
});

test('invalid numeric environment values fall back instead of crashing', () => {
    const warnings: string[] = [];
    assert.equal(intFromEnv('abc', 9191, { name: 'PORT', warnings }), 9191);
    assert.equal(intFromEnv('0', 9191, { min: 1, max: 65535, name: 'PORT', warnings }), 9191);
    assert.equal(intFromEnv('70000', 9191, { min: 1, max: 65535, name: 'PORT', warnings }), 9191);
    assert.equal(intFromEnv('9200', 9191, { min: 1, max: 65535, name: 'PORT', warnings }), 9200);
    assert.equal(warnings.length, 3);
});

test('TRUST_PROXY accepts boolean, hop counts and named ranges', () => {
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('0'), false);
    assert.equal(parseTrustProxy('true'), true);
    assert.equal(parseTrustProxy('2'), 2);
    assert.equal(parseTrustProxy('loopback'), 'loopback');
    assert.equal(parseTrustProxy('loopback, linklocal'), 'loopback, linklocal');
});

test('an invalid TRUST_PROXY is downgraded with a warning', () => {
    const warnings: string[] = [];
    assert.equal(parseTrustProxy('not-a-proxy', warnings), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /TRUST_PROXY/);
});

test('the shutdown budget is always larger than the maximum sync duration', () => {
    const config = loadRuntimeConfig({ REQUEST_TIMEOUT_MS: '5000', SHUTDOWN_TIMEOUT_MS: '1000' });
    assert.ok(config.shutdownTimeoutMs > config.requestTimeoutMs * 3);
});

test('admin credentials and HSTS are read from the environment', () => {
    const config = loadRuntimeConfig({ ADMIN_USER: 'admin', ADMIN_PASSWORD: 'secret', HSTS: 'true' });
    assert.equal(config.adminUser, 'admin');
    assert.equal(config.adminPassword, 'secret');
    assert.equal(config.hsts, true);
    assert.ok(!config.warnings.some((w) => /Only one of|unauthenticated/.test(w)));
});

test('only one admin credential produces a fail-closed warning', () => {
    const config = loadRuntimeConfig({ ADMIN_USER: 'admin' });
    assert.ok(config.warnings.some((w) => /Only one of ADMIN_USER/.test(w)));
});

test('runtime config handles empty numeric values and comma-separated trust proxies', () => {
    const warnings: string[] = [];
    assert.equal(intFromEnv('', 9191, { name: 'PORT', warnings }), 9191);
    assert.equal(intFromEnv('   ', 9191, { name: 'PORT', warnings }), 9191);
    assert.equal(parseTrustProxy('127.0.0.1, 10.0.0.1', warnings), '127.0.0.1, 10.0.0.1');
    assert.equal(warnings.length, 0);
});
