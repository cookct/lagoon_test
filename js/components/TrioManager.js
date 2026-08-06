/**
 * TrioManager - Manages three-way conversations (2 AI characters + 1 human)
 *
 * Handles:
 * - SSE event routing for trio mode
 * - Speaker-attributed message rendering
 * - Interrupt visualization
 * - Let-them-talk mode
 * - Participant strip UI with @mention insertion
 *
 * COMPREHENSIVE LOGGING GUIDE:
 * - All logs use [TrioManager] prefix for easy filtering
 * - Open browser DevTools console (F12) to see logs
 * - DEBUG level: detailed flow, state changes, SSE events
 * - INFO level: key decisions, speaker changes, interrupts
 * - WARN level: unexpected but handled situations
 * - ERROR level: failures
 *
 * To enable verbose logging:
 *   localStorage.setItem('trio_debug', 'true')
 * Then reload the page.
 */
import { state, dom } from '../state.js';
import { addMessageToUI, createAssistantMessageActions } from '../ui/messages.js';
import { autoScroll } from '../ui/scroll.js';
import { parseMarkdown } from '../utils.js';

class TrioManager {
    constructor() {
        this.participants = [];
        this.trioState = {
            last_speaker: null,
            consecutive_default_turns: {},
            active_thread: null,
        };
        this.emotionalState = {};
        this.currentSpeaker = null;
        this.currentBubble = null;
        this.currentContent = '';
        this.isStreaming = false;
        this.abortController = null;
        this._debugEnabled = localStorage.getItem('trio_debug') === 'true';
        this._eventCount = 0;
        this._sessionId = null;
        
        this._log('constructor', 'TrioManager instance created');
    }
    
    // ── Logging Utilities ──────────────────────────────────────
    
    _log(context, message, level = 'debug') {
        const prefix = `[TrioManager${this._sessionId ? '/' + this._sessionId : ''}]`;
        const fullMsg = `${prefix}[${context}] ${message}`;
        
        if (this._debugEnabled || level !== 'debug') {
            const logFn = level === 'error' ? console.error : 
                          level === 'warn' ? console.warn : 
                          level === 'info' ? console.info : 
                          console.debug;
            logFn(fullMsg);
        }
    }
    
    _logEvent(eventType, data) {
        this._eventCount++;
        this._log('SSE_EVENT', `#${this._eventCount} type=${eventType}, data=${JSON.stringify(data).slice(0, 100)}`, 'info');
    }
    
    _logStateChange(field, oldValue, newValue) {
        this._log('STATE_CHANGE', `${field}: ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}`);
    }
    
    _logSpeakerChange(oldSpeaker, newSpeaker) {
        this._log('SPEAKER_CHANGE', `${oldSpeaker} -> ${newSpeaker}`, 'info');
    }
    
    _logInterrupt(interrupter, truncatedPreview) {
        this._log('INTERRUPT', `by=${interrupter}, truncated='${truncatedPreview.slice(0, 50)}...'`, 'info');
    }
    
    _logError(context, error) {
        this._log(context, `ERROR: ${error.message || error}`, 'error');
        if (error.stack) {
            console.error(`[TrioManager] Stack trace:`, error.stack);
        }
    }

    init(config) {
        this._log('init', `config.mode=${config?.mode}, participants=${config?.participants?.length || 0}`);
        
        if (!config || config.mode !== 'trio') {
            this._log('init', 'Not trio mode, skipping init', 'warn');
            return;
        }
        
        const oldParticipants = [...this.participants];
        const oldState = {...this.trioState};
        
        this.participants = config.participants || [];
        this.emotionalState = config.emotional_state || {};
        this.trioState = config.trio_state || this.trioState;
        
        this._logStateChange('participants', oldParticipants, this.participants.map(p => p.label));
        this._logStateChange('trioState', oldState, this.trioState);
        
        this._renderParticipantStrip();
        
        this._log('init', `SUCCESS: ${this.participants.length} participants loaded`, 'info');
        this._log('init', `Participants: ${JSON.stringify(this.participants.map(p => ({label: p.label, name: p.display_name, color: p.color})))}`);
    }

