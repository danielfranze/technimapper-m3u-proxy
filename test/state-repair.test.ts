import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPersistedState, createState } from '../lib/state.js';
import { createDeps, type Deps } from '../test-helpers/state-deps.ts';

function deps(logger: Deps['logger']): Deps {
    return createDeps(logger);
}

test('repairPersistedSettings repairs port, cron and list name', () => {
    const warnings: string[] = [];
    const logger = { warn: (...args: unknown[]) => warnings.push(args.join(' ')), info() {}, error() {} };
    const state = createState();
    applyPersistedState(
        state,
        {
            ip: '192.168.1.10',
            port: '70000',
            cronExpression: 'bad',
            selectedListName: '',
            mapping: {},
            channels: [],
        },
        deps(logger),
    );

    assert.equal(state.config.port, '9100');
    assert.equal(state.config.cronExpression, '*/5 * * * *');
    assert.equal(state.config.selectedListName, 'TV-Liste');
    assert.ok(warnings.length >= 3);
});
