/**
 * Chat Manager Component
 * Encapsulates chat session logic, message rendering, and interaction.
 * Replaces the loose functions in chat.js and event listeners in main.js.
 */

import { state, dom, toggleKeepMessage, addToPromptHistory } from '../state.js';
import { CONTEXT_WINDOWS } from '../core/Constants.js';
import { getDisplayName } from '../core/InstalledModels.js';
import { streamChat, saveChatApi, fetchChat, analyzeEditApi, contextStatusApi } from '../api.js';
import { parseMarkdown, estimateTokens, CODE_EXTENSIONS } from '../utils.js';
import { addMessageToUI, renderMessages as renderMessagesUI, createAssistantMessageActions, showSummarizedNotification } from '../ui/messages.js';
import { autoScroll, scrollToBottom } from '../ui/scroll.js';
import { refreshSidebar } from '../ui/sidebar.js';
import { lagoonAlert, lagoonConfirm } from '../ui/dialog.js';
import { toggleSendButtonState } from '../ui/sendButton.js';

// Venice pricing: { in, out, cacheRead, cacheWrite, tierAt, inTier } — all per million tokens
export const VENICE_PRICING = {
    'venice-uncensored':                        { in: 0.20,  out: 0.90 },
    'venice-uncensored-role-play':              { in: 0.50,  out: 2.00 },
    'zai-org-glm-4.6':                          { in: 0.85,  out: 2.75,  cacheRead: 0.30 },
    'olafangensan-glm-4.7-flash-heretic':       { in: 0.14,  out: 0.80 },
    'zai-org-glm-4.7-flash':                    { in: 0.13,  out: 0.50 },
    'zai-org-glm-5':                            { in: 1.00,  out: 3.20,  cacheRead: 0.20 },
    'zai-org-glm-4.7':                          { in: 0.55,  out: 2.65,  cacheRead: 0.11 },
    'qwen3-4b':                                 { in: 0.05,  out: 0.15 },
    'qwen3-5-9b':                               { in: 0.05,  out: 0.15 },
    'mistral-31-24b':                           { in: 0.50,  out: 2.00 },
    'mistral-small-3-2-24b-instruct':           { in: 0.09,  out: 0.25 },
    'qwen3-235b-a22b-thinking-2507':            { in: 0.45,  out: 3.50 },
    'qwen3-235b-a22b-instruct-2507':            { in: 0.15,  out: 0.75 },
    'qwen3-next-80b':                           { in: 0.35,  out: 1.90 },
    'qwen3-coder-480b-a35b-instruct':           { in: 0.75,  out: 3.00 },
    'qwen3-coder-480b-a35b-instruct-turbo':     { in: 0.35,  out: 1.50,  cacheRead: 0.04 },
    'qwen3-5-35b-a3b':                          { in: 0.31,  out: 1.25,  cacheRead: 0.16 },
    'qwen3-vl-235b-a22b':                       { in: 0.25,  out: 1.50 },
    'hermes-3-llama-3.1-405b':                  { in: 1.10,  out: 3.00 },
    'google-gemma-3-27b-it':                    { in: 0.12,  out: 0.20 },
    'grok-41-fast':                             { in: 0.25,  out: 0.63,  cacheRead: 0.06 },
    'grok-4-20-beta':                           { in: 2.50,  out: 7.50,  cacheRead: 0.25, tierAt: 200000, inTier: 5.00 },
    'grok-4-20-multi-agent-beta':               { in: 2.50,  out: 7.50,  cacheRead: 0.25, tierAt: 200000, inTier: 5.00 },
    'grok-code-fast-1':                         { in: 0.25,  out: 1.87,  cacheRead: 0.03 },
    'gemini-3-pro-preview':                     { in: 2.50,  out: 15.00, cacheRead: 0.63 },
    'gemini-3-1-pro-preview':                   { in: 2.50,  out: 15.00, cacheRead: 0.50, tierAt: 200000, inTier: 5.00 },
    'gemini-3-flash-preview':                   { in: 0.70,  out: 3.75,  cacheRead: 0.07 },
    'claude-opus-4-6':                          { in: 6.00,  out: 30.00, cacheRead: 7.50, cacheWrite: 0.60 },
    'claude-opus-4-5':                          { in: 6.00,  out: 30.00, cacheRead: 7.50, cacheWrite: 0.60 },
    'claude-sonnet-4-6':                        { in: 3.60,  out: 18.00, cacheRead: 4.50, cacheWrite: 0.36 },
    'claude-sonnet-4-5':                        { in: 3.75,  out: 18.75, cacheRead: 4.69, cacheWrite: 0.38 },
    'openai-gpt-oss-120b':                      { in: 0.07,  out: 0.30 },
    'kimi-k2-thinking':                         { in: 0.75,  out: 3.20,  cacheRead: 0.38 },
    'kimi-k2-5':                                { in: 0.56,  out: 3.50,  cacheRead: 0.11 },
    'deepseek-v3.2':                            { in: 0.33,  out: 0.48,  cacheRead: 0.16 },
    'llama-3.2-3b':                             { in: 0.15,  out: 0.60 },
    'llama-3.3-70b':                            { in: 0.70,  out: 2.80 },
    'openai-gpt-52':                            { in: 2.19,  out: 17.50, cacheRead: 0.22 },
    'openai-gpt-52-codex':                      { in: 2.19,  out: 17.50, cacheRead: 0.22 },
    'openai-gpt-53-codex':                      { in: 2.19,  out: 17.50, cacheRead: 0.22 },
    'openai-gpt-54':                            { in: 3.13,  out: 18.80, cacheRead: 0.31 },
    'openai-gpt-54-pro':                        { in: 37.50, out: 225.00, tierAt: 272000, inTier: 75.00 },
    'openai-gpt-4o-2024-11-20':                 { in: 3.13,  out: 12.50 },
    'openai-gpt-4o-mini-2024-07-18':            { in: 0.19,  out: 0.75,  cacheRead: 0.09 },
    'minimax-m21':                              { in: 0.35,  out: 1.50,  cacheRead: 0.04 },
    'minimax-m25':                              { in: 0.34,  out: 1.19,  cacheRead: 0.04 },
    'minimax-m27':                              { in: 0.38,  out: 1.50,  cacheRead: 0.07 },
    'nvidia-nemotron-3-nano-30b-a3b':           { in: 0.07,  out: 0.30 },
    'e2ee-venice-uncensored-24b-p':             { in: 0.25,  out: 1.15 },
    'e2ee-gemma-3-27b-p':                       { in: 0.14,  out: 0.50 },
    'e2ee-glm-4-7-p':                           { in: 1.10,  out: 4.15 },
    'e2ee-glm-4-7-flash-p':                     { in: 0.13,  out: 0.55 },
    'e2ee-gpt-oss-20b-p':                       { in: 0.05,  out: 0.19 },
    'e2ee-gpt-oss-120b-p':                      { in: 0.13,  out: 0.65 },
    'e2ee-qwen-2-5-7b-p':                       { in: 0.05,  out: 0.13 },
    'e2ee-qwen3-30b-a3b-p':                     { in: 0.19,  out: 0.69 },
    'e2ee-qwen3-vl-30b-a3b-p':                  { in: 0.25,  out: 0.90 },
    'e2ee-glm-5':                               { in: 1.10,  out: 4.15 },
    'e2ee-qwen3-5-122b-a10b':                   { in: 0.50,  out: 4.00 },
};

export class ChatManager {
    constructor() {
        this.dom = {};
        this.abortController = null;
        this.timerInterval = null;
        this.sessionCost = parseFloat(localStorage.getItem('lagoon_session_cost') || '0');
        this._pendingOverseerNotes = [];
        this._overseerAutoAccept = localStorage.getItem('overseer_auto_accept') === 'true';
    }

    init() {
        this.refreshDom();
        if (this.dom.chatForm) {
            this.bindEvents();
            this._initPromptExpandBtn();
            if (this.sessionCost > 0 && this.dom.sessionCostEl) {
                this.dom.sessionCostEl.textContent = `$${this.sessionCost.toFixed(4)}`;
            }
            console.log('[ChatManager] Initialized');
        } else {
            console.warn('[ChatManager] Chat DOM elements not found');
        }
    }

