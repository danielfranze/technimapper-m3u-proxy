'use strict';

/**
 * Frontend MVP – Presenter: business logic on top of `model.js` (state) and
 * `view.js` (DOM). DOM rendering lives in view.js, so this file stays testable
 * without a browser.
 */

import { BACKEND_URL } from './view.js';
import { model } from './model.js';
const {
    escapeHtml, isDirty, getActiveMapping, getOrphans, describeDuplicates
} = model;
import {
    copySelectedUrl, renderTable, renderCopyButton, showToast, updateModelBadge,
    updateDirtyIndicator, triggerSyncPulse, handleSearchInput, fitLayout,
    fitVersionBadge, setListOptions, setSelectedList, getSelectedList,
    closeCopyMenu, closeListMenu
} from './view.js';
import {
    getConfig, saveSettings, fetchChannelsRequest, saveMappingRequest, importConfig
} from '../api.js';
import { byId, dialogById, inputById, maybeInputById, queryAll } from './dom.js';

/** @typedef {import('./model.js').Filter} Filter */
/** @typedef {import('./model.js').CopySource} CopySource */
/** @typedef {import('../api.js').SettingsPayload} SettingsPayload */
/** @typedef {'fetch' | 'import'} UnsavedMode */
/** @typedef {'save' | 'discard' | 'cancel'} UnsavedChoice */

/**
 * Asks what to do with unsaved changes. Resolves to 'save', 'discard' or 'cancel'.
 * @param {UnsavedMode} mode
 * @returns {Promise<UnsavedChoice>}
 */
export function askUnsaved(mode) {
    const dialog = dialogById('unsavedDialog');
    const isImport = mode === 'import';
    byId('unsavedText').textContent = isImport
        ? 'Importing replaces the saved mapping. Your unsaved changes will be lost.'
        : 'Apply & Fetch reloads the mapping from the server. Save your changes first or they will be lost.';
    byId('unsavedSave').hidden = isImport;
    byId('unsavedDiscard').textContent = isImport ? 'Discard and import' : 'Discard changes';
    return new Promise(resolve => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(/** @type {UnsavedChoice} */ (dialog.returnValue || 'cancel')), { once: true });
        dialog.showModal();
    });
}

/** Removes IDs of channels that no longer exist and saves immediately. */
export async function removeStaleMappings() {
    const orphans = getOrphans();
    if (orphans.length === 0) {
        showToast('No stale entries found');
        return;
    }
    orphans.forEach(name => delete model.currentMapping[name]);
    await saveMapping(orphans);
}

/**
 * Sets the active channel filter mode ('all', 'mapped', or 'unmapped') and updates chips.
 * @param {Filter} filterType
 * @param {HTMLElement} element
 */
export function setFilter(filterType, element) {
    model.currentFilter = filterType;
    const chipTexts = (element.textContent ?? '').trim().toLowerCase();
    queryAll('.filter-chip').forEach(el => {
        if ((el.textContent ?? '').trim().toLowerCase() === chipTexts) el.classList.add('active');
        else el.classList.remove('active');
    });
    renderTable();
}

/**
 * Synchronizes search inputs (desktop + mobile).
 * @param {string} val
 */
export function syncSearchInputs(val) {
    handleSearchInput(val);
}

