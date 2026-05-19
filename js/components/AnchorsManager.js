/**
 * AnchorsManager — UI for editing per-character anchors entries.
 * Opens via "Anchors" button in the Tools tab (character chats only).
 */

import { state } from '../state.js';
import { lagoonConfirm } from '../ui/dialog.js';
import { fetchConfig, saveConfigApi } from '../api.js';

const API_BASE = '/api/lore';

async function fetchEntries(configName) {
    const r = await fetch(`${API_BASE}/${encodeURIComponent(configName)}`);
    const data = await r.json();
    return data.entries || [];
}

async function createEntry(configName, keywords, content, priority, characterAware) {
    const r = await fetch(`${API_BASE}/${encodeURIComponent(configName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, content, priority, character_aware: characterAware })
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Create failed (${r.status})`);
    }
    return r.json();
}

async function updateEntry(configName, entryId, updates) {
    const r = await fetch(`${API_BASE}/${encodeURIComponent(configName)}/${encodeURIComponent(entryId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${r.status})`);
    }
    return r.json();
}

async function deleteEntry(configName, entryId) {
    const r = await fetch(`${API_BASE}/${encodeURIComponent(configName)}/${entryId}`, {
        method: 'DELETE'
    });
    return r.json();
}

export class AnchorsManager {
    constructor() {
        this._configName = null;
        this._entries = [];
        this._sharedLore = [];
        this._sharedEntries = [];
        this._editingId = null;
        this._activeTab = 'own';

        this.modal = document.getElementById('anchors-modal');
        this.charNameEl = document.getElementById('anchors-char-name');
        this.entriesList = document.getElementById('anchors-entries');
        this.tabBar = document.getElementById('anchors-tab-bar');
        this.addBtn = document.getElementById('add-lore-entry-btn');
        this.editor = document.getElementById('lore-entry-editor');
        this.keywordsInput = document.getElementById('lore-keywords');
        this.contentInput = document.getElementById('lore-content');
        this.priorityInput = document.getElementById('lore-priority');
        this.notAwareInput = document.getElementById('lore-not-aware');
        this.saveEntryBtn = document.getElementById('save-lore-entry-btn');
        this.cancelEntryBtn = document.getElementById('cancel-lore-entry-btn');
        this.closeBtn = document.getElementById('close-anchors-btn');
        this.shareLoreBtn = document.getElementById('share-lore-btn');

        this.shareLoreModal = document.getElementById('share-lore-modal');
        this.shareLoreCharName = document.getElementById('share-lore-char-name');
        this.shareLoreList = document.getElementById('share-lore-list');
        this.closeSLBtn = document.getElementById('close-share-lore-btn');
        this.saveSLBtn = document.getElementById('save-share-lore-btn');
        this.cancelSLBtn = document.getElementById('cancel-share-lore-btn');

        this._bindEvents();
    }

    _bindEvents() {
        this.closeBtn?.addEventListener('click', () => this.close());
        this.modal?.addEventListener('mousedown', (e) => {
            if (e.target === this.modal) this.close();
        });
        this.shareLoreBtn?.addEventListener('click', () => this._openShareLore());
        this.closeSLBtn?.addEventListener('click', () => this._closeShareLore());
        this.cancelSLBtn?.addEventListener('click', () => this._closeShareLore());
        this.saveSLBtn?.addEventListener('click', () => this._saveShareLore());
        this.shareLoreModal?.addEventListener('mousedown', (e) => {
            if (e.target === this.shareLoreModal) this._closeShareLore();
        });
        this.addBtn?.addEventListener('click', () => this._openEditor(null));
        this.saveEntryBtn?.addEventListener('click', () => this._saveEntry());
        this.cancelEntryBtn?.addEventListener('click', () => this._closeEditor());
    }

    async open(configName, sharedLore = []) {
        if (!configName) return;
        this._configName = configName.replace('.json', '');
        this._sharedLore = Array.isArray(sharedLore) ? sharedLore : (sharedLore ? [sharedLore] : []);
        this._activeTab = 'own';
        if (this.charNameEl) this.charNameEl.textContent = this._configName;
        await this._loadEntries();
        this._closeEditor();
        this.modal?.classList.remove('hidden');
    }

