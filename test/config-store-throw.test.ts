'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {  createJsonConfigStore  } from '../dist/lib/config-store.js';

const logger = { warn() {}, error() {} };

test('config store rethrows unexpected rename errors', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const realFs = fs;
    const fsModule = Object.assign({}, realFs, { promises: { ...realFs.promises } }) as any;
    fsModule.promises = {
        ...realFs.promises,
        rename: async () => {
            const err = new Error('no such file') as Error & { code?: string };
            err.code = 'ENOENT';
            throw err;
        }
    };

    const store = createJsonConfigStore({ dataDir, configFile, logger, fsModule });
    try {
        store.ensureDataDir();
        await assert.rejects(store.write({ a: 1 }), /no such file/);
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
