import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8');
const css: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'styles.css'), 'utf8');
const script: string = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8')
    + fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'view.js'), 'utf8');

test('the channel list uses a custom dropdown that is a listbox, not a visible native select', () => {
    assert.ok(html.includes('id="listToggle"') && html.includes('aria-haspopup="listbox"'));
    assert.ok(html.includes('id="listMenu"') && html.includes('role="listbox"'));
    assert.match(html, /<select id="selectedListName" hidden tabindex="-1" aria-hidden="true">/);
    assert.ok(!html.includes('onchange="fetchChannels()"'), 'picking a list must go through chooseList()');
    assert.match(html, /<label id="listLabel" for="listToggle">Target Channel List<\/label>/);
});

test('the hidden select is only touched by the dropdown helpers', () => {
    const view = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'view.js'), 'utf8');
    const main = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'main.js'), 'utf8');
    const uses = (main + view).match(/(?:getElementById|byId)\('selectedListName'\)/g) || [];
    assert.equal(uses.length, 1, 'only listSelect() in view.js may access the hidden select');
    assert.ok(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'presenter.js'), 'utf8').includes('setListOptions(data.availableLists, data.selectedListName)'));
    assert.ok(main.includes('setSelectedList(model.activeListName)') || fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'lib', 'presenter.js'), 'utf8').includes('setSelectedList(model.activeListName)'));
});

test('the copy menu and the channel list share one menu style', () => {
    for (const cls of ['.dd-menu', '.dd-title', '.dd-item', '.dd-check']) assert.ok(html.includes(cls) || css.includes(cls), cls);
    assert.ok(!/split-(menu|item|check)/.test(html), 'old menu class names must be gone');
});

test('the word M3U8 is used everywhere in the UI (only the #EXTM3U file header is exempt)', () => {
    assert.equal(html.replace(/M3U8/g, '').match(/M3U/g), null);
    assert.ok(script.includes('/playlist.m3u8'));
    assert.ok(!/playlist\.m3u(?!8)/.test(html));
});
