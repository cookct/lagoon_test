/**
 * Session Manager Component
 * Handles chat sessions, importing, and exporting.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { state, dom, getDefaultChatConfig } from '../state.js';
import { importChatApi } from '../api.js';
import { uiManager } from '../core/UIManager.js';
import { lagoonAlert, lagoonPrompt } from '../ui/dialog.js';
import { refreshSidebar } from '../ui/sidebar.js';
import { cleanThinking, stripMarkdown } from '../utils.js';

export class SessionManager {
    constructor() {
        this.dom = {};
        this.selectedFile = null;
        this.selectedCharFile = null;
    }

    init() {
        this.refreshDom();
        this.bindEvents();
        console.log('[SessionManager] Initialized');
    }

    refreshDom() {
        this.dom = {
            quickChatBtn: document.getElementById('quick-chat-btn'),
            importChatBtn: document.getElementById('import-chat-btn'),
            importModal: document.getElementById('import-modal'),
            importName: document.getElementById('import-name'),
            importCharacter: document.getElementById('import-character'),
            importFileInput: document.getElementById('import-file-input'),
            importDropZone: document.getElementById('import-drop-zone'),
            importFileName: document.getElementById('import-file-name'),
            cancelImportBtn: document.getElementById('cancel-import-btn'),
            doImportBtn: document.getElementById('do-import-btn'),
            exportBtn: document.getElementById('export-btn'),
            exportCount: document.getElementById('export-count'),
            // Character tab
            tabBtns: document.querySelectorAll('.import-tab-btn'),
            tabChat: document.getElementById('import-tab-chat'),
            tabCharacter: document.getElementById('import-tab-character'),
            exportCharSelect: document.getElementById('export-character-select'),
            doExportCharBtn: document.getElementById('do-export-char-btn'),
            importCharDropZone: document.getElementById('import-char-drop-zone'),
            importCharFileInput: document.getElementById('import-char-file-input'),
            importCharFileName: document.getElementById('import-char-file-name'),
            doImportCharBtn: document.getElementById('do-import-char-btn'),
        };
    }

    bindEvents() {
        this.dom.quickChatBtn?.addEventListener('click', () => this.handleQuickChat());
        
        // Import
        this.dom.importChatBtn?.addEventListener('click', async () => {
            this.dom.importModal.classList.remove('hidden');
            this.switchTab('chat');
            this.dom.importName.value = '';
            this.dom.importFileInput.value = '';
            this.selectedFile = null;
            this.selectedCharFile = null;
            this.dom.importFileName.textContent = 'Click or drag file here';
            this.dom.importDropZone?.classList.remove('has-file');
            await this.populateCharacterDropdown();
        });

        this.dom.doImportBtn?.addEventListener('click', () => this.handleImportChat());
        this.dom.cancelImportBtn?.addEventListener('click', () => this.dom.importModal.classList.add('hidden'));
        this.dom.importDropZone?.addEventListener('click', () => this.dom.importFileInput.click());
        
        this.dom.importFileInput?.addEventListener('change', (e) => {
            console.log('[IMPORT] File input change event', e.target.files);
            if (e.target.files.length > 0) {
                this.selectedFile = e.target.files[0];  // Store file directly
                console.log('[IMPORT] Selected file:', this.selectedFile.name, this.selectedFile.size, 'bytes');
                this.dom.importFileName.textContent = e.target.files[0].name;
                this.dom.importDropZone?.classList.add('has-file');
            }
        });

        this.dom.importDropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.importDropZone.classList.add('drag-over');
        });
        this.dom.importDropZone?.addEventListener('dragleave', () => {
            this.dom.importDropZone.classList.remove('drag-over');
        });
        this.dom.importDropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.importDropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.selectedFile = e.dataTransfer.files[0];  // Store file directly
                this.dom.importFileName.textContent = e.dataTransfer.files[0].name;
                this.dom.importDropZone.classList.add('has-file');
            }
        });

        // Export
        this.dom.exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.mode === 'video') {
                import('./VideoModeManager.js').then(({ videoModeManager }) => videoModeManager.showWebmPicker(null));
                return;
            }
            this.showExportMenu(e.currentTarget);
        });

        // Modal tabs
        this.dom.tabBtns?.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Character export
        this.dom.doExportCharBtn?.addEventListener('click', () => this.handleExportCharacter());

        // Character import drop zone
        this.dom.importCharDropZone?.addEventListener('click', () => this.dom.importCharFileInput.click());
        this.dom.importCharFileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.selectedCharFile = e.target.files[0];
                this.dom.importCharFileName.textContent = e.target.files[0].name;
                this.dom.importCharDropZone.classList.add('has-file');
            }
        });
        this.dom.importCharDropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.importCharDropZone.classList.add('drag-over');
        });
        this.dom.importCharDropZone?.addEventListener('dragleave', () => {
            this.dom.importCharDropZone.classList.remove('drag-over');
        });
        this.dom.importCharDropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.importCharDropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.selectedCharFile = e.dataTransfer.files[0];
                this.dom.importCharFileName.textContent = e.dataTransfer.files[0].name;
                this.dom.importCharDropZone.classList.add('has-file');
            }
        });
        this.dom.doImportCharBtn?.addEventListener('click', () => this.handleImportCharacter());
    }

    switchTab(tab) {
        this.dom.tabBtns?.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        this.dom.tabChat.classList.toggle('hidden', tab !== 'chat');
        this.dom.tabCharacter.classList.toggle('hidden', tab !== 'character');
        if (tab === 'character') this.populateExportCharacterDropdown();
    }

    async handleQuickChat() {
        const { chatManager } = await import('./ChatManager.js');
        chatManager.startNewChatSession(getDefaultChatConfig(), null);
    }

    async populateExportCharacterDropdown() {
        const select = this.dom.exportCharSelect;
        if (!select) return;
        select.innerHTML = '<option value="">-- Select Character --</option>';
        try {
            const { fetchConfigs, fetchConfig } = await import('../api.js');
            const files = await fetchConfigs();
            for (const filename of (files || [])) {
                try {
                    const cfg = await fetchConfig(filename);
                    const opt = document.createElement('option');
                    opt.value = filename;
                    opt.textContent = cfg.character_name || filename.replace('.json', '');
                    select.appendChild(opt);
                } catch {}
            }
        } catch (e) {
            console.error('[SessionManager] Failed to populate export dropdown:', e);
        }
    }

    async handleExportCharacter() {
        const configName = this.dom.exportCharSelect?.value;
        if (!configName) {
            await lagoonAlert('Please select a character to export.');
            return;
        }
        const a = document.createElement('a');
        a.href = `/api/export_character/${encodeURIComponent(configName)}`;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async handleImportCharacter() {
        if (!this.selectedCharFile) {
            await lagoonAlert('Please select a .lagoon-char.zip file.');
            return;
        }
        const formData = new FormData();
        formData.append('file', this.selectedCharFile);
        try {
            const res = await fetch('/api/import_character', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                this.dom.importModal.classList.add('hidden');
                const detail = result.has_lore ? ' (with lore)' : '';
                await lagoonAlert(`"${result.character_name}" imported successfully${detail}.`);
                this.selectedCharFile = null;
                if (this.dom.importCharFileName) this.dom.importCharFileName.textContent = 'Drag & drop a .lagoon-char.zip here';
                this.dom.importCharDropZone?.classList.remove('has-file');
                await refreshSidebar();
            } else {
                await lagoonAlert(`Import failed: ${result.error}`);
            }
        } catch (e) {
            await lagoonAlert(`Import failed: ${e.message}`);
        }
    }

    async populateCharacterDropdown() {
        const select = this.dom.importCharacter;
        if (!select) return;
        
        // Clear existing options except the first
        select.innerHTML = '<option value="">-- No Character --</option>';
        
        // Fetch list of config filenames
        let configFiles = [];
        try {
            const { fetchConfigs } = await import('../api.js');
            configFiles = await fetchConfigs();  // Returns array of filenames
        } catch (e) {
            console.error('Failed to load configs for dropdown:', e);
            return;
        }
        
        if (!configFiles || configFiles.length === 0) {
            uiManager.updateCustomDropdown(select);
            return;
        }
        
        // Fetch each config to get character names
        const { fetchConfig } = await import('../api.js');
        for (const filename of configFiles) {
            try {
                const config = await fetchConfig(filename);
                const option = document.createElement('option');
                option.value = filename;
                option.textContent = config.character_name || config.name || filename.replace('.json', '');
                select.appendChild(option);
            } catch (e) {
                console.error(`Failed to load config ${filename}:`, e);
            }
        }
        uiManager.updateCustomDropdown(select);
    }

    async handleImportChat() {
        const displayName = this.dom.importName.value.trim() || 'Imported Chat';
        const selectedCharacter = this.dom.importCharacter?.value || null;

        console.log('[IMPORT] handleImportChat called');
        console.log('[IMPORT] selectedFile:', this.selectedFile);

        if (!this.selectedFile) {
            await lagoonAlert('Please select a chat export file.');
            return;
        }

        const file = this.selectedFile;
        console.log('[IMPORT] Using file:', file.name, file.size, 'bytes');

        try {
            const rawText = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            if (!rawText.trim()) {
                await lagoonAlert('File is empty.');
                return;
            }

            // Build config if character selected
            let config = {};
            if (selectedCharacter) {
                // Fetch the character config directly
                const { fetchConfig } = await import('../api.js');
                const charConfig = await fetchConfig(selectedCharacter);
                if (charConfig) {
                    config = {
                        parent_config: selectedCharacter,  // Link to character
                        character_name: charConfig.character_name,
                        model: charConfig.model,
                        system_prompt: charConfig.system_prompt,
                        character_card: charConfig.character_card,
                        avatar_url: charConfig.avatar_url
                    };
                }
            }

            const result = await importChatApi(rawText, displayName, config);

            console.log('[IMPORT] API result:', result);

            if (result.success) {
                this.dom.importModal.classList.add('hidden');
                await refreshSidebar();
                console.log('[IMPORT] Loading chat:', result.chat_id);
                const { chatManager } = await import('./ChatManager.js');
                await chatManager.loadChat(result.chat_id);
                await lagoonAlert(`Imported ${result.message_count} messages as "${result.display_name}"`);
            } else {
                await lagoonAlert('Import failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Import error:', err);
            await lagoonAlert('Import failed: ' + err.message);
        }
    }

    showExportMenu(button) {
        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
        const menu = document.createElement('div');
        menu.classList.add('context-menu');
        const rect = button.getBoundingClientRect();
        
        ['Plain Text', 'Markdown', 'Markdown (Clean)', 'Prose', 'Word (DOCX)'].forEach((label, i) => {
            const fmt = ['plain', 'markdown', 'markdown_clean', 'prose', 'docx'][i];
            const item = document.createElement('button');
            item.textContent = label;
            item.classList.add('context-menu-item');
            item.onclick = () => {
                this.exportKeptMessages(fmt);
                menu.remove();
            };
            menu.appendChild(item);
        });
        
        document.body.appendChild(menu);
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.top - menu.offsetHeight - 5}px`;
    }

    async exportKeptMessages(format) {
        if (state.keptMessages.size === 0) return;
        const sortedIndices = Array.from(state.keptMessages).sort((a, b) => a - b);
        const keptMsgs = sortedIndices.map(i => {
            const m = state.messages[i];
            if (!m || m.role !== 'assistant') return null;
            return {
                ...m,
                content: cleanThinking(m.content)
            };
        }).filter(m => m !== null);
        
        const charName = state.currentConfig.character_name || 'Assistant';
        
        if (format === 'docx') {
            const markdownToRuns = (text) => {
                const runs = [];
                let lastIndex = 0;
                // Regex for basic markdown: bold (***, **, __) and italics (*, _)
                const regex = /(\*\*\*|__\*|\*__|__|__|\*\*|\*|_)(.*?)\1/g;
                let match;

                const processText = (txt) => {
                    const lines = txt.split('\n');
                    lines.forEach((line, i) => {
                        if (line) runs.push(new TextRun(line));
                        if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
                    });
                };

                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                        processText(text.substring(lastIndex, match.index));
                    }

                    const marker = match[1];
                    const content = match[2];
                    const runOpts = { text: content };

                    if (marker === '***') { runOpts.bold = true; runOpts.italics = true; }
                    else if (marker === '**' || marker === '__') { runOpts.bold = true; }
                    else if (marker === '*' || marker === '_') { runOpts.italics = true; }

                    runs.push(new TextRun(runOpts));
                    lastIndex = regex.lastIndex;
                }
                if (lastIndex < text.length) {
                    processText(text.substring(lastIndex));
                }
                return runs;
            };

            const doc = new Document({
                sections: [{
                    properties: {},
                    children: [
                        new Paragraph({
                            text: charName,
                            heading: HeadingLevel.HEADING_1,
                        }),
                        new Paragraph({
                            children: [new TextRun({ text: `Exported on ${new Date().toLocaleDateString()}`, italics: true })],
                        }),
                        new Paragraph({ text: "" }), // Spacer
                        ...keptMsgs.flatMap((m, idx) => {
                            const normalized = m.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                            const paragraphs = normalized.split(/\n\n+/).filter(p => p.trim());
                            return paragraphs.map(para => {
                                return new Paragraph({
                                    children: markdownToRuns(para.trim()),
                                    spacing: { after: 200 },
                                });
                            });
                        }),
                    ],
                }],
            });
            
            const blob = await Packer.toBlob(doc);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${charName.replace(/[^a-z0-9]/gi, '_')}-export.docx`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }
        
        // Other formats (plain, markdown, prose)
        let output = '';
        let ext = 'txt';
        let type = 'text/plain';
        
        if (format === 'markdown') {
            output = keptMsgs.map(m => m.content).join('\n\n---\n\n');
            ext = 'md';
        } else if (format === 'markdown_clean') {
            output = keptMsgs.map(m => m.content).join('\n\n');
            ext = 'txt'; // Keep as .txt so it opens in any editor easily
        } else if (format === 'prose') {
            output = keptMsgs.map(m => stripMarkdown(m.content)).join('\n\n');
            ext = 'txt';
        } else {
            // Default plain text (clean prose)
            output = keptMsgs.map(m => stripMarkdown(m.content)).join('\n\n');
        }
        
        const blob = new Blob([output], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${charName.replace(/[^a-z0-9]/gi, '_')}-export.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    updateExportButton() {
        if (!this.dom.exportBtn || !this.dom.exportCount) return;
        // In video mode the button is repurposed — always enabled, no count badge
        if (state.mode === 'video') {
            this.dom.exportBtn.disabled = false;
            this.dom.exportCount.style.display = 'none';
            return;
        }
        const count = state.keptMessages.size;
        if (count > 0) {
            this.dom.exportBtn.disabled = false;
            this.dom.exportCount.textContent = count;
            this.dom.exportCount.style.display = 'flex';
        } else {
            this.dom.exportBtn.disabled = true;
            this.dom.exportCount.textContent = '';
            this.dom.exportCount.style.display = 'none';
        }
    }
}

export const sessionManager = new SessionManager();
// Global hook for legacy code
window.updateExportButton = () => sessionManager.updateExportButton();