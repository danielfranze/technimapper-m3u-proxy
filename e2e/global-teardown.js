'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async () => {
    const DATA_DIR = path.join(os.tmpdir(), 'technimapper-e2e-mock');
    try {
        const pid = parseInt(fs.readFileSync(path.join(DATA_DIR, 'mock.pid'), 'utf8'), 10);
        process.kill(-pid, 'SIGTERM');
    } catch (e) { /* ignore */ }
    const { execSync } = require('child_process');
    try { execSync('pkill -f mock-receiver.js', { stdio: 'ignore' }); } catch (e) { /* ignore */ }
};