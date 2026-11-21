'use strict';

/**
 * JSON persistence adapter for mapping.json.
 *
 * The rest of the application only sees `read()` and `write()`. `write()` is
 * asynchronous so the event loop is not blocked by file I/O on the request path.
 *
 * Writes are serialized through a promise chain: concurrent calls are queued
 * instead of racing on the same temporary file. Each write uses a unique
 * temporary file name so two in-flight writes can never share or truncate the
 * same intermediate file.
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

/**
 * @param {{ dataDir: string, configFile: string, logger: { warn: Function, error: Function }, fsModule?: typeof fs }} options
 */
function createJsonConfigStore({ dataDir, configFile, logger, fsModule = fs }) {
    const promises = fsModule.promises || fsp;

    function ensureDataDir() {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir, fsModule.constants.W_OK);
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
     * Serializes all writes so concurrent callers cannot interleave on the same
     * temporary file or overtake each other's rename. The chain is never broken
     * by a rejected write: a failure is reported to its caller but the next
     * write still runs.
     */
    let writeChain = Promise.resolve();
    let writeCounter = 0;

    /**
     * Writes asynchronously. Prefers an atomic write (temp file + rename).
     * If CONFIG_FILE is a single-file Docker bind mount, rename() fails with
     * EBUSY/EXDEV/EPERM; in that case the file is written in place.
     */
    async function write(data) {
        const run = writeChain.then(async () => {
            const json = JSON.stringify(data, null, 2);
            const tempFile = `${configFile}.${process.pid}.${++writeCounter}.tmp`;
            const removeTemp = async () => {
                try { await promises.unlink(tempFile); } catch (err) { /* ignore */ }
            };

            try {
                await promises.writeFile(tempFile, json, 'utf8');
                await promises.rename(tempFile, configFile);
            } catch (err) {
                await removeTemp();
                if (!['EBUSY', 'EXDEV', 'EPERM'].includes(err.code)) throw err;
                logger.warn(`Atomic rename of ${path.basename(configFile)} failed (${err.code}) - writing in place.`);
                await promises.writeFile(configFile, json, 'utf8');
            }
        });

        // Keep the chain alive even when a write rejects, so one failed write
        // does not stall every subsequent write.
        writeChain = run.catch(() => {});
        return run;
    }

    return { ensureDataDir, exists, read, write };
}

module.exports = { createJsonConfigStore };