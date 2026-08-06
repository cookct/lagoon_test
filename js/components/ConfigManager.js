/**
 * Configuration Manager Component
 * Encapsulates sidebar settings, character creation, and configuration file management.
 */

import { state, dom } from '../state.js';
import { DEFAULT_AVATAR_URI } from '../core/Constants.js';
import { saveConfigApi, uploadAvatarApi, fetchConfig, parseFileApi, deleteConfigApi, reparentChatsApi } from '../api.js';
import { lagoonAlert, lagoonConfirm } from '../ui/dialog.js';
import { refreshSidebar } from '../ui/sidebar.js';
import { updateMessageAvatars } from '../ui/messages.js';
import { CODE_EXTENSIONS } from '../utils.js';

export class ConfigManager {
    constructor() {
        this.dom = {};
        this._editingConfigFilename = null; // tracks which config is open in the editor (NOT the active chat's parent)
        this._editingSharedLore = [];
        this._contextFiles = []; // [{ name, content }] — supports multiple attached context files
        this.refreshDom();
    }

    init() {
        if (this.dom.configForm) {
            this.bindEvents();
            console.log('[ConfigManager] Initialized');
        }
    }

    refreshDom() {
        this.dom = {
            createCharBtn: document.getElementById('create-char-btn'),
            configModal: document.getElementById('config-modal'),
            configForm: document.getElementById('config-form'),
            configName: document.getElementById('config-name'),
            cancelConfigBtn: document.getElementById('cancel-config-btn'),
            
            // Avatar
            avatarUploadBtn: document.getElementById('avatar-upload-btn'),
            avatarUpload: document.getElementById('avatar-upload'),
            avatarPreview: document.getElementById('avatar-preview'),
            // Fields
            model: document.getElementById('model'),
            systemPrompt: document.getElementById('system_prompt'),
            introStatement: document.getElementById('intro_statement'),
            characterCard: document.getElementById('character_card'),
            maxTokens: document.getElementById('max_tokens'),
            
            // Context
            systemContextBtn: document.getElementById('system-context-btn'),
            systemContextInput: document.getElementById('system-context-input'),
            systemContextTextarea: document.getElementById('system_context'),
            contextFilesContainer: document.getElementById('system-context-files'),
            contextStatus: document.getElementById('system_context_status'),
            sharedLoreStatus: document.getElementById('shared-lore-status'),
            contextMode: document.getElementById('context_mode'),
            contextFileBtn: document.getElementById('context-file-btn'),
            contextFileInput: document.getElementById('context-file-input'),
            fileCancelBtn: document.getElementById('file-cancel-btn'),

            // Sliders
            temperature: document.getElementById('temperature'),
            topP: document.getElementById('top_p'),
            repetitionPenalty: document.getElementById('repetition_penalty'),
            tempValue: document.getElementById('temp-value'),
            topPValue: document.getElementById('top-p-value'),
            repPenValue: document.getElementById('rep-pen-value'),

            // Toggles
            enableWebSearch: document.getElementById('enable_web_search'),
            includeVeniceSystemPrompt: document.getElementById('include_venice_system_prompt'),
            uncensoredMode: document.getElementById('uncensored_mode'),
            stripThinking: document.getElementById('strip_thinking'),
            disableThinking: document.getElementById('disable_thinking'),
            styleOverseer: document.getElementById('style_overseer'),
            loreLabels: document.getElementById('lore_labels')
        };
    }

