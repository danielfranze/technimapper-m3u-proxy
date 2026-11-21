'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app', 'main.js'), 'utf8');

test('the channel list uses a custom dropdown that is a listbox, not a visible native select', () => {
    assert.ok(html.includes('id="listToggle"') && html.includes('aria-haspopup="listbox"'));
    assert.ok(html.includes('id="listMenu"') && html.includes('role="listbox"'));
    assert.match(html, /<select id="selectedListName" hidden tabindex="-1" aria-hidden="true">/);
    assert.ok(!html.includes('onchange="fetchChannels()"'), 'picking a list must go through chooseList()');
    assert.match(html, /<label id="listLabel" for="listToggle">Target Channel List<\/label>/);
});

test('the hidden select is only touched by the dropdown helpers', () => {
    const uses = script.match(/getElementById\('selectedListName'\)/g) || [];
    assert.equal(uses.length, 1, 'only listSelect() may access the hidden select');
    assert.ok(script.includes('setListOptions(data.availableLists, data.selectedListName)'));
    assert.ok(script.includes('if (activeListName) setSelectedList(activeListName);'));
});

test('the copy menu and the channel list share one menu style', () => {
    for (const cls of ['.dd-menu', '.dd-title', '.dd-item', '.dd-check']) assert.ok(html.includes(cls), cls);
    assert.ok(!/split-(menu|item|check)/.test(html), 'old menu class names must be gone');
});

test('the word M3U8 is used everywhere in the UI (only the #EXTM3U file header is exempt)', () => {
    assert.equal(html.replace(/M3U8/g, '').match(/M3U/g), null);
    assert.ok(script.includes('/playlist.m3u8'));
    assert.ok(!/playlist\.m3u(?!8)/.test(html));
});
