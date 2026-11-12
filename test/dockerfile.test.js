'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');

test('Dockerfile installs dependencies from the lockfile, then removes package managers from the runtime image', () => {
    const install = dockerfile.indexOf('npm ci --omit=dev');
    const cleanup = dockerfile.indexOf('rm -rf /usr/local/lib/node_modules/npm');
    assert.ok(install !== -1, 'expected "npm ci --omit=dev"');
    assert.ok(cleanup > install, 'npm must only be removed AFTER the dependencies are installed');
    for (const tool of ['corepack', 'yarn']) assert.ok(dockerfile.includes(tool), `expected ${tool} to be removed`);
});

test('Dockerfile runs as the unprivileged user and starts node directly', () => {
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
    assert.ok(!/CMD \[?"?npm/.test(dockerfile), 'the container must not start through npm');
});
