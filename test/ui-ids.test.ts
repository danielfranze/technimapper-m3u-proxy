import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8');

const grab = (name) => {
    const match = script.match(new RegExp(`    function ${name}\\([\\s\\S]*?\\n    \\}\\n`));
    assert.ok(match, `function ${name} not found in index.html`);
    return match[0];
};

function loadUi() {
    const factory = new Function('stubs', `
        let currentMapping = {};
        let detectedChannels = [];
        let currentFilter = 'all';
        const activeOccurrence = {};
        const { showToast, renderTable, updateDirtyIndicator } = stubs;
        ${grab('updateId')}
        ${grab('autoFillFromName')}
        return {
            updateId,
            autoFillFromName,
            load(mapping, channels = []) { currentMapping = mapping; detectedChannels = channels; },
            current: () => currentMapping
        };
    `);

    return factory({ showToast() {}, renderTable() {}, updateDirtyIndicator() {} });
}

test('updateId keeps leading zeros and non-numeric IDs instead of truncating them', () => {
    const ui = loadUi();
    ui.load({ A: 5 });

    ui.updateId('A', '001');
    assert.equal(ui.current().A, '001');

    ui.updateId('A', '12abc');
    assert.equal(ui.current().A, '12abc');

    ui.updateId('A', '7');
    assert.equal(ui.current().A, 7);

    ui.updateId('A', '0');
    assert.equal(ui.current().A, 0);

    ui.updateId('A', '');
    assert.equal(Object.hasOwn(ui.current(), 'A'), false);
});

test('autoFillFromName assigns sequential IDs when not all names have numbers', () => {
    const ui = loadUi();
    ui.load({ Null: 0 }, ['Null', '001 Das Erste HD', '002 ZDF HD']);

    ui.autoFillFromName();
    // Not all names yield a number, so IDs are assigned 1, 2, 3 in order
    // and the previously stored ID is overwritten (Save keeps or discards).
    assert.equal(ui.current().Null, 1);
    assert.equal(ui.current()['001 Das Erste HD'], 2);
    assert.equal(ui.current()['002 ZDF HD'], 3);
});

test('autoFillFromName extracts numbers when every name has one', () => {
    const ui = loadUi();
    ui.load({}, ['001 Das Erste HD', '002 ZDF HD']);

    ui.autoFillFromName();
    assert.equal(ui.current()['001 Das Erste HD'], 1);
    assert.equal(ui.current()['002 ZDF HD'], 2);
});
