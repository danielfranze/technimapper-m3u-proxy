'use strict';

// Backend origin for all API calls.
export const BACKEND_URL = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

function parseJson(res) {
    return res.json().catch(() => ({}));
}

/**
 * Fetch helper: POSTs a JSON body and returns { ok, res, data }.
 */
export async function postJson(path, body) {
    const res = await fetch(BACKEND_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await parseJson(res);
    return { ok: res.ok, res, data };
}

/**
 * Fetch helper: GETs and returns { ok, res, data }.
 */
export async function getJson(path) {
    const res = await fetch(BACKEND_URL + path);
    const data = await parseJson(res);
    return { ok: res.ok, res, data };
}

/**
 * Fetch helper: GETs text (playlist) and returns { ok, res, data }.
 */
export async function getText(path) {
    const res = await fetch(BACKEND_URL + path);
    const data = await parseJson(res);
    return { ok: res.ok, res, data };
}
