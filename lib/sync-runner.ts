import type { Metrics } from './app-types.js';
import type { LineupEntry } from './hdhr.js';
import { HttpError } from './http-error.js';
import { buildM3u8 } from './m3u8.js';
import type { FetchResult, Receiver } from './receiver.js';
import { persistedSnapshot } from './state.js';
import type { AppState, StateStore } from './state-store.js';
import type { ValidatedSettings } from './validation.js';

/**
 * Application use case for receiver sync and playlist state.
 *
 * Extracting this from the HTTP layer keeps route handlers thin and makes the
 * sync flow reusable and testable without Express.
 */

interface SyncRunnerDeps {
    state: StateStore;
    configStore: { write(data: unknown): Promise<void> };
    receiver: Pick<Receiver, 'fetchChannels'>;
    validation: {
        validateSettings(raw: unknown): ValidatedSettings;
        validateMapping?(input: unknown): unknown;
    };
    hdhrModule: {
        buildLineup(channels: { name: string; url: string }[], mapping: Record<string, string | number>): LineupEntry[];
        modelLabel(deviceType: string | null): string;
    };
    logger: { warn(...args: unknown[]): void };
    metrics?: Metrics;
}

function createSyncRunner({ state, configStore, receiver, validation, hdhrModule, logger, metrics }: SyncRunnerDeps) {
    const { validateSettings } = validation;

    function getState(): AppState {
        return state.get();
    }

    function updateState(mutator: (state: AppState) => void): AppState {
        return state.update(mutator);
    }

    function currentSettings(): ValidatedSettings {
        const { ip, port, cronExpression, selectedListName } = getState().config;
        return { ip, port, cronExpression, selectedListName };
    }

    function mergeSettings(overrides: Record<string, unknown> | null = {}): ValidatedSettings {
        if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
            throw HttpError.badRequest('Invalid settings payload');
        }
        const merged: Record<string, unknown> = { ...currentSettings() };
        // A key that is explicitly present overrides the stored value, even when
        // it is empty: validateSettings() then rejects it instead of silently
        // keeping the old value. Keys that are absent leave the stored value.
        for (const key of Object.keys(merged)) {
            if (Object.hasOwn(overrides, key)) {
                merged[key] = overrides[key];
            }
        }
        return validateSettings(merged);
    }

    async function persistState(): Promise<void> {
        await configStore.write(persistedSnapshot(getState()));
    }

    function rebuildViews(): number {
        const snapshot = getState();
        const { m3u8, count } = buildM3u8(snapshot.config.channels, snapshot.config.mapping);
        updateState((s) => {
            s.cachedM3u8 = count > 0 ? m3u8 : null;
            s.lineupEntries = hdhrModule.buildLineup(s.config.channels, s.config.mapping);
        });
        if (count === 0) logger.warn('No mapped channels - /playlist.m3u8 will answer 503 until channels are mapped.');
        return count;
    }

    async function performSync(candidate: ValidatedSettings): Promise<FetchResult & { stale?: boolean }> {
        const startedAt = Date.now();
        updateState((s) => {
            s.sync.lastAttemptAt = new Date().toISOString();
        });

        // Snapshot taken after the attempt timestamp is recorded but before any
        // receiver result is applied. Used to roll back in-memory state if
        // persistence fails, so memory and disk stay consistent.
        let preApplySnapshot: AppState | null = null;

        try {
            const result = await receiver.fetchChannels(candidate);

            // Compare-and-set: if the receiver target changed while this sync was
            // in flight (another save-settings/import-config/fetch-channels), the
            // result belongs to the old target and must not overwrite the new
            // settings or be persisted. The newer operation will run next.
            const current = currentSettings();
            const stale =
                current.ip !== candidate.ip ||
                current.port !== candidate.port ||
                current.cronExpression !== candidate.cronExpression ||
                current.selectedListName !== candidate.selectedListName;
            if (stale) {
                logger.warn('[Sync] Receiver settings changed during sync - discarding result.');
                return { ...result, stale: true };
            }

            preApplySnapshot = getState();
            updateState((s) => {
                Object.assign(s.config, {
                    ip: candidate.ip,
                    port: candidate.port,
                    cronExpression: candidate.cronExpression,
                    selectedListName: result.selectedListName,
                    channels: result.channels,
                    detectedModel: hdhrModule.modelLabel(result.detectedModel),
                    lastSync: new Date().toISOString(),
                });
                s.configured = true;
                s.sync.lastError = null;
                s.sync.lastErrorAt = null;
                s.sync.consecutiveFailures = 0;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });

            rebuildViews();
            try {
                await persistState();
            } catch (persistErr) {
                // Roll back the in-memory changes so a failed write does not leave
                // phantom state that differs from what is stored on disk.
                if (preApplySnapshot) {
                    state.commit(preApplySnapshot);
                }
                throw persistErr;
            }
            if (metrics) {
                metrics.syncRuns++;
                metrics.syncDurationMs = Date.now() - startedAt;
            }
            return result;
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            updateState((s) => {
                s.sync.lastError = e.message;
                s.sync.lastErrorAt = new Date().toISOString();
                s.sync.consecutiveFailures++;
                s.sync.lastDurationMs = Date.now() - startedAt;
            });
            if (metrics) metrics.syncFailures++;
            // Last-known-good: cached playlist and channels stay untouched.
            throw err;
        }
    }

    return {
        getState,
        updateState,
        currentSettings,
        mergeSettings,
        persistState,
        rebuildViews,
        performSync,
    };
}

export { createSyncRunner };
