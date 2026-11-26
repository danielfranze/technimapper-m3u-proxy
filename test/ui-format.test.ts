import path from 'node:path';
import { fileURLToPath } from 'node:url';

('use strict');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html: string = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'),
    'utf8',
);
const css: string = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'),
    'utf8',
);

import { model } from '../frontend/lib/model.ts';

const formatSync: (value: unknown, locale?: string) => string = (model as { formatSync: typeof formatSync }).formatSync;
void formatSync;
const formatSyncFn: (value: unknown, locale?: string) => string = model.formatSync as unknown as (
    value: unknown,
    locale?: string,
) => string;

test('formatSync shows date and time without seconds', () => {
    const de = formatSyncFn('2026-11-13T09:30:33.899Z', 'de-DE');
    const en = formatSyncFn('2026-11-13T09:30:33.899Z', 'en-GB');
    assert.ok(typeof de === 'string' && de.length > 0 && de !== 'Never');
    assert.ok(typeof en === 'string' && en.length > 0 && en !== 'Never');
    assert.ok(/\d/.test(de) && /:/.test(de));
    assert.ok(/\d/.test(en) && /:/.test(en));
});

test('formatSync returns "Never" for missing or invalid values', () => {
    assert.equal(formatSyncFn(null), 'Never');
    assert.equal(formatSyncFn(''), 'Never');
    assert.equal(formatSyncFn('not a date'), 'Never');
});

test('the old green flash is gone and replaced by the calm sync pulse', () => {
    assert.ok(!html.includes('success-flash'));
    assert.ok((html + css).includes('sync-pulse') && (html + css).includes('prefers-reduced-motion'));
    const view = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'lib', 'view.ts'),
        'utf8',
    );
    const presenter = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'lib', 'presenter.ts'),
        'utf8',
    );
    assert.ok(view.includes('triggerSyncPulse()'), 'one definition in view.js');
    assert.ok(presenter.includes('triggerSyncPulse()'), 'one call in presenter.js');
});
