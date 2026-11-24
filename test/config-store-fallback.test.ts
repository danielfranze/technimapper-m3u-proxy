'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonConfigStore } = require('../dist/lib/config-store.js');

const logger = { warn() {}, error() {} };

test('config store falls back to an in-place write when rename fails with EBUSY', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const realFs = fs;
    const fsModule = Object.assign({}, realFs, { promises: { ...realFs.promises } });
    fsModule.promises = {
        ...realFs.promises,
        rename: async () => {
            const err = new Error('device or resource busy');
            err.code = 'EBUSY';
            throw err;
        }
    };

    const store = createJsonConfigStore({ dataDir, configFile, logger, fsModule });
    try {
        store.ensureDataDir();
        await store.write({ ip: '192.168.1.10', mapping: { A: 1 } });
        assert.deepEqual(store.read(), { ip: '192.168.1.10', mapping: { A: 1 } });
        assert.equal(fs.existsSync(`${configFile}.tmp`), false);
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
