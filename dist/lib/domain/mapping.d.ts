/**
 * Domain: channel mapping utilities (ID validity, duplicates, orphan detection, sorting).
 *
 * Pure, no Express, no I/O – unit-testable in isolation.
 */
interface Mapping {
    [name: string]: string | number;
}
/**
 * Validates a channel-name -> ID mapping.
 * Returns { mapping, invalid } where invalid lists channel names with unusable IDs.
 */
declare function validateMapping(input: unknown): {
    mapping: Mapping;
    invalid: string[];
};
/**
 * Returns the IDs that are assigned to more than one channel.
 */
declare function findDuplicateIds(mapping: Mapping): string[];
/**
 * Returns [{ id, channels: [names] }] for every ID that is assigned to more than one channel.
 */
declare function findDuplicateGroups(mapping: Mapping): Array<{
    id: string;
    channels: string[];
}>;
/**
 * Splits a mapping into entries whose channel still exists on the receiver ("active") and
 * stale entries ("orphans"). Without a known channel list nothing can be called stale.
 */
declare function partitionMapping(mapping: Mapping, channelNames: string[]): {
    active: Mapping;
    orphans: string[];
};
/**
 * Returns a copy of the mapping ordered like the receiver's channel list; entries of channels that
 * no longer exist (stale) follow. Without a channel list the order is kept.
 * Purely cosmetic (lookups use the channel name) but keeps mapping.json readable and diffs stable.
 */
declare function sortMapping(mapping: Mapping, channelNames: string[]): Mapping;
export { validateMapping, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping };
