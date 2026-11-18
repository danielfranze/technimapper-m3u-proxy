'use strict';

/**
 * Pure helpers for the HDHomeRun emulation (no Express, no I/O) so they can be unit-tested in isolation.
 * Plex and Jellyfin read /discover.json, /lineup_status.json and /lineup.json and follow the stream URLs.
 */

const { STREAM_URL_REGEX } = require('./m3u8');

const DEFAULTS = Object.freeze({
    deviceId: '12345678',
    tunerCount: 2
});

const DEVICE_ID_REGEX = /^[0-9A-Fa-f]{8}$/;
// host[:port] or [ipv6][:port] - nothing else may end up in URLs that we hand to clients
const HOST_REGEX = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

const LINEUP_STATUS = Object.freeze({
    ScanInProgress: 0,
    ScanPossible: 1,
    Source: 'Cable',
    SourceList: Object.freeze(['Cable'])
});

/** Reads the HDHR_* environment variables. Invalid values fall back to the defaults and produce a warning. */
function resolveConfig(env = {}) {
    const warnings = [];

    // Empty or "-" means "automatic": the name is then built from the detected receiver model (see defaultFriendlyName).
    const rawName = String(env.HDHR_FRIENDLY_NAME || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 64);
    const friendlyName = rawName === '' || rawName === '-' ? null : rawName;

    let deviceId = DEFAULTS.deviceId;
    if (env.HDHR_DEVICE_ID) {
        if (DEVICE_ID_REGEX.test(env.HDHR_DEVICE_ID)) deviceId = env.HDHR_DEVICE_ID.toUpperCase();
        else warnings.push(`HDHR_DEVICE_ID "${env.HDHR_DEVICE_ID}" is invalid (8 hex digits expected) - using ${DEFAULTS.deviceId}.`);
    }

    let tunerCount = DEFAULTS.tunerCount;
    if (env.HDHR_TUNER_COUNT) {
        const n = parseInt(env.HDHR_TUNER_COUNT, 10);
        if (/^\d{1,2}$/.test(String(env.HDHR_TUNER_COUNT)) && n >= 1 && n <= 16) tunerCount = n;
        else warnings.push(`HDHR_TUNER_COUNT "${env.HDHR_TUNER_COUNT}" is invalid (1-16 expected) - using ${DEFAULTS.tunerCount}.`);
    }

    return { enabled: env.HDHR_ENABLED !== 'false', friendlyName, deviceId, tunerCount, warnings };
}

/** Display name of the receiver family for the device type found by the UPnP discovery. */
function modelLabel(deviceType) {
    return deviceType === 'STC' ? 'DIGIT ISIO STC' : 'DIGIT ISIO S/S1/S2';
}

/** Accepts a persisted model label only if it is a plain, short string. */
function sanitizeModel(value) {
    if (typeof value !== 'string') return null;
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60) || null;
}

/** "TechniSat DIGIT ISIO STC", or just "TechniSat" as long as the model is not known yet. */
function defaultFriendlyName(model) {
    return model ? `TechniSat ${model}` : 'TechniSat';
}

/** "001 Das Erste HD" -> "Das Erste HD" (only a leading number followed by whitespace is removed). */
function guideName(name) {
    const original = String(name).trim();
    return original.replace(/^\d+\s+/, '').trim() || original;
}

/**
 * Builds the tuner lineup from the receiver's channels and the user's mapping.
 * The mapped ID is the GuideNumber (and the key of the stream URL). If two channels end up with the same
 * GuideNumber the first one wins, so every stream URL is unambiguous.
 * @returns {{ guideNumber: string, guideName: string, url: string }[]}
 */
function buildLineup(channels, mapping) {
    const entries = [];
    const seen = new Set();
    for (const ch of channels) {
        if (!Object.hasOwn(mapping, ch.name)) continue;
        const guideNumber = String(mapping[ch.name]).trim().replace(/^ts-ch/, '');
        const url = String(ch.url).trim();
        if (!guideNumber || seen.has(guideNumber) || !STREAM_URL_REGEX.test(url)) continue;
        seen.add(guideNumber);
        entries.push({ guideNumber, guideName: guideName(ch.name), url });
    }
    return entries;
}

/** "http://host:port" from the request, or null if the Host header contains anything unexpected. */
function baseUrlFrom(protocol, host) {
    if (typeof host !== 'string' || !HOST_REGEX.test(host)) return null;
    return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}

function discoverPayload(baseUrl, config, model) {
    return {
        FriendlyName: config.friendlyName || defaultFriendlyName(model),
        ModelNumber: 'HDHR4-2DT',
        FirmwareName: 'hdhomerun4_dvbt',
        FirmwareVersion: '20260101',
        DeviceID: config.deviceId,
        DeviceAuth: 'technisat123',
        BaseURL: `${baseUrl}/hdhr`,
        LineupURL: `${baseUrl}/hdhr/lineup.json`,
        TunerCount: config.tunerCount
    };
}

function lineupPayload(entries, baseUrl) {
    return entries.map(e => ({
        GuideNumber: e.guideNumber,
        GuideName: e.guideName,
        URL: `${baseUrl}/hdhr/stream/${encodeURIComponent(e.guideNumber)}`
    }));
}

module.exports = {
    DEFAULTS, LINEUP_STATUS, resolveConfig, modelLabel, sanitizeModel, defaultFriendlyName,
    guideName, buildLineup, baseUrlFrom, discoverPayload, lineupPayload
};
