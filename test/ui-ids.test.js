'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

const grab = (name) => {
    const match = script.match(new RegExp(`    function ${name}\\([\\s\\S]*?\\n    \\}\\n`));
    assert.ok(match, `function ${name} not found in index.html`);
    return match[0];
};

function loadUi() {
    const factory = new Function('stubs', `
        let currentMapping = {};
        let detectedChannels = [];
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

test('autoFillFromName treats ID 0 as mapped and preserves leading zeros', () => {
    const ui = loadUi();
    ui.load({ Null: 0 }, ['Null', '001 Das Erste HD', '002 ZDF HD']);

    ui.autoFillFromName();
    assert.equal(ui.current().Null, 0, 'an existing ID 0 must not be overwritten or duplicated');
    assert.equal(ui.current()['001 Das Erste HD'], '001');
    assert.equal(ui.current()['002 ZDF HD'], '002');
});
