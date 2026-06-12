const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xml2js = require('xml2js');
const cron = require('node-cron');

const app = express();
const APP_VERSION = "1.0.0";
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure the data directory exists
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

// Load configuration from disk
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
        console.error(`[Storage Error] Failed to read mapping.json:`, 
            err.message);
    }
}

// Persist configuration to disk
function saveConfigToDisk() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 
            'utf8');
        console.log(`[Storage] Configuration flushed to disk.`);
    } catch (err) {
        console.error(`[Storage Error] Failed to write mapping.json:`, 
            err.message);
    }
}

// Attempt to detect the receiver model by probing known endpoints
async function detectModel(ip, port) {
    const testTargets = [
        { type: 'STC', obj: '0$3$41$48', path: '/dev0/srv1/control' },
        { type: 'S_SERIES', obj: '3$536870992', path: '/ContentDirectory/Control' }
    ];

    for (const target of testTargets) {
        try {
            console.log(`[Detection] Testing ${target.type} at ${target.path}...`);
            await performSoapRequest(ip, port, target.obj, target.path);
            
            appConfig.deviceType = target.type;
            appConfig.currentObj = target.obj;
            appConfig.currentPath = target.path;
            return target.type;
        } catch (e) {
            continue;
        }
    }
    throw new Error("No supported TechniSat receiver detected.");
}

// Centralized SOAP request logic
function performSoapRequest(ip, port, objectId, path) {
    return new Promise((resolve, reject) => {
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
            <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
            <ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
            <Filter>*</Filter><StartingIndex>0</StartingIndex>
            <RequestedCount>10</RequestedCount></u:Browse></s:Body>
        </s:Envelope>`;
        
        const req = http.request({ 
            hostname: ip, port: port, path: path, method: 'POST', 
            headers: { 
                'Content-Type': 'text/xml', 
                'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"', 
                'Content-Length': Buffer.byteLength(soapEnvelope) 
            }, 
            timeout: 5000 
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                if (data.includes('<s:Envelope')) {
                    resolve(data);
                } else {
                    reject();
                }
            });
        });
        req.on('error', reject);
        req.write(soapEnvelope);
        req.end();
    });
}

// Fetch channel list from TechniSat receiver
async function fetchFromTechniSat() {
    const model = { obj: appConfig.currentObj, path: appConfig.currentPath };
    const channels = await performRequest(model);
    
    if (channels.length > 0) {
        lastSync = new Date().toLocaleString();
        console.log(`[Success] ${channels.length} channels loaded.`);
        return channels;
    }
    throw new Error('Failed to parse channel list.');
}

// Helper to encapsulate SOAP request and XML parsing
function performRequest(model) {
    return new Promise((resolve, reject) => {
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Body>
            <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
              <ObjectID>${model.obj}</ObjectID>
              <BrowseFlag>BrowseDirectChildren</BrowseFlag>
              <Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount>
            </u:Browse>
          </s:Body>
        </s:Envelope>`;

        const options = {
            hostname: appConfig.ip,
            port: parseInt(appConfig.port),
            path: model.path,
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
                'Content-Length': Buffer.byteLength(soapEnvelope)
            },
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                xml2js.parseString(data, { explicitArray: false }, (err, result) => {
                    const resXml = result?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'];
                    if (err || !resXml) return reject();
                    
                    xml2js.parseString(resXml, { explicitArray: false }, (err2, bRes) => {
                        if (err2 || !bRes?.['DIDL-Lite']?.['item']) return reject();
                        
                        const items = Array.isArray(bRes['DIDL-Lite']['item']) ? 
                            bRes['DIDL-Lite']['item'] : [bRes['DIDL-Lite']['item']];
                        
                        const channels = items.filter(i => i['dc:title'] && i['res']).map(i => ({ 
                            name: i['dc:title'], 
                            url: typeof i['res'] === 'object' ? i['res']._ : i['res'] 
                        }));
                        resolve(channels);
                    });
                });
            });
        });
        req.on('error', reject);
        req.write(soapEnvelope);
        req.end();
    });
}

// Generate M3U playlist file content
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

// Schedule background synchronization
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

// API endpoint to get current configuration
app.get('/api/get-config', (req, res) => {
    res.json({
        version: APP_VERSION,
        ip: appConfig.ip,
        port: appConfig.port,
        cronExpression: appConfig.cronExpression,
        lastSync: lastSync
    });
});

// API endpoint to trigger channel fetching
app.post('/api/fetch-channels', async (req, res) => {
    const { ip, port, cronExpression } = req.body;
    
    appConfig.ip = ip; 
    appConfig.port = port; 
    appConfig.cronExpression = cronExpression;
    appConfig.deviceType = null;
    appConfig.currentObj = null;
    appConfig.currentPath = null;
    
    try {
        const model = await detectModel(ip, port);
        appConfig.channels = await fetchFromTechniSat();
        
        generateM3u();
        saveConfigToDisk();
        startBackgroundCron();
        
        res.json({ 
            channels: appConfig.channels.map(c => c.name), 
            mapping: appConfig.mapping,
            detectedModel: model === 'STC' ? 'DIGIT ISIO STC' : 'DIGIT ISIO S/S1/S2' 
        });
    } catch (err) { 
        res.status(500).json({ error: err.message || "Unknown error" }); 
    }
});

// API endpoint to save user channel mapping
app.post('/api/save-mapping', (req, res) => {
    appConfig.mapping = req.body.mapping;
    generateM3u();
    saveConfigToDisk();
    res.json({ success: true });
});

// Endpoint to download M3U playlist
app.get('/playlist.m3u', (req, res) => {
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(cachedM3u);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    loadConfig();
});