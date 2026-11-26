import * as hdhr from '../lib/hdhr.js';
import { createValidation, sortMapping } from '../lib/validation.js';

const fakeCron = (value: string): boolean => typeof value === 'string' && value.trim().split(/\s+/).length === 5;

export interface Deps {
    validateMapping: ReturnType<typeof createValidation>['validateMapping'];
    sortMapping: typeof sortMapping;
    sanitizeModel: typeof hdhr.sanitizeModel;
    isAllowedReceiverIp: ReturnType<typeof createValidation>['isAllowedReceiverIp'];
    cronValidate: (value: string) => boolean;
    defaultCron: string;
    logger: { warn(...args: unknown[]): void; info(...args: unknown[]): void; error(...args: unknown[]): void };
}

function createDeps(logger: Deps['logger']): Deps {
    const validation = createValidation({ cronValidate: fakeCron });
    return {
        validateMapping: validation.validateMapping,
        sortMapping,
        sanitizeModel: hdhr.sanitizeModel,
        isAllowedReceiverIp: validation.isAllowedReceiverIp,
        cronValidate: fakeCron,
        defaultCron: '*/5 * * * *',
        logger,
    };
}

export { createDeps, fakeCron };
