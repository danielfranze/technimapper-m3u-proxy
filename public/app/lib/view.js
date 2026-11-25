'use strict';

/**
 * Frontend MVP – View: DOM rendering and visual feedback (no business logic).
 */

import { model } from './model.js';

export function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)' };
    const icons = { success: 'check_circle', error: 'error', warning: 'warning' };
    const icon = document.createElement('span');
    icon.className = 'material-icons-outlined';
    icon.style.color = colors[type] || colors.error;
    icon.textContent = icons[type] || icons.error;
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function updateDirtyIndicator() {
    const dirty = model.isDirty();
    document.querySelectorAll('.save-dirty').forEach(el => { el.hidden = !dirty; });
    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.title = dirty ? 'Save (unsaved changes)' : 'Save';
        btn.setAttribute('aria-label', dirty ? 'Save, unsaved changes' : 'Save');
    });
}

/** Renders the channel ID mapping table rows based on filters and search queries. */
export function renderTable() {
    const tbody = document.getElementById('channelTableBody');
    let searchTerm = '';
    try {
        const searchInput = document.getElementById('searchInput');
        const searchInputMobile = document.getElementById('searchInputMobile');
        searchTerm = ((searchInput && searchInput.value) || (searchInputMobile && searchInputMobile.value) || '').toLowerCase();
    } catch (e) { /* no document (e.g. unit tests) */ }
    const rows = [];
    const dupIds = new Set(model.getDuplicateGroups(model.getActiveMapping()).map(g => g.id));

    const filtered = [];
    model.detectedChannels.forEach((name, index) => {
        const isActive = model.activeOccurrence[name] === index;
        const assignedId = (isActive && model.currentMapping[name] !== undefined) ? model.currentMapping[name] : '';
        const isMapped = assignedId !== '';
        if (model.currentFilter === 'mapped' && !isMapped) return;
        if (model.currentFilter === 'unmapped' && isMapped) return;
        if (searchTerm && !name.toLowerCase().includes(searchTerm)) return;
        filtered.push({ name, index, isActive, assignedId, isMapped });
    });

    // Sort by assigned ID (mapped first), keeping unmapped in original order.
    filtered.sort((a, b) => {
        const ia = a.assignedId;
        const ib = b.assignedId;
        const aHas = ia !== '';
        const bHas = ib !== '';
        if (aHas && bHas) {
            const na = typeof ia === 'number' ? ia : Number(ia);
            const nb = typeof ib === 'number' ? ib : Number(ib);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return String(ia).localeCompare(String(ib), undefined, { numeric: true });
        }
        if (aHas) return -1;
        if (bHas) return 1;
        return 0; // stable original order
    });

    const seenNames = new Set();
    filtered.forEach(({ name, index, assignedId, isMapped }) => {
        const isFirstOccurrence = !seenNames.has(name);
        seenNames.add(name);
        const isDup = isMapped && dupIds.has(String(assignedId));

        rows.push(`
            <tr class="${isDup ? 'dup-row' : ''}" data-name="${model.escapeHtml(name)}">
                <td>
                    <span class="status-badge ${isMapped ? 'status-mapped' : 'status-unmapped'}">
                        ${isMapped ? 'Mapped' : 'Unmapped'}
                    </span>
                </td>
                <td><strong>${model.escapeHtml(name)}</strong></td>
                <td>
                    <input type="text" id="channel-id-${index}" name="channel-id-${index}" class="id-input" value="${model.escapeHtml(assignedId)}"
                           autocomplete="off" aria-label="Channel ID for ${model.escapeHtml(name)}"
                           data-name="${model.escapeHtml(name)}" data-index="${index}" placeholder="-">
                </td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('');
    document.getElementById('listCard').style.display = 'block';

    const staleCount = model.getOrphans().length;
    document.querySelectorAll('.clean-count').forEach(el => {
        el.textContent = staleCount > 99 ? '99+' : String(staleCount);
        el.hidden = staleCount === 0;
        const btn = el.closest('button');
        btn.title = staleCount > 0
            ? `Remove ${staleCount} stale ${staleCount === 1 ? 'entry' : 'entries'}`
            : 'Remove IDs of channels that are no longer on the receiver';
        btn.setAttribute('aria-label', staleCount > 0 ? `Clean, ${staleCount} stale ${staleCount === 1 ? 'entry' : 'entries'}` : 'Clean');
    });
    updateDirtyIndicator();
}

export function updateModelBadge(status, text) {
    const badges = [document.getElementById('modelInfoDesktop'), document.getElementById('modelInfoMobile')];

    badges.forEach(badge => {
        if (!badge) return;
        badge.className = 'model-badge';
        delete badge.dataset.model;
        if (status === 'pending') {
            badge.classList.add('model-badge-pending');
            badge.innerText = text;
        } else if (status === 'success') {
            badge.classList.add('model-badge-ok');
            badge.innerText = "Detected: " + text;
            if (badge.id === 'modelInfoMobile') badge.dataset.model = text;
        } else if (status === 'error') {
            badge.classList.add('model-badge-error');
            badge.innerText = "Not detected";
        }
    });
    fitModelBadge();
}

/** Mobile badge: show "Detected: <model>" only if it leaves enough room before the Export button. */
function fitModelBadge() {
    const badge = document.getElementById('modelInfoMobile');
    const exportBtn = document.querySelector('.mobile-row-2 button[aria-label^="Export"]');
    const importBtn = document.querySelector('.mobile-row-2 button[aria-label^="Import"]');
    if (!badge || !badge.dataset.model || !exportBtn || !importBtn || exportBtn.offsetParent === null) return;

    badge.textContent = 'Detected: ' + badge.dataset.model;
    const b = badge.getBoundingClientRect();
    const e = exportBtn.getBoundingClientRect();
    const i = importBtn.getBoundingClientRect();
    const sameRow = Math.abs((b.top + b.height / 2) - (e.top + e.height / 2)) < b.height;
    const badgeGap = e.left - b.right;
    const buttonGap = i.left - e.right;
    if (!sameRow || badgeGap < buttonGap) badge.textContent = badge.dataset.model;
}

/** Header: keep "Last sync" and "Copy M3U8 URL" on one line by dropping pieces as needed. */
function fitHeaderMeta() {
    const meta = document.querySelector('.header-meta');
    const sync = document.getElementById('syncBadge');
    const copy = meta ? meta.querySelector('.split-btn') : null;
    if (!meta || !sync || !copy) return;

    const minGap = parseFloat(getComputedStyle(meta).columnGap) || 0;
    const steps = ['hide-url', 'hide-word', 'hide-label'];
    meta.classList.remove(...steps);
    for (let i = 0; i <= steps.length; i++) {
        if (i > 0) meta.classList.add(steps[i - 1]);
        const a = sync.getBoundingClientRect();
        const c = copy.getBoundingClientRect();
        const sameRow = Math.abs((a.top + a.height / 2) - (c.top + c.height / 2)) < a.height;
        if (sameRow && c.left - a.right >= minGap - 0.5) return;
    }
}

/** Version badge: wrap into the top-right corner of the title when it would otherwise wrap. */
function fitVersionBadge() {
    const h1 = document.querySelector('header h1');
    const badge = document.getElementById('versionLabel');
    const title = h1 ? h1.querySelector('.brand-text') : null;
    if (!h1 || !badge || !title) return;

    if (badge.parentElement !== h1) title.after(badge);
    const b = badge.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    if (b.top >= t.bottom - 2) title.appendChild(badge);
}

/** Sync badge pulse on new sync (calm animation). */
export function triggerSyncPulse() {
    const badge = document.getElementById('syncBadge');
    if (!badge || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    badge.classList.remove('sync-pulse');
    void badge.offsetWidth;
    badge.classList.add('sync-pulse');
    const done = (event) => {
        if (event && event.target !== badge) return;
        badge.classList.remove('sync-pulse');
        badge.removeEventListener('animationend', done);
    };
    badge.addEventListener('animationend', done);
    setTimeout(() => done(), 1500);
}

/** Synchronizes search inputs between desktop and mobile views and applies a debounced render. */
let searchTimeout = null;
export function handleSearchInput(val) {
    document.getElementById('searchInput').value = val;
    if (document.getElementById('searchInputMobile')) {
        document.getElementById('searchInputMobile').value = val;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderTable(), 150);
}

/** Copies text; falls back to a hidden textarea on plain-HTTP origins. */
function copyText(text, doneMessage) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        showToast(ok ? doneMessage : 'Failed to copy URL', ok ? 'success' : 'error');
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => showToast(doneMessage)).catch(fallback);
    } else {
        fallback();
    }
}

export { copyText, fitHeaderMeta, fitVersionBadge, fitModelBadge };

export function fitLayout() {
    fitVersionBadge();
    fitHeaderMeta();
    fitModelBadge();
}

// ---- Copy button with a source menu (HDHomeRun tuner address or M3U8 playlist URL) ----
export const COPY_SOURCES = {
    hdhr: { label: 'HDHR', path: '/hdhr', done: 'HDHomeRun address copied to clipboard!', tip: 'Copy the HDHomeRun tuner address (Plex / Jellyfin)' },
    m3u8: { label: 'M3U8', path: '/playlist.m3u8', done: 'M3U8 URL copied to clipboard!', tip: 'Copy the M3U8 playlist URL' }
};

export const BACKEND_URL = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

function copyUrlFor(source) {
    return BACKEND_URL + COPY_SOURCES[source].path;
}

export { copyUrlFor };
export function copySelectedUrl(source) {
    copyText(copyUrlFor(source), COPY_SOURCES[source].done);
}

export function copyMenuItems() {
    return [...document.querySelectorAll('#copyMenu .dd-item')].filter(item => !item.hidden);
}

export function renderCopyButton() {
    const main = document.getElementById('copyMain');
    if (!main) return;
    if (!model.hdhrEnabled && model.copySource === 'hdhr') model.copySource = 'm3u8';
    const source = COPY_SOURCES[model.copySource];
    main.querySelector('.copy-source').textContent = ' ' + source.label;
    main.title = source.tip;
    main.setAttribute('aria-label', source.tip);
    document.querySelectorAll('#copyMenu .dd-item').forEach(item => {
        const key = item.dataset.source;
        item.hidden = key === 'hdhr' && !model.hdhrEnabled;
        item.setAttribute('aria-checked', key === model.copySource ? 'true' : 'false');
        item.querySelector('.dd-item-url').textContent = copyUrlFor(key);
    });
}

export function openCopyMenu() {
    const menu = document.getElementById('copyMenu');
    menu.hidden = false;
    document.getElementById('copyToggle').setAttribute('aria-expanded', 'true');
    menu.style.right = '';
    const rect = menu.getBoundingClientRect();
    if (rect.left < 8) menu.style.right = (rect.left - 8) + 'px';
    const items = copyMenuItems();
    const current = items.find(item => item.getAttribute('aria-checked') === 'true') || items[0];
    if (current) current.focus();
}

export function closeCopyMenu(returnFocus) {
    const menu = document.getElementById('copyMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const toggle = document.getElementById('copyToggle');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
}

export function toggleCopyMenu() {
    if (document.getElementById('copyMenu').hidden) openCopyMenu();
    else closeCopyMenu(true);
}

export function copyMenuItemsVisible() {
    return copyMenuItems();
}

// ---- Target channel list dropdown ----
function listSelect() { return document.getElementById('selectedListName'); }
export function getSelectedList() { return listSelect().value; }
export function listMenuItems() { return [...document.querySelectorAll('#listMenu .dd-item')]; }

export function renderListDropdown() {
    const select = listSelect();
    const menu = document.getElementById('listMenu');
    document.getElementById('listCurrent').textContent = select.value;
    menu.querySelectorAll('.dd-item').forEach(item => item.remove());
    [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'dd-item';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
        item.dataset.value = option.value;
        const name = document.createElement('span');
        name.className = 'dd-item-name';
        name.textContent = option.value;
        const check = document.createElement('span');
        check.className = 'material-icons-outlined dd-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = 'check';
        item.append(name, check);
        menu.appendChild(item);
    });
}

export function setListOptions(names, selected) {
    const select = listSelect();
    const list = names && names.length > 0 ? names : [selected];
    select.replaceChildren(...list.map(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
    }));
    select.value = list.includes(selected) ? selected : list[0];
    renderListDropdown();
}

export function setSelectedList(name) {
    const select = listSelect();
    if ([...select.options].some(option => option.value === name)) select.value = name;
    renderListDropdown();
}

export function openListMenu() {
    document.getElementById('listMenu').hidden = false;
    document.getElementById('listToggle').setAttribute('aria-expanded', 'true');
    const items = listMenuItems();
    const current = items.find(item => item.getAttribute('aria-selected') === 'true') || items[0];
    if (current) current.focus();
}

export function closeListMenu(returnFocus) {
    const menu = document.getElementById('listMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const toggle = document.getElementById('listToggle');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
}
