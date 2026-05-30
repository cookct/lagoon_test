/**
 * Mobile Chat Entry Point
 * Initializes and manages the mobile chat interface
 */

import { MobileHeader } from './components/MobileHeader.js';
import { MobileChat } from './components/MobileChat.js';
import { MobileInput } from './components/MobileInput.js';
import { MobileMenu } from './components/MobileMenu.js';
import { streamChat } from './api.js';
import { state, getDefaultChatConfig } from './state.js';
import { mobileStorage } from './services/MobileStorage.js';
import { audioService } from './services/AudioService.js';
import { initInstalledModels, getDefaultModel } from './core/InstalledModels.js';

class MobileChatApp {
  constructor() {
    console.log('MobileChatApp constructor called');
    this.container = null;
    this.header = null;
    this.chat = null;
    this.input = null;
    this.menu = null;
    this.isActive = false;
    
    // Ensure we have a default config
    if (!state.currentConfig || !state.currentConfig.model) {
      state.currentConfig = getDefaultChatConfig();
    }
  }

  async init() {
    console.log('MobileChatApp.init() called');

    // Ensure SSOT is loaded before any component renders a model dropdown
    await initInstalledModels();

    // Create container regardless of viewport (we'll show/hide via CSS)
    this.container = document.createElement('div');
    this.container.className = 'mobile-chat-container';
    document.body.appendChild(this.container);
    console.log('Mobile container created and added to DOM');

    // Initialize components
    this.header = new MobileHeader(this.container, {
      onMenuClick: () => this.openMenu(),
      onNewChat: () => this.handleNewChat(),
      onModelChange: (modelId) => this.handleModelChange(modelId)
    });
    console.log('MobileHeader created');

    // Set initial config from localStorage
    const savedModel = localStorage.getItem('mobile_chat_model') || getDefaultModel();
    const savedVenicePrompt = localStorage.getItem('mobile_venice_prompt') !== 'false'; // default true
    const savedWebSearch = localStorage.getItem('mobile_web_search') === 'true'; // default false

    if (!state.currentConfig) state.currentConfig = {};
    state.currentConfig.model = savedModel;
    state.currentConfig.include_venice_system_prompt = savedVenicePrompt;
    state.currentConfig.enable_web_search = savedWebSearch;

    this.chat = new MobileChat(this.container, {
      onRegenerate: (idx) => this.handleRegenerate(idx),
      onDeletePair: (idx) => this.handleDeletePair(idx)
    });
    console.log('MobileChat created');

    this.input = new MobileInput(this.container, {
      onSend: (text) => this.handleSend(text),
      onVoiceResponse: (text, isComplete) => this.handleVoiceResponse(text, isComplete),
      onVoiceStart: () => this.handleVoiceStart(),
      onVoiceEnd: () => this.handleVoiceEnd()
    });
    console.log('MobileInput created');

    this.menu = new MobileMenu(this.container, {
      onClose: () => this.closeMenu()
    });
    console.log('MobileMenu created');

    // Render all components
    console.log('Rendering mobile components...');
    this.header.render();
    console.log('MobileHeader rendered');
    this.chat.render();
    console.log('MobileChat rendered');
    this.input.render();
    console.log('MobileInput rendered');
    this.menu.render();
    console.log('MobileMenu rendered');

    // Load saved chat from storage
    this.loadFromLocal();

    // Check initial viewport
    if (this.isMobileViewport()) {
      this.activate();
    }

    // Handle resize
    window.addEventListener('resize', () => this.handleResize());

    return true;
  }

  isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches ||
           window.matchMedia('(pointer: coarse)').matches;
  }

  isBackendChat() {
    return state.currentChatId && state.currentChatId.endsWith('.json');
  }

  async saveChat() {
    if (!state.currentChatId) {
      state.currentChatId = mobileStorage.createNewChat();
    }

    if (this.isBackendChat()) {
      // Save to backend so desktop and other devices see the updates
      try {
        const { saveChatApi } = await import('./api.js');
        await saveChatApi(
          state.currentChatId,
          state.messages,
          state.currentConfig,
          state.currentParentConfig || null,
          null
        );
      } catch (e) {
        console.error('[Mobile] Failed to save chat to backend:', e);
        // Fall back to local so messages aren't lost
        mobileStorage.saveChat(state.currentChatId, state.messages, state.currentConfig);
      }
    } else {
      mobileStorage.saveChat(state.currentChatId, state.messages, state.currentConfig);
    }
  }

  loadFromLocal() {
    const currentId = mobileStorage.getCurrentChatId();
    if (currentId) {
      this.loadChat(currentId);
    }
  }

  loadChat(chatId) {
    const chats = mobileStorage.getChats();
    const chat = chats.find(c => c.id === chatId);
    
    if (chat) {
      audioService.stop();
      state.currentChatId = chat.id;
      state.messages = chat.messages || [];
      state.currentConfig = chat.config || {};
      mobileStorage.setCurrentChatId(chat.id);
      
      this.chat.clear();
      if (state.messages.length > 0) {
        state.messages.forEach(msg => {
          if (msg.role !== 'system') {
            this.chat.addMessage(msg.content, msg.role === 'user');
          }
        });
        // Restore model from chat config, fall back to header selection
        if (chat.config?.model) {
          this.header.setModel(chat.config.model);
          state.currentConfig.model = chat.config.model;
        } else {
          state.currentConfig.model = this.header.getSelectedModel();
        }
      } else {
        this.chat.reset();
      }
    }
  }

  async loadChatFromBackend(chatId) {
    try {
      const { fetchChat } = await import('./api.js');
      const chatData = await fetchChat(chatId);

      audioService.stop();
      state.currentChatId = chatId;
      state.messages = chatData.messages || [];
      state.currentConfig = chatData.config || {};
      state.currentParentConfig = chatData.parent_config || null;

      // Overlay live character definition fields
      if (state.currentParentConfig) {
        try {
          const { fetchConfig } = await import('./api.js');
          const liveConfig = await fetchConfig(state.currentParentConfig);
          if (liveConfig) {
            const liveFields = [
              'system_prompt', 'system_context', 'character_card',
              'context_mode',
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
        } catch (e) { /* ignore */ }
      }

      this.chat.clear();
      if (state.messages.length > 0) {
        state.messages.forEach(msg => {
          if (msg.role !== 'system') {
            this.chat.addMessage(msg.content, msg.role === 'user');
          }
        });
        if (chatData.config?.model) {
          this.header.setModel(chatData.config.model);
          state.currentConfig.model = chatData.config.model;
        } else {
          state.currentConfig.model = this.header.getSelectedModel();
        }
      } else {
        this.chat.reset();
      }
    } catch (e) {
      console.error('[Mobile] Failed to load chat from backend:', e);
    }
  }

  handleNewChat() {
    audioService.unlock();
    audioService.stop();
    state.currentChatId = mobileStorage.createNewChat();
    state.messages = [];
    state.currentConfig = { model: this.header.getSelectedModel() };
    this.chat.reset();
  }

  handleModelChange(modelId) {
    console.log('Model changed to:', modelId);
    if (!state.currentConfig) state.currentConfig = {};
    state.currentConfig.model = modelId;
    // Save to current chat if exists
    if (state.currentChatId) {
      this.saveChat();
    }
  }

  async handleRegenerate(uiIndex) {
    audioService.unlock();
    console.log('Regenerating for UI index:', uiIndex);
    // Map UI index to state index (UI skips system messages)
    const stateIndex = this.mapUiIndexToStateIndex(uiIndex);
    if (stateIndex === -1) return;

    // Find the previous user message
    let userStateIndex = stateIndex - 1;
    while (userStateIndex >= 0 && state.messages[userStateIndex].role !== 'user') {
      userStateIndex--;
    }

    if (userStateIndex < 0) return;

    const userMessage = state.messages[userStateIndex].content;
    
    // Remove all messages from state from this user message onwards
    state.messages = state.messages.slice(0, userStateIndex);
    
    // Refresh UI
    this.refreshChatFromState();
    
    // Trigger send again, but skip UI adding since we want a clean state
    await this.handleSend(userMessage, true);
  }

  async handleDeletePair(uiIndex) {
    audioService.unlock();
    console.log('Deleting pair for UI index:', uiIndex);
    const stateIndex = this.mapUiIndexToStateIndex(uiIndex);
    if (stateIndex === -1) return;

    // Find the previous user message
    let userStateIndex = stateIndex - 1;
    while (userStateIndex >= 0 && state.messages[userStateIndex].role !== 'user') {
      userStateIndex--;
    }

    if (userStateIndex >= 0) {
      // Delete pair
      state.messages.splice(userStateIndex, stateIndex - userStateIndex + 1);
    } else {
      // Just delete the assistant message
      state.messages.splice(stateIndex, 1);
    }

    // Refresh UI and save
    this.refreshChatFromState();
    this.saveChat();
  }

  mapUiIndexToStateIndex(uiIndex) {
    let currentUiIndex = 0;
    for (let i = 0; i < state.messages.length; i++) {
      if (state.messages[i].role !== 'system') {
        if (currentUiIndex === uiIndex) return i;
        currentUiIndex++;
      }
    }
    return -1;
  }

  refreshChatFromState() {
    this.chat.clear();
    state.messages.forEach(msg => {
      if (msg.role !== 'system') {
        this.chat.addMessage(msg.content, msg.role === 'user');
      }
    });
    // If empty, reset to show "Start a conversation"
    if (state.messages.filter(m => m.role !== 'system').length === 0) {
      this.chat.reset();
    }
  }

  activate() {
    this.isActive = true;
    this.container.classList.add('active');
    document.body.classList.add('mobile-active');
  }

  deactivate() {
    this.isActive = false;
    this.container.classList.remove('active');
    document.body.classList.remove('mobile-active');
  }

  handleResize() {
    const isMobile = this.isMobileViewport();
    
    if (isMobile && !this.isActive) {
      this.activate();
    } else if (!isMobile && this.isActive) {
      this.deactivate();
    }
  }

  openMenu() {
    if (this.menu) {
      this.menu.open();
    }
  }

  closeMenu() {
    if (this.menu) {
      this.menu.close();
    }
  }

  // Voice mode handlers
  handleVoiceStart() {
    console.log('Voice session started');
  }

  handleVoiceResponse(text, isComplete) {
    // Not saving voice transcripts for now
  }

  handleVoiceEnd() {
    console.log('Voice session ended');
  }

  async handleSend(text, isRegenerating = false) {
    // Unlock audio context on user gesture
    audioService.unlock();

    // Stop any current audio
    audioService.stop();

    if (!isRegenerating) {
      // Add user message to UI
      this.chat.addMessage(text, true);
    }
    
    // Ensure model is set — fall back to header selection if chat config lacks it
    if (!state.currentConfig) state.currentConfig = {};
    if (!state.currentConfig.model) {
      state.currentConfig.model = this.header.getSelectedModel();
    }
    if (!state.currentConfig.model) {
      this.chat.addMessage('Error: No model selected. Please configure your chat settings.', false);
      return;
    }
    
    try {
      // Add user message to state
      if (!state.messages) state.messages = [];
      
      // Inject system prompt if this is a new conversation
      if (state.messages.length === 0 && state.currentConfig.system_prompt) {
        state.messages.push({ role: 'system', content: state.currentConfig.system_prompt });
      }
      
      state.messages.push({ role: 'user', content: text });
      
      // Create assistant message placeholder
      const assistantMessage = { role: 'assistant', content: '' };
      state.messages.push(assistantMessage);
      const msgIndex = state.messages.length - 1;
      
      // Save state with user message and placeholder
      this.saveChat();
      
      // Add assistant message to UI for streaming
      console.log('Creating streaming message placeholder');
      const streamingMessage = this.chat.addMessage('...', false, true);
      console.log('Streaming message created:', streamingMessage);
      
      // Prepare message history
      const historyToSend = state.messages.slice(0, -1);
      
      // Stream response from API
      const response = await streamChat(
        state.currentChatId,
        historyToSend,
        state.currentConfig,
        state.currentParentConfig,
        null, // signal
        {},   // sessionOverrides
        null  // image
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unknown API error');
      }
      
      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let isNewChat = !state.currentChatId;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              console.log('Parsed streaming data:', JSON.stringify(parsed));
              
              if (parsed.chat_id && isNewChat) {
                state.currentChatId = parsed.chat_id;
                isNewChat = false;
              }
              
              if (parsed.content !== undefined) {
                console.log('Content field found:', JSON.stringify(parsed.content));
                fullContent += parsed.content;
                console.log('Streaming content update, fullContent now:', JSON.stringify(fullContent));
                
                // For streaming, we want to show the content immediately if it's valid
                if (fullContent && fullContent.trim().length > 0) {
                  console.log('Updating UI with streaming content');
                  this.chat.updateLastMessage(fullContent);
                  
                } else {
                  console.log('Streaming content empty, keeping current display');
                }
              }
              
            } catch (e) {
              console.error('Failed to parse streaming data:', e);
            }
          }
        }
      }
      
      // Update final message in state
      console.log('Final content before update:', JSON.stringify(fullContent));
      
      // Ensure we have the complete final content
      let finalContent;
      if (fullContent && fullContent.trim().length > 0) {
        finalContent = fullContent;
      } else {
        finalContent = 'No response received';
        console.log('Using fallback content');
      }
      
      state.messages[msgIndex].content = finalContent;
      console.log('Updating with final content:', JSON.stringify(finalContent));
      this.chat.updateLastMessage(finalContent);
      
      // Save updated chat to local storage
      this.saveChat();
      
      // Auto-read if enabled
      if (audioService.isAutoReadEnabled() && finalContent && finalContent !== 'No response received') {
        const ttsBtn = this.chat.getLastAssistantTtsBtn();
        audioService.setActiveButton(ttsBtn);
        audioService.speak(finalContent);
      }
      
    } catch (error) {
      console.error('Mobile chat error:', error);
      this.chat.updateLastMessage(`Error: ${error.message}`);
    }
  }

  destroy() {
    this.deactivate();
    
    if (this.header) {
      this.header.destroy();
      this.header = null;
    }
    
    if (this.chat) {
      this.chat.destroy();
      this.chat = null;
    }
    
    if (this.input) {
      this.input.destroy();
      this.input = null;
    }
    
    if (this.menu) {
      this.menu.destroy();
      this.menu = null;
    }
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

// Initialize when DOM is ready
let mobileApp = null;

async function initMobile() {
  // Always init the app so it can handle resize events
  mobileApp = new MobileChatApp();
  const result = await mobileApp.init();
  console.log('Mobile app init result:', result);
  // Make it globally accessible for debugging
  window.mobileApp = mobileApp;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobile);
} else {
  initMobile();
}

// Export for manual control
export { MobileChatApp, mobileApp };
