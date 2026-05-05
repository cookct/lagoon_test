/**
 * Dual Model Manager Component
 * Handles automated conversations between two AI models/characters
 */

import { state, dom } from '../state.js';
import { populateSelect, getDisplayName } from '../core/InstalledModels.js';
import { streamChat, saveChatApi } from '../api.js';
import { parseMarkdown } from '../utils.js';
import { addMessageToUI, createAssistantMessageActions } from '../ui/messages.js';
import { autoScroll } from '../ui/scroll.js';
import { refreshSidebar } from '../ui/sidebar.js';
import { lagoonAlert } from '../ui/dialog.js';
import { uiManager } from '../core/UIManager.js';

export class DualModelManager {
    constructor() {
        this.abortController = null;
        this.timerInterval = null;
        this.delayBetweenTurns = 1500; // ms delay between model responses
        this.characters = []; // Loaded character configs
        this._turnChainActive = false; // guard against concurrent chains
        this._sessionId = 0; // incremented on restart to kill stale stream loops
        this._modalInitialized = false;
        this._modeA = 'character';
        this._modeB = 'character';
        this._changeHandlerA = null;
        this._changeHandlerB = null;
    }

    init() {
        this.bindModalEvents();
        console.log('[DualModelManager] Initialized');
    }

    bindModalEvents() {
        // Modal close — button only, no backdrop click
        document.getElementById('dual-modal-close-btn')?.addEventListener('click', () => this.closeModal());

        // Start button
        const startBtn = document.getElementById('dual-start-btn');
        startBtn?.addEventListener('click', () => this.handleStart());

        // Save config button
        document.getElementById('dual-save-config-btn')?.addEventListener('click', () => this.saveConfig());

        // Control buttons (in Tools panel)
        document.getElementById('dual-tool-start-btn')?.addEventListener('click', () => this.openModal());
        document.getElementById('dual-tool-restart-btn')?.addEventListener('click', () => this.showRestartModal());
        document.getElementById('dual-tool-pause-btn')?.addEventListener('click', () => this.pause());
        document.getElementById('dual-tool-resume-btn')?.addEventListener('click', () => this.resume());
        document.getElementById('dual-tool-stop-btn')?.addEventListener('click', () => this.stop());
        document.getElementById('dual-tool-continue-btn')?.addEventListener('click', () => this.showContinueModal());
        document.getElementById('dual-restart-confirm-btn')?.addEventListener('click', () => this.handleRestart());
        document.getElementById('dual-restart-cancel-btn')?.addEventListener('click', () => this.hideRestartModal());
        document.getElementById('dual-restart-cancel-btn2')?.addEventListener('click', () => this.hideRestartModal());

        // Continue modal events
        this.bindContinueModalEvents();

        // Temperature sliders
        this.bindTempSlider('dual-model-a-temp', 'dual-model-a-temp-value');
        this.bindTempSlider('dual-model-b-temp', 'dual-model-b-temp-value');
    }

    bindTempSlider(sliderId, valueId) {
        const slider = document.getElementById(sliderId);
        const valueEl = document.getElementById(valueId);
        if (slider && valueEl) {
            slider.addEventListener('input', () => {
                valueEl.textContent = slider.value;
            });
        }
    }

    bindContinueModalEvents() {
        const modal = document.getElementById('dual-continue-modal');
        const closeBtn = modal?.querySelector('.close-btn');
        const cancelBtn = document.getElementById('dual-continue-cancel-btn');
        const confirmBtn = document.getElementById('dual-continue-confirm-btn');

        closeBtn?.addEventListener('click', () => this.hideContinueModal());
        cancelBtn?.addEventListener('click', () => this.hideContinueModal());
        modal?.addEventListener('mousedown', (e) => {
            if (e.target === modal) this.hideContinueModal();
        });
        confirmBtn?.addEventListener('click', () => this.handleContinue());
    }

    showContinueModal() {
        const modal = document.getElementById('dual-continue-modal');
        if (modal) modal.classList.remove('hidden');
    }

    hideContinueModal() {
        const modal = document.getElementById('dual-continue-modal');
        if (modal) modal.classList.add('hidden');
    }

    handleContinue() {
        const turnsInput = document.getElementById('dual-continue-turns');
        const additionalTurns = parseInt(turnsInput?.value) || 10;
        
        this.hideContinueModal();
        this.continueConversation(additionalTurns);
    }

    async continueConversation(additionalTurns) {
        if (!state.dualModelConfig || !state.dualModelConfig.modelA) {
            lagoonAlert('No dual conversation to continue');
            return;
        }

        // Increment session to kill any stale background loops
        this._sessionId++;
        const mySessionId = this._sessionId;

        // Increase max turns
        state.dualModelConfig.maxTurns += additionalTurns;
        state.dualModelRunning = true;
        state.dualModelPaused = false;

        this.updateControlBar();

        // Determine which model should go next based on last message
        const lastMsg = state.messages[state.messages.length - 1];
        let nextModel = 'A';
        if (lastMsg?.modelKey) {
            nextModel = lastMsg.modelKey === 'A' ? 'B' : 'A';
        }

        await this._runLoop(nextModel);
    }

