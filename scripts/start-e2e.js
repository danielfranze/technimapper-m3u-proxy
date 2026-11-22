'use strict';
console.log('start-e2e.js: starting');
// Starts the mock receiver and the app for E2E tests.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const mockPort = process.env.MOCK_RECEIVER_PORT || '9199';
const dataDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'technimapper-e2e-mock');
fs.mkdirSync(dataDir, { recursive: true });
// Seed a configured state pointing at the mock receiver.
const mapping = {
    ip: '127.0.0.1',
    port: String(mockPort),
    cronExpression: '*/5 * * * *',
    selectedListName: 'TV-Liste',
    mapping: {},
    channels: [],
    lastSync: null,
    detectedModel: null
};
fs.writeFileSync(path.join(dataDir, 'mapping.json'), JSON.stringify(mapping, null, 2));
console.log('E2E data dir:', dataDir);
console.log('Seeded mapping.json:', fs.readFileSync(path.join(dataDir, 'mapping.json'), 'utf8'));

const mock = spawn(process.execPath, ['scripts/mock-receiver.js'], {
    env: { ...process.env, MOCK_RECEIVER_PORT: mockPort },
    stdio: 'inherit'
});

// Wait for mock receiver to be ready.
function waitForMock(cb) {
    const req = http.get(`http://127.0.0.1:${mockPort}/`, (res) => { res.resume(); cb(); });
    req.on('error', () => setTimeout(() => waitForMock(cb), 200));
}
waitForMock(() => {
    const app = spawn('npm', ['start'], { stdio: 'inherit', env: process.env });
    app.on('exit', (code) => { try { mock.kill(); } catch (e) {} process.exit(code || 0); });
});

process.on('SIGTERM', () => { try { mock.kill(); } catch (e) {} process.exit(0); });
process.on('SIGINT', () => { try { mock.kill(); } catch (e) {} process.exit(0); });
