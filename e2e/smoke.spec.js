import { expect, test } from '@playwright/test';

test('home page loads and shows the application title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/TechniMapper/i);
    await expect(page.locator('#applyBtn')).toBeVisible();
});

test('playlist is unavailable before the first successful sync', async ({ request }) => {
    const response = await request.get('/playlist.m3u8');
    expect(response.status()).toBe(503);
    expect(response.headers()['retry-after']).toBe('60');
});

test('HDHomeRun discovery endpoint returns a valid device description', async ({ request }) => {
    const response = await request.get('/hdhr/discover.json');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.BaseURL).toBe('http://127.0.0.1:9191/hdhr');
    expect(body.LineupURL).toBe('http://127.0.0.1:9191/hdhr/lineup.json');
    expect(body.TunerCount).toBe(2);
});

test('HDHomeRun lineup is empty before channels are mapped', async ({ request }) => {
    const response = await request.get('/hdhr/lineup.json');
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual([]);
});

test('health endpoint reports process liveness', async ({ request }) => {
    const response = await request.get('/health/live');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
});

test('unknown API route returns a JSON 404', async ({ request }) => {
    const response = await request.get('/api/does-not-exist');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Not found');
});
