/**
 * Pure M3U8 playlist generation helpers (no I/O) so they can be unit-tested in isolation.
 */
export const STREAM_URL_REGEX = /^https?:\/\/[^\s\x00-\x1f\x7f"<>]+$/;
export function sanitizeM3u8Text(str) {
    return String(str).replace(/[\u0000-\u001f\u007f"]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function buildM3u8(channels, mapping) {
    let m3u8 = '#EXTM3U\n';
    let count = 0;
    for (const ch of channels) {
        if (!Object.hasOwn(mapping, ch.name))
            continue;
        const id = sanitizeM3u8Text(String(mapping[ch.name]));
        const url = String(ch.url).trim();
        if (!id || !STREAM_URL_REGEX.test(url))
            continue;
        const name = sanitizeM3u8Text(ch.name);
        const chNo = id.replace('ts-ch', '');
        m3u8 += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-chno="${chNo}" cuid="${id}" group-title="TechniSat",${name}\n${url}\n`;
        count++;
    }
    return { m3u8, count };
}
//# sourceMappingURL=m3u8.js.map