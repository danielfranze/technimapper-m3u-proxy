/**
 * Pure M3U8 playlist generation helpers (no I/O) so they can be unit-tested in isolation.
 */
declare const STREAM_URL_REGEX: RegExp;
/** Removes control characters and quotes so values can never break out of an M3U8 attribute/line. */
declare function sanitizeM3u8Text(str: any): string;
/**
 * Builds the playlist from channels + mapping.
 * @param {{name: string, url: string}[]} channels
 * @param {Record<string, string|number>} mapping channel name -> channel ID
 * @returns {{ m3u8: string, count: number }}
 */
declare function buildM3u8(channels: any, mapping: any): {
    m3u8: string;
    count: number;
};
export { STREAM_URL_REGEX, sanitizeM3u8Text, buildM3u8 };
