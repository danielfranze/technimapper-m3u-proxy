/**
 * UPnP/SOAP adapter for TechniSat receivers.
 *
 * This is the only module that knows about SOAP, DIDL-Lite and the two device
 * series (STC and S-series). Everything above it works with plain channel
 * objects, which makes the sync flow testable with a fake receiver.
 */

import http from 'node:http';
import xml2js from 'xml2js';
import { STREAM_URL_REGEX } from './m3u8.js';

/** xml2js values: either a string, an object ({ ... }) or an array of them. */
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
    deviceType: DiscoveryType;
    path: string;
    lists: ChannelList[];
}

export interface FetchResult {
    channels: Channel[];
    selectedListName: string;
    availableLists: string[];
    detectedModel: DiscoveryType;
}

interface SoapReceiverLogger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

const DiscoveryType = {
    STC: 'STC',
    S1: 'S1',
    S2: 'S2',
    S_SERIES: 'S_SERIES',
} as const;
type DiscoveryType = (typeof DiscoveryType)[keyof typeof DiscoveryType];

const SOAP_ACTION = '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"';

const ESCAPE_MAP: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };

const DISCOVERY_TARGETS = Object.freeze([
    { type: DiscoveryType.STC, parentObj: '0$3$41', path: '/dev0/srv1/control' },
    { type: DiscoveryType.S_SERIES, parentObj: '3', path: '/ContentDirectory/Control' },
] as const);

