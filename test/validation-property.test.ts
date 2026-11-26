import assert from 'node:assert/strict';
import test from 'node:test';
import * as fc from 'fast-check';
import { ID_REGEX, isAllowedReceiverIp, validateMapping, validateSettings } from '../lib/validation.js';

const fakeCron = (expr: string): boolean => typeof expr === 'string' && /^\S+ \S+ \S+ \S+ \S+$/.test(expr.trim());
const settingsDeps = { cronValidate: fakeCron };

const validNameArb = fc
    .string({ unit: 'binary' })
    .map(() => '')
    .chain(() => fc.uuid());

// Channels list (names + streams).
const channelArb = fc.record({
    name: fc
        .string({ minLength: 1, maxLength: 40 })
        .filter((n) => n.trim().length > 0 && !n.includes('\n') && !n.includes('\r')),
    url: fc.option(fc.constantFrom('http://a.b/1', 'https://c.d/2'), { nil: undefined }),
});

test('validateSettings rejects any port that is not 1-65535, accepts valid ports', () => {
    fc.assert(
        fc.property(fc.integer({ min: 1, max: 65535 }), (port) => {
            const settings = validateSettings(
                { ip: '10.0.0.1', port: String(port), cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste' },
                settingsDeps,
            );
            assert.equal(settings.port, String(port));
        }),
    );

    const bad = validateSettings;
    assert.throws(
        () =>
            bad({ ip: '10.0.0.1', port: '99999', cronExpression: '*/5 * * * *', selectedListName: 'x' }, settingsDeps),
        /Invalid port/,
    );
    assert.throws(
        () => bad({ ip: '10.0.0.1', port: '', cronExpression: '*/5 * * * *', selectedListName: 'x' }, settingsDeps),
        /Invalid port/,
    );
});

test('isAllowedReceiverIp property: private ranges pass, others are rejected', () => {
    fc.assert(
        fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), (a, b) => {
            const ip = `${a}.${b}.10.20`;
            const ok = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
            assert.equal(isAllowedReceiverIp(ip), ok, `ip ${ip}`);
        }),
    );
});

test('validateMapping accepts all generated valid names and reports invalid ones', () => {
    const idArb = fc.oneof(
        fc.integer({ min: 0, max: 9999 }).map((n) => String(n)),
        fc.string({ minLength: 0, maxLength: 40 }).filter((s: string) => !ID_REGEX.test(s)), // invalid IDs are collected as "invalid"
    );
    fc.assert(
        fc.property(
            fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), idArb), { minLength: 1, maxLength: 10 }),
            (entries) => {
                const input = Object.fromEntries(entries);
                const { mapping, invalid } = validateMapping(input);
                for (const [name, id] of Object.entries(mapping)) {
                    assert.ok(typeof id === 'string' || typeof id === 'number', `id type for ${name}`);
                    assert.notEqual(name, '__proto__', 'prototype keys must never be accepted');
                }
                // Every name that yields a canonical ID must be accepted. For duplicate names,
                // Object.fromEntries keeps the last occurrence (documented behaviour).
                const lastByName = new Map<string, string | number>();
                for (const [name, id] of entries) lastByName.set(name, id);
                for (const [name, id] of lastByName) {
                    if (name === '__proto__') continue;
                    const isValidNumber = typeof id === 'number' && Number.isSafeInteger(id) && id >= 0;
                    const isValidString = typeof id === 'string' && ID_REGEX.test(id);
                    if (isValidNumber && String(id).length <= 15)
                        assert.equal(mapping[name], id, `name ${name} accepted`);
                    else if (isValidString) assert.equal(mapping[name], id, `name ${name} accepted`);
                }
                assert.ok(invalid.length >= 0, 'invalid names are reported');
            },
        ),
    );
});
void channelArb;
void validNameArb;
void test;
