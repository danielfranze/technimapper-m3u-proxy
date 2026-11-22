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

test('copy source switches to M3U8', async ({ page }) => {
    await page.goto('/');
    await page.click('#copyToggle');
    await page.click('[data-source="m3u8"]');
    await expect(page.locator('#copyMain')).toContainText('M3U8');
});

test('filter chips switch between all/mapped/unmapped', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    await page.click('[data-action="filter"][data-filter="mapped"]');
    await page.waitForTimeout(100);
    await expect(page.locator('#channelTableBody')).toBeVisible();
});

test('dirty indicator appears and disappears on edit and save', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    const firstInput = page.locator('.id-input').first();
    await firstInput.fill('999');
    await firstInput.blur();
    await expect(page.locator('.save-dirty').first()).toBeVisible();

    await page.click('[data-action="save"]');
    await expect(page.locator('.save-dirty').first()).toBeHidden();
});

test('parse assigns sequential IDs when names have no numbers', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    await page.click('[data-action="autofill"]');
    const firstValue = await page.locator('.id-input').first().inputValue();
    expect(firstValue).toBe('1');
});

test('dropdown opens with keyboard and closes on Escape', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#listToggle');
    await toggle.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#listMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#listMenu')).toBeHidden();
});

test('copy menu closes on outside click', async ({ page }) => {
    await page.goto('/');
    await page.click('#copyToggle');
    await expect(page.locator('#copyMenu')).toBeVisible();
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('#copyMenu')).toBeHidden();
});

test('dirty indicator disappears after successful save', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    const firstInput = page.locator('.id-input').first();
    await firstInput.fill('999');
    await firstInput.blur();
    await expect(page.locator('.save-dirty').first()).toBeVisible();

    await page.click('[data-action="save"]');
    await expect(page.locator('.save-dirty').first()).toBeHidden();
});

test('last sync time is displayed (Never or a date)', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('#last-sync-time').textContent();
    expect(text === 'Never' || /\d/.test(text)).toBeTruthy();
});

test('parse preserves leading zeros in manual ID entry', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    const firstInput = page.locator('.id-input').first();
    await firstInput.fill('001');
    await firstInput.blur();
    await expect(firstInput).toHaveValue('001');
});

test('error toast on invalid receiver IP', async ({ page }) => {
    await page.goto('/');
    await page.fill('#receiverIp', '999.999.999.999');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    await expect(page.locator('#statusMsg')).toContainText(/invalid|error/i);
});
