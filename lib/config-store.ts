/**
 * JSON persistence adapter for mapping.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const fsp = fs.promises;

interface FsLikePromises {
    writeFile(file: unknown, data: unknown, encoding?: unknown): Promise<void>;
    rename(from: unknown, to: unknown): Promise<void>;
    unlink(file: unknown): Promise<void>;
}

export interface FsLike {
    promises?: FsLikePromises;
    mkdirSync(dir: string, options: { recursive: true }): void;
    accessSync(dir: string, mode?: number): void;
    existsSync(file: string): boolean;
    readFileSync(file: string, encoding: string): string;
}

type StoreData = Record<string, unknown>;

interface StoreLogger {
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export interface ConfigStore {
    ensureDataDir: () => void;
    exists: () => boolean;
    read: () => StoreData | null;
    write: (data: unknown) => Promise<void>;
}

export function createJsonConfigStore({
    dataDir,
    configFile,
    logger,
    fsModule = fs as FsLike,
}: {
    dataDir: string;
    configFile: string;
    logger: StoreLogger;
    fsModule?: FsLike;
}): ConfigStore {
    const promises = fsModule.promises || fsp;

    function ensureDataDir(): void {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir);
        } catch (err) {
            throw new Error(
                `Data directory "${dataDir}" is not writable: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    function exists(): boolean {
        return fsModule.existsSync(configFile);
    }

    function read(): StoreData | null {
        if (!exists()) return null;
        return JSON.parse(fsModule.readFileSync(configFile, 'utf8')) as StoreData;
    }

    let writeChain: Promise<void> = Promise.resolve();
    let writeCounter = 0;

    async function write(data: unknown): Promise<void> {
        const run = writeChain.then(async () => {
            const json = JSON.stringify(data, null, 2);
            const tempFile = `${configFile}.${process.pid}.${++writeCounter}.tmp`;
            const removeTemp = async () => {
                try {
                    await promises.unlink(tempFile);
                } catch {
                    /* ignore */
                }
            };

            try {
                await promises.writeFile(tempFile, json, 'utf8');
                await promises.rename(tempFile, configFile);
            } catch (err) {
                await removeTemp();
                const e = err as { code?: string };
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
