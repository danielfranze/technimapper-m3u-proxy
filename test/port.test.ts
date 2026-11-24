import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string): string => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', file), 'utf8');

test('the default port 9191 is used consistently by the server, the Dockerfile and the compose file', () => {
    assert.match(read('lib/runtime-config.ts'), /intFromEnv\(env\.PORT, DEFAULT_PORT/);
    assert.match(read('server.ts'), /app\.listen\(runtime\.port/);

    const dockerfile = read('Dockerfile');
    assert.match(dockerfile, /^EXPOSE 9191$/m);
    assert.match(dockerfile, /127\.0\.0\.1:\$\{PORT:-9191\}\/health/, 'the health check must follow PORT');

    const compose = read('docker-compose.yml');
    assert.match(compose, /"9191:9191"/);
    assert.ok(!compose.includes('3000'), 'no leftover port 3000 in the compose file');
});

test('the CI smoke test and the README use the same port mapping', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /-p 9191:9191/);
    assert.ok(!ci.includes('3000'), 'no leftover port 3000 in the CI workflow');

    const readme = read('README.md');
    assert.ok(!readme.includes('9191:3000'), 'README must not mention the old mapping');
    assert.ok(readme.includes('9191:9191'));
});
