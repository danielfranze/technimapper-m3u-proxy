import http from 'http';

const ip = process.argv[2];
const port = process.argv[3] || '9100';
const objectId = process.argv[4] || '3$536870962';
const reqCount = process.argv[5] || '0';
if (!ip) {
    console.error('Usage: node probe-count.js <ip> [port] [objectId] [requestedCount]');
    process.exit(2);
}

function postSoap(path, envelope) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: ip,
                port: parseInt(port, 10),
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset="utf-8"',
                    SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
                    'Content-Length': Buffer.byteLength(envelope),
                    Connection: 'close',
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            },
        );
        req.on('error', reject);
        req.write(envelope);
        req.end();
    });
}

(async () => {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
<ObjectID>${objectId}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
<Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>${reqCount}</RequestedCount>
</u:Browse></s:Body></s:Envelope>`;
    const r = await postSoap('/ContentDirectory/Control', envelope);
    console.log('HTTP', r.status);
    console.log(r.body.slice(0, 2000));
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
