/**
 * JSON persistence adapter for mapping.json.
 */
export interface ConfigStore {
    ensureDataDir: () => void;
    exists: () => boolean;
    read: () => any;
    write: (data: any) => Promise<void>;
}
export declare function createJsonConfigStore({ dataDir, configFile, logger, fsModule }: {
    dataDir: string;
    configFile: string;
    logger: {
        warn: (...args: any[]) => void;
        error: (...args: any[]) => void;
    };
    fsModule?: any;
}): ConfigStore;
