import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Use a fresh, run-specific data directory so E2E runs never share persisted state.
const e2eDataDir = path.join(os.tmpdir(), `technimapper-e2e-${process.pid}`);
fs.mkdirSync(e2eDataDir, { recursive: true });

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
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
            DATA_DIR: e2eDataDir
        }
    }
});
