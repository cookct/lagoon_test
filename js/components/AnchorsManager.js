/**
 * AnchorsManager — UI for editing per-character anchors entries.
 * Opens via "Anchors" button in the Tools tab (character chats only).
 */

import { state } from '../state.js';
import { lagoonConfirm } from '../ui/dialog.js';

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
    return r.json();
}

async function updateEntry(configName, entryId, updates) {
    const r = await fetch(`${API_BASE}/${encodeURIComponent(configName)}/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
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
        this._editingId = null; // null = new entry, string = editing existing

        this.modal = document.getElementById('anchors-modal');
        this.charNameEl = document.getElementById('anchors-char-name');
        this.entriesList = document.getElementById('anchors-entries');
        this.addBtn = document.getElementById('add-lore-entry-btn');
        this.editor = document.getElementById('lore-entry-editor');
        this.keywordsInput = document.getElementById('lore-keywords');
        this.contentInput = document.getElementById('lore-content');
        this.priorityInput = document.getElementById('lore-priority');
        this.notAwareInput = document.getElementById('lore-not-aware');
        this.saveEntryBtn = document.getElementById('save-lore-entry-btn');
        this.cancelEntryBtn = document.getElementById('cancel-lore-entry-btn');
        this.closeBtn = document.getElementById('close-anchors-btn');

        this._bindEvents();
    }

    _bindEvents() {
        this.closeBtn?.addEventListener('click', () => this.close());
        this.modal?.addEventListener('mousedown', (e) => {
            if (e.target === this.modal) this.close();
        });
        this.addBtn?.addEventListener('click', () => this._openEditor(null));
        this.saveEntryBtn?.addEventListener('click', () => this._saveEntry());
        this.cancelEntryBtn?.addEventListener('click', () => this._closeEditor());
    }

    async open(configName) {
        if (!configName) return;
        this._configName = configName.replace('.json', '');
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
        this._renderEntries();
    }

    _renderEntries() {
        if (!this.entriesList) return;
        if (this._entries.length === 0) {
            this.entriesList.innerHTML = '<p style="color:var(--text-muted,#888);font-size:0.8rem;padding:8px 0;">No entries yet. Add one below.</p>';
            return;
        }

        this.entriesList.innerHTML = '';
        for (const entry of this._entries) {
            const isUnaware = entry.character_aware === false;
            const div = document.createElement('div');
            div.className = `anchors-entry${entry.enabled === false ? ' disabled' : ''}${isUnaware ? ' lore-entry-unaware' : ''}`;
            div.dataset.id = entry.id;

            const kwText = (entry.keywords || []).join(', ') || '(no keywords)';
            div.innerHTML = `
                <div class="lore-entry-header">
                    <span class="lore-entry-keywords">${this._esc(kwText)}${isUnaware ? ' <span class="lore-unaware-badge">not yet aware</span>' : ''}</span>
                    <div class="lore-entry-actions">
                        <button class="lore-btn toggle-btn" data-id="${entry.id}" title="${entry.enabled === false ? 'Enable' : 'Disable'}">
                            ${entry.enabled === false ? 'Enable' : 'Disable'}
                        </button>
                        <button class="lore-btn edit-btn" data-id="${entry.id}">Edit</button>
                        <button class="lore-btn danger delete-btn" data-id="${entry.id}">Delete</button>
                    </div>
                </div>
                <div class="lore-entry-content">${this._esc(entry.content || '')}</div>
            `;

            div.querySelector('.toggle-btn').addEventListener('click', () => this._toggleEntry(entry.id, entry.enabled !== false));
            div.querySelector('.edit-btn').addEventListener('click', () => this._openEditor(entry.id));
            div.querySelector('.delete-btn').addEventListener('click', () => this._deleteEntry(entry.id));

            this.entriesList.appendChild(div);
        }
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

        if (this._editingId) {
            await updateEntry(this._configName, this._editingId, { keywords, content, priority, character_aware: characterAware });
        } else {
            await createEntry(this._configName, keywords, content, priority, characterAware);
        }

        this._closeEditor();
        await this._loadEntries();
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

    _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
