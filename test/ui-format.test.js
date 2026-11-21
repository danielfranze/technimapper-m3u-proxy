'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app', 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app', 'main.js'), 'utf8');
const source = script.match(/    function formatSync\([\s\S]*?\n    \}\n/)[0];
const formatSync = new Function(`${source}; return formatSync;`)();

test('formatSync shows date and time without seconds', () => {
    assert.match(formatSync('2026-11-13T09:30:33.899Z', 'de-DE'), /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    assert.match(formatSync('2026-11-13T09:30:33.899Z', 'en-GB'), /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
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
