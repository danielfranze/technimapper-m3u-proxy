'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonConfigStore } = require('../lib/config-store');

const logger = { warn() {}, error() {} };

test('config store creates the data directory and writes/reads JSON atomically', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const store = createJsonConfigStore({ dataDir, configFile, logger });

    try {
        store.ensureDataDir();
        assert.equal(store.exists(), false);
        assert.equal(store.read(), null);

        store.write({ ip: '192.168.1.10', mapping: { A: 1 } });
        assert.equal(store.exists(), true);
        assert.deepEqual(store.read(), { ip: '192.168.1.10', mapping: { A: 1 } });
        assert.equal(fs.existsSync(`${configFile}.tmp`), false, 'the temporary file must be renamed');
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('config store reports an unwritable data directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const file = path.join(base, 'not-a-directory');
    fs.writeFileSync(file, 'x');
    const dataDir = path.join(file, 'data');
    const store = createJsonConfigStore({ dataDir, configFile: path.join(dataDir, 'mapping.json'), logger });

    try {
        assert.throws(() => store.ensureDataDir(), /not writable/);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});
