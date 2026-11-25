'use strict';

/**
 * Frontend MVP – main.js: event wiring / bootstrap. Thin layer that connects
 * DOM events to `presenter.js` actions. Logic lives in model + presenter.
 */

import { model } from './lib/model.js';
import { askUnsaved, removeStaleMappings, setFilter, autoFillFromName, updateId,
    saveMapping, exportConfig, loadInitialConfig, updateSyncTime, fetchChannels,
    chooseCopySource, chooseList, syncSearchInputs, handleImportFile } from './lib/presenter.js';
import { openCopyMenu, closeCopyMenu, toggleCopyMenu, openListMenu, closeListMenu,
    fitLayout, copySelectedUrl, listMenuItems } from './lib/view.js';

// Unsaved-changes dialog choices
document.querySelectorAll('#unsavedDialog [data-choice]').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById('unsavedDialog').close(btn.dataset.choice));
});

window.addEventListener('beforeunload', (event) => {
    if (model.isDirty()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

// ---- Copy menu wiring ----
document.getElementById('copyToggle').addEventListener('click', toggleCopyMenu);
document.getElementById('copyMenu').addEventListener('click', (event) => {
    const item = event.target.closest('.dd-item');
    if (item) chooseCopySource(item.dataset.source);
});

// ---- Channel list dropdown wiring ----
document.getElementById('listToggle').addEventListener('click', () => {
    if (document.getElementById('listMenu').hidden) openListMenu();
    else closeListMenu(true);
});
document.getElementById('listMenu').addEventListener('click', (event) => {
    const item = event.target.closest('.dd-item');
    if (item) chooseList(item.dataset.value);
});

// ---- List dropdown keyboard + outside-click wiring ----
(function initListDropdownHandlers() {
    const root = document.getElementById('listDropdown');
    if (!root) return;
    const menu = document.getElementById('listMenu');
    let typed = '';
    let typedTimer = null;

    root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeListMenu(true);
        } else if (event.target.id === 'listToggle' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            if (menu.hidden) openListMenu();
        } else if (!menu.hidden && event.target.classList.contains('dd-item')) {
            const items = listMenuItems();
            const i = items.indexOf(event.target);
            const move = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
            if (move !== undefined) {
                event.preventDefault();
                items[move].focus();
            } else if (event.key === 'Tab') {
                closeListMenu(false);
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
                // type-ahead: jump to the next list that starts with the typed letters
                clearTimeout(typedTimer);
                typed += event.key.toLowerCase();
                typedTimer = setTimeout(() => { typed = ''; }, 600);
                const start = typed.length === 1 ? i + 1 : i;
                const ordered = [...items.slice(start), ...items.slice(0, start)];
                const match = ordered.find(item => item.dataset.value.toLowerCase().startsWith(typed));
                if (match) match.focus();
            }
        }
    });
    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) closeListMenu(false);
    });
})();

// ---- Copy menu keyboard + outside-click wiring ----
(function initCopyMenuHandlers() {
    const root = document.getElementById('copySplit');
    const menu = document.getElementById('copyMenu');
    root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeCopyMenu(true);
        } else if (event.target.id === 'copyToggle' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            if (menu.hidden) openCopyMenu();
        } else if (!menu.hidden && event.target.classList.contains('dd-item')) {
            const items = document.querySelectorAll('#copyMenu .dd-item').filter(item => !item.hidden);
            const i = items.indexOf(event.target);
            const move = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
            if (move !== undefined) {
                event.preventDefault();
                items[move].focus();
            } else if (event.key === 'Tab') {
                closeCopyMenu(false);
            }
        }
    });
    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) closeCopyMenu(false);
    });
})();

// ---- Copy menu (cont.): outside-click wiring was added above ----

// ---- Config form events ----
document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
        switch (el.dataset.action) {
            case 'copy': copySelectedUrl(model.copySource); break;
            case 'export': exportConfig(); break;
            case 'import': document.getElementById('importFileInput').click(); break;
            case 'fetch': fetchChannels(); break;
            case 'filter': setFilter(el.dataset.filter, el); break;
            case 'autofill': autoFillFromName(); break;
            case 'clean': removeStaleMappings(); break;
            case 'save': saveMapping(); break;
        }
    });
});
document.querySelectorAll('[data-action="search"]').forEach(el => {
    el.addEventListener('input', (e) => syncSearchInputs(e.target.value));
});

const importFileInput = document.getElementById('importFileInput');
if (importFileInput) importFileInput.addEventListener('change', (e) => handleImportFile(e));

const channelTableBody = document.getElementById('channelTableBody');
if (channelTableBody) {
    channelTableBody.addEventListener('focusin', (e) => {
        const input = e.target.closest('.id-input');
        if (input) input.closest('tr').classList.add('focused-row');
    });
    channelTableBody.addEventListener('focusout', (e) => {
        const input = e.target.closest('.id-input');
        if (input) input.closest('tr').classList.remove('focused-row');
    });
    channelTableBody.addEventListener('change', (e) => {
        const input = e.target.closest('.id-input');
        if (input) updateId(input.dataset.name, input.value, Number(input.dataset.index));
    });
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
    loadInitialConfig();
    updateSyncTime();
    setInterval(updateSyncTime, 30000);
});

window.addEventListener('resize', () => { fitLayout(); });
document.fonts.ready.then(fitLayout);
