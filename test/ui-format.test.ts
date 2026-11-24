import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8');
const css: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'), 'utf8');
const script: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8');
const source: string = script.match(/    function formatSync\([\s\S]*?\n    \}\n/)![0];
const formatSync: (value: unknown, locale?: string) => string = new Function(`${source}; return formatSync;`)() as (value: unknown, locale?: string) => string;

test('formatSync shows date and time without seconds', () => {
    const de = formatSync('2026-11-13T09:30:33.899Z', 'de-DE');
    const en = formatSync('2026-11-13T09:30:33.899Z', 'en-GB');
    assert.ok(typeof de === 'string' && de.length > 0 && de !== 'Never');
    assert.ok(typeof en === 'string' && en.length > 0 && en !== 'Never');
    assert.ok(/\d/.test(de) && /:/.test(de));
    assert.ok(/\d/.test(en) && /:/.test(en));
});

test('formatSync returns "Never" for missing or invalid values', () => {
    assert.equal(formatSync(null), 'Never');
    assert.equal(formatSync(''), 'Never');
    assert.equal(formatSync('not a date'), 'Never');
});

test('the old green flash is gone and replaced by the calm sync pulse', () => {
    assert.ok(!html.includes('success-flash'));
    assert.ok((html + css).includes('sync-pulse') && (html + css).includes('prefers-reduced-motion'));
    assert.equal((script.match(/triggerSyncPulse\(\)/g) || []).length, 2, 'one definition and one call');
});
