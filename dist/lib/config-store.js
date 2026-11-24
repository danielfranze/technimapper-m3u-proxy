"use strict";
/**
 * JSON persistence adapter for mapping.json.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJsonConfigStore = createJsonConfigStore;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const fsp = node_fs_1.default.promises;
function createJsonConfigStore({ dataDir, configFile, logger, fsModule = node_fs_1.default }) {
    const promises = fsModule.promises || fsp;
    function ensureDataDir() {
        try {
            fsModule.mkdirSync(dataDir, { recursive: true });
            fsModule.accessSync(dataDir, fsModule.constants.W_OK);
        }
        catch (err) {
            throw new Error(`Data directory "${dataDir}" is not writable: ${err.message}`);
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
                catch (err) { /* ignore */ }
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
                logger.warn(`Atomic rename of ${node_path_1.default.basename(configFile)} failed (${e.code}) - writing in place.`);
                await promises.writeFile(configFile, json, 'utf8');
            }
        });
        writeChain = run.catch(() => { });
        return run;
    }
    return { ensureDataDir, exists, read, write };
}
//# sourceMappingURL=config-store.js.map