    close() {
        this.modal?.classList.add('hidden');
        this._editingId = null;
    }

    async _loadEntries() {
        this._entries = await fetchEntries(this._configName);
        this._sharedEntries = [];
        for (const src of (this._sharedLore || [])) {
            const entries = await fetchEntries(src);
            if (entries.length) this._sharedEntries.push({ source: src, entries });
        }
        this._renderEntries();
    }

    _renderEntries() {
        if (!this.entriesList) return;

        const hasTabs = this._sharedEntries.length > 0;

        // Build tab bar
        if (this.tabBar) {
            if (hasTabs) {
                this.tabBar.classList.remove('hidden');
                this.tabBar.innerHTML = '';

                const ownTab = document.createElement('button');
                ownTab.type = 'button';
                ownTab.className = 'anchors-tab' + (this._activeTab === 'own' ? ' active' : '');
                ownTab.textContent = this._configName;
                ownTab.addEventListener('click', () => this._switchTab('own'));
                this.tabBar.appendChild(ownTab);

                for (const { source } of this._sharedEntries) {
                    const tab = document.createElement('button');
                    tab.type = 'button';
                    tab.className = 'anchors-tab' + (this._activeTab === source ? ' active' : '');
                    tab.textContent = source;
                    tab.addEventListener('click', () => this._switchTab(source));
                    this.tabBar.appendChild(tab);
                }
            } else {
                this.tabBar.classList.add('hidden');
            }
        }

        const isOwn = this._activeTab === 'own';

        // Show/hide Add Entry button based on active tab
        if (this.addBtn) this.addBtn.style.display = isOwn ? '' : 'none';

        // Hide editor when switching to read-only tab
        if (!isOwn) this._closeEditor();

        this.entriesList.innerHTML = '';

        if (isOwn) {
            if (this._entries.length === 0) {
                this.entriesList.insertAdjacentHTML('beforeend', '<p style="color:var(--text-muted,#888);font-size:0.8rem;padding:8px 0;">No entries yet. Add one below.</p>');
            } else {
                for (const entry of this._entries) {
                    this.entriesList.appendChild(this._makeEntryEl(entry, false));
                }
            }
        } else {
            const group = this._sharedEntries.find(s => s.source === this._activeTab);
            if (group) {
                for (const entry of group.entries) {
                    this.entriesList.appendChild(this._makeEntryEl(entry, true));
                }
            }
        }
    }

    _switchTab(tab) {
        this._activeTab = tab;
        this._renderEntries();
    }

    _makeEntryEl(entry, readOnly) {
        const isUnaware = entry.character_aware === false;
        const div = document.createElement('div');
        div.className = `anchors-entry${entry.enabled === false ? ' disabled' : ''}${isUnaware ? ' lore-entry-unaware' : ''}${readOnly ? ' shared-lore-entry' : ''}`;
        div.dataset.id = entry.id;

        const kwText = (entry.keywords || []).join(', ') || '(no keywords)';
        div.innerHTML = `
            <div class="lore-entry-header">
                <span class="lore-entry-keywords">${this._esc(kwText)}${isUnaware ? ' <span class="lore-unaware-badge">not yet aware</span>' : ''}</span>
                ${readOnly ? '' : `<div class="lore-entry-actions">
                    <button class="lore-btn toggle-btn" data-id="${entry.id}" title="${entry.enabled === false ? 'Enable' : 'Disable'}">
                        ${entry.enabled === false ? 'Enable' : 'Disable'}
                    </button>
                    <button class="lore-btn edit-btn" data-id="${entry.id}">Edit</button>
                    <button class="lore-btn danger delete-btn" data-id="${entry.id}">Delete</button>
                </div>`}
            </div>
            <div class="lore-entry-content">${this._esc(entry.content || '')}</div>
        `;

        if (!readOnly) {
            div.querySelector('.toggle-btn').addEventListener('click', () => this._toggleEntry(entry.id, entry.enabled !== false));
            div.querySelector('.edit-btn').addEventListener('click', () => this._openEditor(entry.id));
            div.querySelector('.delete-btn').addEventListener('click', () => this._deleteEntry(entry.id));
        }

        return div;
    }

