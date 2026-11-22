import { expect, test } from '@playwright/test';

test('syncs channels from the mock receiver and serves them as a playlist', async ({ request }) => {
    const syncRes = await request.post('/api/fetch-channels', { data: {} });
    expect(syncRes.ok()).toBeTruthy();
    const syncBody = await syncRes.json();
    expect(syncBody.channels).toContain('Das Erste HD');
    expect(syncBody.channels).toContain('ZDF HD');

    const playlistRes = await request.get('/playlist.m3u8');
    expect(playlistRes.status()).toBe(200);
    const playlist = await playlistRes.text();
    expect(playlist).toContain('Das Erste HD');
    expect(playlist).toContain('ZDF HD');

    const lineupRes = await request.get('/hdhr/lineup.json');
    expect(lineupRes.ok()).toBeTruthy();
    const lineup = await lineupRes.json();
    expect(lineup.length).toBeGreaterThan(0);
});