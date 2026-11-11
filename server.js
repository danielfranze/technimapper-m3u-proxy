/**
 * ============================================================================
 * TechniMapper - M3U Proxy & Channel Mapping Server
 * ============================================================================
 * Node.js Express backend that talks to TechniSat receivers via UPnP/SOAP,
 * reads the live TV channel list and serves it as a stable M3U playlist.
 *
 * Environment variables (all optional):
 *   PORT                  HTTP port (default 3000)
 *   DATA_DIR              Directory for mapping.json (default ./data)
 *   REQUEST_TIMEOUT_MS    Idle timeout per SOAP request (default 5000)
 *   ALLOW_NON_PRIVATE_IP  "true" to allow receiver IPs outside RFC1918 ranges
 *                         (e.g. VPN/CGNAT such as 100.64.0.0/10)
 *   ADMIN_USER / ADMIN_PASSWORD
 *                         Enables HTTP Basic Auth for the UI and /api/*.
 *                         /playlist.m3u and /health stay public.
 * ============================================================================
 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const xml2js = require('xml2js');
const cron = require('node-cron');
const compression = require('compression');
const packageJson = require('./package.json');

// ---------------------------------------------------------------------------
// Constants & environment
// ---------------------------------------------------------------------------
const APP_VERSION = packageJson.version;
const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'mapping.json');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOW_NON_PRIVATE_IP = process.env.ALLOW_NON_PRIVATE_IP === 'true';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEFAULT_CRON = '*/5 * * * *';
const ID_REGEX = /^[A-Za-z0-9_.\-]{1,32}$/;
const STREAM_URL_REGEX = /^https?:\/\/[^\s\x00-\x1f\x7f"<>]+$/;

const log = {
    info: (...a) => console.log('[INFO]', ...a),
    warn: (...a) => console.warn('[WARN]', ...a),
    error: (...a) => console.error('[ERROR]', ...a)
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------
let appConfig = {
    ip: '192.168.178.28',
    port: '9100',
    cronExpression: DEFAULT_CRON,
    selectedListName: 'TV-Liste',
    mapping: {},
    channels: [],
    lastSync: null // ISO-8601 (UTC) of the last successful sync
};

const syncStatus = { lastError: null, lastErrorAt: null, consecutiveFailures: 0 };

let configured = false;  // true once a config exists on disk or was applied via UI
let cachedM3u = null;    // null = no usable playlist (served as 503, never as empty list)
let cronTask = null;
let shuttingDown = false;

// Serialises all syncs (cron + manual) so they can never overlap.
let syncLock = Promise.resolve();
let syncActive = false;

function withSyncLock(fn) {
    const run = syncLock.then(async () => {
        syncActive = true;
        try {
            return await fn();
        } finally {
            syncActive = false;
        }
    });
    syncLock = run.catch(() => {});
    return run;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Receiver must be a valid IPv4; loopback/link-local/multicast are always rejected. */
function isAllowedReceiverIp(ip) {
    if (typeof ip !== 'string' || !net.isIPv4(ip)) return false;
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127 || a >= 224) return false;      // unspecified, loopback, multicast/reserved
    if (a === 169 && b === 254) return false;                // link-local (incl. cloud metadata)
    if (ALLOW_NON_PRIVATE_IP) return true;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Validates a full settings object and returns a normalised copy. Throws HttpError(400). */
function validateSettings(raw) {
    const ip = String(raw.ip ?? '').trim();
    if (!isAllowedReceiverIp(ip)) {
        throw new HttpError(400, 'Invalid receiver IP. Use a private IPv4 address (10.x, 172.16-31.x, 192.168.x).');
    }

    const portStr = String(raw.port ?? '').trim();
    const portNum = parseInt(portStr, 10);
    if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) {
        throw new HttpError(400, 'Invalid port (1-65535).');
    }

    const cronExpression = String(raw.cronExpression ?? '').trim();
    if (cronExpression.length > 100 || !cron.validate(cronExpression)) {
        throw new HttpError(400, `Invalid cron expression "${cronExpression.slice(0, 40)}" (example: */5 * * * *).`);
    }

    const selectedListName = String(raw.selectedListName ?? '').trim();
    if (!selectedListName || selectedListName.length > 200) {
        throw new HttpError(400, 'Invalid channel list name.');
    }

    return { ip, port: String(portNum), cronExpression, selectedListName };
}

function currentSettings() {
    const { ip, port, cronExpression, selectedListName } = appConfig;
    return { ip, port, cronExpression, selectedListName };
}

/** Merges non-empty overrides into the current settings and validates the result. */
function mergeSettings(overrides = {}) {
    const merged = currentSettings();
    for (const key of Object.keys(merged)) {
        const v = overrides[key];
        if ((typeof v === 'string' && v.trim() !== '') || typeof v === 'number') merged[key] = v;
    }
    return validateSettings(merged);
}

/**
 * Validates a channel-name -> ID mapping.
 * Returns { mapping, invalid } where invalid lists channel names with unusable IDs.
 */
function validateMapping(input) {
    const mapping = {};
    const invalid = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { mapping, invalid: ['<payload>'] };

    for (const [name, value] of Object.entries(input)) {
        if (value === '' || value === null || value === undefined) continue; // unmapped
        if (!name || name.length > 200 || name === '__proto__') {
            invalid.push(name);
            continue;
        }
        const isValidNumber = typeof value === 'number' && Number.isInteger(value) && value >= 0;
        const isValidString = typeof value === 'string' && ID_REGEX.test(value);
        if (isValidNumber && String(value).length <= 32) mapping[name] = value;
        else if (isValidString) mapping[name] = value;
        else invalid.push(name);
    }
    return { mapping, invalid };
}

function findDuplicateIds(mapping) {
    const seen = new Set();
    const dups = new Set();
    for (const v of Object.values(mapping)) {
        const id = String(v);
        if (seen.has(id)) dups.add(id);
        seen.add(id);
    }
    return [...dups];
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function ensureDataDir() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.accessSync(DATA_DIR, fs.constants.W_OK);
    } catch (err) {
        log.error(`Data directory "${DATA_DIR}" is not writable: ${err.message}`);
        log.error('If you use a bind mount with a non-root container, run: chown -R 1000:1000 <host-data-dir>');
        process.exit(1);
    }
}

/**
 * Flushes the state to disk. Prefers an atomic write (temp file + rename).
 * If CONFIG_FILE is a single-file Docker bind mount, rename() fails with EBUSY/EXDEV/EPERM;
 * in that case the file is written in place (not atomic, but works). Throws on real failures.
 */
function saveConfigToDisk() {
    const json = JSON.stringify(appConfig, null, 2);
    const tempFile = CONFIG_FILE + '.tmp';
    const removeTemp = () => { try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ } };

    try {
        fs.writeFileSync(tempFile, json, 'utf8');
        fs.renameSync(tempFile, CONFIG_FILE);
    } catch (err) {
        removeTemp();
        if (!['EBUSY', 'EXDEV', 'EPERM'].includes(err.code)) throw err;
        fs.writeFileSync(CONFIG_FILE, json, 'utf8');
    }
}

