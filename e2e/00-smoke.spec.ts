import { expect, test } from '@playwright/test';

test('home page loads and shows the application title', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => { pageErrors.push(error); });
    await page.goto('/');
    await expect(page).toHaveTitle(/TechniMapper/i);
    await expect(page.locator('#applyBtn')).toBeVisible();
    expect(pageErrors, pageErrors.map(e => e.message).join('\n')).toHaveLength(0);
});

test('playlist responds (503 before sync, 200 after)', async ({ request }) => {
    const response = await request.get('/playlist.m3u8');
    expect([200, 503]).toContain(response.status());
});

test('HDHomeRun discovery endpoint returns a valid device description', async ({ request }) => {
    const response = await request.get('/hdhr/discover.json');
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.BaseURL).toBe('http://127.0.0.1:9191/hdhr');
    expect(body.LineupURL).toBe('http://127.0.0.1:9191/hdhr/lineup.json');
    expect(body.TunerCount).toBe(2);
});

test('HDHomeRun lineup is an array', async ({ request }) => {
    const response = await request.get('/hdhr/lineup.json');
    expect(response.ok()).toBeTruthy();
    const body: unknown[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
});

test('health endpoint reports process liveness', async ({ request }) => {
    const response = await request.get('/health/live');
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
});

test('unknown API route returns a JSON 404', async ({ request }) => {
    const response = await request.get('/api/does-not-exist');
    expect(response.status()).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not found');
});
