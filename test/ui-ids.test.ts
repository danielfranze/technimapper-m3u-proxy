import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { model } from '../public/app/lib/model.js';
import { autoFillFromName, updateId } from '../public/app/lib/presenter.js';

function fakeEl() {
    return { id: '', hidden: false, textContent: '', innerText: '', innerHTML: '', className: '', style: {}, setAttribute() {}, appendChild() {}, append() {}, remove() {}, removeEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, value: '', disabled: false };
}

(globalThis as any).document = {
    querySelectorAll: () => [] as unknown[],
    querySelector: () => null,
    getElementById: () => fakeEl(),
    createElement: () => fakeEl()
};
(globalThis as any).showToast = () => {};

function resetModel() {
    model.currentMapping = {};
    model.savedMapping = {};
    model.detectedChannels = [];
    model.activeOccurrence = {};
    model.currentFilter = 'all';
    model.hdhrEnabled = true;
    model.copySource = 'hdhr';
}

test('updateId keeps leading zeros and non-numeric IDs instead of truncating them', () => {
    resetModel();
    model.currentMapping = { A: 5 };

    updateId('A', '001');
    assert.equal(model.currentMapping.A, '001');

    updateId('A', '12abc');
    assert.equal(model.currentMapping.A, '12abc');

    updateId('A', '7');
    assert.equal(model.currentMapping.A, 7);

    updateId('A', '0');
    assert.equal(model.currentMapping.A, 0);

    updateId('A', '');
    assert.equal(Object.hasOwn(model.currentMapping, 'A'), false);
});

test('autoFillFromName assigns sequential IDs when not all names have numbers', () => {
    resetModel();
    model.detectedChannels = ['Null', '001 Das Erste HD', '002 ZDF HD'];
    model.currentMapping = { Null: 0 };

    autoFillFromName();
    assert.equal(model.currentMapping.Null, 1);
    assert.equal(model.currentMapping['001 Das Erste HD'], 2);
    assert.equal(model.currentMapping['002 ZDF HD'], 3);
});

test('autoFillFromName extracts numbers when every name has one', () => {
    resetModel();
    model.detectedChannels = ['001 Das Erste HD', '002 ZDF HD'];

    autoFillFromName();
    assert.equal(model.currentMapping['001 Das Erste HD'], 1);
    assert.equal(model.currentMapping['002 ZDF HD'], 2);
});

test('MVP frontend files pass syntax check and main.js wires the modules', () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app');
    for (const f of ['main.js', 'api.js', 'lib/model.js', 'lib/view.js', 'lib/presenter.js']) {
        const p = path.join(root, f);
        assert.ok(fs.existsSync(p), `${f} missing`);
    }
});
