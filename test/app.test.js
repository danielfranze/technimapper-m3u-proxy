'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('../test-helpers/harness');

const fakeCron = value => typeof value === 'string' && /^\S+ \S+ \S+ \S+ \S+$/.test(value.trim());

const BASE_CONFIG = {
    ip: '192.168.1.10',
    port: '9100',
    cronExpression: '*/5 * * * *',
    selectedListName: 'TV-Liste'
};

const CHANNELS = [
    { name: 'A', url: 'http://192.168.1.20/a' },
    { name: 'B', url: 'http://192.168.1.20/b' }
];

async function withServer(harness, fn) {
    const server = harness.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.once('listening', resolve);
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        return await fn(base, harness);
    } finally {
        await new Promise(resolve => {
            server.close(resolve);
            if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        });
        harness.services.dispose();
    }
}

const postJson = (base, path, body, headers = {}) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('health endpoints report status, liveness and readiness', async () => {
    const harness = createHarness();
    await withServer(harness, async (base) => {
        const health = await fetch(base + '/health');
        assert.equal(health.status, 200);
        const body = await health.json();
        assert.equal(body.status, 'ok');
        assert.equal(body.configured, false);
        assert.equal(body.playlistAvailable, false);
        assert.equal(body.version, '1.8.0-test');

        assert.equal((await fetch(base + '/health/live')).status, 200);
        assert.equal((await fetch(base + '/health/ready')).status, 200, 'an unconfigured instance is ready for setup');
    });
});

test('a configured instance without a playlist is degraded and not ready', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });

    await withServer(harness, async (base) => {
        const health = await fetch(base + '/health');
        assert.equal(health.status, 200);
        assert.equal((await health.json()).status, 'degraded');

        const ready = await fetch(base + '/health/ready');
        assert.equal(ready.status, 503);
        assert.equal((await ready.json()).status, 'degraded');

        const playlist = await fetch(base + '/playlist.m3u8');
        assert.equal(playlist.status, 503);
        assert.equal(playlist.headers.get('retry-after'), '60');
    });
});

test('HDHomeRun discovery, lineup and stream redirect work', async () => {
    const harness = createHarness({
        state: {
            configured: true,
            config: { ...BASE_CONFIG, channels: CHANNELS, mapping: { A: 1 }, detectedModel: 'DIGIT ISIO STC' }
        }
    });
    harness.services.rebuildViews();

    await withServer(harness, async (base) => {
        const discover = await (await fetch(base + '/hdhr/discover.json')).json();
        assert.equal(discover.BaseURL, `${base}/hdhr`);
        assert.equal(discover.LineupURL, `${base}/hdhr/lineup.json`);
        assert.equal(discover.FriendlyName, 'TechniSat DIGIT ISIO STC');

        const lineup = await (await fetch(base + '/hdhr/lineup.json')).json();
        assert.deepEqual(lineup, [{ GuideNumber: '1', GuideName: 'A', URL: `${base}/hdhr/stream/1` }]);

        const stream = await fetch(base + '/hdhr/stream/1', { redirect: 'manual' });
        assert.equal(stream.status, 302);
        assert.equal(stream.headers.get('location'), 'http://192.168.1.20/a');

        assert.equal((await fetch(base + '/hdhr/stream/99', { redirect: 'manual' })).status, 404);
    });
});

test('Basic Auth protects the API but keeps public routes open', async () => {
    const harness = createHarness({ runtime: { adminUser: 'admin', adminPassword: 'secret' } });
    await withServer(harness, async (base) => {
        assert.equal((await fetch(base + '/health')).status, 200);
        assert.equal((await fetch(base + '/api/get-config')).status, 401);

        const unauthorized = await fetch(base + '/api/get-config', {
            headers: { Authorization: basic('admin', 'wrong') }
        });
        assert.equal(unauthorized.status, 401);

        const authorized = await fetch(base + '/api/get-config', {
            headers: { Authorization: basic('admin', 'secret') }
        });
        assert.equal(authorized.status, 200);
    });
});

test('a single configured auth credential fails closed', async () => {
    const harness = createHarness({ runtime: { adminUser: 'admin', adminPassword: '' } });
    await withServer(harness, async (base) => {
        assert.equal((await fetch(base + '/health')).status, 200);
        const res = await fetch(base + '/api/get-config');
        assert.equal(res.status, 503);
        assert.match((await res.json()).error, /misconfigured/);
    });
});

test('state-changing API requests require JSON and a same-origin origin', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });

    await withServer(harness, async (base) => {
        const sameOrigin = await postJson(base, '/api/fetch-channels', {}, { Origin: base });
        assert.equal(sameOrigin.status, 200);
    });
});

