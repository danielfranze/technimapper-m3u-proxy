/**
 * Pure helpers for the HDHomeRun emulation (no Express, no I/O) so they can be unit-tested in isolation.
 */
import { STREAM_URL_REGEX } from './m3u8.js';
const DEFAULTS = Object.freeze({
    deviceId: '12345678',
    tunerCount: 2,
});
const DEVICE_ID_REGEX = /^[0-9A-Fa-f]{8}$/;
const HOST_REGEX = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;
const LINEUP_STATUS = Object.freeze({
    ScanInProgress: 0,
    ScanPossible: 1,
    Source: 'Cable',
    SourceList: Object.freeze(['Cable']),
});
export function resolveConfig(env = {}) {
    const warnings = [];
    const rawName = String(env.HDHR_FRIENDLY_NAME || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, 64);
    const friendlyName = rawName === '' || rawName === '-' ? null : rawName;
    let deviceId = DEFAULTS.deviceId;
    if (env.HDHR_DEVICE_ID) {
        if (DEVICE_ID_REGEX.test(env.HDHR_DEVICE_ID))
            deviceId = env.HDHR_DEVICE_ID.toUpperCase();
        else
            warnings.push(`HDHR_DEVICE_ID "${env.HDHR_DEVICE_ID}" is invalid (8 hex digits expected) - using ${DEFAULTS.deviceId}.`);
    }
    let tunerCount = DEFAULTS.tunerCount;
    if (env.HDHR_TUNER_COUNT) {
        const n = parseInt(env.HDHR_TUNER_COUNT, 10);
        if (/^\d{1,2}$/.test(String(env.HDHR_TUNER_COUNT)) && n >= 1 && n <= 16)
            tunerCount = n;
        else
            warnings.push(`HDHR_TUNER_COUNT "${env.HDHR_TUNER_COUNT}" is invalid (1-16 expected) - using ${DEFAULTS.tunerCount}.`);
    }
    return { enabled: env.HDHR_ENABLED !== 'false', friendlyName, deviceId, tunerCount, warnings };
}
export function modelLabel(deviceType) {
    switch (deviceType) {
        case 'STC':
            return 'DIGIT ISIO STC';
        case 'S':
            return 'DIGIT ISIO S';
        case 'S1':
            return 'DIGIT ISIO S1';
        case 'S2':
            return 'DIGIT ISIO S2';
        default:
            return 'DIGIT ISIO S/S1/S2';
    }
}
export function sanitizeModel(value) {
    if (typeof value !== 'string')
        return null;
    return (value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, 60) || null);
}
export function defaultFriendlyName(model) {
    return model ? `TechniSat ${model}` : 'TechniSat';
}
export function guideName(name) {
    const original = String(name).trim();
    return original.replace(/^\d+\s+/, '').trim() || original;
}
export function buildLineup(channels, mapping) {
    const entries = [];
    const seen = new Set();
    for (const ch of channels) {
        if (!Object.hasOwn(mapping, ch.name))
            continue;
        const guideNumber = String(mapping[ch.name])
            .trim()
            .replace(/^ts-ch/, '');
        const url = String(ch.url).trim();
        if (!guideNumber || seen.has(guideNumber) || !STREAM_URL_REGEX.test(url))
            continue;
        seen.add(guideNumber);
        entries.push({ guideNumber, guideName: guideName(ch.name), url });
    }
    return entries;
}
export function baseUrlFrom(protocol, host) {
    if (typeof host !== 'string' || !HOST_REGEX.test(host))
        return null;
    return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}
export function discoverPayload(baseUrl, config, model) {
    return {
        FriendlyName: config.friendlyName || defaultFriendlyName(model),
        ModelNumber: 'HDHR4-2DT',
        FirmwareName: 'hdhomerun4_dvbt',
        FirmwareVersion: '20260101',
        DeviceID: config.deviceId,
        DeviceAuth: 'technisat123',
        BaseURL: `${baseUrl}/hdhr`,
        LineupURL: `${baseUrl}/hdhr/lineup.json`,
        TunerCount: config.tunerCount,
    };
}
export function lineupPayload(entries, baseUrl) {
    return entries.map((e) => ({
        GuideNumber: e.guideNumber,
        GuideName: e.guideName,
        URL: `${baseUrl}/hdhr/stream/${encodeURIComponent(e.guideNumber)}`,
    }));
}
export { DEFAULTS, LINEUP_STATUS };
//# sourceMappingURL=hdhr.js.map