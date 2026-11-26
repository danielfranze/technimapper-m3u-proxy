/**
 * Frontend MVP – main: event wiring / bootstrap. Thin layer that connects
 * DOM events to `presenter` actions. Logic lives in model + presenter.
 */

import { byId, dialogById, eventTarget, maybeInputById, queryAll } from './lib/dom.js';
import { model } from './lib/model.js';
import {
    autoFillFromName,
    chooseCopySource,
    chooseList,
    exportConfig,
    fetchChannels,
    handleImportFile,
    loadInitialConfig,
    removeStaleMappings,
    saveMapping,
    setFilter,
    syncSearchInputs,
    updateId,
    updateSyncTime,
} from './lib/presenter.js';
import {
    closeCopyMenu,
    closeListMenu,
    copySelectedUrl,
    fitLayout,
    listMenuItems,
    openCopyMenu,
    openListMenu,
    toggleCopyMenu,
} from './lib/view.js';

/** Maps a keyboard key to a wrap-around dropdown index. `undefined` = not a movement key. */
function dropdownMove(key: string, i: number, len: number): number | undefined {
    if (len === 0) return undefined;
    switch (key) {
        case 'ArrowDown':
            return (i + 1) % len;
        case 'ArrowUp':
            return (i - 1 + len) % len;
        case 'Home':
            return 0;
        case 'End':
            return len - 1;
        default:
            return undefined;
    }
}

// Unsaved-changes dialog choices
queryAll('#unsavedDialog [data-choice]').forEach((btn) => {
    btn.addEventListener('click', () => dialogById('unsavedDialog').close(btn.dataset['choice']));
});

window.addEventListener('beforeunload', (event) => {
    if (model.isDirty()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

// ---- Copy menu wiring ----
byId('copyToggle').addEventListener('click', toggleCopyMenu);
byId('copyMenu').addEventListener('click', (event) => {
    const target = eventTarget(event);
    const item = target?.closest<HTMLElement>('.dd-item');
    if (!item) return;
    const source = item.dataset['source'];
    if (source === 'hdhr' || source === 'm3u8') chooseCopySource(source);
});

// ---- Channel list dropdown wiring ----
byId('listToggle').addEventListener('click', () => {
    if (byId('listMenu').hidden) openListMenu();
    else closeListMenu(true);
});
byId('listMenu').addEventListener('click', (event) => {
    const target = eventTarget(event);
    const item = target?.closest<HTMLElement>('.dd-item');
    if (!item) return;
    const value = item.dataset['value'];
    if (value) chooseList(value);
});

// ---- List dropdown keyboard + outside-click wiring ----
(function initListDropdownHandlers() {
    const root = document.getElementById('listDropdown');
    if (!root) return;
    const menu = byId('listMenu');
    let typed = '';
    let typedTimer: ReturnType<typeof setTimeout> | null = null;

    root.addEventListener('keydown', (event) => {
        const target = eventTarget(event);
        if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeListMenu(true);
        } else if (target?.id === 'listToggle' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            if (menu.hidden) openListMenu();
        } else if (!menu.hidden && target?.classList.contains('dd-item')) {
            const items = listMenuItems();
            const i = items.indexOf(target as HTMLElement);
            const move = dropdownMove(event.key, i, items.length);
            if (move !== undefined) {
                event.preventDefault();
                items[move]?.focus();
            } else if (event.key === 'Tab') {
                closeListMenu(false);
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
                // type-ahead: jump to the next list that starts with the typed letters
                clearTimeout(typedTimer ?? undefined);
                typed += event.key.toLowerCase();
                typedTimer = setTimeout(() => {
                    typed = '';
                }, 600);
                const start = typed.length === 1 ? i + 1 : i;
                const ordered = [...items.slice(start), ...items.slice(0, start)];
                const match = ordered.find((item) => (item.dataset['value'] ?? '').toLowerCase().startsWith(typed));
                if (match) match.focus();
            }
        }
    });
    document.addEventListener('click', (event) => {
        const target = eventTarget(event);
        if (!target || !root.contains(target)) closeListMenu(false);
    });
})();

// ---- Copy menu keyboard + outside-click wiring ----
(function initCopyMenuHandlers() {
    const root = document.getElementById('copySplit');
    if (!root) return;
    const menu = byId('copyMenu');
    root.addEventListener('keydown', (event) => {
        const target = eventTarget(event);
        if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeCopyMenu(true);
        } else if (target?.id === 'copyToggle' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            if (menu.hidden) openCopyMenu();
        } else if (!menu.hidden && target?.classList.contains('dd-item')) {
            const items = queryAll('#copyMenu .dd-item').filter((item) => !item.hidden);
            const i = items.indexOf(target as HTMLElement);
            const move = dropdownMove(event.key, i, items.length);
            if (move !== undefined) {
                event.preventDefault();
                items[move]?.focus();
            } else if (event.key === 'Tab') {
                closeCopyMenu(false);
            }
        }
    });
    document.addEventListener('click', (event) => {
        const target = eventTarget(event);
        if (!target || !root.contains(target)) closeCopyMenu(false);
    });
})();

// ---- Config form events ----
queryAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
        switch (el.dataset['action']) {
            case 'copy':
                copySelectedUrl(model.copySource);
                break;
            case 'export':
                exportConfig();
                break;
            case 'import':
                byId('importFileInput').click();
                break;
            case 'fetch':
                fetchChannels();
                break;
            case 'filter': {
                const filter = el.dataset['filter'];
                if (filter === 'all' || filter === 'mapped' || filter === 'unmapped') setFilter(filter);
                break;
            }
            case 'autofill':
                autoFillFromName();
                break;
            case 'clean':
                removeStaleMappings();
                break;
            case 'save':
                saveMapping();
                break;
        }
    });
});
queryAll('[data-action="search"]').forEach((el) => {
    el.addEventListener('input', (event) => {
        const target = eventTarget(event) as HTMLInputElement | null;
        if (target) syncSearchInputs(target.value);
    });
});

const importFileInput = maybeInputById('importFileInput');
if (importFileInput) importFileInput.addEventListener('change', (event) => handleImportFile(event));

const channelTableBody = document.getElementById('channelTableBody');
if (channelTableBody) {
    channelTableBody.addEventListener('focusin', (event) => {
        const target = eventTarget(event);
        const input = target?.closest('.id-input');
        const row = input?.closest('tr');
        if (row) row.classList.add('focused-row');
    });
    channelTableBody.addEventListener('focusout', (event) => {
        const target = eventTarget(event);
        const input = target?.closest('.id-input');
        const row = input?.closest('tr');
        if (row) row.classList.remove('focused-row');
    });
    channelTableBody.addEventListener('change', (event) => {
        const target = eventTarget(event);
        const input = target?.closest('.id-input') as HTMLInputElement | null;
        if (input && input.dataset['name'] !== undefined) {
            updateId(input.dataset['name'], input.value, Number(input.dataset['index']));
        }
    });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialConfig();
    await updateSyncTime();
    setInterval(updateSyncTime, 30000);
});

window.addEventListener('resize', () => {
    fitLayout();
});
document.fonts.ready.then(fitLayout);
