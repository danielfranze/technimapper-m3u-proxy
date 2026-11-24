'use strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export default async () => {
    const DATA_DIR = path.join(os.tmpdir(), 'technimapper-e2e-mock');
    try {
        const pid = parseInt(fs.readFileSync(path.join(DATA_DIR, 'mock.pid'), 'utf8'), 10);
        process.kill(-pid, 'SIGTERM');
    } catch (e) { /* ignore */ }
    try { execSync('pkill -f mock-receiver.js', { stdio: 'ignore' }); } catch (e) { /* ignore */ }
};