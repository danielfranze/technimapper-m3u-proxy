'use strict';

// Backend origin for all API calls.
export const BACKEND_URL = window.location.origin;

// Small fetch helper used by the UI.
export async function postJson(path, body) {
    const res = await fetch(BACKEND_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
}

export async function getJson(path) {
    const res = await fetch(BACKEND_URL + path);
    const data = await res.json().catch(() => ({}));
    return { res, data };
}
