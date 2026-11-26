/**
 * Typed API client for the backend.
 *
 * Every endpoint wrapper documents its response shape, so the presenter gets
 * checked field access.
 */

import type { components } from './api.generated.js';
import type { DuplicateGroup, Mapping } from './lib/model.js';

/** Schemas generated from `docs/openapi.yaml` by `npm run types:openapi`. */
export type OpenApiSchemas = components['schemas'];

export interface JsonResult<T> {
    ok: boolean;
    res: Response;
    data: T;
    /** Populated when `!ok`: a message from the backend (`error`/`message`) or `HTTP <status>`. */
    error?: string;
}

/** Uniform error for a failed `fetch` (network error, etc.). HTTP errors use `ok=false`, not a throw. */
export class ApiError extends Error {
    readonly status: number;
    readonly data: unknown;
    constructor(message: string, status: number, data: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

/** `GET /api/config` – generated `GetConfig` schema. */
export type ConfigResponse = OpenApiSchemas['GetConfig'];

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

/** `POST /api/fetch-channels` – generated `FetchChannelsResult`, plus `error` for a graceful backend message. */
export type FetchChannelsResponse = OpenApiSchemas['FetchChannelsResult'] & { error?: string };

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
export const BACKEND_URL: string = typeof window !== 'undefined' && window.location ? window.location.origin : '';

function parseJson(res: Response): Promise<unknown> {
    return res.json().catch(() => ({}));
}

/** Extracts a human-readable message from an error response body. */
function errorFrom(data: unknown, res: Response): string {
    if (data && typeof data === 'object') {
        const body = data as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string' && body.error) return body.error;
        if (typeof body.message === 'string' && body.message) return body.message;
    }
    const statusText = res.statusText ? ` ${res.statusText}` : '';
    return `HTTP ${res.status}${statusText}`;
}

export async function postJson<T>(path: string, body: unknown): Promise<JsonResult<T>> {
    let res: Response;
    try {
        res = await fetch(BACKEND_URL + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new ApiError(`POST ${path} failed: ${err instanceof Error ? err.message : String(err)}`, 0, null);
    }
    const data = await parseJson(res);
    const error = res.ok ? undefined : errorFrom(data, res);
    return { ok: res.ok, res, data: data as T, ...(error ? { error } : {}) };
}

export async function getJson<T>(path: string): Promise<JsonResult<T>> {
    let res: Response;
    try {
        res = await fetch(BACKEND_URL + path);
    } catch (err) {
        throw new ApiError(`GET ${path} failed: ${err instanceof Error ? err.message : String(err)}`, 0, null);
    }
    const data = await parseJson(res);
    const error = res.ok ? undefined : errorFrom(data, res);
    return { ok: res.ok, res, data: data as T, ...(error ? { error } : {}) };
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
