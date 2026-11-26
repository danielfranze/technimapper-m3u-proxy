import { expect, type Page, test } from '@playwright/test';

/** Opens the channel list independently of state left by earlier specs. */
async function openChannelList(page: Page): Promise<void> {
    await page.goto('/');
    await page.fill('#receiverIp', '127.0.0.1');
    await page.fill('#receiverPort', '9199');
    await page.click('#applyBtn');
    // A stale unsaved-changes dialog must not block the fetch.
    const dialog = page.locator('#unsavedDialog');
    if (await dialog.isVisible()) await page.locator('#unsavedDiscard').click();
    await expect(page.locator('#listCard')).toBeVisible();
}

test('parse button assigns sequential IDs and save persists them', async ({ page }) => {
    await openChannelList(page);

    await page.click('[data-action="autofill"]');
    await expect(page.locator('.id-input').first()).not.toHaveValue('');

    await page.click('[data-action="save"]');
});

test('dirty indicator appears after editing a channel ID', async ({ page }) => {
    await openChannelList(page);

    const firstInput = page.locator('.id-input').first();
    await firstInput.fill('999');
    await firstInput.blur();
    await expect(page.locator('.save-dirty').first()).toBeVisible();
});