    isTrioMode() {
        const isTrio = state.currentConfig && state.currentConfig.mode === 'trio';
        
        this._log('isTrioMode', `state.currentConfig.mode=${state.currentConfig?.mode}, result=${isTrio}`);
        
        if (!isTrio && state.currentConfig?.character_name?.toLowerCase().includes('trio')) {
            this._log('isTrioMode', 'Config has "trio" in name but mode !== "trio". Config needs recreation.', 'warn');
        }
        return isTrio;
    }

    // ── Participant Strip ──

    _renderParticipantStrip() {
        let strip = document.getElementById('trio-participant-strip');
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'trio-participant-strip';
            strip.className = 'trio-participant-strip';
            const chatContainer = document.getElementById('chat-messages') || dom.chatMessages;
            if (chatContainer && chatContainer.parentNode) {
                chatContainer.parentNode.insertBefore(strip, chatContainer);
            }
        }

        strip.innerHTML = '';
        this.participants.forEach(p => {
            const card = document.createElement('div');
            card.className = 'participant-card';
            card.dataset.label = p.label;
            card.style.setProperty('--participant-color', p.color);

            const avatar = document.createElement('div');
            avatar.className = 'participant-avatar';
            if (p.avatar) {
                avatar.innerHTML = `<img src="${p.avatar}" alt="${p.display_name}" />`;
            } else {
                avatar.textContent = p.display_name.charAt(0).toUpperCase();
                avatar.style.backgroundColor = p.color;
            }

            const info = document.createElement('div');
            info.className = 'participant-info';
            info.innerHTML = `
                <div class="participant-name">${p.display_name}</div>
                <div class="participant-mood">
                    <span class="mood-dot" style="background: ${p.color}"></span>
                    <span class="energy-label">—</span>
                </div>
            `;

            card.appendChild(avatar);
            card.appendChild(info);
            strip.appendChild(card);

            // Click avatar to insert @mention
            avatar.addEventListener('click', () => this._insertMention(p));
            avatar.style.cursor = 'pointer';
            avatar.title = `Click to @mention ${p.display_name}`;

            // Click mood dot to change emotional state
            const moodDot = card.querySelector('.mood-dot');
            if (moodDot) {
                moodDot.style.cursor = 'pointer';
                moodDot.title = 'Click to change emotional state';
                moodDot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showMoodPicker(p.label, moodDot);
                });
            }

