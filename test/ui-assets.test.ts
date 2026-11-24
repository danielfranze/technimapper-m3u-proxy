import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(publicDir, 'app', 'styles.css'), 'utf8');
const server = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.ts'), 'utf8');
const security = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'http-security.ts'), 'utf8');

test('index.html does not reference external hosts', () => {
    const urls = [...html.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"|url\(\s*['"]?(https?:\/\/[^)'"]+)/g)]
        .map(m => m[1] || m[2]);
    assert.deepEqual(urls, []);
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html));
});

test('the Content-Security-Policy does not allow external hosts', () => {
    assert.ok(!/googleapis|gstatic/.test(server + security));
    assert.match(security, /font-src 'self'/);
});

test('the Content-Security-Policy does not allow inline scripts', () => {
    const scriptSrc = (security.match(/script-src[^;]*/) || [''])[0];
    assert.ok(!/unsafe-inline/.test(scriptSrc), 'script-src must not use unsafe-inline');
});

test('index.html has no inline event handlers or style attributes', () => {
    assert.ok(!/\son(click|change|input|submit|load)\s*=/.test(html), 'inline event handlers are not allowed');
    assert.ok(!/\sstyle\s*=/.test(html), 'inline style attributes are not allowed');
});

test('every font referenced in styles.css exists and is a WOFF2 file', () => {
    const files = [...css.matchAll(/url\('(\.\.\/fonts\/[^']+)'\)/g)].map(m => m[1].replace(/^\.\.\//, ''));
    assert.ok(files.length >= 4, 'expected at least 4 @font-face sources');
    for (const file of files) {
        const full = path.join(publicDir, file);
        assert.ok(fs.existsSync(full), `${file} is missing`);
        assert.equal(fs.readFileSync(full).subarray(0, 4).toString('latin1'), 'wOF2', `${file} is not WOFF2`);
    }
});

test('license texts for the bundled fonts are present', () => {
    for (const file of ['LICENSE-Inter.txt', 'LICENSE-MaterialIcons.txt', 'NOTICE.md']) {
        const full = path.join(publicDir, 'fonts', file);
        assert.ok(fs.existsSync(full), `${file} is missing`);
    }
    const inter = fs.readFileSync(path.join(publicDir, 'fonts', 'LICENSE-Inter.txt'), 'utf8');
    assert.match(inter, /SIL OPEN FONT LICENSE Version 1\.1/);
});
