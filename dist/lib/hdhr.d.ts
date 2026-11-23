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
/** Reads the HDHR_* environment variables. Invalid values fall back to the defaults and produce a warning. */
declare function resolveConfig(env?: any): {
    enabled: boolean;
    friendlyName: string;
    deviceId: "12345678";
    tunerCount: number;
    warnings: any[];
};
/** Display name of the receiver family for the device type found by the UPnP discovery. */
declare function modelLabel(deviceType: any): string;
/** Accepts a persisted model label only if it is a plain, short string. */
declare function sanitizeModel(value: any): string;
/** "TechniSat DIGIT ISIO STC", or just "TechniSat" as long as the model is not known yet. */
declare function defaultFriendlyName(model: any): string;
/** "001 Das Erste HD" -> "Das Erste HD" (only a leading number followed by whitespace is removed). */
declare function guideName(name: any): string;
/**
 * Builds the tuner lineup from the receiver's channels and the user's mapping.
 * The mapped ID is the GuideNumber (and the key of the stream URL). If two channels end up with the same
 * GuideNumber the first one wins, so every stream URL is unambiguous.
 * @returns {{ guideNumber: string, guideName: string, url: string }[]}
 */
declare function buildLineup(channels: any, mapping: any): any;
/** "http://host:port" from the request, or null if the Host header contains anything unexpected. */
declare function baseUrlFrom(protocol: any, host: any): string | null;
declare function discoverPayload(baseUrl: any, config: any, model: any): any;
declare function lineupPayload(entries: any, baseUrl: any): any;
export { DEFAULTS, LINEUP_STATUS, resolveConfig, modelLabel, sanitizeModel, defaultFriendlyName, guideName, buildLineup, baseUrlFrom, discoverPayload, lineupPayload };
