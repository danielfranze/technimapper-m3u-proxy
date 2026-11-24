'use strict';

import {  createValidation, sortMapping  } from '../dist/lib/validation.js';
import * as hdhr from '../dist/lib/hdhr.js';

const fakeCron = (value: string): boolean => typeof value === 'string' && value.trim().split(/\s+/).length === 5;

interface Deps {
    validateMapping: ReturnType<typeof createValidation>['validateMapping'];
    sortMapping: typeof sortMapping;
    sanitizeModel: typeof hdhr.sanitizeModel;
    isAllowedReceiverIp: ReturnType<typeof createValidation>['isAllowedReceiverIp'];
    cronValidate: (value: string) => boolean;
    defaultCron: string;
    logger: unknown;
}

function createDeps(logger: unknown): Deps {
    const validation = createValidation({ cronValidate: fakeCron });
    return {
        validateMapping: validation.validateMapping,
        sortMapping,
        sanitizeModel: hdhr.sanitizeModel,
        isAllowedReceiverIp: validation.isAllowedReceiverIp,
        cronValidate: fakeCron,
        defaultCron: '*/5 * * * *',
        logger
    };
}

export { createDeps, fakeCron };
