'use strict';

/**
 * UPnP/SOAP adapter for TechniSat receivers.
 *
 * This is the only module that knows about SOAP, DIDL-Lite and the two device
 * series (STC and S-series). Everything above it works with plain channel
 * objects, which makes the sync flow testable with a fake receiver.
 */

const http = require('http');
const xml2js = require('xml2js');
const { STREAM_URL_REGEX } = require('./m3u8');

const SOAP_ACTION = '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"';

const DISCOVERY_TARGETS = Object.freeze([
    { type: 'STC', parentObj: '0$3$41', path: '/dev0/srv1/control' },
    { type: 'S_SERIES', parentObj: '3', path: '/ContentDirectory/Control' }
]);

function escapeXml(str) {
    return String(str).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

/** xml2js returns either a string or { _: text, $: attrs }. */
function xmlText(value) {
    if (Array.isArray(value)) value = value[0];
    if (value && typeof value === 'object') value = value._;
    return typeof value === 'string' ? value : undefined;
}

function asArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

/** Extracts the DIDL-Lite containers (channel lists) from a Browse response. */
function parseContainerList(didl) {
    return asArray(didl && didl.container)
        .map(container => ({
            id: container?.['$']?.id || container?.id,
            title: xmlText(container?.['dc:title']),
            childCount: parseInt(container?.['$']?.childCount, 10) || 0
        }))
        .filter(list => list.id && list.title);
}

/** Extracts playable channel items from a DIDL-Lite payload. */
function parseChannelItems(didl) {
    return asArray(didl && didl.item)
        .map(item => ({ name: xmlText(item?.['dc:title']), url: xmlText(item?.['res']) }))
        .filter(channel => channel.name && channel.url && STREAM_URL_REGEX.test(channel.url.trim()))
        .map(channel => ({ name: channel.name.trim(), url: channel.url.trim() }));
}

/**
 * @param {{ requestTimeoutMs?: number, maxResponseBytes?: number, logger?: object, agent?: http.Agent }} [options]
 */
function createSoapReceiver({ requestTimeoutMs = 5000, maxResponseBytes = 2 * 1024 * 1024, logger = console, agent } = {}) {
    // Keep-alive is intentionally disabled: several TechniSat receivers (notably
    // the S-series) answer the first (often failing) request with
    // "Connection: keep-alive" but do not correctly handle a second request on
    // the reused socket, returning HTTP 412. A fresh connection per request is
    // a few milliseconds slower but reliable across all receiver generations.
    const upnpAgent = agent || new http.Agent({ keepAlive: false });

    function postSoap(ip, port, pathEndpoint, soapEnvelope) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let totalTimer = null;

            const finish = (err, value) => {
                if (settled) return;
                settled = true;
                if (totalTimer) clearTimeout(totalTimer);
                if (err) reject(err);
                else resolve(value);
            };

            const req = http.request({
                hostname: ip,
                port: parseInt(port, 10),
                path: pathEndpoint,
                method: 'POST',
                agent: upnpAgent,
                headers: {
                    'Content-Type': 'text/xml; charset="utf-8"',
                    SOAPACTION: SOAP_ACTION,
                    'Content-Length': Buffer.byteLength(soapEnvelope),
                    'Connection': 'close'
                }
            }, (res) => {
                const chunks = [];
                let size = 0;

                res.on('data', (chunk) => {
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
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        finish(new Error(`UPnP request failed with HTTP ${res.statusCode}`));
                        return;
                    }
                    finish(null, Buffer.concat(chunks).toString('utf8'));
                });

                res.on('error', err => finish(err));
            });

            // Idle timeout + hard overall deadline.
            req.setTimeout(requestTimeoutMs, () => req.destroy(new Error('UPnP request timed out')));
            totalTimer = setTimeout(() => req.destroy(new Error('UPnP request exceeded total deadline')), requestTimeoutMs * 3);
            req.on('error', err => finish(err));
            req.write(soapEnvelope);
            req.end();
        });
    }

    async function browseUpnp(ip, port, objectId, pathEndpoint) {
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <ObjectID>${escapeXml(objectId)}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
    <Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount>
  </u:Browse></s:Body>
</s:Envelope>`;

        const body = await postSoap(ip, port, pathEndpoint, soapEnvelope);
        const result = await xml2js.parseStringPromise(body, { explicitArray: false });
        const resultXml = xmlText(result?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result']);
        if (!resultXml) throw new Error('UPnP SOAP Browse response invalid');

        const browse = await xml2js.parseStringPromise(resultXml, { explicitArray: false });
        if (!browse?.['DIDL-Lite']) throw new Error('Invalid DIDL-Lite payload');
        return browse['DIDL-Lite'];
    }

    /**
 * Best-effort generation detection for S-series receivers.
 *
 * There is no device description endpoint on these receivers, so the container
 * structure found during discovery is used as a fingerprint:
 *   - S1 exposes an extra "Astra-TV-Liste" container.
 *   - S2 exposes exactly 5 containers (Alle Videos, Datum, Eigene TV-Aufnahmen,
 *     TV-Liste, Verzeichnis) without "Astra-TV-Liste".
 *   - Anything else stays generic ("S_SERIES") until a capture is available
 *     (e.g. the original S series).
 * @param {{ id: string, title: string }[]} lists
 * @returns {'S1'|'S2'|'S_SERIES'}
 */
function detectSSeriesGeneration(lists) {
    const titles = new Set(lists.map(list => list.title));
    if (titles.has('Astra-TV-Liste')) return 'S1';
    if (titles.has('TV-Liste') && lists.length === 5
        && titles.has('Alle Videos') && titles.has('Datum')
        && titles.has('Eigene TV-Aufnahmen') && titles.has('Verzeichnis')) return 'S2';
    return 'S_SERIES';
}

/** Discovers available Live-TV channel lists across the known device series. */
    async function discoverTvLists(ip, port) {
        let lastError = null;

        for (const target of DISCOVERY_TARGETS) {
            try {
                const didl = await browseUpnp(ip, port, target.parentObj, target.path);
                const lists = parseContainerList(didl);
                if (lists.length > 0) {
                const deviceType = target.type === 'S_SERIES'
                    ? detectSSeriesGeneration(lists)
                    : target.type;
                return { deviceType, path: target.path, lists };
            }
            } catch (err) {
                lastError = err;
                logger.warn(`Discovery via ${target.type} failed: ${err.message}`);
            }
        }

        throw new Error('No TechniSat Live-TV containers found' + (lastError ? ` (${lastError.message})` : '.'));
    }

    /** Reads channels from the receiver. Never mutates application state. */
    async function fetchChannels({ ip, port, selectedListName }) {
        const discovery = await discoverTvLists(ip, port);

        let targetList = discovery.lists.find(list => list.title === selectedListName);
        if (!targetList) {
            targetList = discovery.lists[0];
            logger.warn(`List "${selectedListName}" not found, falling back to "${targetList.title}".`);
        }
        if (!targetList) throw new Error('No TechniSat Live-TV containers found.');

        const didl = await browseUpnp(ip, port, targetList.id, discovery.path);
        const channels = parseChannelItems(didl);
        if (channels.length === 0) throw new Error('Failed to parse channel items.');

        const uniqueNames = new Set(channels.map(channel => channel.name));
        if (uniqueNames.size !== channels.length) {
            logger.warn(`${channels.length - uniqueNames.size} duplicate channel name(s) detected - they share one mapping entry.`);
        }

        // Only containers that actually hold channels are selectable TV lists;
        // empty folders (Alle Videos, Datum, Verzeichnis, ...) are hidden from
        // the UI. Fall back to all containers when none reports a child count.
        const tvLists = discovery.lists.filter(list => (list.childCount || 0) > 0);
        const availableLists = (tvLists.length ? tvLists : discovery.lists).map(list => list.title);

        logger.info(`${channels.length} channels loaded from list "${targetList.title}".`);
        return {
            channels,
            selectedListName: targetList.title,
            availableLists,
            detectedModel: discovery.deviceType
        };
    }

    return {
        fetchChannels,
        browseUpnp,
        discoverTvLists,
        close: () => upnpAgent.destroy()
    };
}

module.exports = {
    DISCOVERY_TARGETS,
    escapeXml,
    xmlText,
    asArray,
    parseContainerList,
    parseChannelItems,
    createSoapReceiver
};