    async openModal() {
        const modal = document.getElementById('dual-model-modal');
        if (!modal) return;

        // Load characters and populate dropdowns
        await this.populateCharacterDropdowns();
        modal.classList.remove('hidden');
    }

    closeModal() {
        const modal = document.getElementById('dual-model-modal');
        modal?.classList.add('hidden');
    }

    async loadCharacters() {
        try {
            // Get list of config filenames
            const listResponse = await fetch('/api/configs');
            if (!listResponse.ok) throw new Error('Failed to load config list');
            const filenames = await listResponse.json();
            
            // Fetch full config for each file
            const configPromises = filenames.map(async (filename) => {
                try {
                    const response = await fetch(`/api/config/${encodeURIComponent(filename)}`);
                    if (!response.ok) return null;
                    const config = await response.json();
                    return { ...config, filename };
                } catch (e) {
                    console.warn(`[DualModel] Failed to load config ${filename}:`, e);
                    return null;
                }
            });
            
            const configs = await Promise.all(configPromises);
            return configs.filter(c => c !== null);
        } catch (error) {
            console.error('[DualModel] Failed to load characters:', error);
            return [];
        }
    }

    async populateCharacterDropdowns() {
        const selectA = document.getElementById('dual-char-a-select');
        const selectB = document.getElementById('dual-char-b-select');
        const overrideA = document.getElementById('dual-model-a-override');
        const overrideB = document.getElementById('dual-model-b-override');

        if (!selectA || !selectB) return;

        // Load characters
        this.characters = await this.loadCharacters();

        // Clear and populate character dropdowns
        selectA.innerHTML = '<option value="">-- Select Character --</option>';
        selectB.innerHTML = '<option value="">-- Select Character --</option>';

        this.characters.forEach(char => {
            const optA = document.createElement('option');
            optA.value = char.filename;
            optA.textContent = char.character_name || char.filename;
            selectA.appendChild(optA);

            const optB = document.createElement('option');
            optB.value = char.filename;
            optB.textContent = char.character_name || char.filename;
            selectB.appendChild(optB);
        });

        // Populate model override dropdowns from SSOT
        [overrideA, overrideB].forEach(select => {
            if (!select) return;
            populateSelect(select, { includeBlank: true, blankLabel: "Use Character's Model" });
        });

        if (!this._modalInitialized) {
            // First open: init custom dropdowns and register listeners once
            [selectA, selectB, overrideA, overrideB].forEach(select => {
                if (select) uiManager.initCustomDropdown(select);
            });

            this._changeHandlerA = () => this.onCharacterSelect('A');
            this._changeHandlerB = () => this.onCharacterSelect('B');
            selectA.addEventListener('change', this._changeHandlerA);
            selectB.addEventListener('change', this._changeHandlerB);

            this.bindModeToggles();
            this._modalInitialized = true;
        } else {
            // Subsequent opens: just refresh dropdown displays
            [selectA, selectB, overrideA, overrideB].forEach(select => {
                if (select) uiManager.updateCustomDropdown(select);
            });
        }

        // Restore saved config or set defaults
        const restored = this.loadConfig();
        if (!restored) {
            if (this.characters.length >= 2) {
                selectA.value = this.characters[0].filename;
                selectB.value = this.characters[1].filename;
                this.onCharacterSelect('A');
                this.onCharacterSelect('B');
            } else if (this.characters.length === 1) {
                selectA.value = this.characters[0].filename;
                this.onCharacterSelect('A');
            }
        }
    }

    onCharacterSelect(modelKey) {
        const selectId = `dual-char-${modelKey.toLowerCase()}-select`;
        const select = document.getElementById(selectId);
        if (!select) return;

        const filename = select.value;
        const char = this.characters.find(c => c.filename === filename);
        
        // Update avatar preview
        const avatarEl = document.getElementById(`char-${modelKey.toLowerCase()}-avatar`);
        if (avatarEl) {
            if (char?.avatar_url) {
                avatarEl.innerHTML = `<img src="${char.avatar_url}" alt="${char.character_name}">`;
            } else {
                avatarEl.innerHTML = `<span class="char-avatar-placeholder">${modelKey}</span>`;
            }
        }

        // Update info display
        const infoEl = document.getElementById(`char-${modelKey.toLowerCase()}-info`);
        if (infoEl) {
            if (char) {
                const modelName = getDisplayName(char.model) || 'Unknown';
                infoEl.innerHTML = `<span class="char-model">${modelName}</span> • Temp: ${char.temperature || 0.7}`;
            } else {
                infoEl.innerHTML = `<span class="char-model">Select a character</span>`;
            }
        }

        if (!char) return;

        // Update prompt textarea - combine system_prompt, character_card, and system_context
        const promptEl = document.getElementById(`dual-model-${modelKey.toLowerCase()}-prompt`);
        if (promptEl) {
            const parts = [];
            if (char.system_prompt) parts.push(char.system_prompt);
            if (char.character_card) parts.push(`[CHARACTER CARD]\n${char.character_card}`);
            if (char.system_context) parts.push(`[CONTEXT]\n${char.system_context}`);
            promptEl.value = parts.filter(p => p).join('\n\n');
        }

        // Update temperature
        const tempEl = document.getElementById(`dual-model-${modelKey.toLowerCase()}-temp`);
        const tempValueEl = document.getElementById(`dual-model-${modelKey.toLowerCase()}-temp-value`);
        if (tempEl && char.temperature !== undefined) {
            tempEl.value = char.temperature;
            if (tempValueEl) tempValueEl.textContent = char.temperature;
        }

        // Reset model override
        const overrideEl = document.getElementById(`dual-model-${modelKey.toLowerCase()}-override`);
        if (overrideEl) {
            overrideEl.value = '';
            uiManager.updateCustomDropdown(overrideEl);
        }
    }

