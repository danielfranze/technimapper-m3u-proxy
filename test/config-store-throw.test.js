'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonConfigStore } = require('../lib/config-store');

const logger = { warn() {}, error() {} };

test('config store rethrows unexpected rename errors', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const realFs = fs;
    const fsModule = Object.create(realFs);
    fsModule.renameSync = () => {
        const err = new Error('no such file');
        err.code = 'ENOENT';
        throw err;
    };

    const store = createJsonConfigStore({ dataDir, configFile, logger, fsModule });
    try {
        store.ensureDataDir();
        assert.throws(() => store.write({ a: 1 }), /no such file/);
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
