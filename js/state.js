/**
 * Application State Management
 */

export const state = {
    currentChatId: null,
    messages: [],
    currentConfig: {},
    currentParentConfig: null,
    selectedAvatarFile: null,
    isStreaming: false,
    abortController: null,
    contextFileContent: null,
    contextFileName: null,
    editingMessageIndex: null,
    isTemporaryChat: false,
    lastBalanceVcu: null,
    currentSearchResults: [],
    userScrolledAway: false,
    scrollAnimationId: null,
    targetScrollTop: 0,
    keptMessages: new Set(),  // Track message indices marked for export
    promptHistory: [],  // Last 10 prompts
    promptHistoryIndex: -1,  // Current position in history (-1 = not browsing)
    promptDraft: '',  // Store current input when browsing history
    mode: 'chat',  // 'chat' or 'image' mode
    // Dual model conversation mode
    dualModelMode: false,
    dualModelRunning: false,
    dualModelPaused: false,
    dualModelConfig: {
        modelA: {
            id: null,
            name: '',
            systemPrompt: '',
            temperature: 0.7
        },
        modelB: {
            id: null,
            name: '',
            systemPrompt: '',
            temperature: 0.7
        },
        maxTurns: 10,
        currentTurn: 0
    }
};

export const MODEL_LOGOS = {
    'zai-org/GLM-5': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'zai-org-glm-5': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'zai-org-glm-4.7': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'zai-org-glm-4.7-flash': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'claude-sonnet-45': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">C</text></svg>',
    'venice-uncensored': '<svg viewBox="0 0 326 366" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M163 0L326 94v178l-163 94L0 272V94L163 0z" fill="currentColor"/></svg>',
    'venice-uncensored-role-play': '<svg viewBox="0 0 326 366" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M163 0L326 94v178l-163 94L0 272V94L163 0z" fill="currentColor"/></svg>',
    'olafangensan-glm-4.7-flash-heretic': '<svg viewBox="0 0 326 366" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M163 0L326 94v178l-163 94L0 272V94L163 0z" fill="currentColor"/></svg>',
    'deepseek-v3.2': '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><path d="M150 30c66 0 120 54 120 120s-54 120-120 120S30 216 30 150 84 30 150 30z" fill="currentColor"/></svg>',
    'qwen3-235b-a22b-instruct-2507': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    'llama-3.2-3b': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">L</text></svg>',
    'kimi-k2-5': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">V</text></svg>',
    'grok-41-fast': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'grok-4-20-beta': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'grok-4-20-multi-agent-beta': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'e2ee-gemma-3-27b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'e2ee-glm-4-7-flash-p': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'e2ee-glm-4-7-p': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'e2ee-glm-5': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'e2ee-gpt-oss-120b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'e2ee-gpt-oss-20b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">G</text></svg>',
    'e2ee-qwen-2-5-7b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    'e2ee-qwen3-30b-a3b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    'e2ee-qwen3-5-122b-a10b': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    'e2ee-qwen3-vl-30b-a3b-p': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    // Together AI Families
    'meta-llama': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">L</text></svg>',
    'mistralai': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">M</text></svg>',
    'qwen': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">Q</text></svg>',
    'deepseek-ai': '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><path d="M150 30c66 0 120 54 120 120s-54 120-120 120S30 216 30 150 84 30 150 30z" fill="currentColor"/></svg>',
    'together': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">T</text></svg>',
    // Manufacturer prefix keys — matched by prefix walk for any future model in the family
    'zai-org': '<svg viewBox="0 0 29.74 29.74" xmlns="http://www.w3.org/2000/svg"><path d="m15.47 7.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09c-.01.01 9.3.01 9.3.01zM24.3 7.1 13.14 22.91H5.7L16.86 7.1zM14.53 22.91l1.31-1.86c-.2-.29-.54-.47-.9-.47h7.09v2.33h-9.3z" fill="currentColor"/></svg>',
    'grok': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 4 L20 20 M20 4 L4 20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    'gemini': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13v6l5 3-1 1.73-6-3.73V7h2z" fill="currentColor"/></svg>',
    'kimi': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a7 7 0 0 1 0 14A7 7 0 0 1 12 2zm-4 9l4-5 4 5-4 5z" fill="currentColor"/></svg>',
    'aion-labs': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 L21 20 H3 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="7" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2"/></svg>',
    'deepseek': '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><path d="M150 30c66 0 120 54 120 120s-54 120-120 120S30 216 30 150 84 30 150 30z" fill="currentColor"/></svg>',
    'mistral': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">M</text></svg>',
    'llama': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="currentColor" font-weight="bold" font-family="sans-serif">L</text></svg>',
    'venice': '<svg viewBox="0 0 326 366" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M163 0L326 94v178l-163 94L0 272V94L163 0z" fill="currentColor"/></svg>',
    'ollama': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>'
};


