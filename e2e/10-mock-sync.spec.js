import { expect, test } from '@playwright/test';

test('syncs channels from the mock receiver', async ({ request }) => {
    const saveRes = await request.post('/api/save-settings', { data: { ip: '127.0.0.1', port: '9199', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste' } });
    expect(saveRes.ok()).toBeTruthy();

    const syncRes = await request.post('/api/fetch-channels', { data: {} });
    expect(syncRes.ok()).toBeTruthy();
    const syncBody = await syncRes.json();
    expect(syncBody.channels).toContain('Das Erste HD');
    expect(syncBody.channels).toContain('ZDF HD');
});

test('mapped channels appear in playlist and lineup after save-mapping', async ({ request }) => {
    const saveRes = await request.post('/api/save-settings', { data: { ip: '127.0.0.1', port: '9199', cronExpression: '*/5 * * * *', selectedListName: 'TV-Liste' } });
    expect(saveRes.ok()).toBeTruthy();

    const syncRes = await request.post('/api/fetch-channels', { data: {} });
    expect(syncRes.ok()).toBeTruthy();

    const mappingRes = await request.post('/api/save-mapping', { data: { mapping: { 'Das Erste HD': 1, 'ZDF HD': 2 } } });
    expect(mappingRes.ok()).toBeTruthy();

    const playlistRes = await request.get('/playlist.m3u8');
    expect(playlistRes.status()).toBe(200);
    const playlist = await playlistRes.text();
    expect(playlist).toContain('Das Erste HD');
    expect(playlist).toContain('ZDF HD');

    const lineupRes = await request.get('/hdhr/lineup.json');
    const lineup = await lineupRes.json();
    expect(lineup.length).toBe(2);
});

test('metrics endpoint reflects synced state', async ({ request }) => {
    const metricsRes = await request.get('/metrics');
    expect(metricsRes.ok()).toBeTruthy();
    const body = await metricsRes.text();
    expect(body).toContain('technimapper_channels_total');
    expect(body).toContain('technimapper_sync_runs_total');
});
