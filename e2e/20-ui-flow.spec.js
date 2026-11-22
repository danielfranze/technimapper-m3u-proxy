import { expect, test } from '@playwright/test';

test('parse button assigns sequential IDs and save persists them', async ({ page }) => {
    await page.goto('/');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    await page.click('[data-action="autofill"]');
    await expect(page.locator('.id-input').first()).not.toHaveValue('');

    await page.click('[data-action="save"]');
});

test('dirty indicator appears after editing a channel ID', async ({ page }) => {
    await page.goto('/');
    await page.click('#applyBtn');
    await expect(page.locator('#listCard')).toBeVisible();

    const firstInput = page.locator('.id-input').first();
    await firstInput.fill('999');
    await firstInput.blur();
    await expect(page.locator('.save-dirty').first()).toBeVisible();
});