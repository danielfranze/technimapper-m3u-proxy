/**
 * Pure input-validation helpers (no Express, no I/O) so they can be unit-tested in isolation.
 *
 * This is the public facade: the actual implementations live in `lib/domain/*`.
 */

import { isAllowedReceiverIp } from './domain/ids.js';
import { validateMapping } from './domain/mapping.js';
import { type SettingsDeps, type ValidatedSettings, validateSettings } from './domain/settings.js';

export { ID_REGEX, isAllowedReceiverIp } from './domain/ids.js';
export {
    findDuplicateGroups,
    findDuplicateIds,
    partitionMapping,
    sortMapping,
    validateMapping,
} from './domain/mapping.js';
export { type ValidatedSettings, validateSettings } from './domain/settings.js';

function createValidation({
    cronValidate,
    allowNonPrivateIp = false,
    allowLoopback = false,
}: {
    cronValidate: (expr: string) => boolean;
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}): {
    isAllowedReceiverIp: (ip: unknown) => boolean;
    validateSettings: (raw: unknown) => ValidatedSettings;
    validateMapping: (input: unknown) => { mapping: { [name: string]: string | number }; invalid: string[] };
} {
    const deps: SettingsDeps = { cronValidate, allowNonPrivateIp, allowLoopback };
    return {
        isAllowedReceiverIp: (ip) => isAllowedReceiverIp(ip, { allowNonPrivateIp, allowLoopback }),
        validateSettings: (raw) => validateSettings(raw, deps),
        validateMapping,
    };
}

export { createValidation };
