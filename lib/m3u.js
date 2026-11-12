'use strict';

/**
 * Pure M3U generation helpers (no I/O) so they can be unit-tested in isolation.
 */

// Only plain http(s) URLs without whitespace, control characters, quotes or angle brackets.
const STREAM_URL_REGEX = /^https?:\/\/[^\s\x00-\x1f\x7f"<>]+$/;

/** Removes control characters and quotes so values can never break out of an M3U attribute/line. */
function sanitizeM3uText(str) {
    return String(str).replace(/[\u0000-\u001f\u007f"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds the playlist from channels + mapping.
 * @param {{name: string, url: string}[]} channels
 * @param {Record<string, string|number>} mapping channel name -> channel ID
 * @returns {{ m3u: string, count: number }}
 */
function buildM3u(channels, mapping) {
    let m3u = '#EXTM3U\n';
    let count = 0;

    for (const ch of channels) {
        if (!Object.hasOwn(mapping, ch.name)) continue;
        const id = sanitizeM3uText(mapping[ch.name]);
        const url = String(ch.url).trim();
        if (!id || !STREAM_URL_REGEX.test(url)) continue;

        const name = sanitizeM3uText(ch.name);
        const chNo = id.replace('ts-ch', '');
        m3u += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-chno="${chNo}" cuid="${id}" group-title="TechniSat",${name}\n${url}\n`;
        count++;
    }
    return { m3u, count };
}

module.exports = { STREAM_URL_REGEX, sanitizeM3uText, buildM3u };
