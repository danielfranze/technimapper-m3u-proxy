    'use strict';

    import { BACKEND_URL } from './api.js';

    let currentMapping = {};
    let savedMapping = {};
    let activeListName = '';
    let lastSyncSeen;   // undefined: not loaded yet, null: never synced
    let detectedChannels = [];
    let currentFilter = 'all';
    let searchTimeout = null;
    // For duplicate channel names: which occurrence (by index) currently holds the ID.
    const activeOccurrence = {};

    /** Escapes text for safe use in HTML content and double-quoted attributes. */
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /** Formats an ISO timestamp for display; falls back to "Never". */
    function formatSync(iso, locale) {
        if (!iso) return 'Never';
        const d = new Date(iso);
        if (isNaN(d)) return 'Never';
        return d.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    /** Groups channel names by assigned ID; returns only IDs used more than once. */
    function getDuplicateGroups(mapping) {
        const byId = new Map();
        for (const [name, id] of Object.entries(mapping)) {
            if (id === '' || id === null || id === undefined) continue;
            const key = String(id);
            if (!byId.has(key)) byId.set(key, []);
            byId.get(key).push(name);
        }
        return [...byId].filter(([, names]) => names.length > 1).map(([id, channels]) => ({ id, channels }));
    }

    /** True if both mappings contain the same channel/ID pairs (order does not matter). */
    function mappingsEqual(a, b) {
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length) return false;
        return keysA.every(key => Object.hasOwn(b, key) && String(a[key]) === String(b[key]));
    }

    /** True while the mapping in the browser differs from the last saved/loaded state. */
    function isDirty() {
        return !mappingsEqual(currentMapping, savedMapping);
    }

    /** Shows the dot on both "Save" buttons while there are unsaved changes. */
    function updateDirtyIndicator() {
        const dirty = isDirty();
        document.querySelectorAll('.save-dirty').forEach(el => { el.hidden = !dirty; });
        document.querySelectorAll('.save-btn').forEach(btn => {
            btn.title = dirty ? 'Save (unsaved changes)' : 'Save';
            btn.setAttribute('aria-label', dirty ? 'Save, unsaved changes' : 'Save');
        });
    }

    /**
     * Asks what to do with unsaved changes. Resolves to 'save', 'discard' or 'cancel'.
     * mode "import" has no save option (the import replaces the saved mapping anyway).
     */
    function askUnsaved(mode) {
        const dialog = document.getElementById('unsavedDialog');
        const isImport = mode === 'import';
        document.getElementById('unsavedText').textContent = isImport
            ? 'Importing replaces the saved mapping. Your unsaved changes will be lost.'
            : 'Apply & Fetch reloads the mapping from the server. Save your changes first or they will be lost.';
        document.getElementById('unsavedSave').hidden = isImport;
        document.getElementById('unsavedDiscard').textContent = isImport ? 'Discard and import' : 'Discard changes';
        return new Promise(resolve => {
            dialog.returnValue = '';
            dialog.addEventListener('close', () => resolve(dialog.returnValue || 'cancel'), { once: true });
            dialog.showModal();
        });
    }

    document.querySelectorAll('#unsavedDialog [data-choice]').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById('unsavedDialog').close(btn.dataset.choice));
    });

    window.addEventListener('beforeunload', (event) => {
        if (isDirty()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    /** Mapping restricted to channels that currently exist on the receiver (only those can collide in the playlist). */
    function getActiveMapping() {
        if (detectedChannels.length === 0) return currentMapping;
        const known = new Set(detectedChannels);
        return Object.fromEntries(Object.entries(currentMapping).filter(([name]) => known.has(name)));
    }

    /** Names that have an ID but are no longer part of the channel list on the receiver. */
    function getOrphans() {
        if (detectedChannels.length === 0) return [];
        const known = new Set(detectedChannels);
        return Object.keys(currentMapping).filter(name => !known.has(name));
    }

    /** Removes IDs of channels that no longer exist and saves immediately (so "Apply & Fetch" cannot bring them back). */
    async function removeStaleMappings() {
        const orphans = getOrphans();
        if (orphans.length === 0) {
            showToast('No stale entries found');
            return;
        }
        orphans.forEach(name => delete currentMapping[name]);
        await saveMapping(orphans);
    }

    /** Short human-readable summary, e.g. "1 (Das Erste HD, Das Erste SD); 3 (3sat, Drei) ... +2 more". */
    function describeDuplicates(groups, limit = 3) {
        const shown = groups.slice(0, limit).map(g =>
            `${g.id} (${g.channels.slice(0, 3).join(', ')}${g.channels.length > 3 ? ', …' : ''})`);
        return shown.join('; ') + (groups.length > limit ? ` … +${groups.length - limit} more` : '');
    }

    /**
     * Synchronizes search inputs between desktop and mobile views and applies a 
     * debounced delay to optimize rendering performance for large channel datasets.
     * 
     * @param {string} val - The current query string entered by the user.
     */
    function handleSearchInput(val) {
        document.getElementById('searchInput').value = val;
        if (document.getElementById('searchInputMobile')) {
            document.getElementById('searchInputMobile').value = val;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderTable();
        }, 150);
    }

    /**
     * Dynamically generates and displays a floating toast notification element in the bottom right corner.
     * 
     * @param {string} message - The notification text message to display.
     * @param {string} [type='success'] - The category of the notification ('success' or 'error').
     */
    function showToast(message, type = 'success', duration = 3000) {
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

    /**
     * Copy button: copies the HDHomeRun tuner address or the M3U8 playlist URL to the clipboard.
     */
    // ---- Copy button with a source menu (HDHomeRun tuner address or M3U8 playlist URL) ----
    const COPY_SOURCES = {
        hdhr: { label: 'HDHR', path: '/hdhr', done: 'HDHomeRun address copied to clipboard!', tip: 'Copy the HDHomeRun tuner address (Plex / Jellyfin)' },
        m3u8: { label: 'M3U8', path: '/playlist.m3u8', done: 'M3U8 URL copied to clipboard!', tip: 'Copy the M3U8 playlist URL' }
    };
    const COPY_SOURCE_KEY = 'technimapper.copySource';
    let hdhrEnabled = true;

    /** The remembered choice (browser storage may be unavailable); the tuner address is the default. */
    function loadCopySource() {
        try {
            const stored = localStorage.getItem(COPY_SOURCE_KEY);
            if (stored === 'hdhr' || stored === 'm3u8') return stored;
            if (stored === 'm3u') return 'm3u8';      // value saved by earlier versions
        } catch (e) { /* storage unavailable */ }
        return 'hdhr';
    }
    let copySource = loadCopySource();

    function copyUrlFor(source) {
        return BACKEND_URL + COPY_SOURCES[source].path;
    }

    /** Copies text; falls back to a hidden textarea on plain-HTTP origins where the Clipboard API is unavailable. */
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

    function copySelectedUrl() {
        copyText(copyUrlFor(copySource), COPY_SOURCES[copySource].done);
    }

    function copyMenuItems() {
        return [...document.querySelectorAll('#copyMenu .dd-item')].filter(item => !item.hidden);
    }

    /** Updates label, tooltips, check mark and URL previews of the copy button and its menu. */
    function renderCopyButton() {
        const main = document.getElementById('copyMain');
        if (!main) return;
        if (!hdhrEnabled && copySource === 'hdhr') copySource = 'm3u8';
        const source = COPY_SOURCES[copySource];
        main.querySelector('.copy-source').textContent = ' ' + source.label;
        main.title = source.tip;
        main.setAttribute('aria-label', source.tip);
        document.querySelectorAll('#copyMenu .dd-item').forEach(item => {
            const key = item.dataset.source;
            item.hidden = key === 'hdhr' && !hdhrEnabled;
            item.setAttribute('aria-checked', key === copySource ? 'true' : 'false');
            item.querySelector('.dd-item-url').textContent = copyUrlFor(key);
        });
        fitHeaderMeta();
    }

    function openCopyMenu() {
        const menu = document.getElementById('copyMenu');
        menu.hidden = false;
        document.getElementById('copyToggle').setAttribute('aria-expanded', 'true');
        menu.style.right = '';
        const rect = menu.getBoundingClientRect();
        if (rect.left < 8) menu.style.right = (rect.left - 8) + 'px';      // keep the menu inside the screen
        const items = copyMenuItems();
        const current = items.find(item => item.getAttribute('aria-checked') === 'true') || items[0];
        if (current) current.focus();
    }

    function closeCopyMenu(returnFocus) {
        const menu = document.getElementById('copyMenu');
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        const toggle = document.getElementById('copyToggle');
        toggle.setAttribute('aria-expanded', 'false');
        if (returnFocus) toggle.focus();
    }

    function toggleCopyMenu() {
        if (document.getElementById('copyMenu').hidden) openCopyMenu();
        else closeCopyMenu(true);
    }

    /** Choosing an entry makes it the default for the main button and copies it right away. */
    function chooseCopySource(source) {
        if (!COPY_SOURCES[source] || (source === 'hdhr' && !hdhrEnabled)) return;
        copySource = source;
        try { localStorage.setItem(COPY_SOURCE_KEY, source); } catch (e) { /* storage unavailable */ }
        renderCopyButton();
        closeCopyMenu(true);
        copySelectedUrl();
    }

    // ---- Target channel list dropdown ----
    // The hidden <select id="selectedListName"> stays the single source of truth (read by "Apply & Fetch");
    // the visible dropdown mirrors it so it looks identical in every browser.
    function listSelect() { return document.getElementById('selectedListName'); }
    function getSelectedList() { return listSelect().value; }
    function listMenuItems() { return [...document.querySelectorAll('#listMenu .dd-item')]; }

    function renderListDropdown() {
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

    /** Replaces the available lists and selects one (falls back to the first list). */
    function setListOptions(names, selected) {
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

    function setSelectedList(name) {
        const select = listSelect();
        if ([...select.options].some(option => option.value === name)) select.value = name;
        renderListDropdown();
    }

    function openListMenu() {
        document.getElementById('listMenu').hidden = false;
        document.getElementById('listToggle').setAttribute('aria-expanded', 'true');
        const items = listMenuItems();
        const current = items.find(item => item.getAttribute('aria-selected') === 'true') || items[0];
        if (current) current.focus();
    }

    function closeListMenu(returnFocus) {
        const menu = document.getElementById('listMenu');
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        const toggle = document.getElementById('listToggle');
        toggle.setAttribute('aria-expanded', 'false');
        if (returnFocus) toggle.focus();
    }

    /** Picking another list behaves like the former native "change": it starts "Apply & Fetch". */
    function chooseList(name) {
        const changed = name !== getSelectedList();
        closeListMenu(true);
        if (!changed) return;
        setSelectedList(name);
        fetchChannels();
    }

    (function initListDropdown() {
        const root = document.getElementById('listDropdown');
        if (!root) return;
        const menu = document.getElementById('listMenu');
        let typed = '';
        let typedTimer = null;

        document.getElementById('listToggle').addEventListener('click', () => {
            if (menu.hidden) openListMenu();
            else closeListMenu(true);
        });
        menu.addEventListener('click', (event) => {
            const item = event.target.closest('.dd-item');
            if (item) chooseList(item.dataset.value);
        });
        document.addEventListener('click', (event) => {
            if (!root.contains(event.target)) closeListMenu(false);
        });
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
        renderListDropdown();
    })();

    (function initCopyMenu() {
        const split = document.getElementById('copySplit');
        if (!split) return;
        document.getElementById('copyToggle').addEventListener('click', toggleCopyMenu);
        split.querySelectorAll('.dd-item').forEach(item => {
            item.addEventListener('click', () => chooseCopySource(item.dataset.source));
        });
        document.addEventListener('click', (event) => {
            if (!split.contains(event.target)) closeCopyMenu(false);
        });
        split.addEventListener('keydown', (event) => {
            const menu = document.getElementById('copyMenu');
            if (event.key === 'Escape' && !menu.hidden) {
                event.preventDefault();
                closeCopyMenu(true);
            } else if (event.target.id === 'copyToggle' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                if (menu.hidden) openCopyMenu();
            } else if (!menu.hidden && event.target.classList.contains('dd-item')) {
                const items = copyMenuItems();
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
        renderCopyButton();
    })();

    /**
     * Updates the receiver device detection status badge styling and text across both 
     * desktop and mobile UI view containers.
     * 
     * @param {string} status - Connection status state ('pending', 'success', or 'error').
     * @param {string} text - Description label or device model identifier.
     */
    function updateModelBadge(status, text) {
        const badges = [document.getElementById('modelInfoDesktop'), document.getElementById('modelInfoMobile')];
        
        badges.forEach(badge => {
            if (!badge) return;
            badge.className = 'model-badge';
            delete badge.dataset.model;
            if (status === 'pending') {
                badge.classList.add('model-badge-pending');
                badge.innerText = text;
            } else if (status === 'success') {
                badge.innerText = "Detected: " + text;
                if (badge.id === 'modelInfoMobile') badge.dataset.model = text;
                badge.style.background = "rgba(59, 130, 246, 0.1)";
                badge.style.color = "var(--accent)";
                badge.style.borderColor = "rgba(59, 130, 246, 0.3)";
            } else if (status === 'error') {
                badge.innerText = "Not detected";
                badge.style.background = "rgba(239, 68, 68, 0.1)";
                badge.style.color = "#f87171";
                badge.style.borderColor = "rgba(239, 68, 68, 0.3)";
            }
        });
        fitModelBadge();
    }

    /**
     * Mobile badge: show "Detected: <model>" only if it leaves at least as much room before the Export button
     * as there is between the Export and Import buttons. Otherwise show just the model name.
     */
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

    /**
     * Header: keep "Last sync" and "Copy M3U8 URL" on one line. Shortens step by step, only as far as needed:
     * drop " URL", then the word "Copy" (the source word HDHR/M3U8 stays), then the "Last sync:" label. A step is enough once both items share a row
     * and the gap between them is not smaller than the normal gap of the header.
     */
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

    /**
     * Version badge: normally it sits next to the title. If it would wrap into the next line, it moves into the
     * top-right corner of the title text (smaller, see CSS) and goes back as soon as there is room again.
     */
    function fitVersionBadge() {
        const h1 = document.querySelector('header h1');
        const badge = document.getElementById('versionLabel');
        const title = h1 ? h1.querySelector('.brand-text') : null;
        if (!h1 || !badge || !title) return;

        if (badge.parentElement !== h1) title.after(badge);     // back to the normal position, then measure
        const b = badge.getBoundingClientRect();
        const t = title.getBoundingClientRect();
        if (b.top >= t.bottom - 2) title.appendChild(badge);     // wrapped below the title: corner badge
    }

    function fitLayout() {
        fitVersionBadge();
        fitHeaderMeta();
        fitModelBadge();
    }

    let fitTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(fitLayout, 100);
    });
    document.fonts.ready.then(fitLayout);

    /**
     * Initializes application state and registers periodic background polling intervals 
     * upon DOM content load completion.
     */
    document.addEventListener("DOMContentLoaded", () => {
        updateModelBadge('pending', 'Not detected yet');
        loadInitialConfig();
        updateSyncTime();
        setInterval(updateSyncTime, 30000);
    });

    /**
     * Asynchronously fetches initial server configuration parameters and populates input fields.
     */
    async function loadInitialConfig() {
        try {
            const res = await fetch(BACKEND_URL + '/api/get-config');
            const config = await res.json();
            const setValue = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };

            const versionEl = document.getElementById('versionLabel');
            if (versionEl && config.version) {
                versionEl.textContent = 'v' + config.version;
                fitVersionBadge();
            }
            if (typeof config.hdhrEnabled === 'boolean') {
                hdhrEnabled = config.hdhrEnabled;
                renderCopyButton();
            }
            setValue('receiverIp', config.ip);
            setValue('receiverPort', config.port);
            setValue('cronExpression', config.cronExpression);

            if (config.selectedListName) {
                activeListName = config.selectedListName;
                setListOptions([config.selectedListName], config.selectedListName);
            }
        } catch (e) { console.error('Initial config load failed', e); }
    }

    /**
     * Polls the backend server for the latest playlist synchronization timestamp and updates the UI badge.
     */
    async function updateSyncTime() {
        if (document.hidden) return;
        try {
            const res = await fetch(BACKEND_URL + '/api/get-config');
            const data = await res.json();
            const el = document.getElementById('last-sync-time');
            const badge = document.getElementById('syncBadge');
            if (!el) return;

            const newTime = formatSync(data.lastSync);
            const changed = lastSyncSeen !== undefined && !!data.lastSync && data.lastSync !== lastSyncSeen;
            lastSyncSeen = data.lastSync || null;
            el.textContent = newTime;
            if (badge) {
                badge.title = data.lastError
                    ? `Last sync failed (${data.consecutiveFailures}x): ${data.lastError}`
                    : 'Last successful sync';
            }
            fitHeaderMeta();
            if (changed) triggerSyncPulse();
        } catch (e) {}
    }

    /** Short, calm acknowledgement on the "Last sync" badge when a new sync has arrived. */
    function triggerSyncPulse() {
        const badge = document.getElementById('syncBadge');
        if (!badge || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        badge.classList.remove('sync-pulse');
        void badge.offsetWidth;                                  // restart the animation if it is still running
        badge.classList.add('sync-pulse');
        const done = (event) => {
            if (event && event.target !== badge) return;         // ignore the icon's own animation
            badge.classList.remove('sync-pulse');
            badge.removeEventListener('animationend', done);
        };
        badge.addEventListener('animationend', done);
        setTimeout(() => done(), 1500);                          // safety net (e.g. background tab)
    }

    /**
     * Persists receiver settings before a sync. This keeps the receiver target a
     * separate, validated operation instead of letting every fetch choose an
     * arbitrary LAN address.
     */
    async function saveReceiverSettings(settings) {
        const res = await fetch(BACKEND_URL + '/api/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not save settings');
        return data;
    }

    /**
     * Communicates with the backend server to retrieve live TV channels and available lists from the TechniSat receiver.
     */
    async function fetchChannels() {
        const applyBtn = document.getElementById('applyBtn');
        if (applyBtn.disabled) return;

        if (isDirty()) {
            const choice = await askUnsaved('fetch');
            if (choice === 'cancel') {
                if (activeListName) setSelectedList(activeListName);
                return;
            }
            if (choice === 'save' && !(await saveMapping())) return;
        }

        const statusMsg = document.getElementById('statusMsg');
        const listCard = document.getElementById('listCard');
        const ip = document.getElementById('receiverIp').value.trim();
        const port = document.getElementById('receiverPort').value.trim();
        const cronExpression = document.getElementById('cronExpression').value.trim();
        const selectedListName = getSelectedList();

        statusMsg.className = 'info';
        statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">sync</span> Connecting...`;

        applyBtn.disabled = true;
        try {
            await saveReceiverSettings({ ip, port, cronExpression, selectedListName });
            const res = await fetch(BACKEND_URL + '/api/fetch-channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, port, cronExpression, selectedListName })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            
            if (data.availableLists && data.availableLists.length > 0) {
                setListOptions(data.availableLists, data.selectedListName);
            }

            updateModelBadge('success', data.detectedModel);
            detectedChannels = data.channels;
            currentMapping = data.mapping || {};
            savedMapping = { ...currentMapping };
            // Default: the first occurrence of a (possibly duplicated) name holds the ID.
            const seenNames = new Set();
            detectedChannels.forEach((name, idx) => {
                if (!seenNames.has(name)) {
                    seenNames.add(name);
                    if (currentMapping[name] !== undefined) activeOccurrence[name] = idx;
                    else delete activeOccurrence[name];
                }
            });
            activeListName = data.selectedListName || activeListName;

            statusMsg.className = 'success';
            statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">check_circle</span> <span class="status-prefix">Loaded</span> <strong>${detectedChannels.length} channels</strong><span class="status-list">&nbsp;(&ldquo;${escapeHtml(data.selectedListName)}&rdquo;)</span>`;
            statusMsg.title = `Loaded ${detectedChannels.length} channels ("${data.selectedListName}")`;
            
            renderTable();
            updateSyncTime();
            showToast(`${detectedChannels.length} channels loaded`);
        } catch (err) {
            updateModelBadge('error');
            listCard.style.display = 'none';
            
            statusMsg.className = 'error';
            statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">error</span> ${escapeHtml(err.message)}`;
            
            showToast(err.message, 'error');
        } finally {
            applyBtn.disabled = false;
        }
    }

    /**
     * Sets the active channel filter mode ('all', 'mapped', or 'unmapped') and updates active button chip states.
     * 
     * @param {string} filterType - The filter identifier.
     * @param {HTMLElement} element - The DOM button element that was clicked.
     */
    function setFilter(filterType, element) {
        currentFilter = filterType;
        const chipTexts = element.textContent.trim().toLowerCase();
        
        document.querySelectorAll('.filter-chip').forEach(el => {
            if (el.textContent.trim().toLowerCase() === chipTexts) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        renderTable();
    }

    /**
     * Automatically extracts numeric channel IDs from matching channel string names.
     */
    function autoFillFromName() {
        let count = 0;
        const skipped = [];
        const used = new Set();
        const seenNames = new Set();
        let nextId = 1;

        // Only extract IDs from names when EVERY channel name yields a number.
        // Otherwise fall back to sequential IDs in the current table order.
        let searchTerm = '';
        try {
            const searchInput = document.getElementById('searchInput');
            const searchInputMobile = document.getElementById('searchInputMobile');
            searchTerm = ((searchInput && searchInput.value) || (searchInputMobile && searchInputMobile.value) || '').toLowerCase();
        } catch (e) { /* no document (e.g. unit tests) */ }
        const channelsToFill = detectedChannels.filter(name => {
            const assignedId = currentMapping[name] !== undefined ? currentMapping[name] : '';
            const isMapped = assignedId !== '';
            if (currentFilter === 'mapped' && !isMapped) return false;
            if (currentFilter === 'unmapped' && isMapped) return false;
            if (searchTerm && !name.toLowerCase().includes(searchTerm)) return false;
            return true;
        });

        const allHaveNumbers = channelsToFill.length > 0 && channelsToFill.every(name => /^\\d+/.test(name));

        // Parse is an explicit action: drop previously assigned IDs for the
        // targeted channels first so the result can be adopted or discarded via Save.
        channelsToFill.forEach(name => { delete currentMapping[name]; });

        channelsToFill.forEach(name => {
            // Duplicate channel names only get an ID on their first occurrence.
            if (seenNames.has(name)) {
                skipped.push(name);
                return;
            }
            seenNames.add(name);

            let id = null;
            if (allHaveNumbers) {
                const match = name.match(/^(\\d+)/);
                const raw = match[1];
                const num = Number(raw);
                id = (raw.length <= 15 && Number.isSafeInteger(num)) ? num : raw;
            } else {
                while (used.has(String(nextId))) nextId++;
                id = nextId;
                nextId++;
            }

            if (used.has(String(id))) {
                skipped.push(name);
                return;
            }
            // Overwrite any existing ID: Parse is an explicit action and the
            // Save button lets the user keep or discard the result.
            currentMapping[name] = id;
            used.add(String(id));
            activeOccurrence[name] = detectedChannels.indexOf(name);
            count++;
        });

        renderTable();
        if (skipped.length > 0) {
            const sample = skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? ', …' : '');
            showToast(`Extracted ${count} channel IDs. Skipped ${skipped.length} because the ID is already in use: ${sample}`, 'warning', 10000);
        } else {
            showToast(count > 0 ? `Extracted ${count} channel IDs from names` : 'No new channel numbers found in names');
        }
    }

    /**
     * Dynamically renders the interactive channel mapping table rows based on filters and search queries.
     */
    function renderTable() {
        const tbody = document.getElementById('channelTableBody');
        let searchTerm = '';
        try {
            const searchInput = document.getElementById('searchInput');
            const searchInputMobile = document.getElementById('searchInputMobile');
            searchTerm = ((searchInput && searchInput.value) || (searchInputMobile && searchInputMobile.value) || '').toLowerCase();
        } catch (e) { /* no document (e.g. unit tests) */ }
        const rows = [];
        const dupIds = new Set(getDuplicateGroups(getActiveMapping()).map(g => g.id));

        const filtered = [];
        detectedChannels.forEach((name, index) => {
            const isActive = activeOccurrence[name] === index;
            const assignedId = (isActive && currentMapping[name] !== undefined) ? currentMapping[name] : '';
            const isMapped = assignedId !== '';
            if (currentFilter === 'mapped' && !isMapped) return;
            if (currentFilter === 'unmapped' && isMapped) return;
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
                <tr class="${isDup ? 'dup-row' : ''}" data-name="${escapeHtml(name)}">
                    <td>
                        <span class="status-badge ${isMapped ? 'status-mapped' : 'status-unmapped'}">
                            ${isMapped ? 'Mapped' : 'Unmapped'}
                        </span>
                    </td>
                    <td><strong>${escapeHtml(name)}</strong></td>
                    <td>
                        <input type="text" id="channel-id-${index}" name="channel-id-${index}" class="id-input" value="${escapeHtml(assignedId)}"
                               autocomplete="off" aria-label="Channel ID for ${escapeHtml(name)}"
                               data-name="${escapeHtml(name)}" data-index="${index}" placeholder="-">
                    </td>
                </tr>
            `);
        });

        tbody.innerHTML = rows.join('');
        document.getElementById('listCard').style.display = 'block';

        const staleCount = getOrphans().length;
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

    /**
     * Updates the mapping state for a single specific channel name.
     * 
     * @param {string} name - The original channel name.
     * @param {string} value - The new assigned channel ID value.
     */
    function updateId(name, value, index) {
        if (value === '') {
            delete currentMapping[name];
            delete activeOccurrence[name];
        } else {
            const text = String(value).trim();
            // Canonical non-negative integers stay numbers; anything else (including
            // "001" and "12abc") is kept verbatim so no information is lost.
            const isCanonicalNumber = /^(0|[1-9]\d*)$/.test(text) && text.length <= 15 && Number.isSafeInteger(Number(text));
            currentMapping[name] = isCanonicalNumber ? Number(text) : text;
            // The occurrence being edited becomes the one holding the ID.
            activeOccurrence[name] = (typeof index === 'number') ? index : (activeOccurrence[name] ?? detectedChannels.indexOf(name));
        }
        updateDirtyIndicator();
        renderTable();
    }

    /**
     * Asynchronously persists the current channel ID mapping state to the backend storage.
     */
    async function saveMapping(removedStale = []) {
        const summarize = (list) => list.slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '');
        try {
            const res = await fetch(BACKEND_URL + '/api/save-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapping: currentMapping })
            });
            const result = await res.json().catch(() => ({}));
            if (res.ok) {
                const groups = result.duplicateGroups || getDuplicateGroups(getActiveMapping());
                const orphans = result.orphans || getOrphans();
                const head = removedStale.length > 0
                    ? `Removed ${removedStale.length} stale entries (${summarize(removedStale)}) and saved.`
                    : 'Saved.';
                const parts = [];
                if (groups.length > 0) {
                    parts.push(`${groups.length} ID(s) are used by more than one channel: ${describeDuplicates(groups)}.`);
                }
                if (orphans.length > 0) {
                    parts.push(`${orphans.length} stale entries for channels no longer on the receiver (${summarize(orphans)}) - use "Clean" to remove them.`);
                }
                if (parts.length > 0) {
                    showToast(head + ' ' + parts.join(' '), 'warning', 14000);
                } else {
                    showToast(removedStale.length > 0 ? head : 'Mappings saved successfully!');
                }
                savedMapping = { ...currentMapping };
                renderTable();
                return true;
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (err) {
            showToast(err.message || 'Error saving data to backend.', 'error');
            renderTable();
            return false;
        }
    }

    /**
     * Triggers the server endpoint to export the current system configuration and mapping file as a JSON download.
     */
    function exportConfig() {
        window.location.href = BACKEND_URL + '/api/export-config';
        showToast('Exporting configuration...');
    }

    /**
     * Programmatically opens the hidden file input dialog for uploading configuration JSON files.
     */
    function triggerImport() {
        document.getElementById('importFileInput').click();
    }

    /**
     * Handles the uploaded configuration file, reads its text content, and submits it to the backend.
     * 
     * @param {Event} event - The file input change event object.
     */
    async function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (isDirty()) {
            const choice = await askUnsaved('import');
            if (choice !== 'discard') {
                event.target.value = '';
                return;
            }
            currentMapping = { ...savedMapping };
            updateDirtyIndicator();
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                const res = await fetch(BACKEND_URL + '/api/import-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(importedData)
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    showToast('Configuration imported successfully!');
                    await loadInitialConfig();
                    await fetchChannels();
                } else {
                    throw new Error(result.error || 'Import failed');
                }
            } catch (err) {
                showToast('Import failed: ' + err.message, 'error');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    // Event wiring (no inline handlers, CSP-friendly)
    document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', () => {
            switch (el.dataset.action) {
                case 'copy': copySelectedUrl(); break;
                case 'export': exportConfig(); break;
                case 'import': triggerImport(); break;
                case 'fetch': fetchChannels(); break;
                case 'filter': setFilter(el.dataset.filter, el); break;
                case 'autofill': autoFillFromName(); break;
                case 'clean': removeStaleMappings(); break;
                case 'save': saveMapping(); break;
            }
        });
    });
    document.querySelectorAll('[data-action="search"]').forEach(el => {
        el.addEventListener('input', (e) => handleSearchInput(e.target.value));
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

