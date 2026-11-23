'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMappingRoutes = registerMappingRoutes;
const validation_js_1 = require("../validation.js");
const validation_js_2 = require("../validation.js");
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
            throw new validation_js_1.HttpError(400, `Invalid channel ID for: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', ...' : ''}. Allowed: letters, digits, "_", "-", "." (max. 32 chars, not "." or "..").`);
        }
        const before = getState();
        updateState(s => { s.config.mapping = mapping; });
        rebuildViews();
        try {
            await persistState();
        }
        catch (err) {
            if (stateStore && typeof stateStore.commit === 'function')
                stateStore.commit(before);
            throw err;
        }
        const snapshot = getState();
        const { active, orphans } = (0, validation_js_2.partitionMapping)(mapping, snapshot.config.channels.map(channel => channel.name));
        res.json({
            success: true,
            mappedCount: Object.keys(mapping).length,
            duplicates: (0, validation_js_2.findDuplicateIds)(active),
            duplicateGroups: (0, validation_js_2.findDuplicateGroups)(active),
            orphans
        });
    });
}
//# sourceMappingURL=mapping.js.map