function trySaveConfig() {
    try {
        saveConfigToDisk();
    } catch (err) {
        log.error('Failed to write mapping.json:', err.message);
    }
}

/**
 * Replaces invalid persisted values (port, cron, list name) with defaults so that one corrupt
 * field cannot disable background sync. The receiver IP is left untouched (there is no safe default).
 * Returns true if anything was changed.
 */
function repairPersistedSettings() {
    let changed = false;
    const fix = (field, fallback, reason) => {
        log.warn(`Persisted ${field} "${appConfig[field]}" is invalid (${reason}) - resetting to "${fallback}".`);
        appConfig[field] = fallback;
        changed = true;
    };

    const portStr = String(appConfig.port).trim();
    const portNum = parseInt(portStr, 10);
    if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) fix('port', '9100', 'not a port number');

    const cronStr = String(appConfig.cronExpression).trim();
    if (cronStr.length > 100 || !cron.validate(cronStr)) fix('cronExpression', DEFAULT_CRON, 'not a cron expression');

    const listName = String(appConfig.selectedListName).trim();
    if (!listName || listName.length > 200) fix('selectedListName', 'TV-Liste', 'empty or too long');

    if (!isAllowedReceiverIp(appConfig.ip)) {
        log.warn(`Persisted receiver IP "${appConfig.ip}" is not allowed - please correct it in the UI.`);
    }
    return changed;
}

