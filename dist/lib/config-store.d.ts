/**
 * JSON persistence adapter for mapping.json.
 */
interface FsLikePromises {
    writeFile(file: unknown, data: unknown, encoding?: unknown): Promise<void>;
    rename(from: unknown, to: unknown): Promise<void>;
    unlink(file: unknown): Promise<void>;
}
export interface FsLike {
    promises?: FsLikePromises;
    mkdirSync(dir: string, options: {
        recursive: true;
    }): void;
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
export declare function createJsonConfigStore({ dataDir, configFile, logger, fsModule }: {
    dataDir: string;
    configFile: string;
    logger: StoreLogger;
    fsModule?: FsLike;
}): ConfigStore;
export {};
