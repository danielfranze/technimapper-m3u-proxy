import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverJs = path.join(root, 'dist', 'server.js');

interface BootEnv {
    dataDir: string;
    port: number;
}

let bootEnv: BootEnv | undefined;

function startServer(): { proc: ChildProcess; base: string } {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technimapper-boot-'));
    const port = 30000 + Math.floor(Math.random() * 10000);
    const proc = spawn(process.execPath, [serverJs], {
        env: {
            ...process.env,
            DATA_DIR: dataDir,
            PORT: String(port),
            LOG_LEVEL: 'error',
            NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    bootEnv = { dataDir, port };
    const base = `http://127.0.0.1:${port}`;
    return { proc, base };
}

async function waitForHealth(base: string, attempts = 50): Promise<void> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(`${base}/health/live`);
            if (res.ok) return;
        } catch (err) {
            lastErr = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`server did not become ready: ${String(lastErr)}`);
}

function signal(proc: ChildProcess, sig: NodeJS.Signals): Promise<number> {
    return new Promise((resolve) => {
        proc.once('exit', (code) => resolve(code ?? -1));
        proc.kill(sig);
    });
}

test('server boots, serves health endpoints and exits cleanly on SIGTERM', async () => {
    const { proc, base } = startServer();
    try {
        await waitForHealth(base);

        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        const healthBody = (await health.json()) as {
            status: string;
            version: string;
            configured: boolean;
            playlistAvailable: boolean;
        };
        assert.equal(healthBody.status, 'ok', 'health payload contains status ok');
        assert.equal(healthBody.version, '2.0.0-rc.6');
        assert.equal(healthBody.configured, false);
        assert.equal(healthBody.playlistAvailable, false);

        const ready = await fetch(`${base}/health/ready`);
        assert.equal(ready.status, 200, 'unconfigured instance is ready');

        const live = await fetch(`${base}/health/live`);
        assert.equal(live.status, 200);

        const liveness = await fetch(`${base}/health/liveness`);
        assert.equal(liveness.status, 200, 'alias /health/liveness exists');

        const notFound = await fetch(`${base}/api/does-not-exist`);
        assert.equal(notFound.status, 404);
    } finally {
        const code = await signal(proc, 'SIGTERM');
        assert.equal(code, 0, 'SIGTERM leads to graceful exit code 0');
    }
    assert.ok(bootEnv, 'boot env set');
    assert.ok(fs.existsSync(bootEnv.dataDir), 'data dir created');
});
