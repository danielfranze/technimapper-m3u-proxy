/**
 * JSON persistence adapter for mapping.json.
 */
import fs from 'node:fs';
import path from 'node:path';
const fsp = fs.promises;
export function createJsonConfigStore({ dataDir, configFile, logger, fsModule = fs }) {
    const promises = fsModule.promises || fsp;
    function ensureDataDir() {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir);
        }
        catch (err) {
            throw new Error(`Data directory "${dataDir}" is not writable: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    function exists() {
        return fsModule.existsSync(configFile);
    }
    function read() {
        if (!exists())
            return null;
        return JSON.parse(fsModule.readFileSync(configFile, 'utf8'));
    }
    let writeChain = Promise.resolve();
    let writeCounter = 0;
    async function write(data) {
        const run = writeChain.then(async () => {
            const json = JSON.stringify(data, null, 2);
            const tempFile = `${configFile}.${process.pid}.${++writeCounter}.tmp`;
            const removeTemp = async () => {
                try {
                    await promises.unlink(tempFile);
                }
                catch { /* ignore */ }
            };
            try {
                await promises.writeFile(tempFile, json, 'utf8');
                await promises.rename(tempFile, configFile);
            }
            catch (err) {
                await removeTemp();
                const e = err;
                if (!['EBUSY', 'EXDEV', 'EPERM'].includes(e.code || ''))
                    throw err;
                logger.warn(`Atomic rename of ${path.basename(configFile)} failed (${e.code}) - writing in place.`);
                await promises.writeFile(configFile, json, 'utf8');
            }
        });
        writeChain = run.catch(() => { });
        return run;
    }
    return { ensureDataDir, exists, read, write };
}
//# sourceMappingURL=config-store.js.map