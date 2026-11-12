'use strict';

/**
 * Pure input-validation helpers (no Express, no I/O) so they can be unit-tested in isolation.
 */

const net = require('net');

const ID_REGEX = /^[A-Za-z0-9_.\-]{1,32}$/;

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * @param {{ cronValidate: (expr: string) => boolean, allowNonPrivateIp?: boolean }} options
 */
function createValidation({ cronValidate, allowNonPrivateIp = false }) {
    /** Receiver must be a valid IPv4; loopback/link-local/multicast are always rejected. */
    function isAllowedReceiverIp(ip) {
        if (typeof ip !== 'string' || !net.isIPv4(ip)) return false;
        const [a, b] = ip.split('.').map(Number);
        if (a === 0 || a === 127 || a >= 224) return false;      // unspecified, loopback, multicast/reserved
        if (a === 169 && b === 254) return false;                // link-local (incl. cloud metadata)
        if (allowNonPrivateIp) return true;
        return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }

    /** Validates a full settings object and returns a normalised copy. Throws HttpError(400). */
    function validateSettings(raw) {
        const ip = String(raw.ip ?? '').trim();
        if (!isAllowedReceiverIp(ip)) {
            throw new HttpError(400, 'Invalid receiver IP. Use a private IPv4 address (10.x, 172.16-31.x, 192.168.x).');
        }

        const portStr = String(raw.port ?? '').trim();
        const portNum = parseInt(portStr, 10);
        if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) {
            throw new HttpError(400, 'Invalid port (1-65535).');
        }

        const cronExpression = String(raw.cronExpression ?? '').trim();
        if (cronExpression.length > 100 || !cronValidate(cronExpression)) {
            throw new HttpError(400, `Invalid cron expression "${cronExpression.slice(0, 40)}" (example: */5 * * * *).`);
        }

        const selectedListName = String(raw.selectedListName ?? '').trim();
        if (!selectedListName || selectedListName.length > 200) {
            throw new HttpError(400, 'Invalid channel list name.');
        }

        return { ip, port: String(portNum), cronExpression, selectedListName };
    }

    /**
     * Validates a channel-name -> ID mapping.
     * Returns { mapping, invalid } where invalid lists channel names with unusable IDs.
     */
    function validateMapping(input) {
        const mapping = {};
        const invalid = [];
        if (!input || typeof input !== 'object' || Array.isArray(input)) return { mapping, invalid: ['<payload>'] };

        for (const [name, value] of Object.entries(input)) {
            if (value === '' || value === null || value === undefined) continue; // unmapped
            if (!name || name.length > 200 || name === '__proto__') {
                invalid.push(name);
                continue;
            }
            const isValidNumber = typeof value === 'number' && Number.isInteger(value) && value >= 0;
            const isValidString = typeof value === 'string' && ID_REGEX.test(value);
            if (isValidNumber && String(value).length <= 32) mapping[name] = value;
            else if (isValidString) mapping[name] = value;
            else invalid.push(name);
        }
        return { mapping, invalid };
    }

    return { isAllowedReceiverIp, validateSettings, validateMapping };
}

/** Returns the IDs that are assigned to more than one channel. */
function findDuplicateIds(mapping) {
    const seen = new Set();
    const dups = new Set();
    for (const v of Object.values(mapping)) {
        const id = String(v);
        if (seen.has(id)) dups.add(id);
        seen.add(id);
    }
    return [...dups];
}

/** Returns [{ id, channels: [names] }] for every ID that is assigned to more than one channel. */
function findDuplicateGroups(mapping) {
    const byId = new Map();
    for (const [name, value] of Object.entries(mapping)) {
        const id = String(value);
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(name);
    }
    return [...byId].filter(([, names]) => names.length > 1).map(([id, channels]) => ({ id, channels }));
}

/**
 * Splits a mapping into entries whose channel still exists on the receiver ("active") and
 * stale entries ("orphans"). Without a known channel list nothing can be called stale.
 * @returns {{ active: Record<string, string|number>, orphans: string[] }}
 */
function partitionMapping(mapping, channelNames) {
    if (!channelNames || channelNames.length === 0) return { active: { ...mapping }, orphans: [] };
    const known = new Set(channelNames);
    const active = {};
    const orphans = [];
    for (const [name, id] of Object.entries(mapping)) {
        if (known.has(name)) active[name] = id;
        else orphans.push(name);
    }
    return { active, orphans };
}

/**
 * Returns a copy of the mapping ordered like the receiver's channel list; entries of channels that
 * no longer exist (stale) follow, sorted alphabetically. Without a channel list the order is kept.
 * Purely cosmetic (lookups use the channel name) but keeps mapping.json readable and diffs stable.
 */
function sortMapping(mapping, channelNames) {
    if (!channelNames || channelNames.length === 0) return { ...mapping };
    const sorted = {};
    for (const name of channelNames) {
        if (Object.hasOwn(mapping, name) && !Object.hasOwn(sorted, name)) sorted[name] = mapping[name];
    }
    const rest = Object.keys(mapping).filter(name => !Object.hasOwn(sorted, name));
    rest.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of rest) sorted[name] = mapping[name];
    return sorted;
}

module.exports = { HttpError, ID_REGEX, createValidation, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping };
