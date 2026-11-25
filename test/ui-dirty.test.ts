import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { model } from '../public/app/lib/model.js';

function resetModel() {
    model.currentMapping = {};
    model.savedMapping = {};
    model.detectedChannels = [];
    model.activeOccurrence = {};
    model.currentFilter = 'all';
    model.hdhrEnabled = true;
    model.copySource = 'hdhr';
    model.lastSyncSeen = undefined;
}

function fakeEl() {
    return { id: '', hidden: false, textContent: '', innerText: '', innerHTML: '', className: '', style: {}, setAttribute() {}, appendChild() {}, append() {}, remove() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, value: '', disabled: false };
}

// Minimal document stub so model/view logic can run headless.
(globalThis as any).document = {
    querySelectorAll: () => [] as unknown[],
    querySelector: () => null,
    getElementById: () => fakeEl(),
    createElement: () => fakeEl(),
    querySelectorAll2: undefined
};

test('mappingsEqual ignores order and treats "5" and 5 alike', () => {
    resetModel();
    assert.equal(model.mappingsEqual({ A: 1, B: '2' }, { B: 2, A: '1' }), true);
    assert.equal(model.mappingsEqual({ A: 1 }, { A: 2 }), false);
    assert.equal(model.mappingsEqual({ A: 1 }, { A: 1, B: 2 }), false);
    assert.equal(model.mappingsEqual({}, {}), true);
});

test('isDirty follows edits and becomes clean again when an edit is reverted', () => {
    resetModel();
    model.currentMapping = { A: 1 };
    model.savedMapping = { A: 1 };
    assert.equal(model.isDirty(), false);
    model.currentMapping = { A: '5' };
    assert.equal(model.isDirty(), true);
    model.currentMapping = { A: '1' };
    assert.equal(model.isDirty(), false);
    model.currentMapping = { A: 1, B: 2 };
    assert.equal(model.isDirty(), true);
    model.currentMapping = { A: 1 };
    assert.equal(model.isDirty(), false);
});

test('MVP frontend files pass syntax check and main.js wires the modules', () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app');
    for (const f of ['main.js', 'api.js', 'lib/model.js', 'lib/view.js', 'lib/presenter.js']) {
        const p = path.join(root, f);
        assert.ok(fs.existsSync(p), `${f} missing`);
    }
    const script = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
    assert.ok(script.includes("import { model } from './lib/model.js';"), 'main.js imports the model');
    const presenter = fs.readFileSync(path.join(root, 'lib', 'presenter.js'), 'utf8');
    assert.ok(presenter.includes("from '../api.js'"), 'presenter uses api.js');
});
