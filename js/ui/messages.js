/**
 * Message Rendering and Display
 */

import { state, dom, MODEL_LOGOS, DEFAULT_USER_AVATAR_IMAGE_PATH } from '../state.js';
import { parseMarkdown } from '../utils.js';
import { uiManager } from '../core/UIManager.js';

// Default writing tools as array (supports editable labels)
export const DEFAULT_WRITING_TOOLS = [
    { id: 'tool-1', label: "Less Tell/More Show", prompt: "Rewrite the response with pure showing, zero telling. Remove ALL emotion-labeling adjectives (desperate, angry, nervous, etc). Remove ALL narrator explanations of what something 'was' or 'wasn't', what it 'meant', or how to interpret it. Describe ONLY physical actions, sounds, and sensations. Trust the reader to infer the emotion. If a character is scared, don't say 'scared'—show the sweat, the tremor, the caught breath. Never explain." },
    { id: 'tool-2', label: "More Sensory Detail", prompt: "Rewrite the response focusing on sensory details (sight, sound, smell, touch) to make the scene more immersive." },
    { id: 'tool-3', label: "Less Sensory Detail", prompt: "Rewrite the response trimming excessive sensory details while preserving narrative flow. Cut redundant descriptions and sensory stacking (multiple senses describing the same moment). Keep one strong sensory detail per beat instead of three. Preserve the emotional core, action, and dialogue - just deliver them more cleanly. Aim for roughly 70-80% of the original length." },
    { id: 'tool-4', label: "Add Inner Monologue", prompt: "Rewrite the response, adding a short inner monologue in italics (*like this*) for the character." }
];

// Get writing tools from localStorage or use defaults
export function getWritingToolsOptions() {
    const saved = localStorage.getItem('writing_tools_v2');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Validate it's an array with proper structure
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
                return parsed;
            }
        } catch (e) {
            console.error('Failed to parse saved writing tools:', e);
        }
    }
    // Return deep copy of defaults
    return DEFAULT_WRITING_TOOLS.map(t => ({ ...t }));
}

// Save writing tools to localStorage
export function saveWritingToolsOptions(options) {
    localStorage.setItem('writing_tools_v2', JSON.stringify(options));
}

// Helper to get as label->prompt object (for hamburger menu)
export function getWritingToolsAsObject() {
    const tools = getWritingToolsOptions();
    const obj = {};
    tools.forEach(t => { obj[t.label] = t.prompt; });
    return obj;
}

