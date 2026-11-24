/**
 * UPnP/SOAP adapter for TechniSat receivers.
 *
 * This is the only module that knows about SOAP, DIDL-Lite and the two device
 * series (STC and S-series). Everything above it works with plain channel
 * objects, which makes the sync flow testable with a fake receiver.
 */
import http from 'http';
/** xml2js-Ergebnisse: Entweder ein String, ein Objekt ({ ... }) oder ein Array davon. */
type XmlValue = XmlNode | XmlNode[] | string | undefined;
interface XmlNode {
    [key: string]: unknown;
}
interface ChannelList {
    id: string;
    title: string;
    childCount: number;
}
interface Channel {
    name: string;
    url: string;
}
interface DiscoveryResult {
    deviceType: 'STC' | 'S1' | 'S2' | 'S_SERIES';
    path: string;
    lists: ChannelList[];
}
interface FetchResult {
    channels: Channel[];
    selectedListName: string;
    availableLists: string[];
    detectedModel: 'STC' | 'S1' | 'S2' | 'S_SERIES';
}
interface SoapReceiverLogger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
declare const DISCOVERY_TARGETS: readonly [{
    readonly type: "STC";
    readonly parentObj: "0$3$41";
    readonly path: "/dev0/srv1/control";
}, {
    readonly type: "S_SERIES";
    readonly parentObj: "3";
    readonly path: "/ContentDirectory/Control";
}];
declare function escapeXml(str: string): string;
/** xml2js gibt entweder einen String oder { _: text, $: attrs } zurück. */
declare function xmlText(value: XmlValue): string | undefined;
declare function asArray(value: XmlValue): XmlNode[];
/** Extracts the DIDL-Lite containers (channel lists) from a Browse response. */
declare function parseContainerList(didl: XmlValue): ChannelList[];
/** Extracts playable channel items from a DIDL-Lite payload. */
declare function parseChannelItems(didl: XmlValue): Channel[];
declare function createSoapReceiver({ requestTimeoutMs, maxResponseBytes, logger, agent }?: {
    requestTimeoutMs?: number;
    maxResponseBytes?: number;
    logger?: SoapReceiverLogger;
    agent?: http.Agent;
}): {
    fetchChannels: (settings: {
        ip: string;
        port: string | number;
        selectedListName: string;
    }) => Promise<FetchResult>;
    browseUpnp: (ip: string, port: string | number, objectId: string, pathEndpoint: string) => Promise<XmlNode | undefined>;
    discoverTvLists: (ip: string, port: string | number) => Promise<DiscoveryResult>;
    close: () => void;
};
export { DISCOVERY_TARGETS, escapeXml, xmlText, asArray, parseContainerList, parseChannelItems, createSoapReceiver };
export type Receiver = ReturnType<typeof createSoapReceiver>;
