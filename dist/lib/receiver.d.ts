declare const DISCOVERY_TARGETS: readonly {
    type: string;
    parentObj: string;
    path: string;
}[];
declare function escapeXml(str: any): string;
/** xml2js returns either a string or { _: text, $: attrs }. */
declare function xmlText(value: any): string;
declare function asArray(value: any): any[];
/** Extracts the DIDL-Lite containers (channel lists) from a Browse response. */
declare function parseContainerList(didl: any): {
    id: any;
    title: string;
    childCount: number;
}[];
/** Extracts playable channel items from a DIDL-Lite payload. */
declare function parseChannelItems(didl: any): {
    name: string;
    url: string;
}[];
/**
 * @param {{ requestTimeoutMs?: number, maxResponseBytes?: number, logger?: object, agent?: http.Agent }} [options]
 */
declare function createSoapReceiver({ requestTimeoutMs, maxResponseBytes, logger, agent }?: {
    requestTimeoutMs?: number;
    maxResponseBytes?: number;
    logger?: any;
    agent?: any;
}): {
    fetchChannels: ({ ip, port, selectedListName }: {
        ip: any;
        port: any;
        selectedListName: any;
    }) => Promise<{
        channels: {
            name: string;
            url: string;
        }[];
        selectedListName: string;
        availableLists: string[];
        detectedModel: string;
    }>;
    browseUpnp: (ip: any, port: any, objectId: any, pathEndpoint: any) => Promise<any>;
    discoverTvLists: (ip: any, port: any) => Promise<{
        deviceType: string;
        path: string;
        lists: {
            id: any;
            title: string;
            childCount: number;
        }[];
    }>;
    close: () => any;
};
export { DISCOVERY_TARGETS, escapeXml, xmlText, asArray, parseContainerList, parseChannelItems, createSoapReceiver };