    refreshDom() {
        this.dom = {
            chatForm: document.getElementById('chat-form'),
            messageInput: document.getElementById('message-input'),
            chatMessages: document.getElementById('chat-messages'),
            sendBtn: document.getElementById('send-btn'),
            changeModelBtn: document.getElementById('change-model-btn'),
            veniceToggle: document.getElementById('quick-venice-prompt-toggle'),
            contextFileBtn: document.getElementById('context-file-btn'),
            fileCancelBtn: document.getElementById('file-cancel-btn'),
            viewContextBtn: document.getElementById('view-context-btn'),
            balanceEl: document.getElementById('balance-usd'),
            turnCostEl: document.getElementById('turn-cost'),
            sessionCostEl: document.getElementById('session-cost'),
            costTokensEl: document.getElementById('cost-tokens'),
            resetSessionCostBtn: document.getElementById('reset-session-cost-btn'),
        };
    }

    bindEvents() {
        // Reset session cost
        if (this.dom.resetSessionCostBtn) {
            this.dom.resetSessionCostBtn.addEventListener('click', () => this._resetSessionCost());
        }

        // Venice Prompt Toggle
        if (this.dom.veniceToggle) {
            this.dom.veniceToggle.addEventListener('change', (e) => {
                state.currentConfig.include_venice_system_prompt = e.target.checked;
            });
        }

        // Chat Form Submit
        this.dom.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Message Input Keydown (Enter to send, Arrows for history)
        this.dom.messageInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        
        // Auto-resize input
        this.dom.messageInput.addEventListener('input', () => {
            this.dom.messageInput.style.height = '44px';
            if (this.dom.messageInput.scrollHeight > 44) {
                this.dom.messageInput.style.height = this.dom.messageInput.scrollHeight + 'px';
                this.dom.messageInput.style.overflowY = 'auto';
            } else {
                this.dom.messageInput.style.overflowY = 'hidden';
            }
            toggleSendButtonState();
        });

        // Context Files
        this.dom.contextFileBtn?.addEventListener('click', (e) => {
            // Only trigger click if not clicking the 'X' (cancel) badge
            if (!e.target.closest('.file-cancel-badge')) {
                const input = document.getElementById('context-file-input');
                input?.click();
            }
        });

        const fileInput = document.getElementById('context-file-input');
        fileInput?.addEventListener('change', () => this.handleContextFileSelect());

        this.dom.fileCancelBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearContextFile();
        });
    }

    async handleContextFileSelect() {
        const fileInput = document.getElementById('context-file-input');
        const file = fileInput.files[0];
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
            } else if (ext === 'html' || ext === 'htm') {
                const rawContent = await file.text();
                state.contextFileContent = `[CODE FILE: ${file.name}]\n\`\`\`html\n${rawContent}\n\`\`\``;
                state.contextFileName = file.name;
            } else if (CODE_EXTENSIONS[ext]) {
                const rawContent = await file.text();
                const lang = CODE_EXTENSIONS[ext];
                state.contextFileContent = `[CODE FILE: ${file.name}]\n\`\`\`${lang}\n${rawContent}\n\`\`\``;
                state.contextFileName = file.name;
            } else if (ext === 'pdf') {
                const { parseFileApi } = await import('../api.js');
                const result = await parseFileApi(file);
                state.contextFileContent = result.content;
                state.contextFileName = file.name;
            }

            // Update UI
            const btns = document.querySelectorAll('#context-file-btn');
            btns.forEach(btn => {
                btn.classList.add('has-file');
                btn.title = `File loaded: ${state.contextFileName}`;
            });
            
            console.log(`[ChatManager] File loaded: ${file.name} (${state.contextFileContent.length} chars)`);
        } catch (error) {
            lagoonAlert(`Error loading file: ${error.message}`);
            this.clearContextFile();
        }
    }

    handleSubmit() {
        const userInput = this.dom.messageInput.value?.trim();

        // Handle Macro Injection (Logic from main.js)
        let finalPrompt = userInput;
        const activeMacros = document.querySelectorAll('.macro-item.active');
        let systemInjections = [];
        
        if (activeMacros.length > 0 && !state.isStreaming) {
            const parts = [userInput];
            activeMacros.forEach(btn => parts.unshift(`(( ${btn.dataset.prompt} ))`));
            finalPrompt = parts.join('\n\n');
        }

        if (userInput && !state.isStreaming) {
            addToPromptHistory(userInput);
        }

        if (state.isStreaming) {
            this.handleStopGeneration();
        } else {
            this.handleSendMessage(finalPrompt, systemInjections);
        }
    }

    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.dom.chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }

        // Prompt history navigation
        if (e.key === 'ArrowUp' && state.promptHistory.length > 0) {
            const isAtStart = this.dom.messageInput.selectionStart === 0;
            if (isAtStart) {
                e.preventDefault();
                if (state.promptHistoryIndex === -1) {
                    state.promptDraft = this.dom.messageInput.value;
                }
                if (state.promptHistoryIndex < state.promptHistory.length - 1) {
                    state.promptHistoryIndex++;
                    this.dom.messageInput.value = state.promptHistory[state.promptHistoryIndex];
                    this.dom.messageInput.dispatchEvent(new Event('input'));
                }
            }
        }
        if (e.key === 'ArrowDown' && state.promptHistoryIndex >= 0) {
            const isAtEnd = this.dom.messageInput.selectionStart === this.dom.messageInput.value.length;
            if (isAtEnd) {
                e.preventDefault();
                state.promptHistoryIndex--;
                if (state.promptHistoryIndex === -1) {
                    this.dom.messageInput.value = state.promptDraft;
                } else {
                    this.dom.messageInput.value = state.promptHistory[state.promptHistoryIndex];
                }
                this.dom.messageInput.dispatchEvent(new Event('input'));
            }
        }
    }

    handleStopGeneration() {
        if (state.abortController) {
            state.abortController.abort();
            state.abortController = null;
        }
    }

    // --- Core Logic Ported from chat.js ---

    _resetSessionCost() {
        this.sessionCost = 0;
        localStorage.removeItem('lagoon_session_cost');
        if (this.dom.sessionCostEl) this.dom.sessionCostEl.textContent = '$0.0000';
        if (this.dom.turnCostEl) this.dom.turnCostEl.textContent = '—';
        if (this.dom.costTokensEl) this.dom.costTokensEl.textContent = '';
    }

    startNewChatSession(config, parentConfigFilename) {
        state.currentChatId = null;
        state.messages = [];
        state.currentConfig = { ...config };
        state.currentParentConfig = parentConfigFilename;
        state.isTemporaryChat = true;
        state.keptMessages = new Set();
        this._resetSessionCost();
        this.clearContextFile();

        if (typeof window.updateExportButton === 'function') {
            window.updateExportButton();
        }
        if (typeof window.updateWritingToolsPanel === 'function') {
            window.updateWritingToolsPanel();
        }
        if (typeof window.updateOverseerTab === 'function') {
            window.updateOverseerTab();
        }

        if (state.currentConfig.system_prompt) {
            state.messages.push({ role: "system", content: state.currentConfig.system_prompt });
        }
        if (state.currentConfig.system_context) {
            state.messages.push({ role: "system", content: state.currentConfig.system_context });
        }
        if (state.currentConfig.character_card) {
            state.messages.push({ role: "system", content: `USER-DEFINED INSTRUCTIONS:\n${state.currentConfig.character_card}` });
        }
        if (state.currentConfig.intro_statement) {
            state.messages.push({ role: "assistant", content: state.currentConfig.intro_statement });
        }
        
        this.renderMessages();
        this.enableChatInput(true);
        this.updateModelButtonText();
        this.updateContextGauge();
        
        // Sync toggle state
        if (this.dom.veniceToggle) {
            this.dom.veniceToggle.checked = !!state.currentConfig.include_venice_system_prompt;
        }
    }

    async loadChat(chatId) {
        try {
            this.clearContextFile();
            this._resetSessionCost();
            const chatData = await fetchChat(chatId);
            state.currentChatId = chatData.chat_id;
            state.messages = chatData.messages || [];
            state.currentConfig = chatData.config || {};
            state.currentParentConfig = chatData.parent_config;
            state.isTemporaryChat = false;
            state.keptMessages = new Set(chatData.kept_messages || []);

            // Overlay live character config fields — always use the latest character definition,
            // but preserve per-chat settings (model, temperature) from the chat snapshot.
            if (state.currentParentConfig) {
                const { fetchConfig } = await import('../api.js');
                const liveConfig = await fetchConfig(state.currentParentConfig);
                if (liveConfig) {
                    // Character-definition fields (should reflect latest edits to the character)
                    const liveFields = [
                        'system_prompt', 'system_context', 'character_card',
                        'author_note', 'author_note_depth',
                        'uncensored_mode', 'strip_thinking', 'style_overseer',
                        'fiction_prompt_text', 'include_venice_system_prompt'
                    ];
                    for (const field of liveFields) {
                        if (liveConfig[field] !== undefined) {
                            state.currentConfig[field] = liveConfig[field];
                        }
                    }
                }
            }

            if (typeof window.updateExportButton === 'function') {
                window.updateExportButton();
            }
            if (typeof window.updateWritingToolsPanel === 'function') {
                window.updateWritingToolsPanel();
            }
            if (typeof window.updateOverseerTab === 'function') {
                window.updateOverseerTab();
            }

            // Check if this is a dual chat and restore state
            if (chatData.config?.model === 'dual-model' && chatData.config?.dual_config) {
                const { dualModelManager } = await import('./DualModelManager.js');
                const restored = dualModelManager.restoreFromChat(chatData);
                if (restored) {
                    document.title = state.currentConfig.character_name || 'Dual Chat';
                    return;
                }
            }

            this.renderMessages();
            this.enableChatInput(true);
            
            document.querySelectorAll('.list-item').forEach(item => {
                item.classList.toggle('active', item.dataset.chatId === chatId);
            });
            
            document.title = state.currentConfig.character_name || 'Chat';
            this.updateModelButtonText();
            this.updateContextGauge();
            
            // Sync toggle state
            if (this.dom.veniceToggle) {
                this.dom.veniceToggle.checked = !!state.currentConfig.include_venice_system_prompt;
            }
            
            state.userScrolledAway = false;
            setTimeout(() => autoScroll(true), 50);
        } catch (error) {
            addMessageToUI('system', `Error loading chat: ${error.message}`);
        }
    }

    applyCharacterConfig(newConfig) {
        // Overlay live character config fields onto state.currentConfig
        // Used when editing the active character - changes apply immediately
        const liveFields = [
            'system_prompt', 'system_context', 'character_card',
            'author_note', 'author_note_depth',
            'uncensored_mode', 'strip_thinking', 'style_overseer',
            'fiction_prompt_text', 'include_venice_system_prompt',
            'character_name', 'avatar'
        ];
        for (const field of liveFields) {
            if (newConfig[field] !== undefined) {
                state.currentConfig[field] = newConfig[field];
            }
        }
    }

    renderMessages() {
        renderMessagesUI(
            (idx, instr) => this.regenerateFromIndex(idx, instr),
            (idx) => this.deleteSingleMessage(idx),
            () => this.updateContextGauge(),
            (idx) => this.editAssistantMessage(idx),
            toggleKeepMessage,
            (idx) => this.forkFromMessage(idx)
        );
    }

    async forkFromMessage(msgIndex) {
        // Get messages up to and including the selected message
        const forkedMessages = state.messages.slice(0, msgIndex + 1);
        
        if (forkedMessages.length === 0) {
            lagoonAlert('Cannot fork from an empty conversation.');
            return;
        }

        // Save current chat first if it has content
        if (state.messages.length > 0 && state.currentChatId) {
            await this.saveChat();
        }

        // Create new chat with forked messages
        const originalName = state.currentConfig.character_name || 'Chat';
        
        // Reset to new chat state with forked messages
        state.currentChatId = null;
        state.messages = forkedMessages;
        state.isTemporaryChat = false;
        state.keptMessages = new Set();

        // Save the forked chat
        try {
            await this.saveChat();
            await refreshSidebar();
            
            // Re-render messages to show the forked state
            this.renderMessages();
            this.updateModelButtonText();
            this.updateContextGauge();
            
            lagoonAlert(`Chat forked! ${forkedMessages.length} messages copied to new chat.`);
        } catch (error) {
            console.error('Failed to fork chat:', error);
            lagoonAlert('Failed to fork chat. Please try again.');
        }
    }

    enableChatInput(focus = false) {
        if (!this.dom.messageInput) return;
        
        // Enable input
        this.dom.messageInput.disabled = false;
        if (focus) this.dom.messageInput.focus();
        
        // Update send button state
        toggleSendButtonState();
        
        // Enable ALL instances of action buttons
        document.querySelectorAll('#change-model-btn').forEach(btn => btn.disabled = false);
        document.querySelectorAll('#context-file-btn').forEach(btn => btn.disabled = false);
        document.querySelectorAll('#view-context-btn').forEach(btn => btn.disabled = false);
        
        this.updateModelButtonText();
    }

    clearContextFile() {
        state.contextFileContent = null;
        state.contextFileName = null;
        const input = document.getElementById('context-file-input');
        if (input) input.value = '';
        if (this.dom.contextFileBtn) {
            this.dom.contextFileBtn.classList.remove('has-file');
            this.dom.contextFileBtn.title = 'Upload file (code, PDF, TXT)';
        }
    }

    async handleSendMessage(textToSend = null, systemInjections = []) {
        const userMessage = this.dom.messageInput.value.trim();
        if (!userMessage || !state.currentConfig.model) return;

        // Sync author's note textarea to state before sending — so changes take effect
        // without requiring an explicit Apply click
        const noteArea = document.getElementById('session-author-note');
        const depthInput = document.getElementById('session-author-note-depth');
        if (noteArea && state.currentConfig) {
            state.currentConfig.author_note = noteArea.value;
            if (depthInput) state.currentConfig.author_note_depth = parseInt(depthInput.value) || 4;
        }

        // Inject any pending overseer correction notes as ephemeral system messages
        if (this._pendingOverseerNotes.length > 0) {
            const notes = this._pendingOverseerNotes.splice(0);
            systemInjections = [notes.map(n => `[Style correction: ${n}]`).join(' '), ...systemInjections];
        }

        // Exit dual model mode when starting normal chat
        if (state.dualModelMode) {
            const { dualModelManager } = await import('./DualModelManager.js');
            dualModelManager.exitDualMode();
        }

        if (state.isTemporaryChat) {
            state.isTemporaryChat = false;
        }

        let imageData = null;

        if (state.editingMessageIndex !== null) {
            state.messages[state.editingMessageIndex].content = userMessage;
            state.messages = state.messages.slice(0, state.editingMessageIndex + 1);
            state.editingMessageIndex = null;
            this.dom.messageInput.classList.remove('editing');
            this.renderMessages();
        } else {
            let attachedFileName = null;
            if (state.contextFileContent) {
                const ext = state.contextFileName.split('.').pop().toLowerCase();
                const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
                
                if (IMAGE_EXTENSIONS.includes(ext) && state.contextFileContent.startsWith('data:')) {
                    const matches = state.contextFileContent.match(/^data:(.+);base64,(.+)$/);
                    if (matches) {
                        imageData = { mime: matches[1], data: matches[2] };
                        attachedFileName = state.contextFileName;
                    } else {
                        state.messages.push({ role: 'user', content: `[ATTACHED FILE: ${state.contextFileName}]\n\n${state.contextFileContent}` });
                    }
                } else {
                    state.messages.push({ role: 'user', content: `[ATTACHED FILE: ${state.contextFileName}]\n\n${state.contextFileContent}` });
                }
                this.clearContextFile();
            }

            if (systemInjections && systemInjections.length > 0) {
                systemInjections.forEach(sysMsg => state.messages.push({ role: 'system', content: sysMsg }));
            }

            state.messages.push({ role: 'user', content: userMessage, attachedFileName: attachedFileName });
            const userMsgIndex = state.messages.length - 1;
            addMessageToUI('user', userMessage, state.currentConfig, false, attachedFileName, userMsgIndex);
        }

        this.dom.messageInput.value = '';
        this.dom.messageInput.style.height = 'auto';
        this.setStreamingState(true); 
        
        const promptOverride = (textToSend && textToSend !== userMessage) ? textToSend : null;
        await this.generateResponse(null, promptOverride, imageData);
    }

    async generateResponse(historyOverride = null, promptOverride = null, imageOverride = null) {
        this.setStreamingState(true);
        state.currentSearchResults = [];
        
        const assistantMessage = { role: 'assistant', content: '...', searchResults: [] };
        state.messages.push(assistantMessage);
        const msgIndex = state.messages.length - 1;
        
        const assistantMessageGroup = addMessageToUI('assistant', '...', state.currentConfig, true, null, msgIndex);
        const assistantMessageDiv = assistantMessageGroup.querySelector('.message');
        const messageContent = assistantMessageGroup.querySelector('.message-content');
        const timerSpan = assistantMessageGroup.querySelector('.thought-timer');

        state.userScrolledAway = false;
        autoScroll(true);

        const startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
            if(timerSpan) timerSpan.textContent = ` (${elapsedTime}s)`;
        }, 100);

        state.abortController = new AbortController();

        try {
            let historyToSend;
            if (historyOverride) {
                historyToSend = historyOverride;
            } else {
                // Efficiently build history without deep-cloning massive context files
                historyToSend = state.messages.slice(0, -1);
                
                if (promptOverride && historyToSend.length > 0) {
                    // Create a shallow copy of history and deep clone ONLY the target user message
                    historyToSend = [...historyToSend];
                    for (let i = historyToSend.length - 1; i >= 0; i--) {
                        if (historyToSend[i].role === 'user') {
                            historyToSend[i] = { ...historyToSend[i], content: promptOverride };
                            break;
                        }
                    }
                }
            }

            // Style learning disabled
            // if (state.currentParentConfig) {
            //     const stylePrefs = this.getStylePreferencesPrompt();
            //     if (stylePrefs) historyToSend.unshift({ role: 'system', content: stylePrefs });
            // }

            const sessionOverrides = {};
            sessionOverrides.enable_e2ee = localStorage.getItem('quickchat_e2ee') === 'true';

            const response = await streamChat(
                state.currentChatId,
                historyToSend,
                state.currentConfig,
                state.currentParentConfig,
                state.abortController.signal,
                sessionOverrides,
                imageOverride
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Unknown API error');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let isNewChat = !state.currentChatId;
            let isFirstChunk = true;
            let wasExplicitReasoning = false;
            const loreSignals = { valid: [], bad: [] };
            
            // Streaming DOM elements
            // We use updateStreamingDOM helper now, so we don't need manual refs to containers here
            // except the main wrapper
            
            // Initial placeholder
            const streamingTextNode = document.createTextNode('');
            assistantMessageDiv.appendChild(streamingTextNode);

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

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
                            if (isNewChat) state.currentChatId = eventData.chat_id;
                            assistantMessageDiv.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;"><span class="generating-spinner"></span><i style="opacity: 0.5;">Streaming...</i></div>`;
                        } else if (eventData.event === 'balance') {
                           if (this.dom.balanceEl) {
                               if (eventData.usd) {
                                   const val = parseFloat(eventData.usd);
                                   this.dom.balanceEl.textContent = isNaN(val) ? eventData.usd : val.toFixed(3);
                               }
                           }
                        } else if (eventData.event === 'search_results') {
                            state.currentSearchResults = eventData.data;
                            assistantMessage.searchResults = eventData.data;
                        } else if (eventData.event === 'reasoning') {
                            if (isFirstChunk) {
                                assistantMessage.content = '';
                                assistantMessageDiv.innerHTML = '';
                                isFirstChunk = false;
                            }
                            
                            // Explicit reasoning event: ensure tags exist
                            if (!assistantMessage.content.includes('<think>')) {
                                assistantMessage.content += '<think>';
                            }
                            
                            wasExplicitReasoning = true;
                            assistantMessage.content += eventData.content;
                            
                            this.updateStreamingDOM(assistantMessageDiv, assistantMessage.content);
                            autoScroll();

                        } else if (eventData.event === 'chunk') {
                            if (isFirstChunk) {
                                assistantMessage.content = '';
                                assistantMessageDiv.innerHTML = '';
                                isFirstChunk = false;
                            }
                            
                            // If we were explicitly reasoning (via events) and now switched to chunk (main text),
                            // we force close the tag if the backend didn't send it.
                            if (wasExplicitReasoning && !assistantMessage.content.includes('</think>')) {
                                assistantMessage.content += '</think>\n\n';
                                wasExplicitReasoning = false;
                            }
                            
                            assistantMessage.content += eventData.content;
                            
                            this.updateStreamingDOM(assistantMessageDiv, assistantMessage.content);
                            autoScroll();

                        } else if (eventData.event === 'summarized') {
                            console.log('[DEBUG] Summarized event received. New messages count:', eventData.new_messages ? eventData.new_messages.length : 'none');
                            if (eventData.new_messages) {
                                console.log('[DEBUG] Syncing state with backend summary...');
                                // Replace messages but ensure we keep the in-flight assistant message object
                                const inFlightMsg = assistantMessage; 
                                state.messages = eventData.new_messages;
                                
                                // Re-insert the in-flight message at the end
                                if (!state.messages.includes(inFlightMsg)) {
                                    state.messages.push(inFlightMsg);
                                }
                                
                                this.renderMessages();
                                this.updateContextGauge();
                                console.log('[DEBUG] State synchronized. New count:', state.messages.length);
                            }
                            showSummarizedNotification();
                        } else if (eventData.event === 'review_needed') {
                            this._showReviewNeededBanner();
                        } else if (eventData.event === 'e2ee_active') {
                            this._showToast('\uD83D\uDD12 E2EE verified');
                            const badge = document.createElement('span');
                            badge.className = 'e2ee-badge';
                            badge.title = 'End-to-end encrypted via Venice TEE';
                            badge.textContent = '\uD83D\uDD12';
                            assistantMessageDiv.prepend(badge);
                        } else if (eventData.event === 'e2ee_failed') {
                            this._showToast('\u26A0\uFE0F E2EE failed \u2014 message not encrypted', 'error');
                            return;
                        } else if (eventData.event === 'lore_update') {
                            const kws = (eventData.keywords || []).join(', ') || eventData.entry_id;
                            loreSignals.valid.push(kws);
                            this._showToast(`Now aware: ${kws}`);
                        } else if (eventData.event === 'lore_update_failed') {
                            loreSignals.bad.push(...(eventData.tags || ['?']));
                            this._showToast('Lore reveal: wrong tag format from model', 'error');
                        } else if (eventData.event === 'end') {
                            if (eventData.usage && eventData.model) {
                                this._updateCost(eventData.model, eventData.usage);
                            }
                            if (loreSignals.valid.length || loreSignals.bad.length) {
                                const badge = document.createElement('span');
                                badge.className = loreSignals.bad.length ? 'lore-signal-badge lore-signal-bad' : 'lore-signal-badge lore-signal-ok';
                                badge.textContent = loreSignals.valid.length ? 'LORE ✓' : 'LORE ⚠';
                                badge.title = loreSignals.valid.length
                                    ? `Reveal fired: ${loreSignals.valid.join(', ')}`
                                    : `Wrong tag format: ${loreSignals.bad.join(', ')}`;
                                assistantMessageDiv.querySelector('.message-actions')?.prepend(badge);
                            }
                            await this.saveChat();
                            if (isNewChat) await refreshSidebar();
                            this._refreshPromptMonitor();
                            this._runStyleOverseer();
                            return;
                        } else if (eventData.event === 'error') {
                            throw new Error(eventData.error);
                        }
                    } catch (e) {
                        console.warn("Failed to parse SSE line", trimmedLine, e);
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                if (assistantMessage.content === '...') {
                    state.messages.pop();
                    assistantMessageGroup.remove();
                } else {
                    this.saveChat();
                }
            } else {
                addMessageToUI('system', `Error: ${error.message}`);
            }
        } finally {
            clearInterval(this.timerInterval);
            state.abortController = null;
            this.setStreamingState(false);
            assistantMessageDiv.classList.remove('streaming');
            
            if (assistantMessage.content && assistantMessage.content !== '...') {
                // Use the same helper for final render to maintain consistency
                this.updateStreamingDOM(assistantMessageDiv, assistantMessage.content);
                
                // Trigger auto-read on desktop if enabled
                const { audioService } = await import('../services/AudioService.js');
                if (audioService.isAutoReadEnabled() && assistantMessage.content && assistantMessage.content !== '...') {
                    audioService.speak(assistantMessage.content);
                }
            }
            this.updateContextGauge();

            // Notify in manual mode when context is getting full
            if (localStorage.getItem('summarize_mode') === 'manual') {
                const maxTokens = CONTEXT_WINDOWS[state.currentConfig?.model] || 200000;
                let totalTokens = 0;
                state.messages.forEach(msg => {
                    const c = msg.content || '';
                    totalTokens += (typeof c === 'string' ? c : JSON.stringify(c)).length / 4;
                });
                if (totalTokens / maxTokens >= 0.75) {
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('Context is getting full. Open the context panel to summarize.', 'warning');
                    }
                }
            }

            // Append Actions
             const bubbleWrapper = assistantMessageGroup.querySelector('.bubble-wrapper');
            if (bubbleWrapper && !bubbleWrapper.querySelector('.assistant-actions')) {
                const isKept = state.keptMessages && state.keptMessages.has(msgIndex);
                const actions = createAssistantMessageActions(
                    assistantMessage.content,
                    msgIndex,
                    (idx, instr) => this.regenerateFromIndex(idx, instr),
                    (idx) => this.deleteMessagePair(idx),
                    (idx) => this.editAssistantMessage(idx),
                    toggleKeepMessage,
                    isKept,
                    false, // isDualMode
                    (idx) => this.forkFromMessage(idx),
                    state.currentConfig?.style_overseer ? {
                        autoAccept: this._overseerAutoAccept,
                        onToggle: () => {
                            this._overseerAutoAccept = !this._overseerAutoAccept;
                            localStorage.setItem('overseer_auto_accept', this._overseerAutoAccept);
                            return this._overseerAutoAccept;
                        }
                    } : null
                );
                bubbleWrapper.appendChild(actions);
            }
        }
    }

    async forkFromMessage(msgIndex) {
        // Get messages up to and including the selected message
        const forkedMessages = state.messages.slice(0, msgIndex + 1);
        
        if (forkedMessages.length === 0) {
            console.warn('[Fork] No messages to fork');
            return;
        }
        
        // Store the current chat ID to return to it after forking
        const originalChatId = state.currentChatId;
        
        // Create a forked display name
        const originalName = state.currentConfig.character_name || 'Chat';
        const forkedName = `Fork: ${originalName}`;
        
        // Start a new chat session with the forked messages
        state.currentChatId = null; // null means new chat
        state.messages = forkedMessages;
        state.isTemporaryChat = false;
        state.keptMessages = new Set();
        
        // Save the forked chat
        await this.saveChat();
        
        // Show notification
        if (typeof window.showNotification === 'function') {
            window.showNotification('Chat forked! You\'re now in a new branch.', 'success');
        }
        
        // Refresh sidebar to show the new chat
        if (typeof window.refreshSidebar === 'function') {
            await window.refreshSidebar();
        }
        
        // Re-render messages
        this.renderMessages();
        this.updateContextGauge();
    }

    // Helper to parse <think> tags for streaming
    parseThinkTags(text) {
        let thinkContent = '';
        let mainContent = text;
        
        // 1. Extract all complete blocks
        const closedRegex = /<think>([\s\S]*?)<\/think>/g;
        const closedMatches = [...text.matchAll(closedRegex)];
        
        closedMatches.forEach(match => {
            thinkContent += match[1] + '\n';
        });
        
        // Remove closed blocks from mainContent
        mainContent = mainContent.replace(closedRegex, '');
        
        // 2. Check for an open block remaining at the end (for streaming)
        const openRegex = /<think>([\s\S]*?)$/;
        const openMatch = mainContent.match(openRegex);
        
        if (openMatch) {
            thinkContent += openMatch[1];
            mainContent = mainContent.replace(openRegex, '');
        }
        
        return { 
            thinkContent: thinkContent.trim(), 
            mainContent: mainContent.trim() 
        };
    }

    // Helper to update DOM during streaming with separate think/main blocks
    updateStreamingDOM(container, fullText) {
        const { thinkContent, mainContent } = this.parseThinkTags(fullText);
        
        // Handle Think Container
        let thinkContainer = container.querySelector('.think-container');
        if (thinkContent) {
            if (!thinkContainer) {
                thinkContainer = document.createElement('details');
                thinkContainer.className = 'think-container';
                thinkContainer.innerHTML = '<summary>Thinking...</summary><div class="think-content"></div>';
                
                // Insert at the top
                if (container.firstChild) {
                    container.insertBefore(thinkContainer, container.firstChild);
                } else {
                    container.appendChild(thinkContainer);
                }
            }
            // Update content
            const thinkBody = thinkContainer.querySelector('.think-content');
            thinkBody.innerHTML = parseMarkdown(thinkContent);
            // Ensure it's visible if we have content
            thinkContainer.style.display = 'block'; 
        }
        
        // Handle Main Content
        let mainContainer = container.querySelector('.main-content-stream');
        if (!mainContainer) {
            mainContainer = document.createElement('div');
            mainContainer.className = 'main-content-stream';
            container.appendChild(mainContainer);
        }
        
        if (mainContent) {
             mainContainer.innerHTML = parseMarkdown(mainContent, state.currentSearchResults);
        } else {
             mainContainer.innerHTML = ''; // Clear if no main content yet
        }
    }

    setStreamingState(streaming) {
        state.isStreaming = streaming;
        const submitBtn = this.dom.sendBtn;
        if (!submitBtn) return;

        if (streaming) {
            submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
            submitBtn.classList.add('stop-btn');
            submitBtn.disabled = false;
            submitBtn.style.cursor = 'pointer';
            
            // Also disable input
            this.dom.messageInput.disabled = true;
            if (this.dom.changeModelBtn) this.dom.changeModelBtn.disabled = true;
            if (this.dom.contextFileBtn) this.dom.contextFileBtn.disabled = true;
            if (this.dom.viewContextBtn) this.dom.viewContextBtn.disabled = true;
        } else {
            submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
            submitBtn.classList.remove('stop-btn');
            submitBtn.style.cursor = '';
            toggleSendButtonState();
            
            // Re-enable input
            this.dom.messageInput.disabled = false;
            if (this.dom.changeModelBtn) this.dom.changeModelBtn.disabled = false;
            if (this.dom.contextFileBtn) this.dom.contextFileBtn.disabled = false;
            if (this.dom.viewContextBtn) this.dom.viewContextBtn.disabled = false;
            this.dom.messageInput.focus();
        }
        this.updateModelButtonText();
    }

    async saveChat() {
        if (!state.currentChatId) return;
        const activeChatItem = document.querySelector(`.list-item[data-chat-id="${state.currentChatId}"] .chat-name`);
        const displayName = activeChatItem ? activeChatItem.textContent : null;

        try {
            const result = await saveChatApi(
                state.currentChatId, 
                state.messages, 
                state.currentConfig, 
                state.currentParentConfig, 
                displayName
            );
            if (activeChatItem && result.display_name && activeChatItem.textContent !== result.display_name) {
                activeChatItem.textContent = result.display_name;
                activeChatItem.title = result.display_name;
            }
        } catch (error) {
            console.error("Failed to save chat:", error.message);
        }
    }

    updateModelButtonText() {
         if (this.dom.changeModelBtn && state.currentConfig.model) {
            this.dom.changeModelBtn.textContent = getDisplayName(state.currentConfig.model);
        } else if (this.dom.changeModelBtn) {
            this.dom.changeModelBtn.textContent = 'Model';
        }
    }

    async updateContextGauge() {
        const maxTokens = CONTEXT_WINDOWS[state.currentConfig.model] || 200000;
        let totalTokens = 0;

        state.messages.forEach(msg => {
            totalTokens += estimateTokens(msg.content);
        });

        if (state.currentConfig.system_prompt) totalTokens += estimateTokens(state.currentConfig.system_prompt);
        if (state.currentConfig.character_card) totalTokens += estimateTokens(state.currentConfig.character_card);
        if (state.currentConfig.system_context) totalTokens += estimateTokens(state.currentConfig.system_context);

        const localPercent = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
        
        // Find ALL gauge buttons (there are multiple in Lagoon V1.3)
        const gaugeBtns = document.querySelectorAll('#view-context-btn');
        gaugeBtns.forEach(btn => {
            btn.textContent = `${localPercent}%`;
            
            // Visual indicator for high context
            if (localPercent > 90) {
                btn.style.color = 'var(--ansi-red)';
                btn.style.fontWeight = 'bold';
            } else if (localPercent > 70) {
                btn.style.color = 'var(--ansi-yellow)';
                btn.style.fontWeight = 'normal';
            } else {
                btn.style.color = '';
                btn.style.fontWeight = 'normal';
            }
        });
    }

    async deleteSingleMessage(index) {
        if (index < 0 || index >= state.messages.length) return;

        state.messages.splice(index, 1);

        // Remap kept message indices to account for the deleted message
        if (state.keptMessages.size > 0) {
            const updated = new Set();
            for (const idx of state.keptMessages) {
                if (idx < index) {
                    updated.add(idx); // before deletion, unaffected
                } else if (idx > index) {
                    updated.add(idx - 1); // after deletion, shift down
                }
                // index of the deleted message is dropped
            }
            state.keptMessages = updated;
        }

        this.renderMessages();
        await this.saveChat();
        this.updateContextGauge();
        setTimeout(() => autoScroll(), 50);
    }

    async deleteMessagePair(assistantIndex) {
        if (assistantIndex < 0 || assistantIndex >= state.messages.length) return;

        // Find the paired user message (immediately before, skipping system messages)
        let userIndex = assistantIndex - 1;
        while (userIndex >= 0 && state.messages[userIndex].role === 'system') {
            userIndex--;
        }
        const hasUserPair = userIndex >= 0 && state.messages[userIndex].role === 'user';

        // Remove assistant first (higher index), then user to avoid index shift issues
        state.messages.splice(assistantIndex, 1);
        if (hasUserPair) {
            state.messages.splice(userIndex, 1);
        }

        // Remap kept message indices
        if (state.keptMessages.size > 0) {
            const removed = hasUserPair ? [assistantIndex, userIndex] : [assistantIndex];
            const updated = new Set();
            for (const idx of state.keptMessages) {
                if (!removed.includes(idx)) {
                    const shift = removed.filter(r => r < idx).length;
                    updated.add(idx - shift);
                }
            }
            state.keptMessages = updated;
        }

        this.renderMessages();
        await this.saveChat();
        this.updateContextGauge();
        setTimeout(() => autoScroll(), 50);
    }

    async regenerateFromIndex(assistantIndex, instruction = null, isNudge = false) {
        if (instruction) {
             const currentResponse = state.messages[assistantIndex]?.content;
            if (!currentResponse) return;
            state.messages = state.messages.slice(0, assistantIndex);
            
            this.renderMessages();
            this.updateContextGauge();

            if (isNudge) {
                // For a nudge, append the instruction in double brackets to the last user message
                // Update BOTH state.messages and apiHistory to ensure it persists in context
                for (let i = state.messages.length - 1; i >= 0; i--) {
                    if (state.messages[i].role === 'user') {
                        state.messages[i].content += `\n\n(( ${instruction} ))`;
                        break;
                    }
                }
                const apiHistory = JSON.parse(JSON.stringify(state.messages));
                await this.generateResponse(apiHistory);
            } else {
                const apiHistory = JSON.parse(JSON.stringify(state.messages));
                apiHistory.push({
                    role: 'user',
                    content: `(( ${instruction} ))\n\nRewrite this response:\n\n${currentResponse}`
                });
                await this.generateResponse(apiHistory);
            }
            return;
        }

        let userIndex = assistantIndex - 1;
        while (userIndex >= 0 && state.messages[userIndex].role === 'system') {
            userIndex--;
        }

        if (userIndex < 0 || state.messages[userIndex].role !== 'user') return;

        const userMessage = state.messages[userIndex].content;
        state.messages = state.messages.slice(0, userIndex);

        this.renderMessages();
        this.updateContextGauge();

        await new Promise(r => setTimeout(r, 100));
        this.dom.messageInput.value = userMessage;
        this.handleSendMessage();
    }

    // --- Style Preferences Logic ---

    editAssistantMessage(index) {
        const group = this.dom.chatMessages.querySelector(`.message-group[data-index="${index}"]`);
        if (!group) return;
        
        const messageDiv = group.querySelector('.message.assistant');
        if (!messageDiv) return;
        
        const currentText = state.messages[index].content;
        const width = messageDiv.offsetWidth;
        const height = messageDiv.offsetHeight;
        
        messageDiv.innerHTML = '';
        
        const textarea = document.createElement('textarea');
        textarea.value = currentText;
        textarea.style.width = `${width}px`;
        textarea.style.height = `${Math.max(height, 60)}px`;
        textarea.style.maxWidth = '100%';
        textarea.style.background = 'rgba(0,0,0,0.2)';
        textarea.style.border = '1px solid var(--accent)';
        textarea.style.color = 'var(--text-main)';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '8px';
        textarea.style.resize = 'vertical';
        textarea.style.fontFamily = 'inherit';
        textarea.style.fontSize = 'inherit';
        textarea.style.outline = 'none';
        textarea.style.boxSizing = 'border-box';
        
        textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await this.saveEditedAssistantMessage(index, textarea.value);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.renderMessages();
            }
        });
        
        messageDiv.appendChild(textarea);
        textarea.focus();
    }

    async saveEditedAssistantMessage(index, newContent) {
        const originalContent = state.messages[index].content;
        if (originalContent !== newContent) {
            state.messages[index].content = newContent;
            await this.saveChat();
            this.renderMessages();
            this.analyzeAndStoreEdit(originalContent, newContent, index);
        } else {
            this.renderMessages();
        }
    }

    async analyzeAndStoreEdit(original, edited, msgIndex) {
        try {
            // Style learning disabled - no longer analyzing edits
            // const result = await analyzeEditApi(original, edited);
            // if (result.success && result.analysis) {
            //     this.saveStylePreference(result.analysis);
            //     if (state.messages[msgIndex]) {
            //         state.messages[msgIndex].styleNote = result.analysis;
            //         this.saveChat();
            //     }
            //     this.showNotedIndicator(msgIndex, result.analysis);
            // }
        } catch (e) {
            console.error('[StyleLearn] Edit analysis failed:', e);
        }
    }

    getStylePreferenceKey() {
        const charName = state.currentConfig?.character_name || state.currentParentConfig?.replace('.json', '') || 'global';
        return `style_preferences_${charName.toLowerCase().replace(/\s+/g, '_')}`;
    }

    saveStylePreference(analysis) {
        const key = this.getStylePreferenceKey();
        let prefs = JSON.parse(localStorage.getItem(key) || '[]');
        prefs.push({ analysis: analysis, timestamp: Date.now() });
        if (prefs.length > 20) prefs = prefs.slice(-20);
        localStorage.setItem(key, JSON.stringify(prefs));
    }

    showNotedIndicator(msgIndex, analysis) {
        const group = this.dom.chatMessages.querySelector(`.message-group[data-index="${msgIndex}"]`);
        if (!group) return;

        const existing = group.querySelector('.noted-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.className = 'noted-indicator';
        const escapedAnalysis = analysis.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        indicator.innerHTML = `<span class="noted-text">(noted.)</span><div class="noted-tooltip">${escapedAnalysis}</div>`;

        const bubbleWrapper = group.querySelector('.bubble-wrapper');
        if (bubbleWrapper) bubbleWrapper.appendChild(indicator);
    }

    getStylePreferencesPrompt() {
        // Style learning disabled
        return null;
        // const key = this.getStylePreferenceKey();
        // const prefs = JSON.parse(localStorage.getItem(key) || '[]');
        // if (prefs.length === 0) return null;
        // const charName = state.currentConfig?.character_name || 'this character';
        // const recent = prefs.slice(-5).map(p => p.analysis).join('\n');
        // return `[USER STYLE PREFERENCES for ${charName} - learned from their edits]\n${recent}\n[Apply these preferences to your writing style]`;
    }

    _updateCost(model, usage) {
        let p = VENICE_PRICING[model];
        
        // Fallback to dynamic pricing from installed models
        if (!p) {
            const dynamicModel = modelConfigManager.getModel(model);
            if (dynamicModel && dynamicModel.pricing) {
                p = {
                    in: dynamicModel.pricing.input,
                    out: dynamicModel.pricing.output
                };
            }
        }

        if (!p) return;

        const inp = (usage.input_tokens || 0) / 1_000_000;
        const out = (usage.output_tokens || 0) / 1_000_000;
        const cacheRead = (usage.cache_read_tokens || 0) / 1_000_000;
        const cacheWrite = (usage.cache_write_tokens || 0) / 1_000_000;

        // Tiered input pricing (Grok 4.20, Gemini 3.1 Pro, GPT-5.4 Pro)
        let inRate = p.in;
        if (p.inTier && (usage.input_tokens || 0) > p.tierAt) inRate = p.inTier;

        const turnCost = (inp * inRate)
            + (out * p.out)
            + (cacheRead * (p.cacheRead || 0))
            + (cacheWrite * (p.cacheWrite || p.cacheRead || 0));

        this.sessionCost += turnCost;
        localStorage.setItem('lagoon_session_cost', this.sessionCost.toString());

        if (this.dom.turnCostEl) {
            this.dom.turnCostEl.textContent = turnCost < 0.0001
                ? `< $0.0001`
                : `$${turnCost.toFixed(4)}`;
        }
        if (this.dom.sessionCostEl) {
            this.dom.sessionCostEl.textContent = `$${this.sessionCost.toFixed(4)}`;
        }
        if (this.dom.costTokensEl) {
            const parts = [`${(usage.input_tokens||0).toLocaleString()} in`, `${(usage.output_tokens||0).toLocaleString()} out`];
            if (usage.cache_read_tokens > 0) parts.push(`${usage.cache_read_tokens.toLocaleString()} cached`);
            this.dom.costTokensEl.textContent = parts.join(' · ');
        }
    }

    _initPromptExpandBtn() {
        const btn = document.getElementById('prompt-expand-btn');
        if (!btn) return;
        const sidebar = document.querySelector('.sidebar-right');
        btn.addEventListener('click', async () => {
            const expanded = sidebar.style.width === '440px';
            sidebar.style.width = expanded ? '260px' : '440px';
            btn.textContent = expanded ? '⤢' : '⤡';
            const { uiManager } = await import('../core/UIManager.js');
            uiManager.syncMessagesContainer();
        });
    }

    async _refreshPromptMonitor() {
        const { previewPrompt } = await import('../api.js');
        const { state } = await import('../state.js');
        if (!state.currentChatId) return;
        try {
            const result = await previewPrompt(
                state.currentChatId,
                state.messages,
                state.currentConfig,
                state.currentParentConfig
            );
            if (result) this._renderPromptMonitor(result);
        } catch (e) {
            console.warn('[PromptMonitor] refresh failed:', e);
        }
    }

    _renderPromptMonitor(result) {
        const body = document.getElementById('prompt-monitor-body');
        const tokenEl = document.getElementById('prompt-token-count');
        if (!body) return;

        if (tokenEl) tokenEl.textContent = `${(result.token_count || 0).toLocaleString()} tokens`;

        const messages = result.messages || [];
        const fragments = [];

        // Classify and render each message
        let convStart = -1;
        let convEnd = -1;
        let convCount = 0;

        // Find the conversation block (non-system messages, excluding last user msg)
        const nonSysIndices = messages.map((m, i) => m.role !== 'system' ? i : -1).filter(i => i >= 0);
        const lastUserIdx = [...messages].map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop() ?? -1;
        const convIndices = nonSysIndices.filter(i => i !== lastUserIdx);
        convCount = convIndices.length;
        if (convIndices.length > 0) {
            convStart = convIndices[0];
            convEnd = convIndices[convIndices.length - 1];
        }

        let convPlaceholderInserted = false;

        messages.forEach((msg, idx) => {
            // Skip conversation messages (replaced by placeholder)
            if (convIndices.includes(idx)) {
                if (!convPlaceholderInserted) {
                    convPlaceholderInserted = true;
                    const ph = document.createElement('div');
                    ph.className = 'prompt-conv-placeholder';
                    ph.textContent = `··· ${convCount} conversation message${convCount !== 1 ? 's' : ''} ···`;
                    fragments.push(ph);
                }
                return;
            }

            const role = msg.role;
            const content = typeof msg.content === 'string' ? msg.content
                : (msg.content || []).map(p => p.text || '').join(' ');

            if (role === 'system') {
                // Classify system message
                let badgeClass = 'badge-system';
                let label = 'SYSTEM';
                if (content.startsWith('You are a skilled collaborative fiction')) {
                    badgeClass = 'badge-fiction'; label = 'FICTION';
                } else if (content.startsWith('[SUMMARY')) {
                    badgeClass = 'badge-summary'; label = 'SUMMARY';
                } else if (content.startsWith('[Lore]') || content.startsWith('[Lore |')) {
                    badgeClass = 'badge-lore'; label = 'LORE';
                } else if (content.startsWith("[Author's Note]")) {
                    badgeClass = 'badge-note'; label = 'NOTE';
                } else if (content.startsWith('[Context from past') || content.startsWith('[Relevant past')) {
                    badgeClass = 'badge-rag'; label = 'RAG';
                }

                const details = document.createElement('details');
                details.className = 'prompt-msg-block';
                const summary = document.createElement('summary');
                summary.innerHTML = `<span class="prompt-badge ${badgeClass}">${label}</span><span class="prompt-msg-preview">${content.slice(0, 60).replace(/\n/g, ' ')}…</span>`;
                const pre = document.createElement('div');
                pre.className = 'prompt-msg-content';
                pre.textContent = content;
                details.appendChild(summary);
                details.appendChild(pre);
                fragments.push(details);

            } else if (role === 'user' && idx === lastUserIdx) {
                const block = document.createElement('div');
                block.className = 'prompt-msg-block';
                const label = document.createElement('div');
                label.className = 'prompt-msg-label';
                label.innerHTML = `<span class="prompt-badge badge-user">USER</span>`;
                const pre = document.createElement('div');
                pre.className = 'prompt-msg-content';
                pre.textContent = typeof msg.content === 'string' ? msg.content
                    : (msg.content || []).map(p => p.text || '').join(' ');
                block.appendChild(label);
                block.appendChild(pre);
                fragments.push(block);
            }
        });

        // Lore triggers section — compact single line
        if (result.lore_matched && result.lore_matched.length > 0) {
            const loreSection = document.createElement('div');
            loreSection.className = 'prompt-lore-triggers';
            const lbl = document.createElement('span');
            lbl.className = 'lore-trigger-label';
            lbl.textContent = `LORE (${result.lore_matched.length})`;
            loreSection.appendChild(lbl);
            const MAX_SHOW = 5;
            result.lore_matched.slice(0, MAX_SHOW).forEach(entry => {
                const kw = (entry.keywords || [])[0] || '?';
                const span = document.createElement('span');
                span.className = 'prompt-lore-keyword';
                span.textContent = kw;
                loreSection.appendChild(span);
            });
            if (result.lore_matched.length > MAX_SHOW) {
                const more = document.createElement('span');
                more.className = 'lore-trigger-more';
                more.textContent = `+${result.lore_matched.length - MAX_SHOW}`;
                loreSection.appendChild(more);
            }
            fragments.unshift(loreSection);
        }

        body.replaceChildren(...fragments);
    }

    _showReviewNeededBanner() {
        if (document.getElementById('review-needed-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'review-needed-banner';
        banner.className = 'review-needed-banner';
        banner.innerHTML = `
            <span>&#9888; Summary ready for review &mdash; messages won&#39;t be pruned until you approve.</span>
            <button class="review-dismiss-btn">&#x2715;</button>
        `;
        document.body.appendChild(banner);
        banner.querySelector('.review-dismiss-btn').addEventListener('click', () => banner.remove());
    }

    async _runStyleOverseer() {
        console.log('[Overseer] style_overseer:', state.currentConfig?.style_overseer, '| parentConfig:', state.currentParentConfig);
        if (!state.currentConfig?.style_overseer) return;
        if (!state.currentParentConfig) return;
        let lastMsgIndex = -1;
        for (let i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i].role === 'assistant') { lastMsgIndex = i; break; }
        }
        if (lastMsgIndex === -1) return;
        const last = state.messages[lastMsgIndex];
        const text = typeof last.content === 'string'
            ? last.content
            : (last.content || []).map(p => p.text || '').join(' ');
        const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!stripped) return;
        const groups = document.querySelectorAll('.message-group.assistant');
        const lastGroup = groups[groups.length - 1];
        if (!lastGroup) return;
        const bubbleWrapper = lastGroup.querySelector('.bubble-wrapper');
        if (!bubbleWrapper) return;
        const spinner = document.createElement('div');
        spinner.className = 'overseer-spinner';
        spinner.title = 'Style Overseer checking…';
        bubbleWrapper.appendChild(spinner);
        try {
            const { overseerCheckApi } = await import('../api.js');
            const rawRules = localStorage.getItem('overseer_custom_rules') || '';
            const customRules = rawRules.split('\n').map(r => r.trim()).filter(Boolean);
            const useBuiltinRules = localStorage.getItem('overseer_builtin_rules') !== 'false';
            const overseerModel = localStorage.getItem('overseer_model') || '';
            const result = await overseerCheckApi(stripped, state.currentParentConfig, customRules, useBuiltinRules, overseerModel);
            spinner.remove();
            if (!result?.violations?.length) return;
            if (this._overseerAutoAccept) {
                const msgObj = state.messages[lastMsgIndex];
                if (msgObj) {
                    let currentText = typeof msgObj.content === 'string'
                        ? msgObj.content
                        : (msgObj.content || []).map(p => p.text || '').join(' ');
                    currentText = currentText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    // Track replacements for DOM wrapping (applied after markdown)
                    const replacements = [];
                    result.violations.forEach(v => {
                        if (v.scope === 'paragraph' && v.excerpt && v.paragraph_rewrite) {
                            const para = currentText.split(/\n\n+/).find(p => p.includes(v.excerpt));
                            if (para) {
                                currentText = currentText.replace(para, v.paragraph_rewrite);
                                replacements.push({ original: para, replacement: v.paragraph_rewrite });
                            }
                        } else if (v.replacement && v.replacement !== v.excerpt) {
                            currentText = currentText.replace(v.excerpt, v.replacement);
                            replacements.push({ original: v.excerpt, replacement: v.replacement });
                        }
                    });
                    state.messages[lastMsgIndex].content = currentText;
                    state.messages[lastMsgIndex].corrections = [
                        ...(state.messages[lastMsgIndex].corrections || []),
                        ...replacements
                    ];
                    const msgDiv = bubbleWrapper.querySelector('.message.assistant');
                    if (msgDiv) {
                        const { parseMarkdown } = await import('../utils.js');
                        msgDiv.innerHTML = parseMarkdown(currentText);
                        const allCorrections = state.messages[lastMsgIndex].corrections || [];
                        allCorrections.forEach(({ original, replacement }) => {
                            _wrapCorrectionInDOM(msgDiv, replacement, original);
                        });
                    }
                    const { saveChatApi } = await import('../api.js');
                    saveChatApi(state.currentChatId, state.messages, state.currentConfig, state.currentParentConfig, null, [...state.keptMessages]);
                }
                return;
            }
            bubbleWrapper.querySelector('.overseer-badge')?.remove();
            this._addOverseerBadge(bubbleWrapper, result.violations, lastMsgIndex);
        } catch (e) {
            spinner.remove();
            console.warn('[Overseer] check failed:', e);
        }
    }

    _addOverseerBadge(bubbleWrapper, violations, msgIndex) {
        const badge = document.createElement('div');
        badge.className = 'overseer-badge';
        badge.textContent = `⚑ ${violations.length}`;
        badge.title = 'Style violations detected — click to review';

        const tooltip = document.createElement('div');
        tooltip.className = 'overseer-tooltip';
        tooltip.style.display = 'none';

        const renderTooltip = () => {
            tooltip.innerHTML = '';
            violations.forEach((v, i) => {
                const item = document.createElement('div');
                item.className = 'overseer-violation';
                if (v.scope === 'paragraph') {
                    item.innerHTML = `
                        <div class="overseer-suggestion">${v.suggestion}</div>
                        <div class="overseer-excerpt">❌ "${v.excerpt}"</div>
                        <div class="overseer-rewrite-preview">✓ ${v.paragraph_rewrite || ''}</div>
                        <div class="overseer-actions">
                            <button class="context-approve-btn overseer-accept-btn">Accept rewrite</button>
                            <button class="context-delete-btn overseer-dismiss-btn">Dismiss</button>
                        </div>`;
                } else {
                    item.innerHTML = `
                        <div class="overseer-suggestion">${v.suggestion}</div>
                        <div class="overseer-excerpt">❌ "${v.excerpt}"</div>
                        <div class="overseer-replacement">✓ "${v.replacement || ''}"</div>
                        <div class="overseer-actions">
                            <button class="context-approve-btn overseer-accept-btn">Accept</button>
                            <button class="context-delete-btn overseer-dismiss-btn">Dismiss</button>
                        </div>`;
                }
                item.querySelector('.overseer-accept-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    violations.splice(i, 1);
                    if (violations.length === 0) {
                        badge.remove();
                        tooltip.remove();
                    } else {
                        badge.textContent = `⚑ ${violations.length}`;
                        renderTooltip();
                    }
                    const isParaRewrite = v.scope === 'paragraph' && v.excerpt && v.paragraph_rewrite;
                    if (!isParaRewrite && (!v.replacement || v.replacement === v.excerpt)) return;
                    const msgObj = state.messages[msgIndex];
                    if (!msgObj) return;
                    const currentText = typeof msgObj.content === 'string'
                        ? msgObj.content
                        : (msgObj.content || []).map(p => p.text || '').join(' ');
                    let findText, replaceText;
                    if (isParaRewrite) {
                        findText = currentText.split(/\n\n+/).find(p => p.includes(v.excerpt)) || v.excerpt;
                        replaceText = v.paragraph_rewrite;
                    } else {
                        findText = v.excerpt;
                        replaceText = v.replacement;
                    }
                    const newText = currentText.replace(findText, replaceText);
                    state.messages[msgIndex].content = newText;
                    state.messages[msgIndex].corrections = [
                        ...(state.messages[msgIndex].corrections || []),
                        { original: findText, replacement: replaceText }
                    ];
                    const msgDiv = bubbleWrapper.querySelector('.message.assistant');
                    if (msgDiv) {
                        const { parseMarkdown } = await import('../utils.js');
                        // Re-render from updated text, then re-apply all corrections as DOM spans
                        msgDiv.innerHTML = parseMarkdown(newText);
                        const allCorrections = state.messages[msgIndex].corrections || [];
                        allCorrections.forEach(({ original, replacement }) => {
                            _wrapCorrectionInDOM(msgDiv, replacement, original);
                        });
                    }
                    const { saveChatApi } = await import('../api.js');
                    saveChatApi(state.currentChatId, state.messages, state.currentConfig, state.currentParentConfig, null, [...state.keptMessages]);
                });
                item.querySelector('.overseer-dismiss-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    violations.splice(i, 1);
                    if (violations.length === 0) {
                        badge.remove();
                        tooltip.remove();
                    } else {
                        badge.textContent = `⚑ ${violations.length}`;
                        renderTooltip();
                    }
                });
                tooltip.appendChild(item);
            });
        };

        renderTooltip();
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = tooltip.style.display !== 'none';
            document.querySelectorAll('.overseer-tooltip').forEach(t => t.style.display = 'none');
            tooltip.style.display = visible ? 'none' : 'block';
            if (!visible) tooltip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        document.addEventListener('click', () => { tooltip.style.display = 'none'; });

        bubbleWrapper.appendChild(badge);
        bubbleWrapper.appendChild(tooltip);
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

}

function _wrapCorrectionInDOM(container, text, originalText) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const textNode of nodes) {
        const idx = textNode.textContent.indexOf(text);
        if (idx === -1) continue;
        const span = document.createElement('span');
        span.className = 'overseer-corrected';
        span.title = `Original: ${originalText}`;
        span.textContent = text;
        const parent = textNode.parentNode;
        const before = textNode.textContent.slice(0, idx);
        const after = textNode.textContent.slice(idx + text.length);
        if (before) parent.insertBefore(document.createTextNode(before), textNode);
        parent.insertBefore(span, textNode);
        if (after) parent.insertBefore(document.createTextNode(after), textNode);
        parent.removeChild(textNode);
        return;
    }
}

export const chatManager = new ChatManager();
