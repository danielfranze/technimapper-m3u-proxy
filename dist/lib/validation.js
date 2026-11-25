/**
 * Pure input-validation helpers (no Express, no I/O) so they can be unit-tested in isolation.
 *
 * This is the public facade: the actual implementations live in `lib/domain/*`.
 */
import { isAllowedReceiverIp } from './domain/ids.js';
import { validateSettings } from './domain/settings.js';
import { validateMapping } from './domain/mapping.js';
export { HttpError } from './http-error.js';
export { ID_REGEX, isAllowedReceiverIp } from './domain/ids.js';
export { validateSettings } from './domain/settings.js';
export { validateMapping, findDuplicateIds, findDuplicateGroups, partitionMapping, sortMapping } from './domain/mapping.js';
function createValidation({ cronValidate, allowNonPrivateIp = false, allowLoopback = false }) {
    const deps = { cronValidate, allowNonPrivateIp, allowLoopback };
    return {
        isAllowedReceiverIp: ip => isAllowedReceiverIp(ip, { allowNonPrivateIp, allowLoopback }),
        validateSettings: raw => validateSettings(raw, deps),
        validateMapping
    };
}
export { createValidation };
//# sourceMappingURL=validation.js.map