    bindModeToggles() {
        ['a', 'b'].forEach(side => {
            const toggleEl = document.getElementById(`dual-mode-toggle-${side}`);
            if (!toggleEl) return;
            toggleEl.querySelectorAll('.dual-mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = btn.dataset.mode;
                    this[`_mode${side.toUpperCase()}`] = mode;
                    toggleEl.querySelectorAll('.dual-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
                    this.applyModeToUI(side.toUpperCase(), mode);
                });
            });
        });
    }

    applyModeToUI(side, mode) {
        const s = side.toLowerCase();
        const charFields = document.getElementById(`dual-char-${s}-fields`);
        const overrideLabel = document.getElementById(`dual-model-${s}-override-label`);
        const overrideEl = document.getElementById(`dual-model-${s}-override`);
        const promptEl = document.getElementById(`dual-model-${s}-prompt`);

        if (mode === 'quickchat') {
            if (charFields) charFields.style.display = 'none';
            if (overrideLabel) overrideLabel.textContent = 'Model';
            if (overrideEl) {
                // Swap blank option label for quick chat
                const blank = overrideEl.querySelector('option[value=""]');
                if (blank) blank.textContent = '-- Select Model --';
                uiManager.updateCustomDropdown(overrideEl);
            }
            if (promptEl) promptEl.placeholder = 'System prompt...';
        } else {
            if (charFields) charFields.style.display = '';
            if (overrideLabel) overrideLabel.textContent = 'Model Override';
            if (overrideEl) {
                const blank = overrideEl.querySelector('option[value=""]');
                if (blank) blank.textContent = "Use Character's Model";
                uiManager.updateCustomDropdown(overrideEl);
            }
            if (promptEl) promptEl.placeholder = "Character's system prompt will appear here...";
        }
    }

    saveConfig() {
        const cfg = {
            modeA: this._modeA,
            modeB: this._modeB,
            charA: document.getElementById('dual-char-a-select')?.value || '',
            charB: document.getElementById('dual-char-b-select')?.value || '',
            overrideA: document.getElementById('dual-model-a-override')?.value || '',
            overrideB: document.getElementById('dual-model-b-override')?.value || '',
            promptA: document.getElementById('dual-model-a-prompt')?.value || '',
            promptB: document.getElementById('dual-model-b-prompt')?.value || '',
            tempA: document.getElementById('dual-model-a-temp')?.value || '0.7',
            tempB: document.getElementById('dual-model-b-temp')?.value || '0.7',
            maxTurns: document.getElementById('dual-max-turns')?.value || '10',
            venicePrompt: document.getElementById('dual-venice-prompt')?.checked ?? true,
        };
        localStorage.setItem('dual_model_config', JSON.stringify(cfg));
        const btn = document.getElementById('dual-save-config-btn');
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = 'Saved ✓';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        }
    }

    loadConfig() {
        const raw = localStorage.getItem('dual_model_config');
        if (!raw) return false;
        try {
            const cfg = JSON.parse(raw);

            // Restore modes
            ['A', 'B'].forEach(side => {
                const mode = cfg[`mode${side}`] || 'character';
                this[`_mode${side}`] = mode;
                const toggleEl = document.getElementById(`dual-mode-toggle-${side.toLowerCase()}`);
                if (toggleEl) {
                    toggleEl.querySelectorAll('.dual-mode-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.mode === mode);
                    });
                }
                this.applyModeToUI(side, mode);
            });

            // Restore selects
            const selectA = document.getElementById('dual-char-a-select');
            const selectB = document.getElementById('dual-char-b-select');
            const overrideA = document.getElementById('dual-model-a-override');
            const overrideB = document.getElementById('dual-model-b-override');

            if (selectA && cfg.charA) {
                selectA.value = cfg.charA;
                uiManager.updateCustomDropdown(selectA);
                if (selectA.value) this.onCharacterSelect('A');
            }
            if (selectB && cfg.charB) {
                selectB.value = cfg.charB;
                uiManager.updateCustomDropdown(selectB);
                if (selectB.value) this.onCharacterSelect('B');
            }
            if (overrideA && cfg.overrideA) {
                overrideA.value = cfg.overrideA;
                uiManager.updateCustomDropdown(overrideA);
            }
            if (overrideB && cfg.overrideB) {
                overrideB.value = cfg.overrideB;
                uiManager.updateCustomDropdown(overrideB);
            }

            // Restore prompts and temps (overrides onCharacterSelect population)
            if (cfg.promptA) {
                const el = document.getElementById('dual-model-a-prompt');
                if (el) el.value = cfg.promptA;
            }
            if (cfg.promptB) {
                const el = document.getElementById('dual-model-b-prompt');
                if (el) el.value = cfg.promptB;
            }

            const tempA = document.getElementById('dual-model-a-temp');
            const tempAVal = document.getElementById('dual-model-a-temp-value');
            if (tempA && cfg.tempA) { tempA.value = cfg.tempA; if (tempAVal) tempAVal.textContent = cfg.tempA; }

            const tempB = document.getElementById('dual-model-b-temp');
            const tempBVal = document.getElementById('dual-model-b-temp-value');
            if (tempB && cfg.tempB) { tempB.value = cfg.tempB; if (tempBVal) tempBVal.textContent = cfg.tempB; }

            const maxTurns = document.getElementById('dual-max-turns');
            if (maxTurns && cfg.maxTurns) maxTurns.value = cfg.maxTurns;

            const venicePrompt = document.getElementById('dual-venice-prompt');
            if (venicePrompt && cfg.venicePrompt !== undefined) venicePrompt.checked = cfg.venicePrompt;

            return true;
        } catch (e) {
            console.warn('[DualModel] Failed to restore config:', e);
            return false;
        }
    }

    handleStart() {
        const selectA = document.getElementById('dual-char-a-select');
        const selectB = document.getElementById('dual-char-b-select');
        const overrideA = document.getElementById('dual-model-a-override');
        const overrideB = document.getElementById('dual-model-b-override');
        const promptA = document.getElementById('dual-model-a-prompt');
        const promptB = document.getElementById('dual-model-b-prompt');
        const tempA = document.getElementById('dual-model-a-temp');
        const tempB = document.getElementById('dual-model-b-temp');
        const maxTurns = document.getElementById('dual-max-turns');
        const venicePrompt = document.getElementById('dual-venice-prompt');
        const initialPrompt = document.getElementById('dual-initial-prompt');

        const isQuickA = this._modeA === 'quickchat';
        const isQuickB = this._modeB === 'quickchat';

        // Validation
        if (!isQuickA && !selectA?.value) {
            lagoonAlert('Please select a character for A (or switch to Quick Chat)');
            return;
        }
        if (!isQuickB && !selectB?.value) {
            lagoonAlert('Please select a character for B (or switch to Quick Chat)');
            return;
        }
        if (isQuickA && !overrideA?.value) {
            lagoonAlert('Please select a model for Quick Chat A');
            return;
        }
        if (isQuickB && !overrideB?.value) {
            lagoonAlert('Please select a model for Quick Chat B');
            return;
        }
        if (!isQuickA && !isQuickB && selectA.value === selectB.value) {
            lagoonAlert('Please select two different characters');
            return;
        }
        if (!initialPrompt?.value?.trim()) {
            lagoonAlert('Please enter an initial prompt to start the conversation');
            return;
        }

        const charA = isQuickA ? null : this.characters.find(c => c.filename === selectA.value);
        const charB = isQuickB ? null : this.characters.find(c => c.filename === selectB.value);

        if (!isQuickA && !charA) { lagoonAlert('Failed to load Character A config'); return; }
        if (!isQuickB && !charB) { lagoonAlert('Failed to load Character B config'); return; }

        const buildSide = (isQuick, char, overrideEl, promptEl, tempEl, fallbackName) => {
            if (isQuick) {
                return {
                    id: overrideEl?.value,
                    name: fallbackName,
                    filename: null,
                    systemPrompt: promptEl?.value || '',
                    temperature: parseFloat(tempEl?.value) || 0.7,
                    topP: 1, repetitionPenalty: 1, maxTokens: 20000,
                    enableWebSearch: false, uncensoredMode: false, stripThinking: false,
                    avatarUrl: null, introStatement: ''
                };
            }
            return {
                id: overrideEl?.value || char.model,
                name: char.character_name || fallbackName,
                filename: char.filename,
                systemPrompt: promptEl?.value || char.system_prompt || '',
                temperature: parseFloat(tempEl?.value) || char.temperature || 0.7,
                topP: char.top_p || 1,
                repetitionPenalty: char.repetition_penalty || 1,
                maxTokens: char.max_tokens || 20000,
                enableWebSearch: char.enable_web_search || false,
                uncensoredMode: char.uncensored_mode || false,
                stripThinking: char.strip_thinking || false,
                avatarUrl: char.avatar_url || null,
                introStatement: char.intro_statement || ''
            };
        };

        // Build full config for each participant
        state.dualModelConfig = {
            modelA: buildSide(isQuickA, charA, overrideA, promptA, tempA, 'Quick Chat A'),
            modelB: buildSide(isQuickB, charB, overrideB, promptB, tempB, 'Quick Chat B'),
            maxTurns: parseInt(maxTurns?.value) || 10,
            currentTurn: 0,
            includeVenicePrompt: venicePrompt?.checked ?? true
        };

        this.closeModal();
        this.start(initialPrompt.value.trim());
    }

    async start(initialPrompt) {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._sessionId++;
        
        // Enter dual model mode
        state.dualModelMode = true;
        state.dualModelRunning = true;
        state.dualModelPaused = false;
        state.dualModelConfig.currentTurn = 0;

        // Clear current chat and start fresh
        state.messages = [];
        state.currentChatId = null;
        state.isTemporaryChat = false;

        // Clear chat display
        const target = dom.messagesContainer || dom.chatMessages;
        if (target) target.innerHTML = '';

        // Show control bar
        this.showControlBar();
        this.updateControlBar();

        // Add user's initial prompt as the conversation starter
        state.messages.push({ role: 'user', content: initialPrompt });
        addMessageToUI('user', initialPrompt, {}, false, null, 0);

        // Model A responds first to the user prompt
        await this._runLoop('A');
    }

    async _runLoop(startKey) {
        // Kill any previous loops by requiring a match with the current session ID
        const mySessionId = this._sessionId;
        let currentKey = startKey;
        
        try {
            while (state.dualModelRunning && !state.dualModelPaused && this._sessionId === mySessionId) {
                if (state.dualModelConfig.currentTurn >= state.dualModelConfig.maxTurns) {
                    this.stop();
                    break;
                }
                
                const success = await this.runTurn(currentKey);
                
                // If session changed during the turn or it failed, stop this loop instance
                if (this._sessionId !== mySessionId || !success) break;
                
                currentKey = currentKey === 'A' ? 'B' : 'A';
                
                // Final check before sleeping
                if (state.dualModelRunning && !state.dualModelPaused && this._sessionId === mySessionId) {
                    await this.sleep(this.delayBetweenTurns);
                }
            }
        } finally {
            // No lock to reset
        }
    }

    async runTurn(modelKey) {
        const mySessionId = this._sessionId;
        const config = state.dualModelConfig[`model${modelKey}`];
        if (!config) return false;

        this.updateControlBar();

        // Create assistant message placeholder
        const assistantMessage = {
            role: 'assistant',
            content: '...',
            modelKey,
            modelName: config.name,
            avatarUrl: config.avatarUrl
        };
        state.messages.push(assistantMessage);
        const msgIndex = state.messages.length - 1;

        // Add to UI with character attribution
        const messageGroup = this.addDualModelMessage(modelKey, config, msgIndex);
        const messageDiv = messageGroup.querySelector('.message');

        // Setup abort controller
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        const turnConfig = {
            model: config.id,
            system_prompt: config.systemPrompt || `You are ${config.name}. Engage thoughtfully in this conversation.`,
            temperature: config.temperature,
            top_p: config.topP,
            repetition_penalty: config.repetitionPenalty,
            max_tokens: config.maxTokens,
            enable_web_search: config.enableWebSearch,
            include_venice_system_prompt: state.dualModelConfig.includeVenicePrompt,
            uncensored_mode: config.uncensoredMode,
            strip_thinking: config.stripThinking
        };

        const apiMessages = this.buildApiMessages(modelKey);

        try {
            const response = await streamChat(
                state.currentChatId,
                apiMessages,
                turnConfig,
                null,
                this.abortController.signal
            );

            if (this._sessionId !== mySessionId) throw new Error('AbortError');

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'API error');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let isFirstChunk = true;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (this._sessionId !== mySessionId) { 
                    reader.cancel(); 
                    throw new Error('AbortError');
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

                    try {
                        const rawData = trimmedLine.substring(trimmedLine.indexOf('{')).trim();
                        if (!rawData.startsWith('{')) continue;

                        const eventData = JSON.parse(rawData);

                        if (eventData.event === 'start') {
                            if (!state.currentChatId) {
                                state.currentChatId = eventData.chat_id;
                            }
                            messageDiv.innerHTML = '<span class="generating-spinner"></span>';
                        } else if (eventData.event === 'chunk') {
                            if (isFirstChunk) {
                                assistantMessage.content = '';
                                messageDiv.innerHTML = '';
                                isFirstChunk = false;
                            }
                            assistantMessage.content += eventData.content;
                            messageDiv.innerHTML = parseMarkdown(assistantMessage.content);
                            autoScroll();
                        } else if (eventData.event === 'end') {
                            break;
                        } else if (eventData.event === 'error') {
                            throw new Error(eventData.error);
                        }
                    } catch (e) {
                        console.warn('[DualModel] Parse error:', e);
                    }
                }
            }

            if (this._sessionId !== mySessionId) throw new Error('AbortError');

            await this.saveChat();
            
            if (this._sessionId === mySessionId) {
                state.dualModelConfig.currentTurn++;
                this.updateControlBar();
            }
            
            return true;

        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'AbortError') {
                console.log('[DualModel] Turn aborted');
                // Cleanup placeholder if we didn't get any content
                if (assistantMessage.content === '...') {
                    if (state.messages[msgIndex] === assistantMessage) {
                        state.messages.splice(msgIndex, 1);
                    }
                    messageGroup.remove();
                }
            } else {
                console.error('[DualModel] Error:', error);
                addMessageToUI('system', `Error: ${error.message}`);
                this.stop();
            }
            return false;
        } finally {
            if (this._sessionId === mySessionId && assistantMessage.content !== '...') {
                const bubbleWrapper = messageGroup.querySelector('.bubble-wrapper');
                if (bubbleWrapper && !bubbleWrapper.querySelector('.assistant-actions')) {
                    const actions = createAssistantMessageActions(
                        assistantMessage.content,
                        msgIndex,
                        (idx, instr, isNudge) => this.regenerateMessage(idx, instr, isNudge),
                        (idx) => this.deleteMessagePair(idx),
                        null,
                        null,
                        false,
                        true
                    );
                    bubbleWrapper.appendChild(actions);
                }
            }
        }
    }

    buildApiMessages(currentModelKey) {
        const config = state.dualModelConfig[`model${currentModelKey}`];
        const systemPrompt = config.systemPrompt || `You are ${config.name}.`;

        const rawMessages = [];

        for (let i = 0; i < state.messages.length - 1; i++) { // Exclude the placeholder
            const msg = state.messages[i];

            if (msg.role === 'user') {
                // Model A sees the human's initial prompt.
                // Model B ignores it, treating Model A's first reply as the start of the conversation.
                if (currentModelKey === 'A') {
                    rawMessages.push({ role: 'user', content: msg.content });
                }
            } else if (msg.role === 'assistant' && msg.modelKey) {
                if (msg.modelKey === currentModelKey) {
                    // This model's own previous response
                    rawMessages.push({ role: 'assistant', content: msg.content });
                } else {
                    // The other model's response is presented as user input
                    rawMessages.push({ role: 'user', content: msg.content });
                }
            }
        }

        // Collapse consecutive messages of the same role
        const messages = [{ role: 'system', content: systemPrompt }];
        for (const msg of rawMessages) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === msg.role) {
                lastMsg.content += '\n\n' + msg.content;
            } else {
                messages.push({ ...msg });
            }
        }

        return messages;
    }

    addDualModelMessage(modelKey, config, msgIndex) {
        const target = dom.messagesContainer || dom.chatMessages;

        const group = document.createElement('div');
        group.className = `message-group assistant model-${modelKey.toLowerCase()}`;
        group.dataset.index = msgIndex;
        group.dataset.modelKey = modelKey;

        // Build avatar HTML
        let avatarHtml = '';
        if (config.avatarUrl) {
            avatarHtml = `<img src="${config.avatarUrl}" alt="${config.name}" class="message-avatar">`;
        }

        group.innerHTML = `
            <div class="bubble-wrapper">
                <div class="message-header">
                    ${avatarHtml}
                    <div class="model-badge model-${modelKey.toLowerCase()}">${config.name}</div>
                </div>
                <div class="message assistant">...</div>
            </div>
        `;

        if (target) target.appendChild(group);
        autoScroll();

        return group;
    }

    showControlBar() {
        const panel = document.getElementById('dual-tools-panel');
        if (panel) panel.classList.remove('hidden');
    }

    hideControlBar() {
        const panel = document.getElementById('dual-tools-panel');
        if (panel) panel.classList.add('hidden');
    }

    updateControlBar() {
        const statusEl = document.getElementById('dual-tool-status');
        const charAEl = document.getElementById('dual-tool-char-a');
        const charBEl = document.getElementById('dual-tool-char-b');
        const turnCounterEl = document.getElementById('dual-tool-turn-counter');
        const startBtn = document.getElementById('dual-tool-start-btn');
        const restartBtn = document.getElementById('dual-tool-restart-btn');
        const pauseBtn = document.getElementById('dual-tool-pause-btn');
        const resumeBtn = document.getElementById('dual-tool-resume-btn');
        const stopBtn = document.getElementById('dual-tool-stop-btn');
        const continueBtn = document.getElementById('dual-tool-continue-btn');

        // Update character names
        if (charAEl && state.dualModelConfig?.modelA) {
            charAEl.textContent = state.dualModelConfig.modelA.name || 'Character A';
        }
        if (charBEl && state.dualModelConfig?.modelB) {
            charBEl.textContent = state.dualModelConfig.modelB.name || 'Character B';
        }

        // Update turn counter
        if (turnCounterEl && state.dualModelConfig) {
            turnCounterEl.textContent = `Turn ${state.dualModelConfig.currentTurn + 1}/${state.dualModelConfig.maxTurns}`;
        }

        // Update status
        if (statusEl) {
            statusEl.classList.remove('active', 'paused', 'stopped');
            if (state.dualModelRunning && !state.dualModelPaused) {
                statusEl.textContent = 'Running';
                statusEl.classList.add('active');
            } else if (state.dualModelPaused) {
                statusEl.textContent = 'Paused';
                statusEl.classList.add('paused');
            } else if (state.dualModelMode) {
                statusEl.textContent = 'Stopped';
                statusEl.classList.add('stopped');
            } else {
                statusEl.textContent = 'Inactive';
            }
        }

        // Update button visibility
        const isRunning = state.dualModelRunning && !state.dualModelPaused;
        const isPaused = state.dualModelPaused;
        const isStopped = !state.dualModelRunning && !state.dualModelPaused;
        const atMaxTurns = state.dualModelConfig?.currentTurn >= state.dualModelConfig?.maxTurns;

        if (startBtn) startBtn.classList.toggle('hidden', !isStopped);
        if (restartBtn) restartBtn.classList.toggle('hidden', !state.dualModelMode);
        if (pauseBtn) pauseBtn.classList.toggle('hidden', !isRunning);
        
        const canResume = isPaused || (isStopped && !atMaxTurns && state.dualModelMode);
        if (resumeBtn) resumeBtn.classList.toggle('hidden', !canResume);
        
        if (stopBtn) stopBtn.classList.toggle('hidden', isStopped);
        
        const canContinue = isStopped && atMaxTurns && state.dualModelMode;
        if (continueBtn) continueBtn.classList.toggle('hidden', !canContinue);
    }

    showRestartModal() {
        const modal = document.getElementById('dual-restart-modal');
        const input = document.getElementById('dual-restart-prompt');
        if (input) input.value = '';
        if (modal) modal.classList.remove('hidden');
    }

    hideRestartModal() {
        document.getElementById('dual-restart-modal')?.classList.add('hidden');
    }

    handleRestart() {
        const input = document.getElementById('dual-restart-prompt');
        const prompt = input?.value?.trim();
        if (!prompt) {
            lagoonAlert('Please enter an opening scenario');
            return;
        }
        this.hideRestartModal();
        if (this.abortController) this.abortController.abort();
        this._sessionId++;
        state.dualModelRunning = false;
        state.dualModelPaused = false;
        this._turnChainActive = false;
        this.start(prompt);
    }

    pause() {
        state.dualModelPaused = true;
        this.updateControlBar();
    }

    async resume() {
        if (!state.dualModelMode) return;

        // Force reload of the chat configuration from server to pick up any manual edits (like model swaps)
        if (state.currentChatId) {
            try {
                const response = await fetch(`/api/chat/${state.currentChatId}`);
                if (response.ok) {
                    const chatData = await response.json();
                    if (chatData.config?.dual_config) {
                        state.dualModelConfig = chatData.config.dual_config;
                        console.log('[DualModel] Reloaded config from server (model A: ' + state.dualModelConfig.modelA.id + ')');
                    }
                }
            } catch (e) {
                console.warn('[DualModel] Failed to sync config on resume:', e);
            }
        }

        this._sessionId++;
        state.dualModelPaused = false;
        state.dualModelRunning = true;
        this.updateControlBar();

        // Determine which model should go next
        const lastMsg = state.messages[state.messages.length - 1];
        let nextModel = 'A';

        if (lastMsg?.modelKey) {
            nextModel = lastMsg.modelKey === 'A' ? 'B' : 'A';
        }

        await this._runLoop(nextModel);
    }

    stop() {
        this._sessionId++;
        state.dualModelRunning = false;
        state.dualModelPaused = false;

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.updateControlBar();

        // Add completion message
        const completionMsg = state.dualModelConfig.currentTurn >= state.dualModelConfig.maxTurns
            ? `Conversation completed (${state.dualModelConfig.currentTurn} turns)`
            : `Conversation stopped at turn ${state.dualModelConfig.currentTurn}`;

        addMessageToUI('system', completionMsg);
        this.saveChat();
    }

    async saveChat() {
        if (!state.currentChatId) return;

        const displayName = `${state.dualModelConfig.modelA.name} vs ${state.dualModelConfig.modelB.name}`;

        try {
            await saveChatApi(
                state.currentChatId,
                state.messages,
                {
                    character_name: displayName,
                    model: 'dual-model',
                    dual_config: state.dualModelConfig
                },
                'dual-model', // parent_config tag for sidebar grouping
                displayName
            );
            // Intentionally not refreshing sidebar here to avoid heavy API spam on every turn
        } catch (error) {
            console.error('[DualModel] Save failed:', error);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Exit dual model mode (called when user starts normal chat)
    exitDualMode() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this._sessionId++;
        state.dualModelMode = false;
        state.dualModelRunning = false;
        state.dualModelPaused = false;
        this.hideControlBar();
    }

    // Check if a loaded chat is a dual chat and restore state
    restoreFromChat(chatData) {
        if (chatData?.config?.model !== 'dual-model' && !chatData?.config?.dual_config) {
            return false;
        }

        const dualConfig = chatData.config.dual_config;
        if (!dualConfig || !dualConfig.modelA || !dualConfig.modelB) {
            return false;
        }

        // Restore dual model state
        state.dualModelMode = true;
        state.dualModelRunning = false;
        state.dualModelPaused = true; // Start paused when loading from disk
        state.dualModelConfig = dualConfig;

        // Calculate current turn from messages
        const assistantMsgs = chatData.messages?.filter(m => m.role === 'assistant' && m.modelKey) || [];
        state.dualModelConfig.currentTurn = assistantMsgs.length;

        // Show control bar with continue option
        this.showControlBar();
        this.updateControlBar();

        // Render messages with proper attribution
        this.renderDualMessages(chatData.messages || []);

        return true;
    }

    async regenerateMessage(msgIndex, instruction = null, isNudge = false) {
        if (!state.dualModelMode) return;
        
        // Force reload of the chat configuration from server to pick up any manual edits (like model swaps)
        if (state.currentChatId) {
            try {
                const response = await fetch(`/api/chat/${state.currentChatId}`);
                if (response.ok) {
                    const chatData = await response.json();
                    if (chatData.config?.dual_config) {
                        state.dualModelConfig = chatData.config.dual_config;
                        console.log('[DualModel] Reloaded config for regeneration (model A: ' + state.dualModelConfig.modelA.id + ')');
                    }
                }
            } catch (e) {
                console.warn('[DualModel] Failed to sync config on regeneration:', e);
            }
        }

        const msg = state.messages[msgIndex];
        if (!msg || msg.role !== 'assistant' || !msg.modelKey) return;
        
        const targetModelKey = msg.modelKey;

        // Roll back state to just before this message
        state.messages = state.messages.slice(0, msgIndex);
        
        // If there's an instruction/nudge
        if (instruction) {
            if (isNudge) {
                // Find the previous message that this model is responding to and inject the nudge
                for (let i = state.messages.length - 1; i >= 0; i--) {
                    // Usually this model responds to the other model's previous message (which acts as 'user')
                    // or the human's initial prompt
                    if (state.messages[i].modelKey !== targetModelKey || state.messages[i].role === 'user') {
                        state.messages[i].content += `\n\n(( ${instruction} ))`;
                        break;
                    }
                }
            } else {
                 // For standard regen with a rewriting instruction (from writing tools)
                 state.messages.push({
                     role: 'user', // We inject it as a user message for this turn
                     content: `(( ${instruction} ))\n\nRewrite your previous response:\n\n${msg.content}`
                 });
            }
        }
        
        // Update current turn based on remaining assistant messages
        const assistantMsgs = state.messages.filter(m => m.role === 'assistant' && m.modelKey);
        state.dualModelConfig.currentTurn = assistantMsgs.length;
        
        // Abort any current streams
        if (this.abortController) {
            this.abortController.abort();
        }
        this._sessionId++;
        
        // DO NOT PAUSE! Keep the automated loop running
        state.dualModelRunning = true;
        state.dualModelPaused = false;
        this.updateControlBar();
        
        // Re-render the chat
        this.renderDualMessages(state.messages);
        
        // Start the loop from the target model
        await this._runLoop(targetModelKey);
    }

    async deleteMessagePair(msgIndex) {
        if (!state.dualModelMode) return;
        
        // In Dual Chat, delete this message and potentially the one before it to keep turns aligned
        // This is a simplistic rollback for Dual Chat
        let targetIndex = msgIndex;
        // If we are deleting Model B, delete Model A before it too?
        // Actually, just rolling back to this point is safest
        state.messages = state.messages.slice(0, msgIndex);
        
        const assistantMsgs = state.messages.filter(m => m.role === 'assistant' && m.modelKey);
        state.dualModelConfig.currentTurn = assistantMsgs.length;
        
        state.dualModelPaused = true;
        this.updateControlBar();
        this.renderDualMessages(state.messages);
        await this.saveChat();
    }

    renderDualMessages(messages) {
        const target = dom.messagesContainer || dom.chatMessages;
        if (!target) return;

        target.innerHTML = '';

        messages.forEach((msg, index) => {
            if (msg.role === 'user' && !msg.modelKey) {
                // Original user prompt
                addMessageToUI('user', msg.content, {}, false, null, index);
            } else if (msg.role === 'assistant' && msg.modelKey) {
                // Dual model response
                const config = state.dualModelConfig[`model${msg.modelKey}`];
                if (config) {
                    this.addDualModelMessage(msg.modelKey, config, index);
                    const msgDiv = target.querySelector(`[data-index="${index}"] .message`);
                    if (msgDiv) {
                        msgDiv.innerHTML = parseMarkdown(msg.content);
                        
                        // Also append actions toolbar if the message is complete
                        const messageGroup = target.querySelector(`.message-group[data-index="${index}"]`);
                        if (messageGroup) {
                            const bubbleWrapper = messageGroup.querySelector('.bubble-wrapper');
                            if (bubbleWrapper && !bubbleWrapper.querySelector('.assistant-actions')) {
                                const actions = createAssistantMessageActions(
                                    msg.content,
                                    index,
                                    (idx, instr, isNudge) => this.regenerateMessage(idx, instr, isNudge),
                                    (idx) => this.deleteMessagePair(idx),
                                    null, // edit
                                    null, // toggleKeep
                                    false, // isKept
                                    true  // isDualMode
                                );
                                bubbleWrapper.appendChild(actions);
                            }
                        }
                    }
                }
            } else if (msg.role === 'system') {
                addMessageToUI('system', msg.content);
            }
        });

        setTimeout(() => autoScroll(true), 50);
    }
}

export const dualModelManager = new DualModelManager();