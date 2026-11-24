/**
 * Pure helpers for the HDHomeRun emulation (no Express, no I/O) so they can be unit-tested in isolation.
 */
declare const DEFAULTS: Readonly<{
    deviceId: "12345678";
    tunerCount: 2;
}>;
declare const LINEUP_STATUS: Readonly<{
    ScanInProgress: 0;
    ScanPossible: 1;
    Source: "Cable";
    SourceList: readonly string[];
}>;
export interface HdhrConfig {
    enabled: boolean;
    friendlyName: string | null;
    deviceId: string;
    tunerCount: number;
    warnings: string[];
}
export interface LineupEntry {
    guideNumber: string;
    guideName: string;
    url: string;
}
export interface HdhrChannel {
    name: string;
    url: string;
}
export interface LineupPayloadEntry {
    GuideNumber: string;
    GuideName: string;
    URL: string;
}
export declare function resolveConfig(env?: Record<string, string | undefined>): HdhrConfig;
export declare function modelLabel(deviceType: string | null): string;
export declare function sanitizeModel(value: unknown): string | null;
export declare function defaultFriendlyName(model: string | null): string;
export declare function guideName(name: string): string;
export declare function buildLineup(channels: HdhrChannel[], mapping: Record<string, string | number>): LineupEntry[];
export declare function baseUrlFrom(protocol: string, host: string): string | null;
export declare function discoverPayload(baseUrl: string, config: HdhrConfig, model: string | null): Record<string, unknown>;
export declare function lineupPayload(entries: LineupEntry[], baseUrl: string): LineupPayloadEntry[];
export { DEFAULTS, LINEUP_STATUS };
