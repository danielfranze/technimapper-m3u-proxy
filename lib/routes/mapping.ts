'use strict';

import type { Express, Request, Response } from 'express';
import { HttpError, findDuplicateIds, findDuplicateGroups, partitionMapping } from '../validation.js';
import type { StateStore } from '../state-store.js';

interface MappingCtx {
    getState(): ReturnType<StateStore['get']>;
    updateState(mutator: (state: ReturnType<StateStore['get']>) => void): void;
    state: StateStore;
    persistState(): Promise<void>;
    rebuildViews(): void;
    validation: { validateMapping(input: unknown): { mapping: Record<string, string | number>; invalid: string[] } };
}

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerMappingRoutes(app: Express, ctx: MappingCtx): void {
    const { getState, updateState, state: stateStore, persistState, rebuildViews, validation } = ctx;
    const { validateMapping } = validation;

    app.post('/api/save-mapping', async (req: Request, res: Response) => {
        const { mapping, invalid } = validateMapping((req.body as { mapping?: unknown })?.mapping);
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