export function addMessageToUI(role, content, config, isStreaming = false, attachedFile = null, msgIndex = null, skipScroll = false, onToggleKeep = null, isKept = false, msgData = null, onDeleteMessage = null) {
    if (role === 'system') return null;
    // Hide context file messages from display (they're role:'user' for AI prioritization but shouldn't show)
    if (role === 'user' && content && content.startsWith('[ATTACHED FILE:')) return null;

    const group = document.createElement('div');
    group.classList.add('message-group', role);
    if (msgIndex !== null) group.dataset.index = msgIndex;
    if (isKept) group.classList.add('kept');

    // Dual model styling
    if (msgData && msgData.modelKey) {
        group.classList.add(`model-${msgData.modelKey.toLowerCase()}`);
        group.dataset.modelKey = msgData.modelKey;
    }

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    if (role === 'assistant') {
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        if (config && config.avatar_url) {
            const avatarImg = document.createElement('img');
            avatarImg.src = config.avatar_url;
            avatarDiv.appendChild(avatarImg);
        } else {
            const modelInUse = (config && config.model) ? config.model : 'default';
            const charName = (config && config.character_name) || 'Assistant';
            
            let logoHtml = MODEL_LOGOS[modelInUse];

            // Prefix walk: try progressively shorter dash-segments of the model ID
            if (!logoHtml) {
                const parts = modelInUse.split('-');
                for (let i = parts.length - 1; i >= 1; i--) {
                    const prefix = parts.slice(0, i).join('-');
                    if (MODEL_LOGOS[prefix]) { logoHtml = MODEL_LOGOS[prefix]; break; }
                }
            }

            // Fallback: org/model format (e.g. meta-llama/Llama-3)
            if (!logoHtml && modelInUse.includes('/')) {
                const org = modelInUse.split('/')[0].toLowerCase();
                const match = Object.keys(MODEL_LOGOS).find(key =>
                    org.includes(key) || key.includes(org)
                );
                logoHtml = match ? MODEL_LOGOS[match] : MODEL_LOGOS['together'];
            }

            avatarDiv.innerHTML = logoHtml || `<img src="${DEFAULT_USER_AVATAR_IMAGE_PATH}" alt="Avatar">`;
        }
        group.appendChild(avatarDiv);
    }

    const sender = document.createElement('div');
    sender.classList.add('message-sender');
    let senderName = 'AI';
    if (role === 'assistant') {
        if (config && config.character_name) {
            senderName = config.character_name;
        } else if (config && config.model === 'venice-uncensored') {
            senderName = 'Venice Uncensored';
        } else if (config && config.model) {
            senderName = config.model;
        }
    }

    if (role === 'user') {
        sender.style.display = 'none';
    } else {
        sender.textContent = senderName;
    }

    if (role === 'assistant') {
        const timerSpan = document.createElement('span');
        timerSpan.classList.add('thought-timer');
        sender.appendChild(timerSpan);
    }

    messageContent.appendChild(sender);

    // Show attached file bubble if present
    if (attachedFile) {
        const fileBubble = document.createElement('div');
        fileBubble.classList.add('file-bubble');
        fileBubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${attachedFile}</span>`;
        messageContent.appendChild(fileBubble);
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    // Apply typography settings
    if (uiManager.typographySettings) {
        messageDiv.style.fontFamily = uiManager.typographySettings.font;
        messageDiv.style.fontSize = uiManager.typographySettings.size;
        messageDiv.style.lineHeight = uiManager.typographySettings.lineHeight;
    }

    // Extract search results from config if available
    const searchResults = (config && config.searchResults) ? config.searchResults : [];

    const renderedContent = parseMarkdown(content, searchResults);
    
    // If a user message becomes completely empty after stripping nudges (and has no file), hide it
    if (role === 'user' && !renderedContent.trim() && !attachedFile) {
        return null;
    }

    let finalContent = renderedContent;
    if (msgData && msgData.corrections && msgData.corrections.length > 0) {
        msgData.corrections.forEach(({ original, replacement }) => {
            const escapedOriginal = original.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            const escapedReplacement = replacement.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            finalContent = finalContent.replace(escapedReplacement,
                `<span class="overseer-corrected" title="Original: ${escapedOriginal}">${escapedReplacement}</span>`);
        });
    }
    messageDiv.innerHTML = finalContent;
    if (isStreaming) {
        messageDiv.classList.add('streaming');
    }

    // Wrap bubble in container for width matching with actions (same structure for user and assistant)
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.classList.add('bubble-wrapper');

    // Add model badge for dual model conversations
    if (msgData && msgData.modelKey && msgData.modelName) {
        const badge = document.createElement('div');
        badge.className = `model-badge model-${msgData.modelKey.toLowerCase()}`;
        badge.textContent = msgData.modelName;
        bubbleWrapper.appendChild(badge);
    }

    bubbleWrapper.appendChild(messageDiv);

    if (role === 'user') {
        const actions = createUserMessageActions(content, msgIndex, onDeleteMessage);
        bubbleWrapper.appendChild(actions);
    }

    messageContent.appendChild(bubbleWrapper);

    // Render citations if search results are provided
    if (role === 'assistant' && searchResults.length > 0) {
        const citationBlock = renderCitations(searchResults);
        messageContent.appendChild(citationBlock);
    }

    group.appendChild(messageContent);

    if (dom.chatMessages) {
        dom.chatMessages.appendChild(group);
    }

    return group;
}

export function renderCitations(results) {
    const container = document.createElement('div');
    container.classList.add('citation-container');

    const toggle = document.createElement('button');
    toggle.classList.add('citation-toggle');
    toggle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        <span>Sources (${results.length})</span>
    `;

    const list = document.createElement('div');
    list.classList.add('citation-list');

    results.forEach((res, i) => {
        const item = document.createElement('a');
        item.classList.add('citation-item');
        item.href = res.url;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';

        item.innerHTML = `
            <div class="citation-index">${i + 1}</div>
            <div class="citation-info">
                <span class="citation-title">${res.title || 'Source'}</span>
                <span class="citation-url">${res.url}</span>
            </div>
        `;
        list.appendChild(item);
    });

    toggle.addEventListener('click', () => {
        container.classList.toggle('expanded');
    });

    container.appendChild(toggle);
    container.appendChild(list);
    return container;
}

export function renderMessages(onRegenerate, onDeleteMessage, onUpdateGauge, onEdit, onToggleKeep, onFork = null) {
    if (!dom.chatMessages) return;
    dom.chatMessages.innerHTML = '';
    state.messages.forEach((msg, index) => {
        // Find if this message has associated search results in state
        const config = { ...state.currentConfig };
        if (msg.searchResults) {
            config.searchResults = msg.searchResults;
        }
        const isKept = state.keptMessages && state.keptMessages.has(index);
        // Pass full message data for dual model support
        const group = addMessageToUI(msg.role, msg.content, config, false, null, index, false, onToggleKeep, isKept, msg, onDeleteMessage);

        // Add actions to assistant messages (not just the last one)
        if (msg.role === 'assistant' && group) {
            const bubbleWrapper = group.querySelector('.bubble-wrapper');
            if (bubbleWrapper && !bubbleWrapper.querySelector('.assistant-actions')) {
                const isDualModeMessage = !!(msg.modelKey);
                const actions = createAssistantMessageActions(
                    msg.content,
                    index,
                    onRegenerate,
                    onDeleteMessage,
                    onEdit,
                    onToggleKeep,
                    isKept,
                    isDualModeMessage,
                    onFork
                );
                bubbleWrapper.appendChild(actions);
            }

            // Show persisted style note indicator if present
            if (msg.styleNote && bubbleWrapper) {
                const indicator = document.createElement('div');
                indicator.className = 'noted-indicator';
                const escapedAnalysis = msg.styleNote.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                indicator.innerHTML = `<span class="noted-text">(noted.)</span><div class="noted-tooltip">${escapedAnalysis}</div>`;
                bubbleWrapper.appendChild(indicator);
            }
        }
    });
    if (onUpdateGauge) onUpdateGauge();
}

export function createUserMessageActions(content, msgIndex, onDeleteMessage = null) {
    const actions = document.createElement('div');
    actions.classList.add('message-actions', 'user-actions');
    actions.innerHTML = `
        <button class="copy-btn" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="edit-btn" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="delete-msg-btn" title="Delete this message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;

    actions.querySelector('.copy-btn').addEventListener('click', () => {
        const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        navigator.clipboard.writeText(stripped);
    });

    actions.querySelector('.edit-btn').addEventListener('click', () => {
        state.editingMessageIndex = msgIndex;
        dom.messageInput.value = content;
        dom.messageInput.focus();
        dom.messageInput.classList.add('editing');
    });

    actions.querySelector('.delete-msg-btn').addEventListener('click', () => {
        // Delete ONLY this user message
        if (onDeleteMessage && msgIndex !== null) {
            onDeleteMessage(msgIndex);
        } else if (msgIndex !== null && state.messages[msgIndex]) {
            // Fallback for isolated use
            state.messages.splice(msgIndex, 1);
            const group = actions.closest('.message-group');
            if (group) group.remove();
        }
    });

    return actions;
}

export function createAssistantMessageActions(content, msgIndex, onRegenerate, onDeletePair, onEdit, onToggleKeep, isKept, isDualMode = false, onFork = null, overseerOptions = null) {
    const actions = document.createElement('div');
    actions.classList.add('message-actions', 'assistant-actions');
    actions.innerHTML = `
        <button class="copy-btn" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        ${!isDualMode ? `
        <button class="edit-btn" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
        <button class="fork-btn" title="Fork from here">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
        </button>
        <button class="nudge-btn" title="Nudge & Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        </button>
        <button class="regen-btn" title="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <button class="delete-msg-btn" title="Delete this message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
        ${!isDualMode ? `
        <button class="speaker-btn" title="Read Aloud">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>
        <button class="options-hamburger-btn" title="Writing Tools">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <label class="keep-checkbox-label" title="Keep for export">
            <input type="checkbox" class="keep-checkbox" ${isKept ? 'checked' : ''}>
            <span class="keep-checkbox-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
            </span>
        </label>` : ''}
    `;

    if (overseerOptions) {
        const autoBtn = document.createElement('button');
        autoBtn.className = 'overseer-auto-btn' + (overseerOptions.autoAccept ? ' active' : '');
        autoBtn.title = 'Auto-accept style violations';
        autoBtn.textContent = '⚑ auto';
        autoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newVal = overseerOptions.onToggle();
            document.querySelectorAll('.overseer-auto-btn').forEach(b => b.classList.toggle('active', newVal));
        });
        actions.appendChild(autoBtn);
    }

    actions.querySelector('.keep-checkbox')?.addEventListener('change', (e) => {
        if (onToggleKeep) onToggleKeep(msgIndex, e.target.checked);
    });

    actions.querySelector('.options-hamburger-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();

        // Remove any existing context menus
        document.querySelectorAll('.context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;

        const options = getWritingToolsAsObject();

        Object.entries(options).forEach(([label, prompt]) => {
            const item = document.createElement('button');
            item.className = 'context-menu-item';
            item.textContent = label;
            item.addEventListener('click', () => {
                if (onRegenerate) onRegenerate(msgIndex, prompt);
                menu.remove();
            });
            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        // Smart positioning - check available space
        const menuRect = menu.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const spaceRight = window.innerWidth - rect.left;

        // Vertical positioning: open upward if not enough space below
        if (spaceBelow < menuRect.height + 10 && spaceAbove > menuRect.height + 10) {
            menu.style.top = `${rect.top - menuRect.height - 5}px`;
        }

        // Horizontal positioning: shift left if not enough space on right
        if (spaceRight < menuRect.width + 10) {
            menu.style.left = `${rect.right - menuRect.width}px`;
        }
    });

    actions.querySelector('.edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[Debug] Edit button clicked, msgIndex:', msgIndex, 'onEdit:', typeof onEdit);
        if (onEdit) {
            onEdit(msgIndex);
        } else {
            console.error('[Debug] onEdit is not defined!');
        }
    });

    actions.querySelector('.copy-btn')?.addEventListener('click', () => {
        const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        navigator.clipboard.writeText(stripped);
    });

    actions.querySelector('.fork-btn')?.addEventListener('click', () => {
        if (onFork) onFork(msgIndex);
    });

    actions.querySelector('.regen-btn')?.addEventListener('click', () => {
        if (onRegenerate) onRegenerate(msgIndex);
    });

    actions.querySelector('.nudge-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('nudge-modal');
        const input = document.getElementById('nudge-input');
        const confirmBtn = document.getElementById('nudge-confirm-btn');
        const cancelBtn = document.getElementById('nudge-cancel-btn');
        const closeBtn = document.getElementById('nudge-close-btn');

        if (!modal || !input || !confirmBtn) return;

        input.value = '';
        modal.classList.remove('hidden');
        input.focus();

        const cleanup = () => {
            modal.classList.add('hidden');
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            closeBtn.replaceWith(closeBtn.cloneNode(true));
        };

        const handleConfirm = () => {
            const nudgeText = input.value.trim();
            cleanup();
            if (onRegenerate) {
                // Pass true for the third argument (isNudge) to signal we want to inject OOC
                onRegenerate(msgIndex, nudgeText, true);
            }
        };

        const newConfirmBtn = document.getElementById('nudge-confirm-btn');
        const newCancelBtn = document.getElementById('nudge-cancel-btn');
        const newCloseBtn = document.getElementById('nudge-close-btn');

        newConfirmBtn.addEventListener('click', handleConfirm);
        newCancelBtn.addEventListener('click', cleanup);
        newCloseBtn.addEventListener('click', cleanup);
        
        // Handle Enter key in textarea (Shift+Enter for new line, Enter to submit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleConfirm();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
            }
        });
    });

    actions.querySelector('.delete-msg-btn')?.addEventListener('click', () => {
        if (onDeletePair) onDeletePair(msgIndex);
    });

    actions.querySelector('.speaker-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const { audioService } = await import('../services/AudioService.js');
        
        // Unlock on desktop interaction
        audioService.unlock();
        
        // Toggle behavior - stop if already playing
        if (btn.classList.contains('playing') || audioService.isPlaying) {
            audioService.stop();
            btn.classList.remove('playing', 'loading');
            btn.title = 'Read Aloud';
            return;
        }

        btn.classList.add('loading');
        btn.title = 'Loading audio...';
        
        try {
            await audioService.speak(content);
            btn.classList.remove('loading');
            btn.classList.add('playing');
            btn.title = 'Click to stop';
            
            // Poll to detect when playback finishes naturally
            const checkStatus = setInterval(() => {
                if (!audioService.isPlaying) {
                    btn.classList.remove('playing');
                    btn.title = 'Read Aloud';
                    clearInterval(checkStatus);
                }
            }, 500);
        } catch (err) {
            console.error('TTS playback error:', err);
            btn.classList.remove('loading', 'playing');
            btn.title = 'Read Aloud';
        }
    });

    return actions;
}

