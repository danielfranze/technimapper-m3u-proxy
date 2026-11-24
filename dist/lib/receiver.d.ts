declare const DISCOVERY_TARGETS: readonly {
    type: string;
    parentObj: string;
    path: string;
}[];
declare function escapeXml(str: any): string;
/** xml2js returns either a string or { _: text, $: attrs }. */
declare function xmlText(value: any): string | undefined;
declare function asArray(value: any): any[];
/** Extracts the DIDL-Lite containers (channel lists) from a Browse response. */
declare function parseContainerList(didl: any): {
    id: any;
    title: string | undefined;
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
        ip: string;
        port: string | number;
        selectedListName: string;
    }) => Promise<any>;
    browseUpnp: (ip: string, port: string | number, objectId: string, pathEndpoint: string) => Promise<any>;
    discoverTvLists: (ip: string, port: string | number) => Promise<any>;
    close: () => any;
};
export { DISCOVERY_TARGETS, escapeXml, xmlText, asArray, parseContainerList, parseChannelItems, createSoapReceiver };
