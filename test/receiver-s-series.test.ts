'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import {  createSoapReceiver, escapeXml  } from '../dist/lib/receiver.js';

const quietLogger = { info() {}, warn() {}, error() {} };

function startServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, port: (server.address() as { port: number }).port });
        });
        server.on('error', reject);
    });
}

function stopServer(server: http.Server): Promise<void> {
    return new Promise(resolve => { if (typeof server.closeAllConnections === "function") server.closeAllConnections(); server.close(() => resolve()); });
}

function soapResponse(resultInner: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <Result>${escapeXml(resultInner)}</Result>
    <NumberReturned>2</NumberReturned>
    <TotalMatches>2</TotalMatches>
    <UpdateID>1</UpdateID>
  </u:BrowseResponse></s:Body>
</s:Envelope>`;
}

// S2 discovery capture: 5 containers, no "Astra-TV-Liste".
const s2DiscoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <container id="3$536870962" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Alle Videos</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$52" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Datum</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
  <container id="3$536871012" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Eigene TV-Aufnahmen</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$536870992" parentID="3" restricted="1" childCount="1309" searchable="1">
    <dc:title>TV-Liste</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$51" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Verzeichnis</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
</DIDL-Lite>`;

const s2ListInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="3$536870992$2355389541" parentID="3$536870992" restricted="1">
    <dc:title>Das Erste HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.29:9100/livevideo/video/Lidx4/Pidx112/Das_Erste_HD.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
  <item id="3$536870992$2355389542" parentID="3$536870992" restricted="1">
    <dc:title>ZDF HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.29:9100/livevideo/video/Lidx4/Pidx76/ZDF_HD.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
</DIDL-Lite>`;

test('S2 SOAP flow is detected as S2', async () => {
    let calls = 0;
    const { server, port } = await startServer((req, res) => {
        req.resume();
        req.on('end', () => {
            // STC path does not exist on S-series devices.
            if (req.url === '/dev0/srv1/control') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html');
                res.end('<html><body>Not Found</body></html>');
                return;
            }
            calls++;
            const body = calls === 1 ? soapResponse(s2DiscoveryInner) : soapResponse(s2ListInner);
            res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
            res.end(body);
        });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64 * 1024, logger: quietLogger });
        const result = await receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' });
        receiver.close();

        assert.equal(result.detectedModel, 'S2');
        assert.equal(result.selectedListName, 'TV-Liste');
        assert.deepEqual(result.availableLists, ['TV-Liste']);
        assert.equal(result.channels.length, 2);
        assert.deepEqual(result.channels.map((channel: { name: string }) => channel.name), ['Das Erste HD', 'ZDF HD']);
    } finally {
        await stopServer(server);
    }
});

// S1 discovery: 6 containers, including extra "Astra-TV-Liste".
const s1DiscoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <container id="3$536870962" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Alle Videos</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$536870995" parentID="3" restricted="1" childCount="459" searchable="1">
    <dc:title>Astra-TV-Liste</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$52" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Datum</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
  <container id="3$536871012" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Eigene TV-Aufnahmen</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$536870992" parentID="3" restricted="1" childCount="163" searchable="1">
    <dc:title>TV-Liste</dc:title>
    <upnp:class>object.container.videoContainer</upnp:class>
  </container>
  <container id="3$51" parentID="3" restricted="1" childCount="0" searchable="1">
    <dc:title>Verzeichnis</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
</DIDL-Lite>`;

const s1ListInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="3$536870992$1" parentID="3$536870992" restricted="1">
    <dc:title>Das Erste HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.52:9100/livevideo/video/Lidx4/Pidx112/Das_Erste_HD.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
  <item id="3$536870992$2" parentID="3$536870992" restricted="1">
    <dc:title>ZDF HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.52:9100/livevideo/video/Lidx4/Pidx76/ZDF_HD.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
</DIDL-Lite>`;

test('S1 SOAP flow is detected as S1 via the Astra-TV-Liste container', async () => {
    let calls = 0;
    const { server, port } = await startServer((req, res) => {
        req.resume();
        req.on('end', () => {
            if (req.url === '/dev0/srv1/control') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html');
                res.end('<html><body>Not Found</body></html>');
                return;
            }
            calls++;
            const body = calls === 1 ? soapResponse(s1DiscoveryInner) : soapResponse(s1ListInner);
            res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
            res.end(body);
        });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64 * 1024, logger: quietLogger });
        const result = await receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' });
        receiver.close();

        assert.equal(result.detectedModel, 'S1');
        assert.equal(result.selectedListName, 'TV-Liste');
        assert.equal(result.channels.length, 2);
        assert.deepEqual(result.channels.map((channel: { name: string }) => channel.name), ['Das Erste HD', 'ZDF HD']);
        assert.deepEqual(result.availableLists, ['Astra-TV-Liste', 'TV-Liste']);
    } finally {
        await stopServer(server);
    }
});

// Generic S-series fallback: container structure matches neither S1 nor S2.
const genericDiscoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <container id="3$1" parentID="3" restricted="1" childCount="2" searchable="1">
    <dc:title>Foo</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
</DIDL-Lite>`;

const genericListInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="3$1$1" parentID="3$1" restricted="1">
    <dc:title>Channel One</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.77:9100/livevideo/a.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
</DIDL-Lite>`;

test('an unknown S-series container structure falls back to S_SERIES', async () => {
    let calls = 0;
    const { server, port } = await startServer((req, res) => {
        req.resume();
        req.on('end', () => {
            if (req.url === '/dev0/srv1/control') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html');
                res.end('<html><body>Not Found</body></html>');
                return;
            }
            calls++;
            const body = calls === 1 ? soapResponse(genericDiscoveryInner) : soapResponse(genericListInner);
            res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
            res.end(body);
        });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64 * 1024, logger: quietLogger });
        const result = await receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'Foo' });
        receiver.close();

        assert.equal(result.detectedModel, 'S_SERIES');
        assert.equal(result.channels.length, 1);
    } finally {
        await stopServer(server);
    }
});
