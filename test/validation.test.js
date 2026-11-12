'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, createValidation, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping } = require('../lib/validation');

// Simple stand-in for node-cron's validate(): five whitespace-separated fields.
const fakeCron = (s) => typeof s === 'string' && s.trim().split(/\s+/).length === 5;

const strict = createValidation({ cronValidate: fakeCron });
const permissive = createValidation({ cronValidate: fakeCron, allowNonPrivateIp: true });

test('isAllowedReceiverIp accepts private IPv4 ranges', () => {
    for (const ip of ['192.168.178.28', '10.0.0.1', '172.16.0.1', '172.31.255.254']) {
        assert.equal(strict.isAllowedReceiverIp(ip), true, ip);
    }
});

test('isAllowedReceiverIp rejects loopback, link-local, multicast, public and malformed values', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '169.254.169.254', '224.0.0.1', '8.8.8.8', '172.32.0.1',
        '999.1.1.1', '192.168.1', 'localhost', '', null, undefined, 42]) {
        assert.equal(strict.isAllowedReceiverIp(ip), false, String(ip));
    }
});

test('allowNonPrivateIp permits public/CGNAT ranges but never loopback or metadata', () => {
    assert.equal(permissive.isAllowedReceiverIp('100.64.0.5'), true);
    assert.equal(permissive.isAllowedReceiverIp('8.8.8.8'), true);
    assert.equal(permissive.isAllowedReceiverIp('127.0.0.1'), false);
    assert.equal(permissive.isAllowedReceiverIp('169.254.169.254'), false);
});

test('validateSettings normalises valid input', () => {
    const out = strict.validateSettings({ ip: ' 192.168.1.10 ', port: 9100, cronExpression: '*/5 * * * *', selectedListName: ' TV-Liste ' });
    assert.deepEqual(out, { ip: '192.168.1.10', port: '9100', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste' });
});

test('validateSettings rejects bad ports', () => {
    for (const port of ['0', '65536', '70000', 'abc', '', '12.5', '-1']) {
        assert.throws(
            () => strict.validateSettings({ ip: '192.168.1.10', port, cronExpression: '* * * * *', selectedListName: 'x' }),
            (e) => e instanceof HttpError && e.status === 400 && /port/i.test(e.message),
            `port ${port}`
        );
    }
});

test('validateSettings rejects the port number used as cron expression (regression)', () => {
    assert.throws(
        () => strict.validateSettings({ ip: '192.168.1.10', port: '9100', cronExpression: '9100', selectedListName: 'x' }),
        (e) => e instanceof HttpError && /cron/i.test(e.message) && e.message.includes('9100')
    );
});

test('validateSettings rejects empty or oversized list names and bad IPs', () => {
    const base = { ip: '192.168.1.10', port: '9100', cronExpression: '* * * * *', selectedListName: 'x' };
    assert.throws(() => strict.validateSettings({ ...base, selectedListName: '  ' }), HttpError);
    assert.throws(() => strict.validateSettings({ ...base, selectedListName: 'a'.repeat(201) }), HttpError);
    assert.throws(() => strict.validateSettings({ ...base, ip: '127.0.0.1' }), HttpError);
});

test('validateMapping keeps valid IDs and drops empty values', () => {
    const { mapping, invalid } = strict.validateMapping({ 'Das Erste': 1, ZDF: '2', RTL: '', Sat1: null, 'ts-ch': 'ts-ch5' });
    assert.deepEqual(mapping, { 'Das Erste': 1, ZDF: '2', 'ts-ch': 'ts-ch5' });
    assert.deepEqual(invalid, []);
});

test('validateMapping flags unusable IDs', () => {
    const { mapping, invalid } = strict.validateMapping({
        A: 'has space', B: 'quo"te', C: 'line\nbreak', D: -1, E: 1.5, F: 'x'.repeat(33), G: {}, H: [], OK: 7
    });
    assert.deepEqual(mapping, { OK: 7 });
    assert.deepEqual(invalid.sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
});

test('validateMapping rejects __proto__ keys and non-object payloads', () => {
    const polluted = JSON.parse('{"__proto__": 1, "ok": 2}');
    const { mapping, invalid } = strict.validateMapping(polluted);
    assert.deepEqual(mapping, { ok: 2 });
    assert.deepEqual(invalid, ['__proto__']);
    assert.deepEqual(strict.validateMapping(null).invalid, ['<payload>']);
    assert.deepEqual(strict.validateMapping([1, 2]).invalid, ['<payload>']);
    assert.equal(({}).polluted, undefined);
});

test('findDuplicateIds reports IDs used more than once, comparing numbers and strings alike', () => {
    assert.deepEqual(findDuplicateIds({ A: 1, B: '1', C: 2 }), ['1']);
    assert.deepEqual(findDuplicateIds({ A: 1, B: 2 }), []);
    assert.deepEqual(findDuplicateIds({}), []);
});

test('findDuplicateGroups names the channels that share an ID', () => {
    const groups = findDuplicateGroups({ 'Das Erste HD': 1, 'Das Erste SD': '1', ZDF: 2, '3sat': 3, 'Drei': 3, 'Drei2': 3 });
    assert.deepEqual(groups, [
        { id: '1', channels: ['Das Erste HD', 'Das Erste SD'] },
        { id: '3', channels: ['3sat', 'Drei', 'Drei2'] }
    ]);
    assert.deepEqual(findDuplicateGroups({ A: 1, B: 2 }), []);
});

test('partitionMapping separates stale entries so they do not cause false duplicates', () => {
    const mapping = { '001 Das Erste HD': 1, '002 ZDF HD': 2, ATV: 1, FOX: 2 };
    const { active, orphans } = partitionMapping(mapping, ['001 Das Erste HD', '002 ZDF HD']);
    assert.deepEqual(active, { '001 Das Erste HD': 1, '002 ZDF HD': 2 });
    assert.deepEqual(orphans, ['ATV', 'FOX']);
    assert.deepEqual(findDuplicateGroups(active), []);        // no false positive
    assert.equal(findDuplicateGroups(mapping).length, 2);     // the old behaviour would have reported both
});

test('partitionMapping treats nothing as stale while the channel list is unknown', () => {
    const { active, orphans } = partitionMapping({ A: 1 }, []);
    assert.deepEqual(active, { A: 1 });
    assert.deepEqual(orphans, []);
});

test('sortMapping orders entries like the channel list and puts stale entries last, alphabetically', () => {
    const mapping = { '004 SAT.1': 4, 'ZZ old': 99, '003 RTL': 3, 'AA old': 98, '001 Das Erste HD': 1 };
    const sorted = sortMapping(mapping, ['001 Das Erste HD', '002 ZDF HD', '003 RTL', '004 SAT.1']);
    assert.deepEqual(Object.keys(sorted), ['001 Das Erste HD', '003 RTL', '004 SAT.1', 'AA old', 'ZZ old']);
    assert.deepEqual(sorted, mapping);                                    // same content, only the order differs
    assert.deepEqual(Object.keys(mapping)[0], '004 SAT.1');               // input is not mutated
});

test('sortMapping is idempotent and keeps the order while the channel list is unknown', () => {
    const channels = ['B', 'A', 'C'];
    const once = sortMapping({ C: 3, A: 1, B: 2 }, channels);
    assert.deepEqual(Object.keys(sortMapping(once, channels)), ['B', 'A', 'C']);
    assert.deepEqual(Object.keys(sortMapping({ C: 3, A: 1 }, [])), ['C', 'A']);
});

test('sortMapping copes with duplicate channel names and prototype-like names', () => {
    const sorted = sortMapping({ constructor: 1, A: 2 }, ['A', 'A', 'constructor']);
    assert.deepEqual(Object.keys(sorted), ['A', 'constructor']);
});
