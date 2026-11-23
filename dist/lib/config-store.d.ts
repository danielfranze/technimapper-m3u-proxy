/**
 * @param {{ dataDir: string, configFile: string, logger: { warn: Function, error: Function }, fsModule?: typeof fs }} options
 */
declare function createJsonConfigStore({ dataDir, configFile, logger, fsModule }: {
    dataDir: string;
    configFile: string;
    logger: any;
    fsModule?: any;
}): {
    ensureDataDir: () => void;
    exists: () => any;
    read: () => any;
    write: (data: any) => Promise<void>;
};
export { createJsonConfigStore };
