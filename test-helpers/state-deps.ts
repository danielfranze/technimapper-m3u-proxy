'use strict';

import {  createValidation, sortMapping  } from '../dist/lib/validation.js';
import * as hdhr from '../dist/lib/hdhr.js';

const fakeCron = value => typeof value === 'string' && value.trim().split(/\s+/).length === 5;

function createDeps(logger) {
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
