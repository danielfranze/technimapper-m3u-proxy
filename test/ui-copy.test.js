'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const grab = (pattern) => {
    const m = script.match(pattern);
    assert.ok(m, `not found in index.html: ${pattern}`);
    return m[0];
};

/** Loads the URL logic of the copy button with stubbed browser APIs. */
function loadCopyLogic({ stored, storageThrows = false } = {}) {
    const factory = new Function('BACKEND_URL', 'localStorage', `
        ${grab(/    const COPY_SOURCES = \{[\s\S]*?\n    \};\n/)}
        ${grab(/    const COPY_SOURCE_KEY = '[^']+';\n/)}
        ${grab(/    function loadCopySource\(\) \{[\s\S]*?\n    \}\n/)}
        ${grab(/    function copyUrlFor\(source\) \{[\s\S]*?\n    \}\n/)}
        return { COPY_SOURCES, loadCopySource, copyUrlFor, COPY_SOURCE_KEY };
    `);
    const localStorage = {
        getItem: () => { if (storageThrows) throw new Error('blocked'); return stored === undefined ? null : stored; }
    };
    return factory('http://192.168.178.11:9191', localStorage);
}

test('the copy button offers the HDHomeRun tuner address and the M3U playlist URL of the current origin', () => {
    const { copyUrlFor, COPY_SOURCES } = loadCopyLogic();
    assert.equal(copyUrlFor('hdhr'), 'http://192.168.178.11:9191/hdhr');
    assert.equal(copyUrlFor('m3u'), 'http://192.168.178.11:9191/playlist.m3u');
    assert.deepEqual(Object.keys(COPY_SOURCES), ['hdhr', 'm3u']);
});

test('the remembered source defaults to the tuner address and ignores invalid or unavailable storage', () => {
    assert.equal(loadCopyLogic().loadCopySource(), 'hdhr');
    assert.equal(loadCopyLogic({ stored: 'm3u' }).loadCopySource(), 'm3u');
    assert.equal(loadCopyLogic({ stored: 'hdhr' }).loadCopySource(), 'hdhr');
    assert.equal(loadCopyLogic({ stored: 'nonsense' }).loadCopySource(), 'hdhr');
    assert.equal(loadCopyLogic({ storageThrows: true }).loadCopySource(), 'hdhr');
});

test('the split button is an accessible menu button and replaces the old M3U-only button', () => {
    assert.ok(!html.includes('copyM3uLink'));
    assert.ok(html.includes('id="copySplit"'));
    assert.ok(html.includes('aria-haspopup="menu"'));
    assert.ok(html.includes('role="menu"'));
    assert.equal((html.match(/role="menuitemradio"/g) || []).length, 2);
    assert.equal((html.match(/data-source="(hdhr|m3u)"/g) || []).length, 2);
});

test('the header shortens "Copy HDHR URL" step by step with matching CSS rules', () => {
    assert.match(script, /const steps = \['hide-url', 'hide-source', 'hide-label'\];/);
    for (const rule of ['.header-meta.hide-url .copy-url', '.header-meta.hide-source .copy-source', '.header-meta.hide-label .sync-label']) {
        assert.ok(html.includes(rule), rule);
    }
});