/** Loads and sanitises the persisted state. Returns true if a config file was found. */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return false;
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');

        const { mapping, invalid } = validateMapping(parsed.mapping);
        if (invalid.length) log.warn(`Dropped ${invalid.length} invalid mapping entries from disk.`);

        const channels = Array.isArray(parsed.channels)
            ? parsed.channels.filter(c => c && typeof c.name === 'string' && typeof c.url === 'string')
            : [];

        appConfig = {
            ...appConfig,
            ip: typeof parsed.ip === 'string' ? parsed.ip : appConfig.ip,
            port: parsed.port !== undefined ? String(parsed.port) : appConfig.port,
            cronExpression: typeof parsed.cronExpression === 'string' ? parsed.cronExpression : appConfig.cronExpression,
            selectedListName: typeof parsed.selectedListName === 'string' ? parsed.selectedListName : appConfig.selectedListName,
            lastSync: typeof parsed.lastSync === 'string' ? parsed.lastSync : null,
            mapping,
            channels
        };
        if (repairPersistedSettings()) trySaveConfig();
        log.info('Configuration loaded from disk.');
        return true;
    } catch (err) {
        log.error('Failed to read mapping.json (using defaults):', err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// UPnP / SOAP
// ---------------------------------------------------------------------------
const upnpAgent = new http.Agent({ keepAlive: true, maxSockets: 2 });

function escapeXml(str) {
    return String(str).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

/** xml2js returns either a string or { _: text, $: attrs }. */
function xmlText(v) {
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v._;
    return typeof v === 'string' ? v : undefined;
}

function postSoap(ip, port, pathEndpoint, soapEnvelope) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: ip,
            port: parseInt(port, 10),
            path: pathEndpoint,
            method: 'POST',
            agent: upnpAgent,
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
                'Content-Length': Buffer.byteLength(soapEnvelope)
            }
        }, (res) => {
            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_RESPONSE_BYTES) {
                    req.destroy(new Error('UPnP response too large'));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                clearTimeout(totalTimer);
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`UPnP request failed with HTTP ${res.statusCode}`));
                }
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
            res.on('error', reject);
        });

        // Idle timeout + hard overall deadline.
        req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('UPnP request timed out')));
        const totalTimer = setTimeout(() => req.destroy(new Error('UPnP request exceeded total deadline')), REQUEST_TIMEOUT_MS * 3);
        req.on('error', (err) => { clearTimeout(totalTimer); reject(err); });
        req.write(soapEnvelope);
        req.end();
    });
}

