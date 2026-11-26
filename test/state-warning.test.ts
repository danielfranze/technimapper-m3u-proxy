import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPersistedState, createState } from '../dist/lib/state.js';
import { createDeps } from '../test-helpers/state-deps.ts';

test('repairPersistedSettings warns about a disallowed receiver IP', () => {
    const warnings: string[] = [];
    const logger = { warn: (...args: unknown[]) => warnings.push(args.join(' ')), info() {}, error() {} };
    const deps = createDeps(logger);

    const state = createState();
    applyPersistedState(
        state,
        {
            ip: '8.8.8.8',
            port: '9100',
            cronExpression: '*/5 * * * *',
            selectedListName: 'TV-Liste',
            mapping: {},
            channels: [],
        },
        deps,
    );

    assert.ok(warnings.some((w) => /not allowed/.test(w)));
});