    bindEvents() {
        // Expand Modal Events
        this.bindExpandEvents();

        // Create / Cancel
        this.dom.createCharBtn?.addEventListener('click', () => this.handleCreateCharacter());
        this.dom.cancelConfigBtn?.addEventListener('click', () => this.dom.configModal.classList.add('hidden'));
        this.dom.configForm?.addEventListener('submit', (e) => this.handleSaveFromForm(e));

        // Avatar
        this.dom.avatarUploadBtn?.addEventListener('click', () => this.dom.avatarUpload.click());
        this.dom.avatarUpload?.addEventListener('change', () => this.handleAvatarPreview());
        // System Context (Character Config)
        this.dom.systemContextBtn?.addEventListener('click', () => this.dom.systemContextInput.click());
        this.dom.systemContextInput?.addEventListener('change', () => this.handleSystemContextFileSelect());

        // Context mode toggle — re-embed when switching to RAG
        this.dom.contextMode?.addEventListener('change', () => this._handleContextModeChange());

        // Sliders
        this.dom.temperature?.addEventListener('input', () => this.dom.tempValue.textContent = parseFloat(this.dom.temperature.value).toFixed(2));
        this.dom.topP?.addEventListener('input', () => this.dom.topPValue.textContent = parseFloat(this.dom.topP.value).toFixed(2));
        this.dom.repetitionPenalty?.addEventListener('input', () => this.dom.repPenValue.textContent = parseFloat(this.dom.repetitionPenalty.value).toFixed(2));
    }

    // ---
    
