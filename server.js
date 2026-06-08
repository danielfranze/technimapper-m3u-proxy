const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xml2js = require('xml2js');
const cron = require('node-cron'); // Added node-cron engine

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure target data directory exists for secure Docker volume mounting
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CONFIG_FILE = path.join(DATA_DIR, 'mapping.json');

// Global volatile application memory state (RAM cache)
let appConfig = {
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: '*/60 * * * *', // Default standard cron pattern
    mapping: {},
    channels: []
};

let cachedM3u = '';
let cronTask = null; // Holds node-cron task reference

// Helper: Read storage layer
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            appConfig = { ...appConfig, ...parsed };
            console.log(`[Storage] Configuration successfully loaded from storage.`);
            generateM3u();
            startBackgroundCron();
        } else {
            console.log(`[Storage] No existing configuration found. Initializing defaults.`);
        }
    } catch (err) {
        console.error(`[Storage Error] Failed to read mapping.json:`, err.message);
    }
}

// Helper: Write storage layer
function saveConfigToDisk() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
        console.log(`[Storage] Configuration successfully flushed to disk storage.`);
    } catch (err) {
        console.error(`[Storage Error] Failed to write mapping.json:`, err.message);
    }
}

// UPnP Network Core: Fetch streams from TechniSat Receiver
async function fetchFromTechniSat() {
    return new Promise((resolve, reject) => {
        console.log(`[UPnP Engine] Querying TechniSat device directory at http://${appConfig.ip}:${appConfig.port}/ ...`);
        
        const soapEnvelope = 
            `<?xml version="1.0" encoding="utf-8"?>` +
            `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
            `  <s:Body>` +
            `    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">` +
            `      <ObjectID>0$3$41$48</ObjectID>` + // Verified correct target folder for Digit ISIO STC+
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
            path: '/dev0/srv1/control', // Fixed exact path for Digit ISIO STC+
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
                if (res.statusCode !== 200) {
                    return reject(new Error(`Receiver responded with invalid HTTP code ${res.statusCode}`));
                }

                xml2js.parseString(data, { explicitArray: false }, (err, result) => {
                    if (err) return reject(new Error('Failed to parse root SOAP XML wrapper.'));
                    
                    try {
                        const resultXml = result['s:Envelope']['s:Body']['u:BrowseResponse']['Result'];
                        xml2js.parseString(resultXml, { explicitArray: false }, (err2, browseResult) => {
                            if (err2) return reject(new Error('Failed to parse embedded UPnP DIDL data payload.'));

                            const items = browseResult['DIDL-Lite']['item'];
                            if (!items) return resolve([]);

                            const itemList = Array.isArray(items) ? items : [items];
                            const freshChannels = [];

                            itemList.forEach(item => {
                                const title = item['dc:title'];
                                const url = item['res'];
                                if (title && url) {
                                    freshChannels.push({ name: title, url: url });
                                }
                            });
                            resolve(freshChannels);
                        });
                    } catch (ex) {
                        reject(new Error('UPnP payload processing structural mismatch. Check receiver state.'));
                    }
                });
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Network connection timeout. Target device unreachable.'));
        });
        
        req.write(soapEnvelope);
        req.end();
    });
}

// Engine: Assemble standard M3U compilation straight into RAM cache
function generateM3u() {
    let m3u = `#EXTM3U\n`;
    let activeMappingsCount = 0;

    appConfig.channels.forEach(ch => {
        const assignedId = appConfig.mapping[ch.name];
        if (assignedId !== undefined && assignedId !== null && assignedId !== '') {
            m3u += `#EXTINF:-1 tvg-id="${assignedId}" tvg-name="${ch.name}" channel-id="${assignedId}",${ch.name}\n`;
            m3u += `${ch.url}\n`;
            activeMappingsCount++;
        }
    });

    cachedM3u = m3u;
    console.log(`[M3U Engine] Playlist rebuilt successfully in memory. (${activeMappingsCount} channels compiled).`);
}

// Background Task Coordinator: Node-Cron Implementation
function startBackgroundCron() {
    if (cronTask) {
        cronTask.stop();
        console.log(`[Cron Coordinator] Halting active background cron worker.`);
    }

    const pattern = appConfig.cronExpression || '*/60 * * * *';
    
    // Validate syntax before launching thread
    if (!cron.validate(pattern)) {
        console.error(`[Cron Coordinator Error] CRITICAL: Expression "${pattern}" is invalid! Defaulting to execution safety layer (hourly).`);
        return;
    }

    console.log(`[Cron Coordinator] Spawning cron pipeline with schedule pattern: "${pattern}"`);

    cronTask = cron.schedule(pattern, async () => {
        console.log(`[Cron Runner] Triggering scheduled expression-based background UPnP sync execution...`);
        try {
            const rawChannels = await fetchFromTechniSat();
            if (rawChannels.length > 0) {
                appConfig.channels = rawChannels;
                generateM3u();
                saveConfigToDisk();
                console.log(`[Cron Runner] Scheduled execution cycle processed successfully.`);
            } else {
                console.log(`[Cron Runner] Warning: Execution cycle returned empty channel dataset. Retaining current live cache data.`);
            }
        } catch (err) {
            console.error(`[Cron Runner Exception] Background execution script error:`, err.message);
        }
    });
}

// --- REST API Endpoints ---

// UI Config Dispatcher
app.get('/api/get-config', (req, res) => {
    res.json({
        ip: appConfig.ip,
        port: appConfig.port,
        cronExpression: appConfig.cronExpression
    });
});

// UI Event Listener: Trigger Manual Synchronization & Settings Updates
app.post('/api/fetch-channels', async (req, res) => {
    const { ip, port, cronExpression } = req.body;
    
    if (!ip || !port) return res.status(400).json({ error: 'Missing mandatory parameters: IP or Port.' });
    if (cronExpression && !cron.validate(cronExpression)) {
        return res.status(400).json({ error: 'Invalid Cron Expression syntax.' });
    }

    appConfig.ip = ip;
    appConfig.port = port;
    if (cronExpression) appConfig.cronExpression = cronExpression;

    try {
        const rawChannels = await fetchFromTechniSat();
        appConfig.channels = rawChannels;
        
        generateM3u();
        saveConfigToDisk();
        startBackgroundCron();

        res.json({
            channels: appConfig.channels.map(c => c.name),
            mapping: appConfig.mapping
        });
    } catch (err) {
        console.error(`[API Exception] Remote synchronization request aborted:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// UI Event Listener: Save Key Mappings
app.post('/api/save-mapping', (req, res) => {
    const { mapping } = req.body;
    if (!mapping) return res.status(400).json({ error: 'Payload validation failed: Missing channel mapping object.' });

    appConfig.mapping = mapping;
    generateM3u();
    saveConfigToDisk();
    res.json({ success: true });
});

// Stream Delivery: Expose Dynamic Live RAM Cache Playlist
app.get('/playlist.m3u', (req, res) => {
    console.log(`[HTTP Server] Client [${req.ip}] requested live 'playlist.m3u'. Responding straight from memory cache.`);
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
    res.send(cachedM3u);
});

// Application Initialization Entry Point
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` TechniSat Channel Control Hub - Node Server Pipeline`);
    console.log(` Service successfully listening on port: ${PORT}`);
    console.log(` Local Network Interface Endpoint: http://localhost:${PORT}`);
    console.log(`=======================================================`);
    loadConfig();
});