import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { model, loadCopySource } from '../public/app/lib/model.js';
import { copyUrlFor, COPY_SOURCES } from '../public/app/lib/view.js';

const html: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8');

// Stub localStorage before importing modules (model.js reads it at load time).
(globalThis as any).localStorage = {
    _v: new Map<string, string>(),
    getItem(key: string) { return (this as any)._v.get(key) ?? null; },
    setItem(key: string, v: string) { (this as any)._v.set(key, v); }
};

test('the copy button offers the HDHomeRun tuner address and the M3U8 playlist URL of the current origin', () => {
    const hdhr = copyUrlFor('hdhr');
    const m3u8 = copyUrlFor('m3u8');
    assert.ok(hdhr === '' || hdhr.endsWith('/hdhr'), `hdhr=${hdhr}`);
    assert.ok(m3u8 === '' || m3u8.endsWith('/playlist.m3u8'), `m3u8=${m3u8}`);
    assert.deepEqual(Object.keys(COPY_SOURCES), ['hdhr', 'm3u8']);
});

test('the remembered source defaults to the tuner address and ignores invalid or unavailable storage', () => {
    assert.equal(model.copySource, 'hdhr', 'default: hdhr');
    assert.equal(loadCopySource(), 'hdhr');
    (globalThis as any).localStorage = {
        getItem() { return 'nonsense'; },
        setItem() {}
    };
    assert.equal(loadCopySource(), 'hdhr');
    assert.equal((globalThis as any).localStorage.getItem(), 'nonsense'); // storage untouched
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
    const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'), 'utf8');
    assert.ok(css.includes('.header-meta.hide-url .copy-url'), 'hide-url rule');
    assert.ok(css.includes('.header-meta.hide-word .copy-word'), 'hide-word rule');
    assert.ok(css.includes('.header-meta.hide-label .sync-label'), 'hide-label rule');
    const view = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'view.js'), 'utf8');
    const presenter = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'presenter.js'), 'utf8');
    assert.ok(view.includes('function fitHeaderMeta()'), 'fitHeaderMeta defined in view.js');
    assert.ok(view.includes('fitHeaderMeta();'), 'fitHeaderMeta wired via fitLayout');
    assert.ok(presenter.includes('fitLayout'), 'presenter calls fitLayout');
});
