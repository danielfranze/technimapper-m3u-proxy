"use strict";
/**
 * Pure M3U8 playlist generation helpers (no I/O) so they can be unit-tested in isolation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STREAM_URL_REGEX = void 0;
exports.sanitizeM3u8Text = sanitizeM3u8Text;
exports.buildM3u8 = buildM3u8;
exports.STREAM_URL_REGEX = /^https?:\/\/[^\s\x00-\x1f\x7f"<>]+$/;
function sanitizeM3u8Text(str) {
    return String(str).replace(/[\u0000-\u001f\u007f"]/g, ' ').replace(/\s+/g, ' ').trim();
}
function buildM3u8(channels, mapping) {
    let m3u8 = '#EXTM3U\n';
    let count = 0;
    for (const ch of channels) {
        if (!Object.hasOwn(mapping, ch.name))
            continue;
        const id = sanitizeM3u8Text(String(mapping[ch.name]));
        const url = String(ch.url).trim();
        if (!id || !exports.STREAM_URL_REGEX.test(url))
            continue;
        const name = sanitizeM3u8Text(ch.name);
        const chNo = id.replace('ts-ch', '');
        m3u8 += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-chno="${chNo}" cuid="${id}" group-title="TechniSat",${name}\n${url}\n`;
        count++;
    }
    return { m3u8, count };
}
//# sourceMappingURL=m3u8.js.map