/** Automatically extracts numeric channel IDs from matching channel string names. */
export function autoFillFromName() {
    let count = 0;
    /** @type {string[]} */
    const skipped = [];
    /** @type {Set<string>} */
    const used = new Set();
    /** @type {Set<string>} */
    const seenNames = new Set();
    let nextId = 1;

    // Only extract IDs from names when EVERY channel name yields a number.
    // Otherwise fall back to sequential IDs in the current table order.
    const searchTerm = getSearchTerm();
    const channelsToFill = model.detectedChannels.filter(name => {
        const assignedId = model.currentMapping[name] !== undefined ? model.currentMapping[name] : '';
        const isMapped = assignedId !== '';
        if (model.currentFilter === 'mapped' && !isMapped) return false;
        if (model.currentFilter === 'unmapped' && isMapped) return false;
        if (searchTerm && !name.toLowerCase().includes(searchTerm)) return false;
        return true;
    });

    const allHaveNumbers = channelsToFill.length > 0 && channelsToFill.every(name => /^\d+/.test(name));

    // Parse is an explicit action: drop previously assigned IDs for the
    // targeted channels first so the result can be adopted or discarded via Save.
    channelsToFill.forEach(name => { delete model.currentMapping[name]; });

    channelsToFill.forEach(name => {
        // Duplicate channel names only get an ID on their first occurrence.
        if (seenNames.has(name)) {
            skipped.push(name);
            return;
        }
        seenNames.add(name);

        /** @type {number | string | null} */
        let id = null;
        if (allHaveNumbers) {
            const match = name.match(/^(\d+)/);
            const raw = match?.[1];
            if (raw) {
                const num = Number(raw);
                id = (raw.length <= 15 && Number.isSafeInteger(num)) ? num : raw;
            }
        }
        if (id === null) {
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
        model.currentMapping[name] = id;
        used.add(String(id));
        model.activeOccurrence[name] = model.detectedChannels.indexOf(name);
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
 * Updates the mapping state for a single specific channel name.
 * @param {string} name
 * @param {string | number} value
 * @param {number} [index]
 */
export function updateId(name, value, index) {
    if (value === '') {
        delete model.currentMapping[name];
        delete model.activeOccurrence[name];
    } else {
        const text = String(value).trim();
        // Canonical non-negative integers stay numbers; anything else (including
        // "001" and "12abc") is kept verbatim so no information is lost.
        const isCanonicalNumber = /^(0|[1-9]\d*)$/.test(text) && text.length <= 15 && Number.isSafeInteger(Number(text));
        model.currentMapping[name] = isCanonicalNumber ? Number(text) : text;
        // The occurrence being edited becomes the one holding the ID.
        model.activeOccurrence[name] = (typeof index === 'number') ? index : (model.activeOccurrence[name] ?? model.detectedChannels.indexOf(name));
    }
    updateDirtyIndicator();
    renderTable();
}

/**
 * Asynchronously persists the current channel ID mapping state to the backend storage.
 * @param {string[]} [removedStale]
 * @returns {Promise<boolean>}
 */
export async function saveMapping(removedStale = []) {
    /** @param {string[]} list */
    const summarize = (list) => list.slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '');
    try {
        const { ok: isOk, data: result } = await saveMappingRequest(model.currentMapping);
        if (isOk) {
            const groups = result.duplicateGroups || model.getDuplicateGroups(getActiveMapping());
            const orphans = result.orphans || getOrphans();
            const head = removedStale.length > 0
                ? `Removed ${removedStale.length} stale entries (${summarize(removedStale)}) and saved.`
                : 'Saved.';
            /** @type {string[]} */
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
            model.savedMapping = { ...model.currentMapping };
            renderTable();
            return true;
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message || 'Error saving data to backend.', 'error');
        renderTable();
        return false;
    }
}

/** Triggers the server endpoint to export the current system configuration and mapping file as a JSON download. */
export function exportConfig() {
    window.location.href = BACKEND_URL + '/api/export-config';
    showToast('Exporting configuration...');
}

/** Asynchronously fetches initial server configuration parameters and populates input fields. */
export async function loadInitialConfig() {
    try {
        const { data: config } = await getConfig();
        /** @param {string} id @param {string | undefined} v */
        const setValue = (id, v) => { const el = maybeInputById(id); if (el && v) el.value = v; };

        const versionEl = document.getElementById('versionLabel');
        if (versionEl && config.version) {
            versionEl.textContent = 'v' + config.version;
            fitVersionBadge();
        }
        if (typeof config.hdhrEnabled === 'boolean') {
            model.hdhrEnabled = config.hdhrEnabled;
            renderCopyButton();
        }
        setValue('receiverIp', config.ip);
        setValue('receiverPort', config.port);
        setValue('cronExpression', config.cronExpression);

        if (config.selectedListName) {
            model.activeListName = config.selectedListName;
            setListOptions([config.selectedListName], config.selectedListName);
        }
    } catch (e) { console.error('Initial config load failed', e); }
}

/** Polls the backend for the latest playlist synchronization timestamp and updates the UI badge. */
export async function updateSyncTime() {
    if (document.hidden) return;
    try {
        const { data } = await getConfig();
        const el = document.getElementById('last-sync-time');
        const badge = document.getElementById('syncBadge');
        if (!el) return;

        const newTime = model.formatSync(data.lastSync);
        const changed = model.lastSyncSeen !== undefined && !!data.lastSync && data.lastSync !== model.lastSyncSeen;
        model.lastSyncSeen = data.lastSync || null;
        el.textContent = newTime;
        if (badge) {
            badge.title = data.lastError
                ? `Last sync failed (${data.consecutiveFailures}x): ${data.lastError}`
                : 'Last successful sync';
        }
        fitLayout();
        if (changed) triggerSyncPulse();
    } catch (e) {}
}

/**
 * Persists receiver settings before a sync.
 * @param {SettingsPayload} settings
 * @returns {Promise<import('../api.js').SaveSettingsResponse>}
 */
export async function saveReceiverSettings(settings) {
    const { data } = await saveSettings(settings);
    if (data.error) throw new Error(data.error || 'Could not save settings');
    return data;
}

/** Communicates with the backend server to retrieve live TV channels and available lists from the TechniSat receiver. */
export async function fetchChannels() {
    const applyBtn = /** @type {HTMLButtonElement} */ (byId('applyBtn'));
    if (applyBtn.disabled) return;

    if (isDirty()) {
        const choice = await askUnsaved('fetch');
        if (choice === 'cancel') {
            if (model.activeListName) setSelectedList(model.activeListName);
            return;
        }
        if (choice === 'save' && !(await saveMapping())) return;
    }

    const statusMsg = byId('statusMsg');
    const listCard = byId('listCard');
    const ip = inputById('receiverIp').value.trim();
    const port = inputById('receiverPort').value.trim();
    const cronExpression = inputById('cronExpression').value.trim();
    const selectedListName = getSelectedList();

    statusMsg.className = 'info';
    statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">sync</span> Connecting...`;

    applyBtn.disabled = true;
    try {
        await saveReceiverSettings({ ip, port, cronExpression, selectedListName });
        const { data } = await fetchChannelsRequest({ ip, port, cronExpression, selectedListName });

        if (data.error) throw new Error(data.error);

        if (data.availableLists && data.availableLists.length > 0) {
            setListOptions(data.availableLists, data.selectedListName);
        }

        updateModelBadge('success', data.detectedModel);
        model.detectedChannels = data.channels;
        model.currentMapping = data.mapping || {};
        model.savedMapping = { ...model.currentMapping };
        // Default: the first occurrence of a (possibly duplicated) name holds the ID.
        /** @type {Set<string>} */
        const seenNames = new Set();
        model.detectedChannels.forEach((name, idx) => {
            if (!seenNames.has(name)) {
                seenNames.add(name);
                if (model.currentMapping[name] !== undefined) model.activeOccurrence[name] = idx;
                else delete model.activeOccurrence[name];
            }
        });
        model.activeListName = data.selectedListName || model.activeListName;

        statusMsg.className = 'success';
        statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">check_circle</span> <span class="status-prefix">Loaded</span> <strong>${model.detectedChannels.length} channels</strong><span class="status-list">&nbsp;(&ldquo;${escapeHtml(data.selectedListName)}&rdquo;)</span>`;
        statusMsg.title = `Loaded ${model.detectedChannels.length} channels ("${data.selectedListName}")`;

        renderTable();
        updateSyncTime();
        showToast(`${model.detectedChannels.length} channels loaded`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateModelBadge('error');
        listCard.style.display = 'none';

        statusMsg.className = 'error';
        statusMsg.innerHTML = `<span class="material-icons-outlined icon-14">error</span> ${escapeHtml(message)}`;

        showToast(message, 'error');
    } finally {
        applyBtn.disabled = false;
    }
}

/**
 * Choosing an entry makes it the default for the main button and copies it right away.
 * @param {CopySource} source
 */
export function chooseCopySource(source) {
    if (!model.hdhrEnabled && source === 'hdhr') source = 'm3u8';
    model.copySource = source;
    try { localStorage.setItem('technimapper.copySource', source); } catch (e) { /* storage unavailable */ }
    renderCopyButton();
    closeCopyMenu(true);
    copySelectedUrl(source);
}

/**
 * Picking another list behaves like the former native "change": it starts "Apply & Fetch".
 * @param {string} name
 */
export function chooseList(name) {
    const changed = name !== getSelectedList();
    closeListMenu(true);
    if (!changed) return;
    setSelectedList(name);
    fetchChannels();
}

/**
 * Handles the uploaded configuration file, reads its text content, and submits it to the backend.
 * @param {Event} event
 */
export async function handleImportFile(event) {
    const input = /** @type {HTMLInputElement | null} */ (event.target);
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    if (model.isDirty()) {
        const choice = await askUnsaved('import');
        if (choice !== 'discard') {
            input.value = '';
            return;
        }
        model.currentMapping = { ...model.savedMapping };
        updateDirtyIndicator();
    }

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const text = typeof reader.result === 'string' ? reader.result : '';
            const importedData = JSON.parse(text);
            const { ok: isOk, data: result } = await importConfig(importedData);
            if (isOk && result.success) {
                showToast('Configuration imported successfully!');
                await loadInitialConfig();
                await fetchChannels();
            } else {
                throw new Error(result.error || 'Import failed');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            showToast('Import failed: ' + message, 'error');
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

/** Returns the active search term from the desktop/mobile inputs. */
function getSearchTerm() {
    try {
        const searchInput = maybeInputById('searchInput');
        const searchInputMobile = maybeInputById('searchInputMobile');
        return ((searchInput && searchInput.value) || (searchInputMobile && searchInputMobile.value) || '').toLowerCase();
    } catch (e) { return ''; }
}
