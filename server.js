/**
 * ============================================================================
 * TechniMapper - M3U Proxy & Channel Mapping Server
 * ============================================================================
 * A robust Node.js Express backend designed to interface with TechniSat 
 * receivers via UPnP/SOAP, parse live TV channel lists, and proxy them into
 * standard M3U playlist formats.
 * ============================================================================
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xml2js = require('xml2js');
const cron = require('node-cron');
const packageJson = require('./package.json');

// Initialize Express application instance
const app = express();
const APP_VERSION = packageJson.version; // Dynamic version binding from package.json
const PORT = 3000;

// Middleware configuration
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent storage configuration directory and file paths
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CONFIG_FILE = path.join(DATA_DIR, 'mapping.json');

// Core application state configuration schema
let appConfig = {
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: '*/60 * * * *',
    selectedListName: 'TV-Liste', // Default target favorites list
    mapping: {},
    channels: []
};

// Runtime cache and background worker references
let cachedM3u = '';
let lastSync = 'Never';
let cronTask = null;

/**
 * Loads configuration and channel mappings from local disk storage.
 * Automatically triggers initial M3U compilation and cron scheduling on success.
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            appConfig = { ...appConfig, ...parsed };
            console.log(`[Storage] Configuration successfully loaded from disk.`);
            generateM3u();
            startBackgroundCron();
        }
    } catch (err) {
        console.error(`[Storage Error] Failed to read mapping.json:`, err.message);
    }
}

/**
 * Flushes current application state and configuration to persistent disk storage atomically.
 * Writes to a temporary file first and renames it to prevent file corruption on crash.
 */
function saveConfigToDisk() {
    try {
        const tempFile = CONFIG_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(appConfig, null, 2), 'utf8');
        fs.renameSync(tempFile, CONFIG_FILE);
        console.log(`[Storage] Configuration flushed to disk atomically.`);
    } catch (err) {
        console.error(`[Storage Error] Failed to write mapping.json:`, err.message);
    }
}

/**
 * Executes a generic UPnP SOAP Browse request against the receiver device.
 * 
 * @param {string} ip - Receiver IP address
 * @param {string} port - UPnP control port
 * @param {string} objectId - UPnP container or object ID to browse
 * @param {string} path - SOAP endpoint path
 * @returns {Promise<Object>} Parsed DIDL-Lite response payload
 */
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

/**
 * Discovers available Live-TV channel container lists across known device series architectures.
 */
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

/**
 * Fetches stream items and channel definitions from the selected TechniSat list container.
 */
async function fetchFromTechniSat() {
    const discovery = await discoverTvLists(appConfig.ip, appConfig.port);
    
    // Attempt to match the target list name configured by the user
    let targetList = discovery.lists.find(l => l.title === appConfig.selectedListName);
    
    // Fallback strategy: Default to the first available list if target is missing
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

/**
 * Compiles raw channel data and user-defined ID mappings into an M3U playlist format string.
 */
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

/**
 * Initializes or updates the background cron scheduler for automated playlist synchronizations.
 */
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

/**
 * ============================================================================
 * REST API Endpoints
 * ============================================================================
 */

/**
 * GET /api/get-config
 * Returns current server configuration parameters and synchronization metadata.
 */
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

/**
 * POST /api/fetch-channels
 * Updates connection parameters and initiates a live fetch operation from the receiver.
 */
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

/**
 * POST /api/save-mapping
 * Persists user-defined channel ID mappings and updates the M3U cache.
 */
app.post('/api/save-mapping', (req, res) => {
    appConfig.mapping = req.body.mapping;
    generateM3u();
    saveConfigToDisk();
    res.json({ success: true });
});

/**
 * GET /api/export-config
 * Exports current configuration and channel mapping as a downloadable JSON file.
 */
app.get('/api/export-config', (req, res) => {
    try {
        const configData = {
            version: APP_VERSION,
            exportedAt: new Date().toISOString(),
            config: {
                ip: appConfig.ip,
                port: appConfig.port,
                cronExpression: appConfig.cronExpression,
                selectedListName: appConfig.selectedListName
            },
            mapping: appConfig.mapping || {}
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="technimapper-config.json"');
        return res.json(configData);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to export configuration' });
    }
});

/**
 * POST /api/import-config
 * Imports configuration and channel mappings from an uploaded JSON payload.
 */
app.post('/api/import-config', (req, res) => {
    try {
        const importedData = req.body;

        if (!importedData || typeof importedData !== 'object') {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        // Apply config options if present
        if (importedData.config) {
            if (importedData.config.ip) appConfig.ip = importedData.config.ip;
            if (importedData.config.port) appConfig.port = importedData.config.port;
            if (importedData.config.cronExpression) appConfig.cronExpression = importedData.config.cronExpression;
            if (importedData.config.selectedListName) appConfig.selectedListName = importedData.config.selectedListName;
        }

        // Apply channel mapping
        if (importedData.mapping && typeof importedData.mapping === 'object') {
            appConfig.mapping = importedData.mapping;
        }

        generateM3u();
        saveConfigToDisk();
        startBackgroundCron();

        return res.json({ success: true, message: 'Configuration imported successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to import configuration: ' + err.message });
    }
});

/**
 * GET /playlist.m3u
 * Serves the compiled M3U playlist stream proxy endpoint to clients.
 */
app.get('/playlist.m3u', (req, res) => {
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(cachedM3u);
});

// Start Express server instance and load initial configuration
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    loadConfig();
});