    bindExpandEvents() {
        const expandBtns = document.querySelectorAll('.expand-textarea-btn');
        const expandModal = document.getElementById('expand-textarea-modal');
        const expandInput = document.getElementById('expand-textarea-input');
        const expandTitle = document.getElementById('expand-modal-title');
        const saveBtn = document.getElementById('expand-save-btn');
        const cancelBtn = document.getElementById('expand-cancel-btn');
        const closeBtn = document.getElementById('expand-close-btn');

        if (!expandModal || !expandInput) return;

        let currentTargetId = null;

        const openModal = (targetId, title) => {
            const targetElement = document.getElementById(targetId);
            if (!targetElement) return;

            currentTargetId = targetId;
            expandTitle.textContent = `Edit ${title}`;
            expandInput.value = targetElement.value;
            expandModal.classList.remove('hidden');
            expandInput.focus();
        };

        const closeModal = () => {
            expandModal.classList.add('hidden');
            currentTargetId = null;
        };

        const saveContent = () => {
            if (currentTargetId) {
                const targetElement = document.getElementById(currentTargetId);
                if (targetElement) {
                    targetElement.value = expandInput.value;
                    
                    // Dispatch input event to trigger auto-resize or other listeners if needed
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Specific logic for system context which is sometimes hidden
                    if (currentTargetId === 'system_context' && expandInput.value.trim() !== '') {
                        targetElement.classList.remove('hidden');
                    }
                }
            }
            closeModal();
        };

        expandBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                // Attempt to find the label text for the title
                let title = 'Content';
                const label = document.querySelector(`label[for="${targetId}"]`);
                if (label) {
                    title = label.textContent;
                }
                openModal(targetId, title);
            });
        });

        saveBtn?.addEventListener('click', saveContent);
        cancelBtn?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        
        // Ctrl+Enter to save
        expandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveContent();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        });
    }

    handleCreateCharacter() {
        this._editingConfigFilename = null;
        this._editingSharedLore = [];
        this._contextFiles = [];
        this.dom.configForm.reset();
        this.dom.configName.value = '';
        this.dom.avatarPreview.src = DEFAULT_AVATAR_URI;
        state.selectedAvatarFile = null;
        
        if (this.dom.systemContextTextarea) {
            this.dom.systemContextTextarea.value = '';
            this.dom.systemContextTextarea.classList.add('hidden');
            
            const contextLabel = document.getElementById('system_context_label');
            const contextBtn = document.getElementById('system_context_expand_btn');
            if (contextLabel) contextLabel.classList.add('hidden');
            if (contextBtn) contextBtn.classList.add('hidden');
        }
        this._renderContextFileChips();
        if (state.currentConfig) state.currentConfig.system_context = '';
        if (this.dom.contextMode) this.dom.contextMode.value = 'always';
        
        // Clear status displays
        if (this.dom.contextStatus) {
            this.dom.contextStatus.classList.add('hidden');
            this.dom.contextStatus.textContent = '';
        }
        if (this.dom.sharedLoreStatus) {
            this.dom.sharedLoreStatus.classList.add('hidden');
            this.dom.sharedLoreStatus.textContent = '';
        }

        // Load persisted settings from localStorage
        const savedSettings = JSON.parse(localStorage.getItem('lagoon_desktop_settings') || '{}');
        this.dom.temperature.value = savedSettings.temperature || 0.7;
        this.dom.topP.value = savedSettings.top_p || 1.0;
        this.dom.repetitionPenalty.value = savedSettings.repetition_penalty || 1.0;
        this.dom.tempValue.textContent = parseFloat(this.dom.temperature.value).toFixed(2);
        this.dom.topPValue.textContent = parseFloat(this.dom.topP.value).toFixed(2);
        this.dom.repPenValue.textContent = parseFloat(this.dom.repetitionPenalty.value).toFixed(2);
        this.dom.configModal.classList.remove('hidden');
    }

    async handleSaveFromForm(e) {
        e.preventDefault();
        const configName = this.dom.configName.value.trim();
        if (!configName) {
            await lagoonAlert("A 'Character Name' is required.");
            return;
        }
        const configData = this.getCurrentConfigFromForm();
        await this.saveConfig(configName, configData);
        this.dom.configModal.classList.add('hidden');
    }

    getCurrentConfigFromForm() {
        const configName = this.dom.configName.value.trim();
        return {
            character_name: configName,
            model: this.dom.model.value,
            system_prompt: this.dom.systemPrompt.value,
            intro_statement: this.dom.introStatement.value,
            character_card: this.dom.characterCard.value,
            system_context: this.dom.systemContextTextarea ? this.dom.systemContextTextarea.value : '',
            context_mode: this.dom.contextMode ? this.dom.contextMode.value : 'always',
            temperature: parseFloat(this.dom.temperature.value),
            top_p: parseFloat(this.dom.topP.value),
            repetition_penalty: parseFloat(this.dom.repetitionPenalty.value),
            max_tokens: parseInt(this.dom.maxTokens.value.replace(',', ''), 10) || 4096,
            author_note: state.currentConfig?.author_note || '',
            author_note_depth: state.currentConfig?.author_note_depth || 4,
            enable_web_search: this.dom.enableWebSearch.checked,
            include_venice_system_prompt: this.dom.includeVeniceSystemPrompt.checked,
            uncensored_mode: this.dom.uncensoredMode.checked,
            strip_thinking: this.dom.stripThinking.checked,
            disable_thinking: this.dom.disableThinking?.checked || false,
            lore_labels: this.dom.loreLabels?.checked ?? true,
            style_overseer: this.dom.styleOverseer?.checked || false,
            shared_lore: this._editingSharedLore,
            avatar_url: this.dom.avatarPreview.src.startsWith('data:') ? this.dom.avatarPreview.src : null
        };
    }

    async saveConfig(filename, configData) {
        if (state.selectedAvatarFile) {
            try {
                const result = await uploadAvatarApi(state.selectedAvatarFile);
                configData.avatar_url = result.path;
                this.dom.avatarPreview.src = result.path;
            } catch (error) {
                await lagoonAlert(`Error uploading avatar: ${error.message}`);
                return;
            }
        }
        
        try {
            await saveConfigApi(filename, configData);

            // If context mode is RAG, embed the context file server-side
            if (configData.context_mode === 'rag' && configData.system_context) {
                try {
                    const { embedContextApi } = await import('../api.js');
                    const newFilename = `${filename}.json`;
                    await embedContextApi(newFilename, configData.system_context, 'context');
                } catch (err) {
                    console.warn('[ConfigManager] Context embedding after save failed:', err);
                }
            }

            // Handle Renaming: If we have an existing config open in the editor and the name changed, delete the old one
            const newFilename = `${filename}.json`;
            let wasRename = false;
            if (this._editingConfigFilename && this._editingConfigFilename !== newFilename) {
                const oldFilename = this._editingConfigFilename;
                wasRename = true;
                console.log(`[ConfigManager] Renaming detected. Deleting old config: ${oldFilename}`);
                try {
                    await deleteConfigApi(oldFilename);
                } catch (err) {
                    console.warn(`[ConfigManager] Failed to delete old config during rename: ${err.message}`);
                }
                // Update parent_config in all chats that reference the old name
                try {
                    await reparentChatsApi(oldFilename, newFilename);
                } catch (err) {
                    console.warn(`[ConfigManager] Failed to reparent chats after rename: ${err.message}`);
                }
                this._editingConfigFilename = newFilename;
            }

            state.selectedAvatarFile = null;

            // Track if this was an edit of the currently active character.
            // wasRename covers the rename case; otherwise check if edited config matches the current chat's parent.
            const wasEditingActiveChar = wasRename || (this._editingConfigFilename !== null && this._editingConfigFilename === state.currentParentConfig);
            
            // Only update currentParentConfig if we were editing an existing character
            // Otherwise, keep the user in their current session (e.g., Quick Chat)
            if (wasEditingActiveChar) {
                state.currentParentConfig = newFilename;
            }
            
            await refreshSidebar();

            // If editing the active character, apply changes to the current chat immediately.
            if (wasEditingActiveChar) {
                const newConfig = await fetchConfig(`${filename}.json`);
                if (newConfig) {
                    const { chatManager } = await import('./ChatManager.js');
                    chatManager.applyCharacterConfig(newConfig);
                    chatManager.updateModelButtonText();
                    updateMessageAvatars(newConfig);
                    if (state.currentChatId) {
                        const { saveChatApi } = await import('../api.js');
                        saveChatApi(
                            state.currentChatId,
                            state.messages,
                            state.currentConfig,
                            state.currentParentConfig,
                            null
                        ).catch(e => console.warn('[ConfigManager] Failed to persist chat after config update:', e));
                    }
                }
            }
        } catch (error) {
            await lagoonAlert(`Error saving configuration: ${error.message}`);
        }
    }

    async loadConfigToForm(configFilename) {
        this.refreshDom(); // Ensure DOM is fresh
        const configData = await fetchConfig(configFilename);
        if (!configData) return;

        this._editingConfigFilename = configFilename; // track editor state only — do NOT touch state.currentParentConfig
        this._editingSharedLore = Array.isArray(configData.shared_lore) ? configData.shared_lore
            : (configData.shared_lore ? [configData.shared_lore] : []);
        this.dom.configName.value = configFilename.replace('.json', '');
        this.dom.model.value = configData.model || 'zai-org-glm-4.7';
        this.dom.model.dispatchEvent(new Event('change'));
        this.dom.systemPrompt.value = configData.system_prompt || '';
        this.dom.introStatement.value = configData.intro_statement || '';
        this.dom.characterCard.value = configData.character_card || '';
        
        if (this.dom.systemContextTextarea) {
            const contextLabel = document.getElementById('system_context_label');
            const contextBtn = document.getElementById('system_context_expand_btn');
            
            if (configData.system_context) {
                this.dom.systemContextTextarea.value = configData.system_context;
                this.dom.systemContextTextarea.classList.remove('hidden');
                if (contextLabel) contextLabel.classList.remove('hidden');
                if (contextBtn) contextBtn.classList.remove('hidden');
                // Parse existing system_context into individual file chips
                this._contextFiles = this._parseContextIntoFiles(configData.system_context);
            } else {
                this.dom.systemContextTextarea.value = '';
                this.dom.systemContextTextarea.classList.add('hidden');
                if (contextLabel) contextLabel.classList.add('hidden');
                if (contextBtn) contextBtn.classList.add('hidden');
                this._contextFiles = [];
            }
            this._renderContextFileChips();
        }

        // Context mode dropdown
        if (this.dom.contextMode) {
            this.dom.contextMode.value = configData.context_mode || 'always';
        }

        // Update context file status
        this._updateContextStatus(configData.system_context, configData.context_mode);

        // Update shared lore status
        this._updateSharedLoreStatus(configData.shared_lore);

        // Clear status displays for new character creation
        if (!configFilename && !this._editingConfigFilename) {
            if (this.dom.contextStatus) {
                this.dom.contextStatus.classList.add('hidden');
            }
            if (this.dom.sharedLoreStatus) {
                this.dom.sharedLoreStatus.classList.add('hidden');
            }
        }

        this.dom.temperature.value = configData.temperature || 0.7;
        this.dom.topP.value = configData.top_p || 1.0;
        this.dom.repetitionPenalty.value = configData.repetition_penalty || 1.0;
        this.dom.maxTokens.value = configData.max_tokens || 4096;

        this.dom.enableWebSearch.checked = configData.enable_web_search || false;
        this.dom.includeVeniceSystemPrompt.checked = configData.include_venice_system_prompt ?? true;
        this.dom.uncensoredMode.checked = configData.uncensored_mode || false;
        this.dom.stripThinking.checked = configData.strip_thinking || false;
        if (this.dom.disableThinking) this.dom.disableThinking.checked = configData.disable_thinking || false;
        if (this.dom.loreLabels) this.dom.loreLabels.checked = configData.lore_labels ?? true;
        if (this.dom.styleOverseer) this.dom.styleOverseer.checked = configData.style_overseer || false;
        this.dom.avatarPreview.src = configData.avatar_url || DEFAULT_AVATAR_URI;
        state.selectedAvatarFile = null;

        this.dom.tempValue.textContent = parseFloat(this.dom.temperature.value).toFixed(2);
        this.dom.topPValue.textContent = parseFloat(this.dom.topP.value).toFixed(2);
        this.dom.repPenValue.textContent = parseFloat(this.dom.repetitionPenalty.value).toFixed(2);

        this.dom.configModal.classList.remove('hidden');
    }

    // Avatar Logic
    handleAvatarPreview() {
        const file = this.dom.avatarUpload.files[0];
        if (file) {
            state.selectedAvatarFile = file;
            this.dom.avatarPreview.src = URL.createObjectURL(file);
        }
    }

    // Context File Logic
    async handleContextFileSelect() {
        const file = this.dom.contextFileInput.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

        try {
            if (IMAGE_EXTENSIONS.includes(ext)) {
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                });
                reader.readAsDataURL(file);
                state.contextFileContent = await base64Promise;
                state.contextFileName = file.name;

            } else if (ext === 'txt') {
                state.contextFileContent = await file.text();
                state.contextFileName = file.name;
            } else if (CODE_EXTENSIONS[ext]) {
                const rawContent = await file.text();
                const lang = CODE_EXTENSIONS[ext];
                state.contextFileContent = `[CODE FILE: ${file.name}]\n\`\`\`${lang}\n${rawContent}\n\`\`\``;
                state.contextFileName = file.name;
            } else if (ext === 'pdf') {
                const result = await parseFileApi(file);
                state.contextFileContent = result.content;
                state.contextFileName = file.name;
            }

            this.dom.contextFileBtn.classList.add('has-file');
            this.dom.contextFileBtn.title = `File loaded: ${state.contextFileName}`;
        } catch (error) {
            await lagoonAlert(`Error loading file: ${error.message}`);
            chatManager.clearContextFile();
        }
    }

    async handleSystemContextFileSelect() {
        const file = this.dom.systemContextInput.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        let content = "";

        try {
            if (ext === 'pdf') {
                 const result = await parseFileApi(file);
                 content = `[SYSTEM CONTEXT: ${file.name}]\n${result.content}`;
            } else {
                 const rawText = await file.text();
                 if (CODE_EXTENSIONS[ext]) {
                     content = `[SYSTEM CONTEXT: ${file.name}]\n\`\`\`${CODE_EXTENSIONS[ext]}\n${rawText}\n\`\`\``;
                 } else {
                     content = `[SYSTEM CONTEXT: ${file.name}]\n${rawText}`;
                 }
            }

            // Push to multi-file array (supports multiple attached files)
            this._contextFiles.push({ name: file.name, content });
            this._rebuildSystemContextTextarea();
            this._renderContextFileChips();

            if (this.dom.systemContextTextarea) {
                this.dom.systemContextTextarea.classList.remove('hidden');
                const contextLabel = document.getElementById('system_context_label');
                const contextBtn = document.getElementById('system_context_expand_btn');
                if (contextLabel) contextLabel.classList.remove('hidden');
                if (contextBtn) contextBtn.classList.remove('hidden');
                if (!state.currentConfig) state.currentConfig = {};
                state.currentConfig.system_context = this.dom.systemContextTextarea.value;
                const mode = this.dom.contextMode ? this.dom.contextMode.value : 'always';
                this._updateContextStatus(this.dom.systemContextTextarea.value, mode);
            }
            this.dom.systemContextInput.value = '';

            // If context mode is RAG, embed the file server-side immediately
            const mode = this.dom.contextMode ? this.dom.contextMode.value : 'always';
            if (mode === 'rag' && this._editingConfigFilename) {
                try {
                    const { embedContextApi } = await import('../api.js');
                    const result = await embedContextApi(this._editingConfigFilename, content, file.name);
                    if (result.success) {
                        await lagoonAlert(`Loaded & embedded context: ${file.name} (${result.chunks} chunks)`);
                    } else {
                        await lagoonAlert(`Loaded context: ${file.name}\n(RAG embedding failed — will use full injection as fallback)`);
                    }
                } catch (err) {
                    console.warn('[ConfigManager] Context embedding failed:', err);
                    await lagoonAlert(`Loaded context: ${file.name}\n(RAG embedding unavailable — will use full injection as fallback)`);
                }
            } else {
                await lagoonAlert(`Loaded system context: ${file.name}`);
            }

        } catch (error) {
            await lagoonAlert(`Error reading file: ${error.message}`);
        }
    }

    // Merge all attached context files into the hidden textarea for backward compatibility
    _rebuildSystemContextTextarea() {
        if (!this.dom.systemContextTextarea) return;
        if (this._contextFiles.length === 0) {
            this.dom.systemContextTextarea.value = '';
        } else if (this._contextFiles.length === 1) {
            this.dom.systemContextTextarea.value = this._contextFiles[0].content;
        } else {
            this.dom.systemContextTextarea.value = this._contextFiles
                .map(f => f.content)
                .join('\n\n---\n\n');
        }
    }

    // Parse a merged system_context string back into individual file objects
    // Splits on [SYSTEM CONTEXT: filename] headers; content without headers becomes one "Context" entry
    _parseContextIntoFiles(contextText) {
        if (!contextText || !contextText.trim()) return [];
        
        // Split on the [SYSTEM CONTEXT: ...] header, keeping the header with its content
        const parts = contextText.split(/(?=\[SYSTEM CONTEXT: [^\]]+\])/);
        const files = [];
        
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^\[SYSTEM CONTEXT: ([^\]]+)\]/);
            if (match) {
                files.push({ name: match[1], content: trimmed });
            } else {
                // Content without a header — treat as a single unnamed context block
                files.push({ name: 'Context', content: trimmed });
            }
        }
        return files;
    }

    // Render visual chips for each attached context file with X remove buttons
    _renderContextFileChips() {
        const container = this.dom.contextFilesContainer;
        if (!container) return;
        container.innerHTML = '';

        this._contextFiles.forEach((fileObj, index) => {
            const chip = document.createElement('span');
            chip.className = 'context-file-chip';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'context-file-chip-name';
            nameSpan.textContent = '📎 ' + fileObj.name;
            nameSpan.title = fileObj.name;
            chip.appendChild(nameSpan);

            const xBtn = document.createElement('button');
            xBtn.type = 'button';
            xBtn.className = 'context-file-chip-x';
            xBtn.innerHTML = '&times;';
            xBtn.title = 'Remove file';
            xBtn.addEventListener('click', () => this._removeContextFile(index));
            chip.appendChild(xBtn);

            container.appendChild(chip);
        });
    }

    // Remove a context file by index and rebuild
    _removeContextFile(index) {
        this._contextFiles.splice(index, 1);
        this._rebuildSystemContextTextarea();
        this._renderContextFileChips();

        if (this.dom.systemContextTextarea) {
            if (this._contextFiles.length === 0) {
                this.dom.systemContextTextarea.classList.add('hidden');
                const contextLabel = document.getElementById('system_context_label');
                const contextBtn = document.getElementById('system_context_expand_btn');
                if (contextLabel) contextLabel.classList.add('hidden');
                if (contextBtn) contextBtn.classList.add('hidden');
            }
            if (!state.currentConfig) state.currentConfig = {};
            state.currentConfig.system_context = this.dom.systemContextTextarea.value;
            const mode = this.dom.contextMode ? this.dom.contextMode.value : 'always';
            this._updateContextStatus(this.dom.systemContextTextarea.value, mode);
        }
    }

    async _handleContextModeChange() {
        const mode = this.dom.contextMode ? this.dom.contextMode.value : 'always';
        if (mode !== 'rag') return;

        // If we have context text but no config filename yet, just note it
        const contextText = this.dom.systemContextTextarea ? this.dom.systemContextTextarea.value.trim() : '';
        if (!contextText) return;

        const configName = this._editingConfigFilename;
        if (!configName) {
            // Will embed after save when we have a filename
            return;
        }

        try {
            const { embedContextApi } = await import('../api.js');
            const result = await embedContextApi(configName, contextText, 'context');
            if (result.success) {
                await lagoonAlert(`Context embedded: ${result.chunks} chunks ready for RAG retrieval`);
            } else {
                await lagoonAlert('RAG embedding failed — context will fall back to full injection');
            }
        } catch (err) {
            console.warn('[ConfigManager] Context embedding failed:', err);
            await lagoonAlert('RAG embedding unavailable — context will fall back to full injection');
        }
    }

    _updateContextStatus(contextText, contextMode) {
        const statusEl = this.dom.contextStatus;
        if (!statusEl) return;

        if (!contextText) {
            statusEl.classList.add('hidden');
            statusEl.textContent = '';
            return;
        }

        // Extract ALL filenames from [SYSTEM CONTEXT: filename] headers
        const matches = [...contextText.matchAll(/\[SYSTEM CONTEXT: ([^\]]+)\]/g)];
        const modeLabel = contextMode === 'rag' ? 'RAG' : 'Always';

        if (matches.length === 0) {
            statusEl.textContent = `📎 Context file (${modeLabel})`;
        } else if (matches.length === 1) {
            statusEl.textContent = `📎 ${matches[0][1]} (${modeLabel})`;
        } else {
            const names = matches.slice(0, 3).map(m => m[1]).join(', ');
            const more = matches.length > 3 ? ` +${matches.length - 3} more` : '';
            statusEl.textContent = `📎 ${matches.length} files: ${names}${more} (${modeLabel})`;
        }
        statusEl.classList.remove('hidden');
    }

    _updateSharedLoreStatus(sharedLore) {
        const statusEl = this.dom.sharedLoreStatus;
        if (!statusEl) return;

        const loreArray = Array.isArray(sharedLore) ? sharedLore : (sharedLore ? [sharedLore] : []);

        if (loreArray.length === 0) {
            statusEl.classList.add('hidden');
            statusEl.textContent = '';
            return;
        }

        const count = loreArray.length;
        const names = loreArray.slice(0, 3).join(', ');
        const more = count > 3 ? ` +${count - 3} more` : '';

        statusEl.textContent = `📚 Shared lore: ${names}${more}`;
        statusEl.classList.remove('hidden');
    }
}

export const configManager = new ConfigManager();