export function showSummarizedNotification() {
    const notification = document.createElement('div');
    notification.className = 'summarized-notification';
    notification.innerHTML = '📝 Context was automatically summarized to fit within model limits';
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

/**
 * Update avatar images in existing assistant messages when config changes
 * @param {Object} config - The new config with updated avatar_url and character_name
 */
export function updateMessageAvatars(config) {
    const messagesContainer = dom.chatMessages;
    if (!messagesContainer) return;
    
    // Find all assistant message groups
    const assistantMessages = messagesContainer.querySelectorAll('.message-group.assistant');
    
    assistantMessages.forEach(msgGroup => {
        const avatarDiv = msgGroup.querySelector('.avatar');
        const senderDiv = msgGroup.querySelector('.message-sender');
        
        if (avatarDiv && config) {
            if (config.avatar_url) {
                // Update with new avatar URL
                let avatarImg = avatarDiv.querySelector('img');
                if (avatarImg) {
                    avatarImg.src = config.avatar_url;
                } else {
                    avatarDiv.innerHTML = `<img src="${config.avatar_url}" alt="Avatar">`;
                }
            } else {
                // Use model logo or default
                const modelInUse = config.model || 'default';
                let logoHtml = MODEL_LOGOS[modelInUse];
                
                // Prefix walk: try progressively shorter dash-segments
                if (!logoHtml) {
                    const parts = modelInUse.split('-');
                    for (let i = parts.length - 1; i >= 1; i--) {
                        const prefix = parts.slice(0, i).join('-');
                        if (MODEL_LOGOS[prefix]) { logoHtml = MODEL_LOGOS[prefix]; break; }
                    }
                }
                
                // Fallback: org/model format
                if (!logoHtml && modelInUse.includes('/')) {
                    const org = modelInUse.split('/')[0].toLowerCase();
                    const match = Object.keys(MODEL_LOGOS).find(key =>
                        org.includes(key) || key.includes(org)
                    );
                    logoHtml = match ? MODEL_LOGOS[match] : MODEL_LOGOS['together'];
                }
                
                avatarDiv.innerHTML = logoHtml || `<img src="${DEFAULT_USER_AVATAR_IMAGE_PATH}" alt="Avatar">`;
            }
        }
        
        // Update sender name
        if (senderDiv && config) {
            let senderName = 'AI';
            if (config.character_name) {
                senderName = config.character_name;
            } else if (config.model === 'venice-uncensored') {
                senderName = 'Venice Uncensored';
            } else if (config.model) {
                senderName = config.model.split('/').pop().split(':')[0];
            }
            senderDiv.textContent = senderName;
        }
    });
}
