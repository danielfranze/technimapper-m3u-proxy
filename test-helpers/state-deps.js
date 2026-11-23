'use strict';

const { createValidation, sortMapping } = require('../dist/lib/validation.js');
const hdhr = require('../dist/lib/hdhr.js');

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

module.exports = { createDeps, fakeCron };
