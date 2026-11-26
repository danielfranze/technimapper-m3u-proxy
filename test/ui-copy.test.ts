import path from 'node:path';
import { fileURLToPath } from 'node:url';

('use strict');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadCopySource, model } from '../frontend/lib/model.ts';
import { COPY_SOURCES, copyUrlFor } from '../frontend/lib/view.ts';

const html: string = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'),
    'utf8',
);

// Stub localStorage before importing modules (model.js reads it at load time).
interface TestLocalStorage {
    _v: Map<string, string>;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
const testStorage: TestLocalStorage = {
    _v: new Map<string, string>(),
    getItem(key: string) {
        return this._v.get(key) ?? null;
    },
    setItem(key: string, value: string) {
        this._v.set(key, value);
    },
};
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, configurable: true });

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
    Object.defineProperty(globalThis, 'localStorage', {
        value: { getItem: () => 'nonsense', setItem() {} },
        configurable: true,
    });
    assert.equal(loadCopySource(), 'hdhr');
    assert.equal((globalThis.localStorage as unknown as { getItem(): string | null }).getItem(), 'nonsense'); // storage untouched
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
    const css = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'),
        'utf8',
    );
    assert.ok(css.includes('.header-meta.hide-url .copy-url'), 'hide-url rule');
    assert.ok(css.includes('.header-meta.hide-word .copy-word'), 'hide-word rule');
    assert.ok(css.includes('.header-meta.hide-label .sync-label'), 'hide-label rule');
    const view = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'lib', 'view.ts'),
        'utf8',
    );
    const presenter = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'lib', 'presenter.ts'),
        'utf8',
    );
    assert.ok(view.includes('function fitHeaderMeta()'), 'fitHeaderMeta defined in view.js');
    assert.ok(view.includes('fitHeaderMeta();'), 'fitHeaderMeta wired via fitLayout');
    assert.ok(presenter.includes('fitLayout'), 'presenter calls fitLayout');
});
