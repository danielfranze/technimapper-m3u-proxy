'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStateStore } = require('../lib/state-store');

test('state store commits immutable snapshots', () => {
    const store = createStateStore({ count: 1, nested: { value: 2 } });
    const first = store.get();

    store.commit({ count: 2, nested: { value: 3 } });
    const second = store.get();

    assert.notEqual(first, second);
    assert.equal(first.count, 1);
    assert.equal(second.count, 2);
    assert.throws(() => { first.count = 9; }, TypeError);
    assert.throws(() => { second.nested.value = 9; }, TypeError);
});

test('state store update clones before mutating', () => {
    const store = createStateStore({ items: [1, 2] });
    const before = store.get();

    const after = store.update(draft => { draft.items.push(3); draft.items[0] = 9; });

    assert.deepEqual(before.items, [1, 2]);
    assert.deepEqual(after.items, [9, 2, 3]);
    assert.notEqual(before, after);
});
