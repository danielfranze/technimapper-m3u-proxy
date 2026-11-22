'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createSoapReceiver, escapeXml } = require('../lib/receiver.js');

const quietLogger = { info() {}, warn() {}, error() {} };

function startServer(handler) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
        server.on('error', reject);
    });
}

function stopServer(server) {
    return new Promise(resolve => {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close(resolve);
    });
}

function soapResponse(resultInner) {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <Result>${escapeXml(resultInner)}</Result>
    <NumberReturned>1</NumberReturned><TotalMatches>1</TotalMatches><UpdateID>1</UpdateID>
  </u:BrowseResponse></s:Body>
</s:Envelope>`;
}

test('receiver falls back to the first list when the selected list is missing', async () => {
    const discoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
      <container id="0$3$41$47" parentID="0$3$41" restricted="1"><dc:title>TV-Liste</dc:title></container>
    </DIDL-Lite>`;
    const listInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
      <item id="i1" parentID="0$3$41$47" restricted="1"><dc:title>A</dc:title><res>http://192.168.1.20/a</res></item>
    </DIDL-Lite>`;

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
        const result = await receiver.fetchChannels({ ip: '127.0.0.1', port, selectedListName: 'Missing' });
        receiver.close();
        assert.equal(result.selectedListName, 'TV-Liste');
        assert.equal(result.channels.length, 1);
    } finally {
        await stopServer(server);
    }
});

test('receiver handles duplicate channel names', async () => {
    const discoveryInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
      <container id="0$3$41$47" parentID="0$3$41" restricted="1"><dc:title>TV-Liste</dc:title></container>
    </DIDL-Lite>`;
    const listInner = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
      <item id="i1" parentID="0$3$41$47" restricted="1"><dc:title>Duplicate</dc:title><res>http://192.168.1.20/a</res></item>
      <item id="i2" parentID="0$3$41$47" restricted="1"><dc:title>Duplicate</dc:title><res>http://192.168.1.20/b</res></item>
    </DIDL-Lite>`;

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
        assert.equal(result.channels.length, 2);
    } finally {
        await stopServer(server);
    }
});
