/**
 * Domain: channel mapping utilities (ID validity, duplicates, orphan detection, sorting).
 *
 * Pure, no Express, no I/O – unit-testable in isolation.
 */
import { ID_REGEX } from './ids.js';
/**
 * Validates a channel-name -> ID mapping.
 * Returns { mapping, invalid } where invalid lists channel names with unusable IDs.
 */
function validateMapping(input) {
    const mapping = {};
    const invalid = [];
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { mapping, invalid: ['<payload>'] };
    for (const [name, value] of Object.entries(input)) {
        if (value === '' || value === null || value === undefined)
            continue; // unmapped
        if (!name || name.length > 200 || name === '__proto__') {
            invalid.push(name);
            continue;
        }
        const isValidNumber = typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value) && value >= 0;
        const isValidString = typeof value === 'string' && ID_REGEX.test(value);
        if (isValidNumber && String(value).length <= 32)
            mapping[name] = value;
        else if (isValidString)
            mapping[name] = value;
        else
            invalid.push(name);
    }
    return { mapping, invalid };
}
/**
 * Returns the IDs that are assigned to more than one channel.
 */
function findDuplicateIds(mapping) {
    const seen = new Set();
    const dups = new Set();
    for (const v of Object.values(mapping)) {
        const id = String(v);
        if (seen.has(id))
            dups.add(id);
        seen.add(id);
    }
    return [...dups];
}
/**
 * Returns [{ id, channels: [names] }] for every ID that is assigned to more than one channel.
 */
function findDuplicateGroups(mapping) {
    const byId = new Map();
    for (const [name, value] of Object.entries(mapping)) {
        const id = String(value);
        const names = byId.get(id);
        if (names)
            names.push(name);
        else
            byId.set(id, [name]);
    }
    return [...byId].filter(([, names]) => names.length > 1).map(([id, channels]) => ({ id, channels }));
}
/**
 * Splits a mapping into entries whose channel still exists on the receiver ("active") and
 * stale entries ("orphans"). Without a known channel list nothing can be called stale.
 */
function partitionMapping(mapping, channelNames) {
    if (!channelNames || channelNames.length === 0)
        return { active: { ...mapping }, orphans: [] };
    const known = new Set(channelNames);
    const active = {};
    const orphans = [];
    for (const [name, id] of Object.entries(mapping)) {
        if (known.has(name))
            active[name] = id;
        else
            orphans.push(name);
    }
    return { active, orphans };
}
/**
 * Returns a copy of the mapping ordered like the receiver's channel list; entries of channels that
 * no longer exist (stale) follow. Without a channel list the order is kept.
 * Purely cosmetic (lookups use the channel name) but keeps mapping.json readable and diffs stable.
 */
function sortMapping(mapping, channelNames) {
    if (!channelNames || channelNames.length === 0)
        return { ...mapping };
    const sorted = {};
    for (const name of channelNames) {
        const value = mapping[name];
        if (value !== undefined && Object.hasOwn(mapping, name) && !Object.hasOwn(sorted, name))
            sorted[name] = value;
    }
    const rest = Object.keys(mapping).filter(name => !Object.hasOwn(sorted, name));
    // Unknown/stale entries keep their current (insertion) order instead of being
    // re-sorted alphabetically, so the user's manual ordering is preserved.
    for (const name of rest) {
        const value = mapping[name];
        if (value !== undefined)
            sorted[name] = value;
    }
    return sorted;
}
export { validateMapping, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping };
//# sourceMappingURL=mapping.js.map