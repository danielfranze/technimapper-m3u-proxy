'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildM3u, sanitizeM3uText, STREAM_URL_REGEX } = require('../lib/m3u');

const channels = [
    { name: 'Das Erste HD', url: 'http://192.168.1.10:8080/stream/1' },
    { name: 'ZDF HD', url: 'http://192.168.1.10:8080/stream/2' },
    { name: 'Unmapped', url: 'http://192.168.1.10:8080/stream/3' }
];

test('buildM3u emits header and entries only for mapped channels', () => {
    const { m3u, count } = buildM3u(channels, { 'Das Erste HD': 1, 'ZDF HD': 'ts-ch2' });
    assert.equal(count, 2);
    const lines = m3u.trimEnd().split('\n');
    assert.equal(lines[0], '#EXTM3U');
    assert.equal(lines.length, 5);
    assert.equal(
        lines[1],
        '#EXTINF:-1 tvg-id="1" tvg-name="Das Erste HD" tvg-chno="1" cuid="1" group-title="TechniSat",Das Erste HD'
    );
    assert.equal(lines[2], 'http://192.168.1.10:8080/stream/1');
    assert.match(lines[3], /tvg-id="ts-ch2".*tvg-chno="2"/);
    assert.ok(!m3u.includes('Unmapped'));
});

test('buildM3u returns count 0 when nothing is mapped (caller must answer 503)', () => {
    assert.equal(buildM3u(channels, {}).count, 0);
    assert.equal(buildM3u([], { A: 1 }).count, 0);
});

test('buildM3u cannot be tricked by line breaks or quotes in channel names', () => {
    const evil = [{ name: 'Evil"\r\n#EXTINF:-1,Injected\nhttp://evil.example/x', url: 'http://192.168.1.10/s' }];
    const { m3u, count } = buildM3u(evil, { [evil[0].name]: 9 });
    assert.equal(count, 1);
    const lines = m3u.trimEnd().split('\n');
    assert.equal(lines.length, 3); // header, one EXTINF, one URL - nothing injected
    assert.ok(!lines[1].includes('"\r'));
    assert.equal(lines[2], 'http://192.168.1.10/s');
});

test('buildM3u skips channels with unsafe or non-http stream URLs', () => {
    const bad = [
        { name: 'A', url: 'javascript:alert(1)' },
        { name: 'B', url: 'http://host/with space' },
        { name: 'C', url: 'http://host/ok\nhttp://evil/' },
        { name: 'D', url: 'http://192.168.1.10/ok' }
    ];
    const { count, m3u } = buildM3u(bad, { A: 1, B: 2, C: 3, D: 4 });
    assert.equal(count, 1);
    assert.ok(m3u.includes('http://192.168.1.10/ok'));
});

test('buildM3u ignores inherited object properties (prototype keys)', () => {
    const odd = [{ name: 'constructor', url: 'http://192.168.1.10/a' }, { name: '__proto__', url: 'http://192.168.1.10/b' }];
    assert.equal(buildM3u(odd, {}).count, 0);
});

test('sanitizeM3uText collapses whitespace and strips control characters', () => {
    assert.equal(sanitizeM3uText('  a\t\tb\u0000c "d"  '), 'a b c d');
    assert.equal(sanitizeM3uText(42), '42');
});

test('STREAM_URL_REGEX accepts http and https only', () => {
    assert.ok(STREAM_URL_REGEX.test('http://192.168.1.10:8080/x?y=1&z=2'));
    assert.ok(STREAM_URL_REGEX.test('https://example.org/x'));
    assert.ok(!STREAM_URL_REGEX.test('ftp://example.org/x'));
    assert.ok(!STREAM_URL_REGEX.test('http://a b'));
});
