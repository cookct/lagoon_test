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
        if (state.currentConfig) state.currentConfig.system_context = '';

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
            } else {
                this.dom.systemContextTextarea.value = '';
                this.dom.systemContextTextarea.classList.add('hidden');
                if (contextLabel) contextLabel.classList.add('hidden');
                if (contextBtn) contextBtn.classList.add('hidden');
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
                 content = `[SYSTEM CONTEXT: ${file.name}]
${result.content}`;
            } else {
                 const rawText = await file.text();
                 if (CODE_EXTENSIONS[ext]) {
                     content = `[SYSTEM CONTEXT: ${file.name}]\n\`\`\`${CODE_EXTENSIONS[ext]}\n${rawText}\n\`\`\``;
                 } else {
                     content = `[SYSTEM CONTEXT: ${file.name}]
${rawText}`;
                 }
            }

            if (this.dom.systemContextTextarea) {
                this.dom.systemContextTextarea.value = content;
                this.dom.systemContextTextarea.classList.remove('hidden');
                
                const contextLabel = document.getElementById('system_context_label');
                const contextBtn = document.getElementById('system_context_expand_btn');
                if (contextLabel) contextLabel.classList.remove('hidden');
                if (contextBtn) contextBtn.classList.remove('hidden');
                
                if (!state.currentConfig) state.currentConfig = {};
                state.currentConfig.system_context = content;
            }
            this.dom.systemContextInput.value = '';
            await lagoonAlert(`Loaded system context: ${file.name}`);

        } catch (error) {
            await lagoonAlert(`Error reading file: ${error.message}`);
        }
    }
}

export const configManager = new ConfigManager();
