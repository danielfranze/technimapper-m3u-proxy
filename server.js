const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xml2js = require('xml2js');
const cron = require('node-cron');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CONFIG_FILE = path.join(DATA_DIR, 'mapping.json');

let appConfig = {
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: '*/60 * * * *',
    mapping: {},
    channels: []
};

let cachedM3u = '';
let lastSync = 'Never';
let cronTask = null;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            appConfig = { ...appConfig, ...parsed };
            console.log(`[Storage] Configuration loaded.`);
            generateM3u();
            startBackgroundCron();
        }
    } catch (err) {
        console.error(`[Storage Error] Failed to read mapping.json:`, err.message);
    }
}

function saveConfigToDisk() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
        console.log(`[Storage] Configuration flushed to disk.`);
    } catch (err) {
        console.error(`[Storage Error] Failed to write mapping.json:`, err.message);
    }
}

async function fetchFromTechniSat() {
    return new Promise((resolve, reject) => {
        const soapEnvelope =
            `<?xml version="1.0" encoding="utf-8"?>` +
            `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
            `  <s:Body>` +
            `    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">` +
            `      <ObjectID>0$3$41$48</ObjectID>` +
            `      <BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
            `      <Filter>*</Filter>` +
            `      <StartingIndex>0</StartingIndex>` +
            `      <RequestedCount>0</RequestedCount>` +
            `      <SortCriteria></SortCriteria>` +
            `    </u:Browse>` +
            `  </s:Body>` +
            `</s:Envelope>`;

        const options = {
            hostname: appConfig.ip,
            port: parseInt(appConfig.port),
            path: '/dev0/srv1/control',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
                'Content-Length': Buffer.byteLength(soapEnvelope)
            },
            timeout: 8000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                xml2js.parseString(data, { explicitArray: false }, (err, result) => {
                    if (err) return reject(new Error('Failed to parse XML'));
                    try {
                        const resultXml = result['s:Envelope']['s:Body']['u:BrowseResponse']['Result'];
                        xml2js.parseString(resultXml, { explicitArray: false }, (err2, browseResult) => {
                            const items = browseResult['DIDL-Lite']['item'];
                            const itemList = Array.isArray(items) ? items : [items];
                            const freshChannels = [];
                            itemList.forEach(item => {
                                const url = typeof item['res'] === 'object' ? item['res']._ : item['res'];
                                if (item['dc:title'] && url) {
                                    freshChannels.push({ name: item['dc:title'], url: url });
                                }
                            });
                            lastSync = new Date().toLocaleString();
                            resolve(freshChannels);
                        });
                    } catch (ex) { reject(ex); }
                });
            });
        });
        req.on('error', reject);
        req.write(soapEnvelope);
        req.end();
    });
}

function generateM3u() {
    let m3u = `#EXTM3U
`;
    appConfig.channels.forEach(ch => {
        const rawId = appConfig.mapping[ch.name];
        if (rawId) {
            const assignedId = String(rawId);
            const streamUrl = typeof ch.url === 'object' ? (ch.url._ || ch.url) : ch.url;
            const chNo = assignedId.replace('ts-ch', '');
            m3u += `#EXTINF:-1 tvg-id="${assignedId}" tvg-name="${ch.name}" tvg-chno="${chNo}" cuid="${assignedId}" group-title="TechniSat",${ch.name}
`;
            m3u += `${streamUrl}
`;
        }
    });
    cachedM3u = m3u;
}

function startBackgroundCron() {
    if (cronTask) cronTask.stop();
    const pattern = appConfig.cronExpression || '*/60 * * * *';
    if (!cron.validate(pattern)) return;

    cronTask = cron.schedule(pattern, async () => {
        try {
            appConfig.channels = await fetchFromTechniSat();
            generateM3u();
            saveConfigToDisk();
        } catch (err) { console.error(err.message); }
    });
}

app.get('/api/get-config', (req, res) => {
    res.json({
        ip: appConfig.ip,
        port: appConfig.port,
        cronExpression: appConfig.cronExpression,
        lastSync: lastSync
    });
});

app.post('/api/fetch-channels', async (req, res) => {
    const { ip, port, cronExpression } = req.body;
    appConfig.ip = ip; appConfig.port = port; appConfig.cronExpression = cronExpression;
    try {
        appConfig.channels = await fetchFromTechniSat();
        generateM3u();
        saveConfigToDisk();
        startBackgroundCron();
        res.json({ channels: appConfig.channels.map(c => c.name), mapping: appConfig.mapping });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/save-mapping', (req, res) => {
    appConfig.mapping = req.body.mapping;
    generateM3u();
    saveConfigToDisk();
    res.json({ success: true });
});

app.get('/playlist.m3u', (req, res) => {
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(cachedM3u);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    loadConfig();
});
