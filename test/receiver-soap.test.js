'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createSoapReceiver, escapeXml } = require('../lib/receiver');

const quietLogger = { info() {}, warn() {}, error() {} };

function startServer(handler) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, port: server.address().port });
        });
        server.on('error', reject);
    });
}

function stopServer(server) {
    return new Promise(resolve => { if (typeof server.closeAllConnections === "function") server.closeAllConnections(); server.close(resolve); });
}

function soapResponse(resultInner) {
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

const discoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <container id="0$3$41$47" parentID="0$3$41" restricted="1" childCount="316" searchable="1">
    <dc:title>Astra-TV-Liste</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
  <container id="0$3$41$48" parentID="0$3$41" restricted="1" childCount="44" searchable="1">
    <dc:title>TV-Liste</dc:title>
    <upnp:class>object.container</upnp:class>
  </container>
</DIDL-Lite>`;

const listInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="0$3$41$47R268" parentID="0$3$41$47" restricted="1">
    <dc:title>001 Das Erste HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.230:9100/disk/NON-DLNA-OP01-FLAGS8d100000/O0I268.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
  <item id="0$3$41$47R524" parentID="0$3$41$47" restricted="1">
    <dc:title>002 ZDF HD</dc:title>
    <res protocolInfo="http-get:*:video/mpeg:*">http://192.168.178.230:9100/disk/NON-DLNA-OP01-FLAGS8d100000/O0I524.ts</res>
    <upnp:class>object.item.videoItem.videoBroadcast</upnp:class>
  </item>
</DIDL-Lite>`;

test('STC SOAP flow returns channels from a mock receiver', async () => {
    let calls = 0;
    const { server, port } = await startServer((req, res) => {
        calls++;
        req.resume();
        req.on('end', () => {
            const body = calls === 1 ? soapResponse(discoveryInner) : soapResponse(listInner);
            res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
            res.end(body);
        });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64 * 1024, logger: quietLogger });
        const result = await receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' });
        receiver.close();

        assert.equal(result.selectedListName, 'TV-Liste');
        assert.deepEqual(result.availableLists, ['Astra-TV-Liste', 'TV-Liste']);
        assert.equal(result.detectedModel, 'STC');
        assert.equal(result.channels.length, 2);
        assert.deepEqual(result.channels.map(channel => channel.name), ['001 Das Erste HD', '002 ZDF HD']);
        assert.match(result.channels[0].url, /O0I268\.ts$/);
    } finally {
        await stopServer(server);
    }
});

test('SOAP receiver reports an HTTP error from the receiver', async () => {
    const { server, port } = await startServer((req, res) => {
        req.resume();
        req.on('end', () => { res.statusCode = 500; res.end('boom'); });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64 * 1024, logger: quietLogger });
        await assert.rejects(
            receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' }),
            /UPnP request failed with HTTP 500/
        );
        receiver.close();
    } finally {
        await stopServer(server);
    }
});

test('SOAP receiver rejects an oversized response', async () => {
    const { server, port } = await startServer((req, res) => {
        req.resume();
        req.on('end', () => {
            res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
            res.end('x'.repeat(200));
        });
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 1000, maxResponseBytes: 64, logger: quietLogger });
        await assert.rejects(
            receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' }),
            /UPnP response too large/
        );
        receiver.close();
    } finally {
        await stopServer(server);
    }
});

test('SOAP receiver reports a timeout', async () => {
    const { server, port } = await startServer((req, res) => {
        req.resume();
        // Never answer; the client must time out.
    });

    try {
        const receiver = createSoapReceiver({ requestTimeoutMs: 200, maxResponseBytes: 64 * 1024, logger: quietLogger });
        await assert.rejects(
            receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'TV-Liste' }),
            /timed out|exceeded total deadline/
        );
        receiver.close();
    } finally {
        await stopServer(server);
    }
});
