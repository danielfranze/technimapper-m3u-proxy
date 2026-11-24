import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8');

const grab = (name: string, isAsync: boolean = false): string => {
    const m = script.match(new RegExp(`    ${isAsync ? 'async ' : ''}function ${name}\\([\\s\\S]*?\\n    \\}\\n`));
    assert.ok(m, `function ${name} not found in index.html`);
    return m[0];
};

interface DirtyUi {
    isDirty(): boolean;
    mappingsEqual(a: Record<string, string | number>, b: Record<string, string | number>): boolean;
    updateId(name: string, value: string): void;
    saveMapping(): Promise<boolean>;
    load(current: Record<string, string | number>, saved: Record<string, string | number>, channels?: string[]): void;
    current(): Record<string, string | number>;
    saved(): Record<string, string | number>;
}

interface DirtyUiStubs {
    showToast: (...args: unknown[]) => void;
    renderTable: () => void;
    fetch: (url: string, options?: unknown) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
    document: { querySelectorAll(selector: string): unknown[] };
}

/** Loads the unsaved-changes logic of the web UI with stubbed browser APIs. */
function loadUi({ fetchImpl }: { fetchImpl?: () => Promise<{ ok: boolean; json(): Promise<unknown> }> } = {}): { ui: DirtyUi; toasts: unknown[][] } {
    const toasts: unknown[][] = [];
    const factory = new Function('stubs', `
        let currentMapping = {};
        let savedMapping = {};
        let detectedChannels = [];
        const activeOccurrence = {};
        const { showToast, renderTable, fetch, document } = stubs;
        const BACKEND_URL = '';
        ${['getDuplicateGroups', 'describeDuplicates', 'getActiveMapping', 'getOrphans', 'mappingsEqual', 'isDirty',
        'updateDirtyIndicator', 'updateId'].map(n => grab(n)).join('\n')}
        ${grab('saveMapping', true)}
        return { isDirty, mappingsEqual, updateId, saveMapping,
            load(current, saved, channels = []) { currentMapping = current; savedMapping = saved; detectedChannels = channels; },
            current: () => currentMapping, saved: () => savedMapping };
    `) as (stubs: DirtyUiStubs) => DirtyUi;
    const ui = factory({
        showToast: (...args: unknown[]) => toasts.push(args),
        renderTable: () => {},
        fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ success: true, duplicateGroups: [], orphans: [] }) })),
        document: { querySelectorAll: () => [] }
    });
    return { ui, toasts };
}

test('mappingsEqual ignores order and treats "5" and 5 alike', () => {
    const { ui } = loadUi();
    assert.equal(ui.mappingsEqual({ A: 1, B: '2' }, { B: 2, A: '1' }), true);
    assert.equal(ui.mappingsEqual({ A: 1 }, { A: 2 }), false);
    assert.equal(ui.mappingsEqual({ A: 1 }, { A: 1, B: 2 }), false);
    assert.equal(ui.mappingsEqual({}, {}), true);
});

test('isDirty follows edits and becomes clean again when an edit is reverted', () => {
    const { ui } = loadUi();
    ui.load({ A: 1 }, { A: 1 });
    assert.equal(ui.isDirty(), false);
    ui.updateId('A', '5');
    assert.equal(ui.isDirty(), true);
    ui.updateId('A', '1');
    assert.equal(ui.isDirty(), false);
    ui.updateId('B', '2');
    assert.equal(ui.isDirty(), true);
    ui.updateId('B', '');
    assert.equal(ui.isDirty(), false);
});

test('a successful save returns true and makes the state clean', async () => {
    const { ui, toasts } = loadUi();
    ui.load({ A: 1 }, {});
    assert.equal(ui.isDirty(), true);
    assert.equal(await ui.saveMapping(), true);
    assert.equal(ui.isDirty(), false);
    assert.deepEqual(toasts.at(-1), ['Mappings saved successfully!']);
});

test('a failed save returns false and keeps the changes marked as unsaved', async () => {
    const { ui, toasts } = loadUi({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Invalid channel ID' }) }) });
    ui.load({ A: 'bad id' }, {});
    assert.equal(await ui.saveMapping(), false);
    assert.equal(ui.isDirty(), true);
    assert.equal(toasts.at(-1)![1], 'error');
});