async function browseUpnp(ip, port, objectId, pathEndpoint) {
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
    <ObjectID>${escapeXml(objectId)}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>
    <Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount>
  </u:Browse></s:Body>
</s:Envelope>`;

    const body = await postSoap(ip, port, pathEndpoint, soapEnvelope);

    const result = await xml2js.parseStringPromise(body, { explicitArray: false });
    const resXml = result?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'];
    if (!resXml) throw new Error('UPnP SOAP Browse response invalid');

    const browse = await xml2js.parseStringPromise(resXml, { explicitArray: false });
    if (!browse?.['DIDL-Lite']) throw new Error('Invalid DIDL-Lite payload');
    return browse['DIDL-Lite'];
}

/** Discovers available Live-TV channel lists across the known device series. */
async function discoverTvLists(ip, port) {
    const testTargets = [
        { type: 'STC', parentObj: '0$3$41', path: '/dev0/srv1/control' },
        { type: 'S_SERIES', parentObj: '3', path: '/ContentDirectory/Control' }
    ];

    let lastError = null;
    for (const target of testTargets) {
        try {
            const didl = await browseUpnp(ip, port, target.parentObj, target.path);
            const containers = didl.container ? (Array.isArray(didl.container) ? didl.container : [didl.container]) : [];
            const lists = containers
                .map(c => ({ id: c['$']?.id || c.id, title: xmlText(c['dc:title']) }))
                .filter(l => l.id && l.title);

            if (lists.length > 0) return { deviceType: target.type, path: target.path, lists };
        } catch (err) {
            lastError = err;
            log.warn(`Discovery via ${target.type} failed: ${err.message}`);
        }
    }
    throw new Error('No TechniSat Live-TV containers found' + (lastError ? ` (${lastError.message})` : '.'));
}

/** Pure function: reads channels from the receiver using the given settings. Never mutates state. */
async function fetchFromTechniSat({ ip, port, selectedListName }) {
    const discovery = await discoverTvLists(ip, port);

    let targetList = discovery.lists.find(l => l.title === selectedListName);
    if (!targetList) {
        targetList = discovery.lists[0];
        log.warn(`List "${selectedListName}" not found, falling back to "${targetList.title}".`);
    }

    const didl = await browseUpnp(ip, port, targetList.id, discovery.path);
    const items = didl.item ? (Array.isArray(didl.item) ? didl.item : [didl.item]) : [];

    const channels = items
        .map(i => ({ name: xmlText(i['dc:title']), url: xmlText(i['res']) }))
        .filter(c => c.name && c.url && STREAM_URL_REGEX.test(c.url.trim()))
        .map(c => ({ name: c.name.trim(), url: c.url.trim() }));

    if (channels.length === 0) throw new Error('Failed to parse channel items.');

    const uniqueNames = new Set(channels.map(c => c.name));
    if (uniqueNames.size !== channels.length) {
        log.warn(`${channels.length - uniqueNames.size} duplicate channel name(s) detected - they share one mapping entry.`);
    }

    log.info(`${channels.length} channels loaded from list "${targetList.title}".`);
    return {
        channels,
        selectedListName: targetList.title,
        availableLists: discovery.lists.map(l => l.title),
        detectedModel: discovery.deviceType
    };
}

// ---------------------------------------------------------------------------
// Playlist generation
// ---------------------------------------------------------------------------

/** Removes control characters and quotes so values can never break out of an M3U attribute/line. */
function sanitizeM3uText(str) {
    return String(str).replace(/[\u0000-\u001f\u007f"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds the playlist from channels + mapping. If nothing is mapped, the cache is set to null
 * so /playlist.m3u answers 503 instead of an empty list (which would make Dispatcharr purge channels).
 */
function generateM3u() {
    let m3u = '#EXTM3U\n';
    let count = 0;

    for (const ch of appConfig.channels) {
        if (!Object.hasOwn(appConfig.mapping, ch.name)) continue;
        const id = sanitizeM3uText(appConfig.mapping[ch.name]);
        const url = String(ch.url).trim();
        if (!id || !STREAM_URL_REGEX.test(url)) continue;

        const name = sanitizeM3uText(ch.name);
        const chNo = id.replace('ts-ch', '');
        m3u += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-chno="${chNo}" cuid="${id}" group-title="TechniSat",${name}\n${url}\n`;
        count++;
    }

    cachedM3u = count > 0 ? m3u : null;
    if (count === 0) log.warn('No mapped channels - /playlist.m3u will answer 503 until channels are mapped.');
    return count;
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