test('the receiver target is changed through settings, not through a sync', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });

    await withServer(harness, async (base) => {
        const blocked = await postJson(base, '/api/fetch-channels', {
            ...BASE_CONFIG,
            ip: '192.168.1.99'
        });
        assert.equal(blocked.status, 409);
        assert.equal(harness.calls.length, 0, 'the receiver must not be contacted for a blocked target');

        const saved = await postJson(base, '/api/save-settings', { ...BASE_CONFIG, ip: '192.168.1.99' });
        assert.equal(saved.status, 200);
        assert.equal(harness.state.get().config.ip, '192.168.1.99');

        const fetched = await postJson(base, '/api/fetch-channels', { ...BASE_CONFIG, ip: '192.168.1.99' });
        assert.equal(fetched.status, 200);
        assert.equal(harness.calls.length, 1);
        assert.equal(harness.calls[0].ip, '192.168.1.99');
    });
});

test('save-mapping rebuilds playlist and lineup and reports duplicates and orphans', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });

    await withServer(harness, async (base) => {
        const saved = await postJson(base, '/api/save-mapping', {
            mapping: { A: 1, B: '1', Old: 2 }
        });
        assert.equal(saved.status, 200);

        const body = await saved.json();
        assert.deepEqual(body.duplicateGroups, [{ id: '1', channels: ['A', 'B'] }]);
        assert.deepEqual(body.orphans, ['Old']);
        assert.equal(harness.writes.length, 1);

        const playlist = await fetch(base + '/playlist.m3u8');
        assert.equal(playlist.status, 200);
        assert.match(playlist.headers.get('content-type'), /audio\/x-mpegurl/);
        const text = await playlist.text();
        assert.match(text, /tvg-id="1"/);
        assert.match(text, /http:\/\/192\.168\.1\.20\/a/);

        const lineup = await (await fetch(base + '/hdhr/lineup.json')).json();
        assert.equal(lineup.length, 1, 'duplicate IDs appear only once in the lineup');
    });
});

test('invalid mapping IDs are rejected without changing state', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS, mapping: { A: 1 } } }
    });

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/save-mapping', { mapping: { A: 'bad id' } });
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /Invalid channel ID/);
        assert.deepEqual(harness.state.get().config.mapping, { A: 1 });
        assert.equal(harness.writes.length, 0);
    });
});

test('export and import round-trip settings and mapping', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS, mapping: { A: 1 } } }
    });

    await withServer(harness, async (base) => {
        const exported = await (await fetch(base + '/api/export-config')).json();
        assert.equal(exported.config.ip, '192.168.1.10');
        assert.deepEqual(exported.mapping, { A: 1 });

        const imported = await postJson(base, '/api/import-config', {
            config: { ...BASE_CONFIG, ip: '192.168.1.30', selectedListName: 'Radio' },
            mapping: { A: 2 }
        });
        assert.equal(imported.status, 200);
        assert.equal(harness.state.get().config.ip, '192.168.1.30');
        assert.equal(harness.state.get().config.selectedListName, 'Radio');
        assert.deepEqual(harness.state.get().config.mapping, { A: 2 });
        assert.equal(harness.writes.length, 1);

        const invalid = await postJson(base, '/api/import-config', { mapping: { A: 'bad id' } });
        assert.equal(invalid.status, 400);
        assert.deepEqual(harness.state.get().config.mapping, { A: 2 });
    });
});

test('a failed sync keeps the last known playlist and records the error', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS, mapping: { A: 1 } } },
        fetchChannels: async () => { throw new Error('receiver unreachable'); }
    });
    harness.services.rebuildViews();
    const before = harness.state.get().cachedM3u8;

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/fetch-channels', {});
        assert.equal(res.status, 502);
        assert.match((await res.json()).error, /receiver unreachable/);
        assert.equal(harness.state.get().cachedM3u8, before, 'the last known playlist must survive a failed sync');
        assert.equal(harness.state.get().sync.consecutiveFailures, 1);
        assert.match(harness.state.get().sync.lastError, /receiver unreachable/);
        assert.equal(harness.state.get().config.mapping.A, 1);
    });
});

test('API rate limiting returns 429 after the configured budget', async () => {
    const harness = createHarness({ runtime: { apiRateMax: 2, apiRateWindowMs: 60000 } });
    await withServer(harness, async (base) => {
        assert.equal((await fetch(base + '/api/get-config')).status, 200);
        assert.equal((await fetch(base + '/api/get-config')).status, 200);
        const limited = await fetch(base + '/api/get-config');
        assert.equal(limited.status, 429);
        assert.ok(Number(limited.headers.get('retry-after')) >= 1);
    });
});

