'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('index.html does not reference external hosts', () => {
    const urls = [...html.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"|url\(\s*['"]?(https?:\/\/[^)'"]+)/g)]
        .map(m => m[1] || m[2]);
    assert.deepEqual(urls, []);
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html));
});

test('the Content-Security-Policy does not allow external hosts', () => {
    assert.ok(!/googleapis|gstatic/.test(server));
    assert.match(server, /font-src 'self'/);
});

test('every font referenced in index.html exists and is a WOFF2 file', () => {
    const files = [...html.matchAll(/url\('(fonts\/[^']+\.woff2)'\)/g)].map(m => m[1]);
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
