import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const MOCK_PORT = 9199;
const DATA_DIR = path.join(os.tmpdir(), 'technimapper-e2e-mock');

export default async (): Promise<void> => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const mapping = {
        ip: '127.0.0.1',
        port: String(MOCK_PORT),
        cronExpression: '*/5 * * * *',
        selectedListName: 'TV-Liste',
        mapping: {},
        channels: [],
        lastSync: null,
        detectedModel: null,
    };
    fs.writeFileSync(path.join(DATA_DIR, 'mapping.json'), JSON.stringify(mapping, null, 2));
    console.log('global-setup: seeded', path.join(DATA_DIR, 'mapping.json'));

    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'mock-receiver.js')], {
        env: { ...process.env, MOCK_RECEIVER_PORT: String(MOCK_PORT) },
        stdio: 'inherit',
        detached: true,
    });
    child.unref();
    if (child.pid !== undefined) fs.writeFileSync(path.join(DATA_DIR, 'mock.pid'), String(child.pid));
    console.log('global-setup: started mock receiver pid', child.pid);

    await new Promise<void>((resolve, reject) => {
        const tryConnect = () => {
            const req = http.get(`http://127.0.0.1:${MOCK_PORT}/`, (res) => {
                res.resume();
                resolve();
            });
            req.on('error', () => setTimeout(tryConnect, 200));
        };
        tryConnect();
        setTimeout(() => reject(new Error('mock receiver not ready')), 10000);
    });
    console.log('global-setup: mock receiver ready');
};