export const CONTEXT_WINDOWS = {
    'zai-org-glm-5': 200000,
    'zai-org-glm-4.7': 200000,
    'zai-org-glm-4.7-flash': 200000,
    'deepseek-v3.2': 160000,
    'claude-sonnet-45': 200000,
    'venice-uncensored': 30000,
    'venice-uncensored-role-play': 30000,
    'olafangensan-glm-4.7-flash-heretic': 128000,
    'llama-3.2-3b': 128000,
    'kimi-k2-5': 262144,
    'grok-41-fast': 131072,
    'grok-4-20-beta': 131072,
    'grok-4-20-multi-agent-beta': 131072
};

export const DEFAULT_USER_AVATAR_IMAGE_PATH = '/images/default-avatar-2.png';

const DEFAULT_SYSTEM_PROMPT = "You are a helpful ai assistant";

export const defaultChatConfig = {
    character_name: 'Quick Chat',
    model: '',
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    character_card: '',
    system_context: '',
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 4096,
    enable_web_search: false,
    enable_web_scraping: true,
    include_venice_system_prompt: false,
    uncensored_mode: false,
    avatar_url: null,
    strip_thinking: true,
    strip_thinking_response: true
};

export function getDefaultChatConfig() {
    const useDefaultPrompt = localStorage.getItem('use_default_prompt') !== 'false';
    const customPrompt = localStorage.getItem('custom_system_prompt');
    const promptToUse = customPrompt !== null ? customPrompt : DEFAULT_SYSTEM_PROMPT;
    const uncensoredMode = localStorage.getItem('quickchat_uncensored') === 'true';
    const stripThinking = localStorage.getItem('quickchat_strip_thinking') !== 'false';
    const webSearch = localStorage.getItem('quickchat_web_search') === 'true';
    const webScraping = localStorage.getItem('quickchat_web_scraping') !== 'false';

    return {
        ...defaultChatConfig,
        system_prompt: useDefaultPrompt ? promptToUse : '',
        uncensored_mode: uncensoredMode,
        strip_thinking: stripThinking,
        enable_web_search: webSearch,
        enable_web_scraping: webScraping
    };
}

export function getDefaultSystemPrompt() {
    const customPrompt = localStorage.getItem('custom_system_prompt');
    return customPrompt !== null ? customPrompt : DEFAULT_SYSTEM_PROMPT;
}

export function setDefaultSystemPrompt(prompt) {
    localStorage.setItem('custom_system_prompt', prompt);
}

// DOM element references
export const dom = {};

export function resetChatState() {
    state.currentChatId = null;
    state.messages = [];
    state.isTemporaryChat = true;
    state.editingMessageIndex = null;
    state.keptMessages = new Set();
}

export function toggleKeepMessage(msgIndex, isKept) {
    if (isKept) {
        state.keptMessages.add(msgIndex);
    } else {
        state.keptMessages.delete(msgIndex);
    }

    // Update export button (will be set by main.js)
    if (typeof window.updateExportButton === 'function') {
        window.updateExportButton();
    }

    // Update the visual state of the message group
    const group = document.querySelector(`.message-group[data-index="${msgIndex}"]`);
    if (group) {
        group.classList.toggle('kept', isKept);
    }

    // Auto-save kept messages with chat
    console.log('[KeptMessages] Toggle called, chatId:', state.currentChatId, 'keptMessages:', Array.from(state.keptMessages));
    if (state.currentChatId) {
        // Pass keptMessages explicitly to avoid module cache issues with  imports
        const keptArray = Array.from(state.keptMessages);
        import('./api.js').then(api => {
            console.log('[KeptMessages] Calling saveChatApi with:', keptArray);
            api.saveChatApi(state.currentChatId, state.messages, state.currentConfig, state.currentParentConfig, null, keptArray)
                .then(() => console.log('[KeptMessages] Save successful'))
                .catch(err => console.error('[KeptMessages] Save failed:', err));
        });
    } else {
        console.log('[KeptMessages] No currentChatId, skipping save');
    }
}

// Prompt history management
const MAX_PROMPT_HISTORY = 10;

export function loadPromptHistory() {
    try {
        const saved = localStorage.getItem('promptHistory');
        state.promptHistory = saved ? JSON.parse(saved) : [];
    } catch {
        state.promptHistory = [];
    }
}

export function addToPromptHistory(prompt) {

    if (!prompt || !prompt.trim()) return;



    // Always reset navigation state on submission

    state.promptHistoryIndex = -1;

    state.promptDraft = '';



    // Don't add duplicates of the most recent prompt

    if (state.promptHistory[0] === prompt) return;



    // Add to front, limit to MAX_PROMPT_HISTORY

    state.promptHistory.unshift(prompt);

    if (state.promptHistory.length > MAX_PROMPT_HISTORY) {

        state.promptHistory.pop();

    }



    // Save to localStorage

    localStorage.setItem('promptHistory', JSON.stringify(state.promptHistory));

}
