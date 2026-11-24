import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8');
const css: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'), 'utf8');
const script: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8');

const grab = (pattern: RegExp): string => {
    const m = script.match(pattern);
    assert.ok(m, `not found in index.html: ${pattern}`);
    return m[0];
};

interface CopyLogic {
    COPY_SOURCES: Record<string, string>;
    loadCopySource(): string;
    copyUrlFor(source: string): string;
    COPY_SOURCE_KEY: string;
}

/** Loads the URL logic of the copy button with stubbed browser APIs. */
function loadCopyLogic({ stored, storageThrows = false }: { stored?: string; storageThrows?: boolean } = {}): CopyLogic {
    const factory = new Function('BACKEND_URL', 'localStorage', `
        ${grab(/    const COPY_SOURCES = \{[\s\S]*?\n    \};\n/)}
        ${grab(/    const COPY_SOURCE_KEY = '[^']+';\n/)}
        ${grab(/    function loadCopySource\(\) \{[\s\S]*?\n    \}\n/)}
        ${grab(/    function copyUrlFor\(source\) \{[\s\S]*?\n    \}\n/)}
        return { COPY_SOURCES, loadCopySource, copyUrlFor, COPY_SOURCE_KEY };
    `) as (backendUrl: string, storage: { getItem(key: string): string | null }) => CopyLogic;
    const localStorage = {
        getItem: (): string | null => { if (storageThrows) throw new Error('blocked'); return stored === undefined ? null : stored; }
    };
    return factory('http://192.168.178.11:9191', localStorage);
}

test('the copy button offers the HDHomeRun tuner address and the M3U8 playlist URL of the current origin', () => {
    const { copyUrlFor, COPY_SOURCES } = loadCopyLogic();
    assert.equal(copyUrlFor('hdhr'), 'http://192.168.178.11:9191/hdhr');
    assert.equal(copyUrlFor('m3u8'), 'http://192.168.178.11:9191/playlist.m3u8');
    assert.deepEqual(Object.keys(COPY_SOURCES), ['hdhr', 'm3u8']);
});

test('the remembered source defaults to the tuner address and ignores invalid or unavailable storage', () => {
    assert.equal(loadCopyLogic().loadCopySource(), 'hdhr');
    assert.equal(loadCopyLogic({ stored: 'm3u8' }).loadCopySource(), 'm3u8');
    assert.equal(loadCopyLogic({ stored: 'm3u' }).loadCopySource(), 'm3u8', 'value saved by earlier versions');
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
    assert.equal((html.match(/data-source="(hdhr|m3u8)"/g) || []).length, 2);
});

test('the header drops " URL", then the word "Copy" (never the source word), then the label "Last sync:"', () => {
    assert.match(script, /const steps = \['hide-url', 'hide-word', 'hide-label'\];/);
    for (const rule of ['.header-meta.hide-url .copy-url', '.header-meta.hide-word .copy-word', '.header-meta.hide-label .sync-label']) {
        assert.ok(css.includes(rule), rule);
    }
});
