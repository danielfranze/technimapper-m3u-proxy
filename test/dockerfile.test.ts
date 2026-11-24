import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dockerfile = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Dockerfile'), 'utf8');

test('Dockerfile installs dependencies from the lockfile, then removes package managers from the runtime image', () => {
    const install = dockerfile.indexOf('npm ci --omit=dev');
    const cleanup = dockerfile.indexOf('rm -rf /usr/local/lib/node_modules/npm');
    assert.ok(install !== -1, 'expected "npm ci --omit=dev"');
    assert.ok(cleanup > install, 'npm must only be removed AFTER the dependencies are installed');
    for (const tool of ['corepack', 'yarn']) assert.ok(dockerfile.includes(tool), `expected ${tool} to be removed`);
});

test('Dockerfile runs as the unprivileged user and starts node directly', () => {
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /CMD \["node", "dist\/server\.js"\]/);
    assert.ok(!/CMD \[?"?npm/.test(dockerfile), 'the container must not start through npm');
});
