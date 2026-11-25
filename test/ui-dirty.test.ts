import test from 'node:test';
import assert from 'node:assert/strict';
import { model } from '../frontend/lib/model.ts';

type UiModel = {
    currentMapping: Record<string, string | number>;
    savedMapping: Record<string, string | number>;
    detectedChannels: string[];
    activeOccurrence: Record<string, number>;
    currentFilter: string;
    hdhrEnabled: boolean;
    copySource: string;
    isDirty(): boolean;
    mappingsEqual(a: unknown, b: unknown): boolean;
};
const ui = model as unknown as UiModel;

function resetModel() {
    ui.currentMapping = {};
    ui.savedMapping = {};
    ui.detectedChannels = [];
    ui.activeOccurrence = {};
    ui.currentFilter = 'all';
    ui.hdhrEnabled = true;
    ui.copySource = 'hdhr';
}

function fakeEl() {
    return { id: '', hidden: false, textContent: '', innerText: '', innerHTML: '', className: '', style: {}, setAttribute() {}, appendChild() {}, append() {}, remove() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, value: '', disabled: false };
}

// Minimal document stub so model/view logic can run headless.
Object.assign(globalThis, {
    document: {
        querySelectorAll: () => [] as unknown[],
        querySelector: () => null,
        getElementById: () => fakeEl(),
        createElement: () => fakeEl(),
    },
});

test('mappingsEqual ignores order and treats "5" and 5 alike', () => {
    resetModel();
    assert.equal(ui.mappingsEqual({ A: 1, B: '2' }, { B: 2, A: '1' }), true);
    assert.equal(ui.mappingsEqual({ A: 1 }, { A: 2 }), false);
    assert.equal(ui.mappingsEqual({ A: 1 }, { A: 1, B: 2 }), false);
    assert.equal(ui.mappingsEqual({}, {}), true);
});

test('isDirty follows edits and becomes clean again when an edit is reverted', () => {
    resetModel();
    ui.currentMapping = { A: 1 };
    ui.savedMapping = { A: 1 };
    assert.equal(ui.isDirty(), false);
    ui.currentMapping = { A: '5' };
    assert.equal(ui.isDirty(), true);
    ui.currentMapping = { A: '1' };
    assert.equal(ui.isDirty(), false);
    ui.currentMapping = { A: 1, B: 2 };
    assert.equal(ui.isDirty(), true);
    ui.currentMapping = { A: 1 };
    assert.equal(ui.isDirty(), false);
});
