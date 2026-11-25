import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Minimal browser-API stubs, so model/view/presenter run headless in Node.
// ---------------------------------------------------------------------------

type Id = string;

interface ElementStub {
    id: Id;
    hidden: boolean;
    className: string;
    title: string;
    value: string;
    disabled: boolean;
    textContent: string;
    innerText: string;
    innerHTML: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    ariaSelected?: string;
    listeners: Map<string, Array<(e?: unknown) => void>>;
    keydown?: (e?: unknown) => void;
    appendChild(el: ElementStub): void;
    append(): void;
    setAttribute(name: string, value: string): void;
    classList: {
        add(...c: string[]): void;
        remove(...c: string[]): void;
        toggle(c: string): void;
        contains(c: string): boolean;
    };
    querySelector(selector: string): ElementStub | null;
    querySelectorAll(selector: string): ElementStub[];
    closest(selector: string): ElementStub | null;
    focus(): void;
    getBoundingClientRect(): { top: number; left: number; width: number; height: number; right: number; bottom: number };
    childNodes: ElementStub[];
    [key: string]: unknown;
}

function makeElement(id: Id): ElementStub {
    return {
        id,
        hidden: false,
        className: '',
        title: '',
        value: '',
        disabled: false,
        textContent: '',
        innerText: '',
        innerHTML: '',
        style: {},
        dataset: {},
        listeners: new Map(),
        options: [],
        appendChild(el: ElementStub) { this.childNodes = (this.childNodes as ElementStub[]).concat([el]); },
        append: () => undefined,
        remove: () => undefined,
        childNodes: [] as ElementStub[],
        replaceChildren: () => undefined,
        insertBefore: () => undefined,
        setAttribute() { /* store in dataset for asserts */ },
        classList: {
            add: () => undefined,
            remove: () => undefined,
            toggle: () => undefined,
            contains: () => false
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => getOrCreateElement('closest-stub'),
        focus: () => undefined,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 })
    };
}

const elements: Map<Id, ElementStub> = new Map();
function getOrCreateElement(id: Id): ElementStub {
    let el = elements.get(id);
    if (!el) { el = makeElement(id); elements.set(id, el); }
    return el;
}

const documentStub: {
    hidden: boolean;
    querySelectorAll(selector: string): ElementStub[];
    querySelector(selector: string): ElementStub | null;
    getElementById(id: Id): ElementStub;
    createElement(tag: string): ElementStub;
} = {
    hidden: false,
    querySelectorAll: () => [] as ElementStub[],
    querySelector: () => null,
    getElementById: (id: Id) => getOrCreateElement(id),
    createElement: (tag: string) => makeElement(tag)
};
(globalThis as Record<string, unknown>).document = documentStub;
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: undefined }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: () => undefined }, configurable: true });

// Imports after the browser stubs.
const { model } = await import('../public/app/lib/model.js');
const { renderTable, updateDirtyIndicator, showToast, handleSearchInput } = await import('../public/app/lib/view.js');
const { autoFillFromName, updateId, fetchChannels } = await import('../public/app/lib/presenter.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface SetModelInput {
    currentMapping?: Record<string, string | number>;
    savedMapping?: Record<string, string | number>;
    detectedChannels?: string[];
    currentFilter?: string;
    hdhrEnabled?: boolean;
}

function setModel(data: SetModelInput = {}): void {
    model.currentMapping = (data.currentMapping ?? {}) as unknown as typeof model.currentMapping;
    model.savedMapping = (data.savedMapping ?? {}) as unknown as typeof model.savedMapping;
    model.detectedChannels = (data.detectedChannels ?? []) as unknown as typeof model.detectedChannels;
    model.currentFilter = data.currentFilter ?? 'all';
    model.hdhrEnabled = data.hdhrEnabled ?? true;
    // Reset search inputs so tests do not leak state into each other.
    documentStub.getElementById('searchInput').value = '';
    documentStub.getElementById('searchInputMobile').value = '';
}