function escapeXml(str: string): string {
    return String(str).replace(/[<>&"']/g, (c: string) => ESCAPE_MAP[c] ?? c);
}

function asNode(value: unknown): XmlNode | undefined {
    return value && typeof value === 'object' ? (value as XmlNode) : undefined;
}

/** xml2js returns either a string or { _: text, $: attrs }. */
function xmlText(value: XmlValue): string | undefined {
    let current: XmlValue = value;
    if (Array.isArray(current)) current = current[0];
    const node = asNode(current);
    if (node) current = node['_'] as XmlValue;
    return typeof current === 'string' ? current : undefined;
}

function asArray(value: XmlValue): XmlNode[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value as XmlNode[];
    return [value as XmlNode];
}

function nodeKey(node: XmlNode | undefined, key: string): XmlValue {
    return node ? (node[key] as XmlValue) : undefined;
}

/** Extracts the DIDL-Lite containers (channel lists) from a Browse response. */
function parseContainerList(didl: XmlValue): ChannelList[] {
    const containers = asArray(nodeKey(didl as XmlNode, 'container'));
    const lists: ChannelList[] = [];
    for (const container of containers) {
        const attrs = asNode(container['$']);
        const id = (attrs?.['id'] as string | undefined) ?? xmlText(container['id'] as XmlValue);
        const title = xmlText(container['dc:title'] as XmlValue);
        const childCount = parseInt(String(attrs?.['childCount']), 10) || 0;
        if (id && title) lists.push({ id, title, childCount });
    }
    return lists;
}

/** Extracts playable channel items from a DIDL-Lite payload. */
function parseChannelItems(didl: XmlValue): Channel[] {
    const items = asArray(nodeKey(didl as XmlNode, 'item'));
    const channels: Channel[] = [];
    for (const item of items) {
        const name = xmlText(item['dc:title'] as XmlValue);
        const url = xmlText(item['res'] as XmlValue);
        if (name && url && STREAM_URL_REGEX.test(url.trim())) {
            channels.push({ name: name.trim(), url: url.trim() });
        }
    }
    return channels;
}

function createSoapReceiver({
    requestTimeoutMs = 5000,
    maxResponseBytes = 2 * 1024 * 1024,
    logger = console as SoapReceiverLogger,
    agent,
}: {
    requestTimeoutMs?: number;
    maxResponseBytes?: number;
    logger?: SoapReceiverLogger;
    agent?: http.Agent;
} = {}): {
    fetchChannels: (settings: { ip: string; port: string | number; selectedListName: string }) => Promise<FetchResult>;
    browseUpnp: (
        ip: string,
        port: string | number,
        objectId: string,
        pathEndpoint: string,
    ) => Promise<XmlNode | undefined>;
    discoverTvLists: (ip: string, port: string | number) => Promise<DiscoveryResult>;
    close: () => void;
} {
    // Keep-alive is intentionally disabled: several TechniSat receivers (notably
    // the S-series) answer the first (often failing) request with
    // "Connection: keep-alive" but do not correctly handle a second request on
    // the reused socket, returning HTTP 412. A fresh connection per request is
    // a few milliseconds slower but reliable across all receiver generations.
    const upnpAgent = agent || new http.Agent({ keepAlive: false });

    function postSoap(ip: string, port: string | number, pathEndpoint: string, soapEnvelope: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            let settled = false;
            let totalTimer: ReturnType<typeof setTimeout> | null = null;

            const finish = (err: Error | null, value?: string) => {
                if (settled) return;
                settled = true;
                if (totalTimer) clearTimeout(totalTimer);
                if (err) reject(err);
                else if (value !== undefined) resolve(value);
            };

            const req = http.request(
                {
                    hostname: ip,
                    port: parseInt(String(port), 10),
                    path: pathEndpoint,
                    method: 'POST',
                    agent: upnpAgent,
                    headers: {
                        'Content-Type': 'text/xml; charset="utf-8"',
                        SOAPACTION: SOAP_ACTION,
                        'Content-Length': Buffer.byteLength(soapEnvelope),
                        Connection: 'close',
                    },
                },
                (res: http.IncomingMessage) => {
                    const chunks: Buffer[] = [];
                    let size = 0;

                    res.on('data', (chunk: Buffer) => {
                        if (settled) return;
                        size += chunk.length;
                        if (size > maxResponseBytes) {
                            req.destroy();
                            finish(new Error('UPnP response too large'));
                            return;
                        }
                        chunks.push(chunk);
                    });

                    res.on('end', () => {
                        if (settled) return;
                        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
                            finish(new Error(`UPnP request failed with HTTP ${res.statusCode}`));
                            return;
                        }
                        finish(null, Buffer.concat(chunks).toString('utf8'));
                    });

                    res.on('error', (err) => finish(err));
                },
            );

            // Idle timeout + hard overall deadline.
            req.setTimeout(requestTimeoutMs, () => req.destroy(new Error('UPnP request timed out')));
            totalTimer = setTimeout(
                () => req.destroy(new Error('UPnP request exceeded total deadline')),
                requestTimeoutMs * 3,
            );
            req.on('error', (err) => finish(err));
            req.write(soapEnvelope);
            req.end();
        });
    }

    async function browseUpnp(
        ip: string,
        port: string | number,
        objectId: string,
        pathEndpoint: string,
    ): Promise<XmlNode | undefined> {
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <ObjectID>${escapeXml(objectId)}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
    <Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount>
  </u:Browse></s:Body>
</s:Envelope>`;

        const body = await postSoap(ip, port, pathEndpoint, soapEnvelope);
        const parsed = (await xml2js.parseStringPromise(body, { explicitArray: false })) as XmlNode;
        const envelope = asNode(parsed['s:Envelope']);
        const response = asNode(nodeKey(envelope, 's:Body'));
        const resultXml = xmlText(nodeKey(asNode(nodeKey(response, 'u:BrowseResponse')), 'Result'));
        if (!resultXml) throw new Error('UPnP SOAP Browse response invalid');

        const browse = (await xml2js.parseStringPromise(resultXml, { explicitArray: false })) as XmlNode;
        const didl = browse['DIDL-Lite'];
        if (!didl || typeof didl !== 'object') throw new Error('Invalid DIDL-Lite payload');
        return asNode(didl);
    }

    /**
     * Best-effort generation detection for S-series receivers.
     */
    function detectSSeriesGeneration(lists: ChannelList[]): DiscoveryType {
        const titles = new Set(lists.map((list) => list.title));
        if (titles.has('Astra-TV-Liste')) return DiscoveryType.S1;
        if (
            titles.has('TV-Liste') &&
            lists.length === 5 &&
            titles.has('Alle Videos') &&
            titles.has('Datum') &&
            titles.has('Eigene TV-Aufnahmen') &&
            titles.has('Verzeichnis')
        )
            return DiscoveryType.S2;
        return DiscoveryType.S_SERIES;
    }

    /** Discovers available Live-TV channel lists across the known device series. */
    async function discoverTvLists(ip: string, port: string | number): Promise<DiscoveryResult> {
        let lastError: Error | null = null;

        for (const target of DISCOVERY_TARGETS) {
            try {
                const didl = await browseUpnp(ip, port, target.parentObj, target.path);
                const lists = parseContainerList(didl);
                if (lists.length > 0) {
                    const deviceType = target.type === 'S_SERIES' ? detectSSeriesGeneration(lists) : target.type;
                    return { deviceType, path: target.path, lists };
                }
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                logger.warn(`Discovery via ${target.type} failed: ${lastError.message}`);
            }
        }

        throw new Error(`No TechniSat Live-TV containers found${lastError ? ` (${lastError.message})` : '.'}`);
    }

    /** Reads channels from the receiver. Never mutates application state. */
    async function fetchChannels({
        ip,
        port,
        selectedListName,
    }: {
        ip: string;
        port: string | number;
        selectedListName: string;
    }): Promise<FetchResult> {
        const discovery = await discoverTvLists(ip, port);

        const targetList = discovery.lists.find((list) => list.title === selectedListName) ?? discovery.lists[0];
        if (!targetList) throw new Error('No TechniSat Live-TV containers found.');
        if (targetList.title !== selectedListName) {
            logger.warn(`List "${selectedListName}" not found, falling back to "${targetList.title}".`);
        }

        const didl = await browseUpnp(ip, port, targetList.id, discovery.path);
        const channels = parseChannelItems(didl);
        if (channels.length === 0) throw new Error('Failed to parse channel items.');

        const uniqueNames = new Set(channels.map((channel) => channel.name));
        if (uniqueNames.size !== channels.length) {
            logger.warn(
                `${channels.length - uniqueNames.size} duplicate channel name(s) detected - they share one mapping entry.`,
            );
        }

        // Only containers that actually hold channels are selectable TV lists;
        // empty folders (Alle Videos, Datum, Verzeichnis, ...) are hidden from
        // the UI. Fall back to all containers when none reports a child count.
        const tvLists = discovery.lists.filter((list) => (list.childCount || 0) > 0);
        const availableLists = (tvLists.length ? tvLists : discovery.lists).map((list) => list.title);

        logger.info(`${channels.length} channels loaded from list "${targetList.title}".`);
        return {
            channels,
            selectedListName: targetList.title,
            availableLists,
            detectedModel: discovery.deviceType,
        };
    }

    return {
        fetchChannels,
        browseUpnp,
        discoverTvLists,
        close: () => upnpAgent.destroy(),
    };
}

export {
    asArray,
    createSoapReceiver,
    DISCOVERY_TARGETS,
    DiscoveryType,
    escapeXml,
    parseChannelItems,
    parseContainerList,
    xmlText,
};
export type Receiver = ReturnType<typeof createSoapReceiver>;