            // Update mood from emotional state
            this._updateParticipantMood(p.label);
        });

        // Add "Let Them Talk" button
        const lttBtn = document.createElement('button');
        lttBtn.className = 'trio-let-them-talk-btn';
        lttBtn.textContent = '🎭 Let Them Talk';
        lttBtn.onclick = () => this.letThemTalk();
        strip.appendChild(lttBtn);
    }

    _insertMention(participant) {
        const input = dom.messageInput;
        if (!input) return;
        const mention = `@${participant.name_variants?.[0] || participant.display_name} `;
        const cursorPos = input.selectionStart;
        const before = input.value.substring(0, cursorPos);
        const after = input.value.substring(cursorPos);
        // Add space before if needed
        const prefix = (before && !before.endsWith(' ')) ? ' ' : '';
        input.value = before + prefix + mention + after;
        input.focus();
        const newPos = cursorPos + prefix.length + mention.length;
        input.setSelectionRange(newPos, newPos);
    }

    _updateParticipantMood(label) {
        const card = document.querySelector(`.participant-card[data-label="${label}"]`);
        if (!card) return;
        const moodState = this.emotionalState[label];
        if (!moodState) return;

        const dot = card.querySelector('.mood-dot');
        const energyLabel = card.querySelector('.energy-label');

        // Map mood to color — includes plan's arc-progression moods
        const moodColors = {
            happy: '#4ade80', excited: '#fbbf24', angry: '#ef4444',
            sad: '#60a5fa', neutral: '#9ca3af', amused: '#a78bfa',
            annoyed: '#f97316', guarded: '#6b7280', affectionate: '#f472b6',
            // Arc-progression moods (plan §6.7)
            vulnerable: '#c4b5fd', performing: '#f59e0b',
            deflecting: '#6366f1', serious: '#475569', playful: '#34d399',
        };
        if (dot && moodState.current) {
            dot.style.background = moodColors[moodState.current] || '#9ca3af';
        }
        if (energyLabel && moodState.energy) {
            energyLabel.textContent = moodState.energy;
        }
    }

    _showMoodPicker(label, anchorEl) {
        // Remove any existing picker
        const existing = document.querySelector('.trio-mood-picker');
        if (existing) existing.remove();

        const moods = [
            'neutral', 'guarded', 'angry', 'amused', 'annoyed',
            'affectionate', 'vulnerable', 'performing', 'deflecting',
            'serious', 'playful', 'sad', 'excited', 'happy'
        ];

        const picker = document.createElement('div');
        picker.className = 'trio-mood-picker';
        picker.innerHTML = moods.map(m => 
            `<button data-mood="${m}" class="mood-option">${m}</button>`
        ).join('');

        // Position near the anchor
        const rect = anchorEl.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.left = `${rect.left}px`;
        picker.style.top = `${rect.bottom + 4}px`;

        // Handle selection
        picker.querySelectorAll('.mood-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const mood = btn.dataset.mood;
                if (!this.emotionalState[label]) {
                    this.emotionalState[label] = { current: 'neutral', energy: '—' };
                }
                this.emotionalState[label].current = mood;
                this._updateParticipantMood(label);
                picker.remove();
            });
        });

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!picker.contains(e.target)) picker.remove();
            }, { once: true });
        }, 0);

        document.body.appendChild(picker);
    }

    _setActiveSpeaker(label) {
        document.querySelectorAll('.participant-card').forEach(card => {
            card.classList.toggle('active', card.dataset.label === label);
        });
    }

    _flashInterrupted(label) {
        const card = document.querySelector(`.participant-card[data-label="${label}"]`);
        if (card) {
            card.classList.add('interrupted');
            setTimeout(() => card.classList.remove('interrupted'), 1500);
        }
    }

    // ── Message Sending ──

    async sendMessage(userMessage) {
        if (!this.isTrioMode()) return false;
        if (this.isStreaming) return false;

        console.log('[TrioManager] sendMessage:', userMessage?.substring(0, 100));
        
        // Add user message to state and UI
        state.messages.push({ role: 'user', content: userMessage });
        addMessageToUI('user', userMessage, state.currentConfig, false, null, state.messages.length - 1);

        this.isStreaming = true;
        this.abortController = new AbortController();
        
        // Show stop button
        if (window.chatManager) {
            window.chatManager.setStreamingState(true);
        }

        try {
            const response = await fetch('/api/chat/trio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: state.messages,  // Include the user's message!
                    config: state.currentConfig,
                    chat_id: state.currentChatId,
                    trio_state: this.trioState,
                    emotional_state: this.emotionalState,
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                throw new Error('Trio API request failed');
            }

            await this._processSSEStream(response);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[TrioManager] Error:', error);
                addMessageToUI('system', `Error: ${error.message}`);
            }
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            this._cleanupStreaming();
            
            // Hide stop button, restore send button
            if (window.chatManager) {
                window.chatManager.setStreamingState(false);
            }
        }

        return true;
    }

    async _processSSEStream(response) {
        console.log('[TrioManager] Processing SSE stream');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log('[TrioManager] Stream done');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;

                try {
                    const raw = trimmed.substring(trimmed.indexOf('{')).trim();
                    if (!raw.startsWith('{')) continue;
                    const eventData = JSON.parse(raw);
                    console.log('[TrioManager] SSE event:', eventData.event, eventData);
                    this._handleSSEEvent(eventData);
                } catch (e) {
                    if (!(e instanceof SyntaxError)) throw e;
                }
            }
        }
    }

    _handleSSEEvent(eventData) {
        switch (eventData.event) {
            case 'start':
                if (!state.currentChatId) state.currentChatId = eventData.chat_id;
                break;

            case 'trio_state':
                this.trioState = eventData.trio_state;
                this._setActiveSpeaker(eventData.addressee);
                break;

            case 'trio_participants':
                if (!this.participants.length) {
                    this.participants = eventData.participants;
                    this._renderParticipantStrip();
                }
                break;

            case 'speaker_start':
                this._startNewBubble(eventData.speaker, eventData.display_name);
                break;

            case 'trio_delta':
                this._appendDelta(eventData.speaker, eventData.delta);
                break;

            case 'trio_speaker_change':
                this._finishCurrentBubble();
                this._startNewBubble(eventData.speaker);
                break;

            case 'trio_interrupt':
                this._handleInterrupt(eventData);
                break;

            case 'trio_yield':
                // Speaker yielded their turn
                break;

            case 'trio_silent':
                // Speaker chose to stay silent (passive reaction)
                this._finishCurrentBubble(true);
                break;

            case 'speaker_end':
                this._finishCurrentBubble();
                break;

            case 'resume_available':
                // Interrupted character can resume — currently auto-resumed by backend
                break;

            case 'end':
                this._handleEnd(eventData);
                break;

            case 'error':
                addMessageToUI('system', `Error: ${eventData.error}`);
                break;
        }
    }

    // ── Bubble Management ──

    _startNewBubble(speakerLabel, displayName) {
        this._finishCurrentBubble();

        const participant = this.participants.find(p => p.label === speakerLabel);
        if (!participant) return;

        this.currentSpeaker = speakerLabel;
        this.currentContent = '';
        this.currentDisplayName = displayName || participant.display_name;

        // Create message object
        const msgObj = {
            role: 'assistant',
            content: '',
            speaker: speakerLabel,
        };
        state.messages.push(msgObj);
        this._currentMsgIndex = state.messages.length - 1;

        // Create UI element with trio-specific config
        const trioConfig = {
            ...state.currentConfig,
            character_name: participant.display_name,
            avatar_url: participant.avatar,
            trio_color: participant.color,
            trio_speaker: speakerLabel,
        };

        this.currentBubble = addMessageToUI('assistant', '...', trioConfig, true, null, this._currentMsgIndex, false, null, false, { trio: true, speaker: speakerLabel });
        if (this.currentBubble) {
            this.currentBubble.classList.add('trio-message');
            this.currentBubble.style.setProperty('--participant-color', participant.color);
            const msgEl = this.currentBubble.querySelector('.message');
            if (msgEl) msgEl.style.setProperty('border-left-color', participant.color);
        }

        // Start streaming timer (like regular chat)
        this._bubbleStartTime = Date.now();
        const timerSpan = this.currentBubble?.querySelector('.thought-timer');
        if (timerSpan) {
            this._timerInterval = setInterval(() => {
                const elapsed = ((Date.now() - this._bubbleStartTime) / 1000).toFixed(1);
                timerSpan.textContent = ` (${elapsed}s)`;
            }, 100);
        }

        this._setActiveSpeaker(speakerLabel);
        autoScroll();
    }

    _appendDelta(speaker, delta) {
        if (!delta) return;

        // If speaker changed without a speaker_start event, start new bubble
        if (this.currentSpeaker !== speaker) {
            this._startNewBubble(speaker);
        }

        this.currentContent += delta;

        if (this.currentBubble) {
            const messageDiv = this.currentBubble.querySelector('.message');
            if (messageDiv) {
                // Render markdown progressively during streaming (like regular chat)
                messageDiv.innerHTML = parseMarkdown(this.currentContent);
                messageDiv.classList.add('streaming');
            }
            autoScroll();
        }
    }

    _finishCurrentBubble(isPassive = false) {
        // Stop streaming timer
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }

        if (!this.currentBubble || !this.currentContent) {
            if (this.currentBubble) {
                // Empty bubble - remove
                const lastMsg = state.messages[state.messages.length - 1];
                if (lastMsg && lastMsg.speaker === this.currentSpeaker && !lastMsg.content) {
                    state.messages.pop();
                }
                this.currentBubble.remove();
            }
            this.currentBubble = null;
            this.currentSpeaker = null;
            this.currentContent = '';
            return;
        }

        // Update the message object in state
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.speaker === this.currentSpeaker) {
            lastMsg.content = this.currentContent;
            if (isPassive) lastMsg.is_passive_reaction = true;
        }

        // Re-render with markdown (final render)
        if (this.currentBubble) {
            const messageDiv = this.currentBubble.querySelector('.message');
            if (messageDiv) {
                messageDiv.innerHTML = parseMarkdown(this.currentContent);
                messageDiv.classList.remove('streaming');
            }
            if (isPassive) {
                this.currentBubble.classList.add('passive-reaction');
            }

            // Add action buttons (like regular chat)
            const bubbleWrapper = this.currentBubble.querySelector('.bubble-wrapper');
            if (bubbleWrapper && !bubbleWrapper.querySelector('.assistant-actions')) {
                const msgIndex = this._currentMsgIndex;
                const actions = createAssistantMessageActions(
                    this.currentContent,
                    msgIndex,
                    (idx, instr) => window.chatManager?.regenerateFromIndex(idx, instr),
                    (idx) => window.chatManager?.deleteMessagePair(idx),
                    (idx) => window.chatManager?.editAssistantMessage(idx),
                    null, // onToggleKeep
                    false, // isKept
                    false, // isDualMode
                    (idx) => window.chatManager?.forkFromMessage(idx),
                    null,  // overseerOptions
                    (idx, text) => window.chatManager?.correctAndRegenerate(idx, text),
                );
                bubbleWrapper.appendChild(actions);
            }
        }

        this.currentBubble = null;
        this.currentSpeaker = null;
        this.currentContent = '';
    }

    _handleInterrupt(data) {
        // Save the interrupted speaker before _finishCurrentBubble clears it
        const interruptedLabel = this.currentSpeaker;

        // Finalize current bubble as interrupted
        if (this.currentBubble) {
            this.currentBubble.classList.add('interrupted');
            // Add em-dash if not already there
            if (!this.currentContent.endsWith('—') && !this.currentContent.endsWith('— ')) {
                this.currentContent += ' —';
                const messageDiv = this.currentBubble.querySelector('.message');
                if (messageDiv) messageDiv.textContent = this.currentContent;
            }
            this._finishCurrentBubble();
        }

        // Flash the interrupted participant card
        if (interruptedLabel) {
            this._flashInterrupted(interruptedLabel);
        }
    }

    _handleEnd(data) {
        this._finishCurrentBubble();

        // Update trio state
        if (data.trio_state) {
            this.trioState = data.trio_state;
        }

        // Save chat - ensure chat ID is set first
        if (window.chatManager) {
            // The 'start' SSE event should have set state.currentChatId
            // If it didn't, the save will be skipped - log a warning
            if (!state.currentChatId) {
                console.warn('[TrioManager] No chat ID at end of stream - chat may not save');
            }
            window.chatManager.saveChat();
        }

        // Update sidebar to show the new/updated chat
        import('../ui/sidebar.js').then(m => {
            if (m.refreshSidebar) m.refreshSidebar();
        }).catch(() => {});
    }

    _cleanupStreaming() {
        document.querySelectorAll('.participant-card').forEach(c => c.classList.remove('active'));
    }

    // ── Let Them Talk ──

    async letThemTalk() {
        if (this.isStreaming) return;

        this.isStreaming = true;
        this.abortController = new AbortController();
        
        // Show stop button
        if (window.chatManager) {
            window.chatManager.setStreamingState(true);
        }

        // Read rounds from session config (default 2)
        const maxRounds = state.currentConfig?.let_them_talk_rounds ?? 2;

        try {
            const response = await fetch('/api/chat/trio/let-them-talk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: state.messages,
                    config: state.currentConfig,
                    chat_id: state.currentChatId,
                    trio_state: this.trioState,
                    emotional_state: this.emotionalState,
                    max_rounds: maxRounds,
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) throw new Error('Let-them-talk request failed');
            await this._processSSEStream(response);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[TrioManager] Let-them-talk error:', error);
                addMessageToUI('system', `Error: ${error.message}`);
            }
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            this._cleanupStreaming();
            
            // Hide stop button
            if (window.chatManager) {
                window.chatManager.setStreamingState(false);
            }
        }
    }

    // ── Abort ──

    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    // ── Cleanup (when switching away from trio mode) ──

    cleanup() {
        this.abort();
        this.participants = [];
        this.trioState = { last_speaker: null, consecutive_default_turns: {}, active_thread: null };
        this.emotionalState = {};
        this.currentSpeaker = null;
        this.currentBubble = null;
        this.currentContent = '';
        this.isStreaming = false;
        
        // Remove the participant strip from DOM
        const strip = document.getElementById('trio-participant-strip');
        if (strip) {
            strip.remove();
        }
        
        console.log('[TrioManager] Cleaned up');
    }
}

export const trioManager = new TrioManager();
