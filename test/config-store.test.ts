import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createJsonConfigStore } from '../lib/config-store.js';

const logger = { warn() {}, error() {} };

test('config store creates the data directory and writes/reads JSON atomically', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const store = createJsonConfigStore({ dataDir, configFile, logger });

    try {
        store.ensureDataDir();
        assert.equal(store.exists(), false);
        assert.equal(store.read(), null);

        await store.write({ ip: '192.168.1.10', mapping: { A: 1 } });
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

test('config store serializes concurrent writes instead of racing on the temp file', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-'));
    const configFile = path.join(dataDir, 'mapping.json');
    const store = createJsonConfigStore({ dataDir, configFile, logger });

    try {
        store.ensureDataDir();
        await Promise.all([store.write({ value: 'first' }), store.write({ value: 'second' })]);
        assert.deepEqual(store.read(), { value: 'second' });
        assert.equal(fs.existsSync(`${configFile}.tmp`), false);
        // No leftover unique temp files either.
        const leftovers = fs.readdirSync(dataDir).filter((name) => name.includes('.tmp'));
        assert.deepEqual(leftovers, []);
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
