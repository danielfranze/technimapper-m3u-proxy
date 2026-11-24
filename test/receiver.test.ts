'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {  parseContainerList, parseChannelItems, escapeXml, xmlText  } from '../dist/lib/receiver.js';

test('xmlText handles strings, arrays and xml2js text objects', () => {
    assert.equal(xmlText('hello'), 'hello');
    assert.equal(xmlText(['hello']), 'hello');
    assert.equal(xmlText({ _: 'hello', $: {} }), 'hello');
    assert.equal(xmlText({ $: {} }), undefined);
});

test('escapeXml escapes all characters that can break SOAP XML', () => {
    assert.equal(escapeXml(`<&>"'`), '&lt;&amp;&gt;&quot;&apos;');
});

test('parseContainerList extracts id and title and drops incomplete entries', () => {
    const didl = {
        container: [
            { $: { id: '3' }, 'dc:title': 'TV-Liste' },
            { $: { id: '4' }, 'dc:title': { _: 'Radio' } },
            { $: {} },
            { $: { id: '5' } }
        ]
    };
    assert.deepEqual(parseContainerList(didl), [
        { id: '3', title: 'TV-Liste', childCount: 0 },
        { id: '4', title: 'Radio', childCount: 0 }
    ]);
});

test('parseChannelItems trims values and rejects non-HTTP or malformed URLs', () => {
    const didl = {
        item: [
            { 'dc:title': ' 001 Das Erste HD ', res: ' http://192.168.1.20:9100/stream/1 ' },
            { 'dc:title': 'Bad', res: 'file:///etc/passwd' },
            { 'dc:title': 'Also bad', res: 'http://example.org/a b' },
            { 'dc:title': '', res: 'http://example.org/a' },
            { 'dc:title': 'No URL' }
        ]
    };
    assert.deepEqual(parseChannelItems(didl), [
        { name: '001 Das Erste HD', url: 'http://192.168.1.20:9100/stream/1' }
    ]);
});

test('parseChannelItems accepts a single item and an empty payload', () => {
    assert.deepEqual(parseChannelItems({ item: { 'dc:title': 'A', res: 'https://example.org/a' } }),
        [{ name: 'A', url: 'https://example.org/a' }]);
    assert.deepEqual(parseChannelItems({}), []);
});
