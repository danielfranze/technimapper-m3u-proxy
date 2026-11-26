import type { Express, NextFunction, Request, Response } from 'express';
import { errorMessage } from '../error-message.js';
import * as hdhrModule from '../hdhr.js';
import { HttpError } from '../http-error.js';
import type { AppState, StateStore } from '../state-store.js';
import type { ValidatedSettings } from '../validation.js';

interface PerformSyncResult {
    channels: { name: string; url: string }[];
    availableLists: string[];
    stale?: boolean;
    detectedModel?: string;
}

interface ConfigCtx {
    getState(): AppState;
    updateState(mutator: (state: AppState) => void): void;
    state: StateStore;
    currentSettings(): ValidatedSettings;
    mergeSettings(overrides: Record<string, unknown> | null): ValidatedSettings;
    persistState(): Promise<void>;
    startBackgroundCron(): unknown;
    syncQueue: {
        clearBackoff(): void;
        request(fn: () => Promise<unknown>): Promise<unknown>;
    };
    validation: { validateMapping(input: unknown): { mapping: Record<string, string | number>; invalid: string[] } };
    version: string;
    hdhrConfig: { enabled: boolean };
    logger: { error(...args: unknown[]): void };
    performSync(candidate: {
        ip: string;
        port: string | number;
        selectedListName: string;
        cronExpression: string;
    }): Promise<PerformSyncResult>;
    rebuildViews(): void;
}

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerConfigRoutes(app: Express, ctx: ConfigCtx): void {
    const {
        getState,
        updateState,
        state: stateStore,
        currentSettings,
        mergeSettings,
        persistState,
        startBackgroundCron,
        syncQueue,
        validation,
        version,
        hdhrConfig,
        logger,
        performSync,
    } = ctx;
    const { validateMapping } = validation;

    app.get('/api/config', (_req: Request, res: Response) => {
        const snapshot = getState();
        res.json({
            version,
            ip: snapshot.config.ip,
            port: snapshot.config.port,
            cronExpression: snapshot.config.cronExpression,
            selectedListName: snapshot.config.selectedListName,
            lastSync: snapshot.config.lastSync,
            lastError: snapshot.sync.lastError,
            lastErrorAt: snapshot.sync.lastErrorAt,
            consecutiveFailures: snapshot.sync.consecutiveFailures,
            hdhrEnabled: hdhrConfig.enabled,
        });
    });

    app.post('/api/save-settings', async (req: Request, res: Response) => {
        const settings = mergeSettings((req.body || {}) as Record<string, unknown>);
        const before = getState();
        updateState((s) => {
            Object.assign(s.config, settings);
            s.configured = true;
        });
        try {
            await persistState();
        } catch (err) {
            if (stateStore && typeof stateStore.commit === 'function') stateStore.commit(before);
            throw err;
        }
        syncQueue.clearBackoff();
        startBackgroundCron();
        res.json({ success: true, ...currentSettings() });
    });

    app.post('/api/fetch-channels', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body =
                req.body && typeof req.body === 'object' && !Array.isArray(req.body)
                    ? (req.body as Record<string, unknown>)
                    : {};
            const candidate = mergeSettings(body);

            if (getState().configured && (body.ip !== undefined || body.port !== undefined)) {
                const snapshot = getState();
                if (candidate.ip !== snapshot.config.ip || candidate.port !== snapshot.config.port) {
                    throw HttpError.conflict('Receiver address changed. Save the settings first, then fetch channels.');
                }
            }

            const result = (await syncQueue.request(() => performSync(candidate))) as PerformSyncResult;
            if (result?.stale) {
                throw HttpError.conflict('Receiver settings changed during sync. Please retry.');
            }
            startBackgroundCron();

            const snapshot = getState();
            res.json({
                channels: snapshot.config.channels.map((channel) => channel.name),
                availableLists: result.availableLists,
                selectedListName: snapshot.config.selectedListName,
                mapping: snapshot.config.mapping,
                detectedModel: hdhrModule.modelLabel(result.detectedModel ?? null),
            });
        } catch (err) {
            if (err instanceof HttpError) return next(err);
            logger.error('[fetch-channels]', errorMessage(err));
            return next(HttpError.badGateway(errorMessage(err) || 'Receiver request failed'));
        }
    });

    app.get('/api/export-config', (_req: Request, res: Response) => {
        const snapshot = getState();
        res.setHeader('Content-Disposition', 'attachment; filename="technimapper-config.json"');
        res.json({
            version,
            exportedAt: new Date().toISOString(),
            config: currentSettings(),
            mapping: snapshot.config.mapping || {},
        });
    });

    app.post('/api/import-config', async (req: Request, res: Response) => {
        const data = req.body as { config?: unknown; mapping?: unknown } | null | undefined;
        if (!data || typeof data !== 'object' || Array.isArray(data))
            throw HttpError.badRequest('Invalid JSON payload');

        const settings = data.config ? mergeSettings(data.config as Record<string, unknown>) : null;
        let mapping: Record<string, string | number> | null = null;
        if (data.mapping !== undefined) {
            const checked = validateMapping(data.mapping);
            if (checked.invalid.length)
                throw HttpError.badRequest(
                    `Invalid channel ID in import for: ${checked.invalid.slice(0, 5).join(', ')}`,
                );
            mapping = checked.mapping;
        }

        const beforeImport = getState();
        updateState((s) => {
            if (settings) Object.assign(s.config, settings);
            if (mapping) s.config.mapping = mapping;
            s.configured = true;
        });

        ctx.rebuildViews();
        try {
            await persistState();
        } catch (err) {
            if (stateStore && typeof stateStore.commit === 'function') stateStore.commit(beforeImport);
            throw err;
        }
        if (typeof syncQueue.clearBackoff === 'function') syncQueue.clearBackoff();
        startBackgroundCron();
        res.json({ success: true, message: 'Configuration imported successfully' });
    });
}

export { registerConfigRoutes };
