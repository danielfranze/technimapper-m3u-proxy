/**
 * Typed API client for the backend.
 *
 * Every endpoint wrapper documents its response shape, so the presenter gets
 * checked field access without a build step.
 */

import type { Mapping, DuplicateGroup } from './lib/model.js';

export interface JsonResult<T> {
    ok: boolean;
    res: Response;
    data: T;
}

export interface ConfigResponse {
    version: string;
    ip: string;
    port: string;
    cronExpression: string;
    selectedListName: string;
    lastSync: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    consecutiveFailures: number;
    hdhrEnabled: boolean;
}

export interface SettingsPayload {
    ip: string;
    port: string;
    cronExpression: string;
    selectedListName: string;
}

export interface SaveSettingsResponse extends SettingsPayload {
    success: boolean;
    error?: string;
}

export interface FetchChannelsResponse {
    channels: string[];
    availableLists: string[];
    selectedListName: string;
    mapping: Mapping;
    detectedModel: string;
    error?: string;
}

export interface SaveMappingResponse {
    success: boolean;
    mappedCount: number;
    duplicates: string[];
    duplicateGroups: DuplicateGroup[];
    orphans: string[];
    error?: string;
}

export interface ImportConfigResponse {
    success: boolean;
    message: string;
    error?: string;
}

// Backend origin for all API calls.
export const BACKEND_URL: string =
    (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

function parseJson(res: Response): Promise<unknown> {
    return res.json().catch(() => ({}));
}

export async function postJson<T>(path: string, body: unknown): Promise<JsonResult<T>> {
    const res = await fetch(BACKEND_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await parseJson(res);
    return { ok: res.ok, res, data: data as T };
}

export async function getJson<T>(path: string): Promise<JsonResult<T>> {
    const res = await fetch(BACKEND_URL + path);
    const data = await parseJson(res);
    return { ok: res.ok, res, data: data as T };
}

export async function getConfig(): Promise<JsonResult<ConfigResponse>> {
    return getJson<ConfigResponse>('/api/config');
}

export async function saveSettings(settings: SettingsPayload): Promise<JsonResult<SaveSettingsResponse>> {
    return postJson<SaveSettingsResponse>('/api/save-settings', settings);
}

export async function fetchChannelsRequest(settings: SettingsPayload): Promise<JsonResult<FetchChannelsResponse>> {
    return postJson<FetchChannelsResponse>('/api/fetch-channels', settings);
}

export async function saveMappingRequest(mapping: Mapping): Promise<JsonResult<SaveMappingResponse>> {
    return postJson<SaveMappingResponse>('/api/save-mapping', { mapping });
}

export async function importConfig(config: unknown): Promise<JsonResult<ImportConfigResponse>> {
    return postJson<ImportConfigResponse>('/api/import-config', config);
}