test('two concurrent sync requests are serialized', async () => {
    let active = 0;
    let maxActive = 0;
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } },
        fetchChannels: async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 20));
            active--;
            return {
                channels: CHANNELS,
                selectedListName: 'TV-Liste',
                availableLists: ['TV-Liste'],
                detectedModel: 'STC'
            };
        }
    });

    await withServer(harness, async (base) => {
        const [first, second] = await Promise.all([
            postJson(base, '/api/fetch-channels', {}),
            postJson(base, '/api/fetch-channels', {})
        ]);
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(maxActive, 1);
    });
});

test('a persistence failure returns 500 without leaving a broken response', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });
    harness.configStore.write = () => { throw new Error('disk full'); };

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/save-mapping', { mapping: { A: 1 } });
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'Internal server error');
    });
});

test('metrics endpoint returns Prometheus text', async () => {
    const harness = createHarness({ state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } } });
    harness.services.rebuildViews();
    await withServer(harness, async (base) => {
        const res = await fetch(base + '/metrics');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /text\/plain/);
        const body = await res.text();
        assert.match(body, /technimapper_http_requests_total/);
        assert.match(body, /technimapper_channels_total/);
    });
});

test('malformed JSON and unknown API routes use the central error handling', async () => {
    const harness = createHarness();
    await withServer(harness, async (base) => {
        const badJson = await postJson(base, '/api/save-mapping', '{not json');
        assert.equal(badJson.status, 400);
        assert.equal((await badJson.json()).error, 'Invalid JSON payload');

        const notFound = await fetch(base + '/api/does-not-exist');
        assert.equal(notFound.status, 404);
        assert.equal((await notFound.json()).error, 'Not found');
    });
});

test('save-settings rejects non-object payloads', async () => {
    const harness = createHarness();
    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/save-settings', [1, 2]);
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /Invalid settings payload/);
    });
});

test('a sync whose settings change mid-flight is discarded instead of overwriting them', async () => {
    let resolveFetch;
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } },
        fetchChannels: () => new Promise(resolve => { resolveFetch = resolve; })
    });
    harness.services.rebuildViews();
    const before = harness.state.get().cachedM3u8;

    await withServer(harness, async (base) => {
        const syncPromise = postJson(base, '/api/fetch-channels', { ...BASE_CONFIG });

        // Change the receiver target while the sync is still in flight.
        const saved = await postJson(base, '/api/save-settings', { ...BASE_CONFIG, ip: '192.168.1.99' });
        assert.equal(saved.status, 200);
        assert.equal(harness.state.get().config.ip, '192.168.1.99');

        resolveFetch({
            channels: CHANNELS,
            selectedListName: 'TV-Liste',
            availableLists: ['TV-Liste'],
            detectedModel: 'STC'
        });

        const syncRes = await syncPromise;
        assert.equal(syncRes.status, 409);
        assert.match((await syncRes.json()).error, /changed during sync/i);

        // The stale sync must not have overwritten the new target or the playlist.
        assert.equal(harness.state.get().config.ip, '192.168.1.99');
        assert.equal(harness.state.get().cachedM3u8, before);
    });
});

test('a persistence failure rolls back in-memory mapping state', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS, mapping: {} } }
    });
    harness.configStore.write = () => { throw new Error('disk full'); };

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/save-mapping', { mapping: { A: 1 } });
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'Internal server error');
        // In-memory state must not retain the failed write.
        assert.deepEqual(harness.state.get().config.mapping, {});
    });
});

test('a persistence failure rolls back in-memory settings state', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG } }
    });
    harness.configStore.write = () => { throw new Error('disk full'); };

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/save-settings', { ip: '192.168.1.99' });
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'Internal server error');
        assert.equal(harness.state.get().config.ip, BASE_CONFIG.ip);
    });
});

test('a persistence failure during sync preserves last-known-good channels', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS } }
    });
    harness.services.rebuildViews();
    const beforeChannels = harness.state.get().config.channels;
    const beforeCached = harness.state.get().cachedM3u8;
    harness.configStore.write = () => { throw new Error('disk full'); };

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/fetch-channels', { ...BASE_CONFIG });
        assert.equal(res.status, 502);
        assert.deepEqual(harness.state.get().config.channels, beforeChannels);
        assert.equal(harness.state.get().cachedM3u8, beforeCached);
    });
});

test('a persistence failure during import-config rolls back state', async () => {
    const harness = createHarness({
        state: { configured: true, config: { ...BASE_CONFIG, channels: CHANNELS, mapping: {} } }
    });
    harness.configStore.write = () => { throw new Error('disk full'); };

    await withServer(harness, async (base) => {
        const res = await postJson(base, '/api/import-config', { config: { ...BASE_CONFIG, ip: '192.168.1.99' }, mapping: { A: 1 } });
        assert.equal(res.status, 500);
        assert.equal(harness.state.get().config.ip, BASE_CONFIG.ip);
        assert.deepEqual(harness.state.get().config.mapping, {});
    });
});
