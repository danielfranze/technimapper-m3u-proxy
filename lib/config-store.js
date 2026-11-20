'use strict';

/**
 * JSON persistence adapter for mapping.json.
 *
 * The rest of the application only sees `read()` and `write()`. That keeps the
 * filesystem details (atomic rename, Docker bind-mount fallback, directory
 * permissions) out of the HTTP and sync code and makes an in-memory fake easy.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {{ dataDir: string, configFile: string, logger: { warn: Function, error: Function }, fsModule?: typeof fs }} options
 */
function createJsonConfigStore({ dataDir, configFile, logger, fsModule = fs }) {
    function ensureDataDir() {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir, fs.constants.W_OK);
        } catch (err) {
            throw new Error(`Data directory "${dataDir}" is not writable: ${err.message}`);
        }
    }

    function exists() {
        return fsModule.existsSync(configFile);
    }

    /** @returns {object|null} parsed JSON, or null when no config exists yet */
    function read() {
        if (!exists()) return null;
        return JSON.parse(fsModule.readFileSync(configFile, 'utf8'));
    }

    /**
     * Writes atomically (temp file + rename). If CONFIG_FILE is a single-file Docker
     * bind mount, rename() fails with EBUSY/EXDEV/EPERM; in that case the file is
     * written in place (not atomic, but works). Throws on real failures.
     */
    function write(data) {
        const json = JSON.stringify(data, null, 2);
        const tempFile = `${configFile}.tmp`;
        const removeTemp = () => {
            try { fsModule.unlinkSync(tempFile); } catch (err) { /* ignore */ }
        };

        try {
            fsModule.writeFileSync(tempFile, json, 'utf8');
            fsModule.renameSync(tempFile, configFile);
        } catch (err) {
            removeTemp();
            if (!['EBUSY', 'EXDEV', 'EPERM'].includes(err.code)) throw err;
            logger.warn(`Atomic rename of ${path.basename(configFile)} failed (${err.code}) - writing in place.`);
            fsModule.writeFileSync(configFile, json, 'utf8');
        }
    }

    return { ensureDataDir, exists, read, write };
}

module.exports = { createJsonConfigStore };