/** Fetches from the receiver and commits the new state only if the fetch succeeded. */
async function performSync(candidate) {
    try {
        const result = await fetchFromTechniSat(candidate);

        Object.assign(appConfig, {
            ip: candidate.ip,
            port: candidate.port,
            cronExpression: candidate.cronExpression,
            selectedListName: result.selectedListName,
            channels: result.channels,
            lastSync: new Date().toISOString()
        });
        configured = true;
        syncStatus.lastError = null;
        syncStatus.lastErrorAt = null;
        syncStatus.consecutiveFailures = 0;

        generateM3u();
        trySaveConfig();
        return result;
    } catch (err) {
        syncStatus.lastError = err.message;
        syncStatus.lastErrorAt = new Date().toISOString();
        syncStatus.consecutiveFailures++;
        // Last-known-good: cachedM3u and appConfig.channels stay untouched.
        throw err;
    }
}

async function runScheduledSync() {
    if (shuttingDown) return;
    if (syncActive) {
        log.warn('Previous sync still running - skipping this run.');
        return;
    }
    try {
        await withSyncLock(() => performSync(validateSettings(currentSettings())));
    } catch (err) {
        log.error(`[Sync] ${err.message} (consecutive failures: ${syncStatus.consecutiveFailures}) - serving last known playlist.`);
    }
}

function stopBackgroundCron() {
    if (cronTask) {
        cronTask.stop();
        if (typeof cronTask.destroy === 'function') cronTask.destroy();
        cronTask = null;
    }
}

function startBackgroundCron() {
    stopBackgroundCron();
    const pattern = appConfig.cronExpression || DEFAULT_CRON;
    if (!cron.validate(pattern)) {
        log.error(`Invalid cron expression "${pattern}" - background sync disabled.`);
        return;
    }
    cronTask = cron.schedule(pattern, runScheduledSync);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
});

app.use(compression());

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

/** Optional HTTP Basic Auth. /playlist.m3u and /health stay public for Dispatcharr and Docker. */
function basicAuth(req, res, next) {
    if (!ADMIN_USER || !ADMIN_PASSWORD) return next();
    if (req.path === '/health' || req.path === '/playlist.m3u') return next();

    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx >= 0 && safeEqual(decoded.slice(0, idx), ADMIN_USER) && safeEqual(decoded.slice(idx + 1), ADMIN_PASSWORD)) {
            return next();
        }
    }
    res.set('WWW-Authenticate', 'Basic realm="TechniMapper", charset="UTF-8"');
    return res.status(401).send('Authentication required');
}
app.use(basicAuth);

/** Minimal in-memory rate limiter (no extra dependency). */
function rateLimit({ windowMs, max }) {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    }, windowMs).unref();

    return (req, res, next) => {
        const now = Date.now();
        let entry = hits.get(req.ip);
        if (!entry || entry.reset <= now) {
            entry = { count: 0, reset: now + windowMs };
            hits.set(req.ip, entry);
        }
        if (++entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    };
}

app.use(express.json({ limit: '1mb' }));
app.post('/api/*', rateLimit({ windowMs: 60 * 1000, max: 60 }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
    const hasPlaylist = cachedM3u !== null;
    res.json({
        status: !configured || (hasPlaylist && syncStatus.consecutiveFailures < 3) ? 'ok' : 'degraded',
        version: APP_VERSION,
        configured,
        playlistAvailable: hasPlaylist,
        lastSync: appConfig.lastSync,
        lastError: syncStatus.lastError,
        consecutiveFailures: syncStatus.consecutiveFailures
    });
});

app.get('/api/get-config', (req, res) => {
    res.json({
        version: APP_VERSION,
        ip: appConfig.ip,
        port: appConfig.port,
        cronExpression: appConfig.cronExpression,
        selectedListName: appConfig.selectedListName,
        lastSync: appConfig.lastSync,
        lastError: syncStatus.lastError,
        consecutiveFailures: syncStatus.consecutiveFailures
    });
});

