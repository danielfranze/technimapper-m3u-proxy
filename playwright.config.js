import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const E2E_DATA_DIR = path.join(os.tmpdir(), 'technimapper-e2e-mock');
fs.mkdirSync(E2E_DATA_DIR, { recursive: true });

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    globalTeardown: './e2e/global-teardown.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    outputDir: path.join(os.tmpdir(), 'technimapper-playwright-results'),
    use: {
        baseURL: 'http://127.0.0.1:9191',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    webServer: {
        command: 'npm start',
        url: 'http://127.0.0.1:9191/health/live',
        reuseExistingServer: false,
        timeout: 30000,
        env: {
            LOG_LEVEL: 'warn',
            DATA_DIR: E2E_DATA_DIR,
            ALLOW_NON_PRIVATE_IP: 'true',
            ALLOW_LOOPBACK_RECEIVER: 'true'
        }
    }
});