function rows(tbodyId = 'channelTableBody'): string[] {
    const body = (globalThis as unknown as { document: { getElementById: (id: Id) => ElementStub } }).document.getElementById(tbodyId);
    return [...body.innerHTML.matchAll(/<tr class="[^"]*"[^>]*>/g)].map(m => m[0]);
}

// ---------------------------------------------------------------------------
// Model tests
// ---------------------------------------------------------------------------

test('model: mappingsEqual ignores order and treats "5" and 5 alike', () => {
    setModel({});
    assert.equal(model.mappingsEqual({ A: 1, B: '2' }, { B: 2, A: '1' }), true);
    assert.equal(model.mappingsEqual({ A: 1 }, { A: 2 }), false);
    assert.equal(model.mappingsEqual({}, {}), true);
});

test('model: isDirty follows currentMapping vs savedMapping', () => {
    setModel({ currentMapping: { A: 1 }, savedMapping: { A: 1 } });
    assert.equal(model.isDirty(), false);
    model.currentMapping = { A: 2 };
    assert.equal(model.isDirty(), true);
    model.currentMapping = { A: 1 };
    assert.equal(model.isDirty(), false);
});

test('model: getActiveMapping filters to detected channels', () => {
    setModel({ detectedChannels: ['A'], currentMapping: { A: 1, B: 2 } });
    assert.deepEqual(model.getActiveMapping(), { A: 1 });
    setModel({});
    assert.deepEqual(model.getActiveMapping(), {});
});

test('model: getOrphans lists mapped channels not on the receiver', () => {
    setModel({ detectedChannels: ['A'], currentMapping: { A: 1, B: 2 } });
    assert.deepEqual(model.getOrphans(), ['B']);
    setModel({});
    assert.deepEqual(model.getOrphans(), []);
});

test('model: getDuplicateGroups returns groups of shared IDs', () => {
    setModel({});
    assert.deepEqual(model.getDuplicateGroups({ A: 1, B: 1, C: 2 }), [{ id: '1', channels: ['A', 'B'] }]);
    assert.deepEqual(model.getDuplicateGroups({ A: 1 }), []);
});

// ---------------------------------------------------------------------------
// View tests
// ---------------------------------------------------------------------------

test('view: updateDirtyIndicator toggles visibility of save buttons', () => {
    const saveBtns = [getOrCreateElement('save1'), getOrCreateElement('save2')];
    saveBtns.forEach(el => { el.className = 'save-btn'; el.hidden = true; });
    documentStub.querySelectorAll = () => saveBtns;

    setModel({ currentMapping: { A: 1 }, savedMapping: { A: 1 } });
    updateDirtyIndicator();
    assert.ok(saveBtns.every(el => el.hidden), 'no dirty dot when clean');

    setModel({ currentMapping: { A: 2 }, savedMapping: { A: 1 } });
    updateDirtyIndicator();
    assert.ok(!saveBtns.every(el => el.hidden), 'dirty dot visible');
});

test('view: renderTable filters rows by the search input and hides unmapped rows when filtered', () => {
    const searchInput = getOrCreateElement('searchInput');
    setModel({ detectedChannels: ['001 A', '002 B'], currentMapping: {} });
    const tbody = (globalThis as unknown as { document: { getElementById: (id: Id) => ElementStub } }).document.getElementById('channelTableBody');
    tbody.innerHTML = '';
    renderTable();
    assert.equal(rows().length, 2, 'all rows when search empty');

    searchInput.value = 'a';
    handleSearchInput('a');
    // handleSearchInput debounces by 150ms – wait for it in this test
    const done = (async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        assert.equal(rows().length, 1, 'only matching rows visible');
        assert.ok(tbody.innerHTML.includes('001 A'));
    })();
    return done;
});

test('view: showToast appends to the toast container', () => {
    const container = (globalThis as unknown as { document: { getElementById: (id: Id) => ElementStub } }).document.getElementById('toast-container');
    const before = container.childNodes.length;
    showToast('hello', 'error');
    assert.equal(container.childNodes.length, before + 1, 'a new toast element was added');
});

// ---------------------------------------------------------------------------
// Presenter tests
// ---------------------------------------------------------------------------

test('presenter: autoFillFromName assigns sequential IDs when names have no numbers', () => {
    setModel({ detectedChannels: ['Null', 'A'], currentMapping: { Null: 0 } });
    autoFillFromName();
    assert.equal((model.currentMapping as Record<string, unknown>).Null, 1);
});

test('presenter: updateId keeps leading zeros and numeric IDs as numbers', () => {
    setModel({ currentMapping: {}, detectedChannels: ['A', 'B'] });
    updateId('A', '001');
    assert.equal((model.currentMapping as Record<string, unknown>).A, '001');
    updateId('B', '2');
    assert.equal((model.currentMapping as Record<string, unknown>).B, 2);
});

test('presenter: fetchChannels uses api helpers', async () => {
    // Stub global fetch used by public/app/api.js
    const fetchCalls: Array<{ url: string; method?: string | undefined }> = [];
    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: (url: string, init?: { method?: string }) => {
            fetchCalls.push({ url, method: init?.method });
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    channels: ['Das Erste HD', 'ZDF HD'],
                    selectedListName: 'TV-Liste',
                    availableLists: ['TV-Liste'],
                    detectedModel: 'STC',
                    mapping: {}
                })
            });
        }
    });

    setModel({ currentMapping: {}, savedMapping: {}, detectedChannels: [] });
    const listCard = (globalThis as unknown as { document: { getElementById: (id: Id) => ElementStub } }).document.getElementById('listCard');
    await fetchChannels();
    assert.equal(model.detectedChannels.length, 2, 'detected channels loaded');
    assert.equal(listCard.style.display, 'block');
});

test('MVP frontend files are syntactically valid', () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app');
    for (const f of ['main.js', 'api.js', 'lib/model.js', 'lib/view.js', 'lib/presenter.js']) {
        assert.ok(fs.existsSync(path.join(root, f)), `${f} missing`);
    }
});