app.post('/api/fetch-channels', async (req, res, next) => {
    try {
        const candidate = mergeSettings(req.body || {}); // throws 400 on invalid input, nothing is mutated
        const result = await withSyncLock(() => performSync(candidate));
        startBackgroundCron();

        res.json({
            channels: appConfig.channels.map(c => c.name),
            availableLists: result.availableLists,
            selectedListName: appConfig.selectedListName,
            mapping: appConfig.mapping,
            detectedModel: result.detectedModel === 'STC' ? 'DIGIT ISIO STC' : 'DIGIT ISIO S/S1/S2'
        });
    } catch (err) {
        if (err instanceof HttpError) return next(err);
        log.error('[fetch-channels]', err.message);
        res.status(502).json({ error: err.message || 'Receiver request failed' });
    }
});

app.post('/api/save-mapping', (req, res) => {
    const { mapping, invalid } = validateMapping(req.body?.mapping);
    if (invalid.length) {
        throw new HttpError(400, `Invalid channel ID for: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', ...' : ''}. Allowed: letters, digits, "_", "-", "." (max. 32 chars).`);
    }
    appConfig.mapping = mapping;
    generateM3u();
    saveConfigToDisk();
    res.json({ success: true, mappedCount: Object.keys(mapping).length, duplicates: findDuplicateIds(mapping) });
});

app.get('/api/export-config', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="technimapper-config.json"');
    res.json({
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        config: currentSettings(),
        mapping: appConfig.mapping || {}
    });
});

app.post('/api/import-config', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Invalid JSON payload');

    // Validate everything first, apply afterwards (all-or-nothing).
    const settings = data.config ? mergeSettings(data.config) : null;
    let mapping = null;
    if (data.mapping !== undefined) {
        const checked = validateMapping(data.mapping);
        if (checked.invalid.length) throw new HttpError(400, `Invalid channel ID in import for: ${checked.invalid.slice(0, 5).join(', ')}`);
        mapping = checked.mapping;
    }

    if (settings) Object.assign(appConfig, settings);
    if (mapping) appConfig.mapping = mapping;
    configured = true;

    generateM3u();
    saveConfigToDisk();
    startBackgroundCron();
    res.json({ success: true, message: 'Configuration imported successfully' });
});

app.get('/playlist.m3u', (req, res) => {
    if (cachedM3u === null) {
        // Never serve an empty playlist: Dispatcharr's orphan cleanup would delete all channels.
        res.set('Retry-After', '60');
        return res.status(503).type('text/plain').send('Playlist not available: no channels synced or mapped yet.');
    }
    res.set('Cache-Control', 'no-cache');
    res.type('audio/x-mpegurl; charset=utf-8').send(cachedM3u);
});

// 404 for unknown API routes, then central error handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON payload' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    log.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup & graceful shutdown
// ---------------------------------------------------------------------------
ensureDataDir();
configured = loadConfig();
if (configured) generateM3u(); // serve last known playlist immediately

if ((ADMIN_USER && !ADMIN_PASSWORD) || (!ADMIN_USER && ADMIN_PASSWORD)) {
    log.warn('Only one of ADMIN_USER / ADMIN_PASSWORD is set - authentication is DISABLED.');
} else if (!ADMIN_USER) {
    log.warn('No ADMIN_USER/ADMIN_PASSWORD set - the UI and API are unauthenticated. Do not expose this service to the internet.');
}

const server = app.listen(PORT, () => {
    log.info(`TechniMapper v${APP_VERSION} listening on port ${PORT}`);
    if (configured) {
        startBackgroundCron();
        setTimeout(runScheduledSync, 500); // refresh possibly stale URLs right after (re)start
    }
});

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received - shutting down gracefully.`);
    stopBackgroundCron();

    setTimeout(() => process.exit(1), 10000).unref(); // hard stop if something hangs
    server.close(async () => {
        await syncLock;           // let a running sync finish (and persist) first
        upnpAgent.destroy();
        process.exit(0);
    });
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason));
