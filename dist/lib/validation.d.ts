/**
 * Pure input-validation helpers (no Express, no I/O) so they can be unit-tested in isolation.
 *
 * This is the public facade: the actual implementations live in `lib/domain/*`.
 */
import { type ValidatedSettings } from './domain/settings.js';
export { ID_REGEX, isAllowedReceiverIp } from './domain/ids.js';
export { findDuplicateGroups, findDuplicateIds, partitionMapping, sortMapping, validateMapping, } from './domain/mapping.js';
export { type ValidatedSettings, validateSettings } from './domain/settings.js';
export { HttpError } from './http-error.js';
declare function createValidation({ cronValidate, allowNonPrivateIp, allowLoopback, }: {
    cronValidate: (expr: string) => boolean;
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}): {
    isAllowedReceiverIp: (ip: unknown) => boolean;
    validateSettings: (raw: unknown) => ValidatedSettings;
    validateMapping: (input: unknown) => {
        mapping: {
            [name: string]: string | number;
        };
        invalid: string[];
    };
};
export { createValidation };
