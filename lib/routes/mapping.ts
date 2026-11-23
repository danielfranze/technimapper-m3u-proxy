'use strict';

import {  HttpError  } from '../validation.js';
import {  findDuplicateIds, findDuplicateGroups, partitionMapping  } from '../validation.js';

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerMappingRoutes(app, ctx) {
    const { getState, updateState, state: stateStore, persistState, rebuildViews, validation } = ctx;
    const { validateMapping } = validation;

    app.post('/api/save-mapping', async (req, res) => {
        const { mapping, invalid } = validateMapping(req.body?.mapping);
        if (invalid.length) {
            throw new HttpError(400, `Invalid channel ID for: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', ...' : ''}. Allowed: letters, digits, "_", "-", "." (max. 32 chars, not "." or "..").`);
        }

        const before = getState();
        updateState(s => { s.config.mapping = mapping; });
        rebuildViews();
        try {
            await persistState();
        } catch (err) {
            if (stateStore && typeof stateStore.commit === 'function') stateStore.commit(before);
            throw err;
        }

        const snapshot = getState();
        const { active, orphans } = partitionMapping(mapping, snapshot.config.channels.map(channel => channel.name));
        res.json({
            success: true,
            mappedCount: Object.keys(mapping).length,
            duplicates: findDuplicateIds(active),
            duplicateGroups: findDuplicateGroups(active),
            orphans
        });
    });
}

export { registerMappingRoutes };
