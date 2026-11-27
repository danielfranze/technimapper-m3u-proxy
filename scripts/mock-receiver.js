// Minimal TechniSat SOAP mock for E2E tests.
// Serves a discovery (TV-Liste) and a channel list on /ContentDirectory/Control.
import http from 'node:http';

const port = parseInt(process.env.MOCK_RECEIVER_PORT || '9199', 10);

const discovery = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <Result>&lt;DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"&gt;&lt;container id="3$536870992" parentID="3" restricted="1" childCount="2" searchable="1"&gt;&lt;dc:title&gt;TV-Liste&lt;/dc:title&gt;&lt;upnp:class&gt;object.container.videoContainer&lt;/upnp:class&gt;&lt;/container&gt;&lt;/DIDL-Lite&gt;</Result>
    <NumberReturned>1</NumberReturned><TotalMatches>1</TotalMatches><UpdateID>1</UpdateID>
  </u:BrowseResponse></s:Body></s:Envelope>`;

const list = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <Result>&lt;DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"&gt;&lt;item id="3$536870992$1" parentID="3$536870992" restricted="1"&gt;&lt;dc:title&gt;Das Erste HD&lt;/dc:title&gt;&lt;res protocolInfo="http-get:*:video/mpeg:*"&gt;http://127.0.0.1:${port}/stream/1&lt;/res&gt;&lt;upnp:class&gt;object.item.videoItem.videoBroadcast&lt;/upnp:class&gt;&lt;/item&gt;&lt;item id="3$536870992$2" parentID="3$536870992" restricted="1"&gt;&lt;dc:title&gt;ZDF HD&lt;/dc:title&gt;&lt;res protocolInfo="http-get:*:video/mpeg:*"&gt;http://127.0.0.1:${port}/stream/2&lt;/res&gt;&lt;upnp:class&gt;object.item.videoItem.videoBroadcast&lt;/upnp:class&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</Result>
    <NumberReturned>2</NumberReturned><TotalMatches>2</TotalMatches><UpdateID>1</UpdateID>
  </u:BrowseResponse></s:Body></s:Envelope>`;

const server = http.createServer((req, res) => {
    console.log('mock-receiver request:', req.method, req.url);
    if (req.url?.includes('/dev0/srv1/control')) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }
    // Read body to determine which response to send.
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        const isDiscovery = /<ObjectID>3<\/ObjectID>/.test(body) || /<ObjectID>0\$3\$41<\/ObjectID>/.test(body);
        const resp = isDiscovery ? discovery : list;
        res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
        res.end(resp);
    });
});
server.listen(port, '127.0.0.1', () => {
    console.log('Mock receiver listening on', port);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
