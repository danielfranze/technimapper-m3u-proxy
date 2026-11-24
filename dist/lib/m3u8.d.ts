/**
 * Pure M3U8 playlist generation helpers (no I/O) so they can be unit-tested in isolation.
 */
export declare const STREAM_URL_REGEX: RegExp;
export declare function sanitizeM3u8Text(str: string): string;
export declare function buildM3u8(channels: {
    name: string;
    url: string;
}[], mapping: Record<string, string | number>): {
    m3u8: string;
    count: number;
};
