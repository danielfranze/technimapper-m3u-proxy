import assert from 'node:assert/strict';
import test from 'node:test';
import { model } from '../frontend/lib/model.ts';
import { autoFillFromName, updateId } from '../frontend/lib/presenter.ts';

// Test-local typed view of the MVP model (the frontend is JS; the tests are TS).
type UiModel = {
    currentMapping: Record<string, string | number>;
    savedMapping: Record<string, string | number>;
    detectedChannels: string[];
    activeOccurrence: Record<string, number>;
    currentFilter: string;
    hdhrEnabled: boolean;
    copySource: string;
};
const ui: UiModel = model as unknown as UiModel;

function fakeEl(): Record<string, unknown> {
    return {
        id: '',
        hidden: false,
        textContent: '',
        innerText: '',
        innerHTML: '',
        className: '',
        style: {},
        setAttribute() {},
        appendChild() {},
        append() {},
        remove() {},
        removeEventListener() {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        value: '',
        disabled: false,
        querySelector: () => null,
        querySelectorAll: () => [],
        focus() {},
    };
}

Object.assign(globalThis, {
    document: {
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => fakeEl(),
        createElement: () => fakeEl(),
    },
});
(globalThis as Record<string, unknown>).showToast = () => undefined;

function resetModel() {
    ui.currentMapping = {};
    ui.savedMapping = {};
    ui.detectedChannels = [];
    ui.activeOccurrence = {};
    ui.currentFilter = 'all';
    ui.hdhrEnabled = true;
    ui.copySource = 'hdhr';
}

test('updateId keeps leading zeros and non-numeric IDs instead of truncating them', () => {
    resetModel();
    ui.currentMapping = { A: 5 };

    updateId('A', '001');
    assert.equal(ui.currentMapping.A, '001');

    updateId('A', '12abc');
    assert.equal(ui.currentMapping.A, '12abc');

    updateId('A', '7');
    assert.equal(ui.currentMapping.A, 7);

    updateId('A', '0');
    assert.equal(ui.currentMapping.A, 0);

    updateId('A', '');
    assert.equal(Object.hasOwn(ui.currentMapping, 'A'), false);
});

test('autoFillFromName assigns sequential IDs when not all names have numbers', () => {
    resetModel();
    ui.detectedChannels = ['Null', '001 Das Erste HD', '002 ZDF HD'];
    ui.currentMapping = { Null: 0 };

    autoFillFromName();
    assert.equal(ui.currentMapping.Null, 1);
    assert.equal(ui.currentMapping['001 Das Erste HD'], 2);
    assert.equal(ui.currentMapping['002 ZDF HD'], 3);
});

test('autoFillFromName extracts numbers when every name has one', () => {
    resetModel();
    ui.detectedChannels = ['001 Das Erste HD', '002 ZDF HD'];

    autoFillFromName();
    assert.equal(ui.currentMapping['001 Das Erste HD'], 1);
    assert.equal(ui.currentMapping['002 ZDF HD'], 2);
});
