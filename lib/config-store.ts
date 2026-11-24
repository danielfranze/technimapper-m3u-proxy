/**
 * JSON persistence adapter for mapping.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const fsp = fs.promises;

export interface ConfigStore {
    ensureDataDir: () => void;
    exists: () => boolean;
    read: () => any;
    write: (data: any) => Promise<void>;
}

export function createJsonConfigStore({ dataDir, configFile, logger, fsModule = fs }: {
    dataDir: string;
    configFile: string;
    logger: { warn: (...args: any[]) => void; error: (...args: any[]) => void };
    fsModule?: any;
}): ConfigStore {
    const promises = fsModule.promises || fsp;

    function ensureDataDir(): void {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir, fsModule.constants.W_OK);
        } catch (err) {
            throw new Error(`Data directory "${dataDir}" is not writable: ${(err as Error).message}`);
        }
    }

    function exists(): boolean {
        return fsModule.existsSync(configFile);
    }

    function read(): any {
        if (!exists()) return null;
        return JSON.parse(fsModule.readFileSync(configFile, 'utf8'));
    }

    let writeChain: Promise<void> = Promise.resolve();
    let writeCounter = 0;

    async function write(data: any): Promise<void> {
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
                const e = err as { code?: string; message?: string };
                if (!['EBUSY', 'EXDEV', 'EPERM'].includes(e.code || '')) throw err;
                logger.warn(`Atomic rename of ${path.basename(configFile)} failed (${e.code}) - writing in place.`);
                await promises.writeFile(configFile, json, 'utf8');
            }
        });

        writeChain = run.catch(() => {});
        return run;
    }

    return { ensureDataDir, exists, read, write };
}
