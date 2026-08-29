const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xml2js = require('xml2js');
const cron = require('node-cron');

const app = express();
const APP_VERSION = "1.1.0";
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
    selectedListName: 'TV-Liste', // Standard auf deine Favoritenliste
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

// Generische SOAP Browse Funktion
function browseUpnp(ip, port, objectId, path) {
    return new Promise((resolve, reject) => {
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
            <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
            <ObjectID>${objectId}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
            <Filter>*</Filter><StartingIndex>0</StartingIndex>
            <RequestedCount>0</RequestedCount></u:Browse></s:Body>
        </s:Envelope>`;

        const req = http.request({
            hostname: ip, port: parseInt(port), path: path, method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
                'Content-Length': Buffer.byteLength(soapEnvelope)
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                xml2js.parseString(data, { explicitArray: false }, (err, result) => {
                    const resXml = result?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'];
                    if (err || !resXml) return reject(new Error('UPnP SOAP Browse response invalid'));

                    xml2js.parseString(resXml, { explicitArray: false }, (err2, bRes) => {
                        if (err2 || !bRes?.['DIDL-Lite']) return reject(new Error('Invalid DIDL-Lite payload'));
                        resolve(bRes['DIDL-Lite']);
                    });
                });
            });
        });
        req.on('error', reject);
        req.write(soapEnvelope);
        req.end();
    });
}

// Hilfsfunktion zum Erkennen aller verfügbaren Live-TV Listen
async function discoverTvLists(ip, port) {
    const testTargets = [
        { type: 'STC', parentObj: '0$3$41', path: '/dev0/srv1/control' },
        { type: 'S_SERIES', parentObj: '3', path: '/ContentDirectory/Control' }
    ];

    for (const target of testTargets) {
        try {
            const didl = await browseUpnp(ip, port, target.parentObj, target.path);
            const containers = didl.container ? (Array.isArray(didl.container) ? didl.container : [didl.container]) : [];
            
            if (containers.length > 0) {
                const lists = containers.map(c => ({
                    id: c['$']?.id || c.id,
                    title: c['dc:title']
                }));
                return { deviceType: target.type, path: target.path, lists };
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error("No TechniSat Live-TV containers found.");
}

// Senderliste der ausgewählten Liste laden
async function fetchFromTechniSat() {
    const discovery = await discoverTvLists(appConfig.ip, appConfig.port);
    
    // Nach der vom User gewünschten Liste suchen (z.B. "TV-Liste")
    let targetList = discovery.lists.find(l => l.title === appConfig.selectedListName);
    
    // Fallback: Falls der Name nicht gefunden wird, nimm die erste Liste
    if (!targetList && discovery.lists.length > 0) {
        targetList = discovery.lists[0];
        appConfig.selectedListName = targetList.title;
    }

    if (!targetList) throw new Error(`List "${appConfig.selectedListName}" not found on receiver.`);

    appConfig.currentObj = targetList.id;
    appConfig.currentPath = discovery.path;

    const didl = await browseUpnp(appConfig.ip, appConfig.port, targetList.id, discovery.path);
    const items = didl.item ? (Array.isArray(didl.item) ? didl.item : [didl.item]) : [];

    const channels = items.filter(i => i['dc:title'] && i['res']).map(i => ({
        name: i['dc:title'],
        url: typeof i['res'] === 'object' ? i['res']._ : i['res']
    }));

    if (channels.length > 0) {
        lastSync = new Date().toLocaleString();
        console.log(`[Success] ${channels.length} channels loaded from list "${targetList.title}".`);
        return { channels, availableLists: discovery.lists.map(l => l.title), detectedModel: discovery.deviceType };
    }
    throw new Error('Failed to parse channel items.');
}

function generateM3u() {
    let m3u = `#EXTM3U\n`;
    appConfig.channels.forEach(ch => {
        const rawId = appConfig.mapping[ch.name];
        if (rawId) {
            const id = String(rawId);
            const url = typeof ch.url === 'object' ? (ch.url._ || ch.url) : ch.url;
            const chNo = id.replace('ts-ch', '');
            m3u += `#EXTINF:-1 tvg-id="${id}" tvg-name="${ch.name}" tvg-chno="${chNo}" ` +
                   `cuid="${id}" group-title="TechniSat",${ch.name}\n${url}\n`;
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
            const result = await fetchFromTechniSat();
            appConfig.channels = result.channels;
            generateM3u();
            saveConfigToDisk();
        } catch (err) { console.error(err.message); }
    });
}

app.get('/api/get-config', (req, res) => {
    res.json({
        version: APP_VERSION,
        ip: appConfig.ip,
        port: appConfig.port,
        cronExpression: appConfig.cronExpression,
        selectedListName: appConfig.selectedListName,
        lastSync: lastSync
    });
});

app.post('/api/fetch-channels', async (req, res) => {
    const { ip, port, cronExpression, selectedListName } = req.body;

    appConfig.ip = ip;
    appConfig.port = port;
    appConfig.cronExpression = cronExpression;
    if (selectedListName) appConfig.selectedListName = selectedListName;

    try {
        const result = await fetchFromTechniSat();
        appConfig.channels = result.channels;

        generateM3u();
        saveConfigToDisk();
        startBackgroundCron();

        res.json({
            channels: appConfig.channels.map(c => c.name),
            availableLists: result.availableLists,
            selectedListName: appConfig.selectedListName,
            mapping: appConfig.mapping,
            detectedModel: result.detectedModel === 'STC' ? 'DIGIT ISIO STC' : 'DIGIT ISIO S/S1/S2'
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Unknown error" });
    }
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