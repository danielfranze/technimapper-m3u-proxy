/**
 * Pure input-validation helpers (no Express, no I/O) so they can be unit-tested in isolation.
 */
declare const ID_REGEX: RegExp;
/**
 * @extends {Error}
 */
declare class HttpError extends Error {
    status: number;
    /**
     * @param {number} status
     * @param {string} message
     */
    constructor(status: any, message: any);
}
/**
 * @param {{ cronValidate: (expr: string) => boolean, allowNonPrivateIp?: boolean }} options
 */
declare function createValidation({ cronValidate, allowNonPrivateIp, allowLoopback }: {
    cronValidate: (expr: string) => boolean;
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}): any;
/**
 * Returns the IDs that are assigned to more than one channel.
 * @param {Record<string, string | number>} mapping
 * @returns {string[]}
 */
declare function findDuplicateIds(mapping: Record<string, string | number>): unknown[];
/**
 * Returns [{ id, channels: [names] }] for every ID that is assigned to more than one channel.
 * @param {Record<string, string | number>} mapping
 * @returns {{ id: string, channels: string[] }[]}
 */
declare function findDuplicateGroups(mapping: Record<string, string | number>): {
    id: any;
    channels: any;
}[];
/**
 * Splits a mapping into entries whose channel still exists on the receiver ("active") and
 * stale entries ("orphans"). Without a known channel list nothing can be called stale.
 * @returns {{ active: Record<string, string|number>, orphans: string[] }}
 */
declare function partitionMapping(mapping: Record<string, string | number>, channelNames: string[]): {
    active: Record<string, string | number>;
    orphans: string[];
};
/**
 * Returns a copy of the mapping ordered like the receiver's channel list; entries of channels that
 * no longer exist (stale) follow, sorted alphabetically. Without a channel list the order is kept.
 * Purely cosmetic (lookups use the channel name) but keeps mapping.json readable and diffs stable.
 */
declare function sortMapping(mapping: Record<string, string | number>, channelNames: string[]): Record<string, string | number>;
export { HttpError, ID_REGEX, createValidation, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping };
