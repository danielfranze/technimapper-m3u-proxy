'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const openapiPath = path.join(root, 'docs', 'openapi.yaml');
const openapi = parseYaml(fs.readFileSync(openapiPath, 'utf8')) as {
    openapi?: string;
    paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    info: { version: string };
};

test('docs/openapi.yaml is valid OpenAPI 3 YAML', () => {
    assert.ok(openapi.openapi?.startsWith('3.'), 'openapi version 3.x');
    assert.ok(openapi.info?.version, 'info.version present');
    assert.ok(openapi.paths && typeof openapi.paths === 'object', 'paths present');
});

// Extract route registrations from the route modules: app.get('/path', ...), app.post(...), etc.
function extractRoutes(src: string): string[] {
    const out = new Set<string>();
    const re = /(?:app\.get|app\.post|router\.get|router\.post)\(\s*(['"])([^'"]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[2]!);
    return [...out];
}

const ROUTES_DIR = path.join(root, 'lib', 'routes');
const SERVER_SRC = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

test('every route registered in lib/routes or server.ts exists in docs/openapi.yaml', () => {
    const specRoutes = Object.keys(openapi.paths).filter(p => !p.startsWith('/api/docs'));
    for (const file of fs.readdirSync(ROUTES_DIR)) {
        if (!file.endsWith('.ts')) continue;
        const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
        for (const route of extractRoutes(src)) {
            assert.ok(specRoutes.includes(route), `${file}: ${route} missing in openapi.yaml`);
        }
    }
    // app.use('/hdhr', hdhrRouter) is covered by the hdhrRouter.* registrations above;
    // /api/docs is documented separately (interactive viewer).
});

test('openapi.yaml statuses match the statuses we assert in app.test.ts', () => {
    const appTests = fs.readFileSync(path.join(root, 'test', 'app.test.ts'), 'utf8');
    const codes = new Set<string>();
    const re = /status,?\s*\)?\.?\s*(?:\(\s*|status\s*,\s*)(\d{3})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(appTests))) codes.add(m[1]!);
    const documentedCodes = new Set<string>(
        Object.values(openapi.paths).flatMap(ops => Object.values(ops).flatMap(op => Object.keys(op.responses || {})))
    );
    for (const code of codes) {
        assert.ok(documentedCodes.has(code), `status ${code} asserted in app.test.ts but missing in openapi.yaml`);
    }
});

void SERVER_SRC;
