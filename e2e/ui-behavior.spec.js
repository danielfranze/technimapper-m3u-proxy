import { expect, test } from '@playwright/test';

test('search filters the channel table', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    const rowsBefore = await page.locator('#channelTableBody tr').count();
    await page.fill('#searchInput', 'ZDF');
    await page.waitForTimeout(200);
    const rowsAfter = await page.locator('#channelTableBody tr').count();
    expect(rowsAfter).toBeLessThan(rowsBefore);
    await expect(page.locator('#channelTableBody')).toContainText('ZDF');
});

test('copy menu offers HDHR and M3U8 sources', async ({ page }) => {
    await page.goto('/');
    await page.click('#copyToggle');
    await expect(page.locator('#copyMenu')).toBeVisible();
    await expect(page.locator('[data-source="hdhr"]')).toBeVisible();
    await expect(page.locator('[data-source="m3u8"]')).toBeVisible();
});

test('filter chips switch between all/mapped/unmapped', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    await page.click('[data-action="filter"][data-filter="mapped"]');
    await page.waitForTimeout(100);
    // No crash; table still renders.
    await expect(page.locator('#channelTableBody')).toBeVisible();
});