    _openEditor(entryId) {
        this._editingId = entryId;
        if (entryId) {
            const entry = this._entries.find(e => e.id === entryId);
            if (!entry) return;
            this.keywordsInput.value = (entry.keywords || []).join(', ');
            this.contentInput.value = entry.content || '';
            if (this.priorityInput) this.priorityInput.value = entry.priority ?? 0;
            if (this.notAwareInput) this.notAwareInput.checked = entry.character_aware === false;
        } else {
            this.keywordsInput.value = '';
            this.contentInput.value = '';
            if (this.priorityInput) this.priorityInput.value = 0;
            if (this.notAwareInput) this.notAwareInput.checked = false;
        }
        this.editor?.classList.remove('hidden');
        this.editor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this.keywordsInput?.focus();
    }

    _closeEditor() {
        this.editor?.classList.add('hidden');
        this._editingId = null;
    }

    async _saveEntry() {
        const keywords = this.keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean);
        const content = this.contentInput.value.trim();
        const priority = parseInt(this.priorityInput?.value ?? 0) || 0;
        const characterAware = !(this.notAwareInput?.checked ?? false);
        if (!content) {
            this.contentInput.focus();
            return;
        }

        try {
            if (this._editingId) {
                await updateEntry(this._configName, this._editingId, { keywords, content, priority, character_aware: characterAware });
            } else {
                await createEntry(this._configName, keywords, content, priority, characterAware);
            }
            this._closeEditor();
            await this._loadEntries();
        } catch (e) {
            this._showToast(e.message || 'Save failed', 'error');
        }
    }

    async _toggleEntry(entryId, currentlyEnabled) {
        await updateEntry(this._configName, entryId, { enabled: !currentlyEnabled });
        await this._loadEntries();
    }

    async _deleteEntry(entryId) {
        if (!await lagoonConfirm('Delete this anchors entry?')) return;
        await deleteEntry(this._configName, entryId);
        await this._loadEntries();
    }

    async _openShareLore() {
        if (!this._configName) return;
        if (this.shareLoreCharName) this.shareLoreCharName.textContent = this._configName;
        await this._buildShareLoreList();
        this.shareLoreModal?.classList.remove('hidden');
    }

    async _buildShareLoreList() {
        if (!this.shareLoreList) return;
        this.shareLoreList.innerHTML = '';
        try {
            const [names, liveConfig] = await Promise.all([
                fetch('/api/configs/lore_files').then(r => r.json()),
                fetchConfig(this._configName + '.json')
            ]);
            const current = Array.isArray(liveConfig?.shared_lore) ? liveConfig.shared_lore
                : (liveConfig?.shared_lore ? [liveConfig.shared_lore] : []);
            for (const name of names) {
                const label = document.createElement('label');
                const isSelected = current.includes(name);
                label.className = 'shared-lore-item' + (isSelected ? ' selected' : '');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = name;
                cb.checked = isSelected;
                cb.addEventListener('change', () => label.classList.toggle('selected', cb.checked));
                const span = document.createElement('span');
                span.textContent = name;
                label.appendChild(cb);
                label.appendChild(span);
                this.shareLoreList.appendChild(label);
            }
        } catch (e) {
            console.warn('[AnchorsManager] Failed to load lore files', e);
        }
    }

    async _saveShareLore() {
        if (!this._configName) return;
        const selected = Array.from(this.shareLoreList?.querySelectorAll('input[type=checkbox]:checked') || []).map(cb => cb.value);
        try {
            const liveConfig = await fetchConfig(this._configName + '.json');
            if (!liveConfig) return;
            liveConfig.shared_lore = selected;
            await saveConfigApi(this._configName, liveConfig);
            this._sharedLore = selected;
            this._closeShareLore();
            await this._loadEntries();
        } catch (e) {
            console.warn('[AnchorsManager] Failed to save shared lore', e);
        }
    }

    _closeShareLore() {
        this.shareLoreModal?.classList.add('hidden');
    }

    _showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = type === 'error' ? 'lore-toast lore-toast-error' : 'lore-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('lore-toast-visible'));
        setTimeout(() => {
            toast.classList.remove('lore-toast-visible');
            toast.classList.add('lore-toast-exit');
            setTimeout(() => toast.remove(), 400);
        }, 2800);
    }

    _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
