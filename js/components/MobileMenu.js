/**
 * Mobile Menu Drawer Component
 * Slide-in menu from the left
 */

export class MobileMenu {
  constructor(container, options = {}) {
    this.container = container;
    this.onClose = options.onClose || (() => {});
    this.element = null;
    this.overlay = null;
    this.drawer = null;
    this.isOpen = false;
  }

  render() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'mobile-menu-overlay';
    
    // Create drawer
    this.drawer = document.createElement('div');
    this.drawer.className = 'mobile-menu-drawer';
    
    // Header
    const header = document.createElement('div');
    header.className = 'mobile-menu-header';
    
    const title = document.createElement('h2');
    title.className = 'mobile-menu-title';
    title.textContent = 'Menu';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mobile-menu-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Content
    this.content = document.createElement('div');
    this.content.className = 'mobile-menu-content';
    
    // Create Tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'mobile-menu-tabs';
    
    const chatsTab = document.createElement('button');
    chatsTab.className = 'mobile-menu-tab';
    chatsTab.dataset.tab = 'chats';
    chatsTab.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>Chats</span>
    `;

    const settingsTab = document.createElement('button');
    settingsTab.className = 'mobile-menu-tab active';
    settingsTab.dataset.tab = 'settings';
    settingsTab.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span>Settings</span>
    `;
    
    tabsContainer.appendChild(chatsTab);
    tabsContainer.appendChild(settingsTab);
    
    // Panel Containers
    const chatsPanel = document.createElement('div');
    chatsPanel.className = 'mobile-menu-panel';
    chatsPanel.id = 'mobile-panel-chats';

    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'mobile-menu-panel active';
    settingsPanel.id = 'mobile-panel-settings';
    
    // Chats Panel Content
    const chatListContainer = document.createElement('div');
    chatListContainer.className = 'mobile-chat-list';
    chatsPanel.appendChild(chatListContainer);
    
    // Settings Panel Content - collapsible sections
    settingsPanel.innerHTML = `
      <div class="mobile-menu-section collapsible">
        <h3 class="section-header collapsed">Chat Settings <span class="collapse-icon">▶</span></h3>
        <div class="section-content" style="display: none;">
          <label class="mobile-field-label">System Prompt</label>
          <textarea class="mobile-system-prompt-textarea" placeholder="Enter system prompt..."></textarea>
          <button class="mobile-save-prompt-btn">Save Prompt</button>
          <div class="mobile-prompt-status"></div>

          <div class="mobile-settings-divider"></div>

          <label class="mobile-toggle-item">
            <span>Venice System Prompt</span>
            <div class="mobile-toggle-switch">
              <input type="checkbox" id="mobile-toggle-venice-prompt">
              <span class="mobile-toggle-slider"></span>
            </div>
          </label>
          <label class="mobile-toggle-item">
            <span>Web Search</span>
            <div class="mobile-toggle-switch">
              <input type="checkbox" id="mobile-toggle-web-search">
              <span class="mobile-toggle-slider"></span>
            </div>
          </label>

          <div class="mobile-settings-divider"></div>

          <label class="mobile-toggle-item">
            <span>Auto-read responses</span>
            <div class="mobile-toggle-switch">
              <input type="checkbox" id="mobile-toggle-auto-read">
              <span class="mobile-toggle-slider"></span>
            </div>
          </label>
          <div class="mobile-voice-selection">
            <label for="mobile-provider-select">TTS Provider</label>
            <select id="mobile-provider-select" class="mobile-select-input">
              <option value="venice">Venice AI (Fast)</option>
              <option value="google">Google Cloud (Premium)</option>
            </select>
          </div>
          <div class="mobile-voice-selection">
            <label for="mobile-voice-select">TTS Voice</label>
            <div class="mobile-voice-row">
              <select id="mobile-voice-select" class="mobile-select-input"></select>
              <button id="mobile-test-voice-btn" class="mobile-action-btn" title="Test Voice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="mobile-menu-section collapsible">
        <h3 class="section-header collapsed">Gemini Live <span class="collapse-icon">▶</span></h3>
        <div class="section-content" style="display: none;">
          <label class="mobile-toggle-item">
            <span>Enable Voice Mode</span>
            <div class="mobile-toggle-switch">
              <input type="checkbox" id="mobile-toggle-gemini-live">
              <span class="mobile-toggle-slider"></span>
            </div>
          </label>
          <div class="mobile-voice-selection">
            <label for="mobile-gemini-voice-select">AI Voice</label>
            <select id="mobile-gemini-voice-select" class="mobile-select-input">
              <option value="Aoede">Aoede (Bright)</option>
              <option value="Charon">Charon (Informative)</option>
              <option value="Fenrir">Fenrir (Excitable)</option>
              <option value="Kore">Kore (Firm)</option>
              <option value="Leda">Leda</option>
              <option value="Orus">Orus</option>
              <option value="Puck">Puck (Upbeat)</option>
              <option value="Zephyr">Zephyr</option>
            </select>
          </div>
          <div class="mobile-voice-selection">
            <label for="mobile-gemini-system-prompt">System Prompt</label>
            <textarea id="mobile-gemini-system-prompt" class="mobile-system-prompt-textarea" placeholder="Enter Gemini Live system prompt..."></textarea>
            <button class="mobile-save-gemini-prompt-btn">Save</button>
            <div class="mobile-gemini-prompt-status"></div>
          </div>
        </div>
      </div>
    `;

    // Add collapsible toggle behavior
    settingsPanel.querySelectorAll('.section-header').forEach(header => {
      header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.collapse-icon');
        const isCollapsed = header.classList.contains('collapsed');

        if (isCollapsed) {
          header.classList.remove('collapsed');
          content.style.display = 'block';
          icon.textContent = '▼';
        } else {
          header.classList.add('collapsed');
          content.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });
    
    this.content.appendChild(tabsContainer);
    this.content.appendChild(chatsPanel);
    this.content.appendChild(settingsPanel);
    
    // Tab switching logic
    [chatsTab, settingsTab].forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        [chatsTab, settingsTab].forEach(t => t.classList.toggle('active', t === btn));
        chatsPanel.classList.toggle('active', tab === 'chats');
        settingsPanel.classList.toggle('active', tab === 'settings');
        if (tab === 'chats') this.renderChatList();
      });
    });
    
    // Add system prompt functionality
    const textarea = settingsPanel.querySelector('.mobile-system-prompt-textarea');
    const saveBtn = settingsPanel.querySelector('.mobile-save-prompt-btn');
    const statusDiv = settingsPanel.querySelector('.mobile-prompt-status');
    const venicePromptToggle = settingsPanel.querySelector('#mobile-toggle-venice-prompt');
    const webSearchToggle = settingsPanel.querySelector('#mobile-toggle-web-search');
    const autoReadToggle = settingsPanel.querySelector('#mobile-toggle-auto-read');
    const providerSelect = settingsPanel.querySelector('#mobile-provider-select');
    const voiceSelect = settingsPanel.querySelector('#mobile-voice-select');
    const testVoiceBtn = settingsPanel.querySelector('#mobile-test-voice-btn');

    // Gemini Live settings
    const geminiLiveToggle = settingsPanel.querySelector('#mobile-toggle-gemini-live');
    const geminiVoiceSelect = settingsPanel.querySelector('#mobile-gemini-voice-select');
    const geminiSystemPrompt = settingsPanel.querySelector('#mobile-gemini-system-prompt');
    const saveGeminiPromptBtn = settingsPanel.querySelector('.mobile-save-gemini-prompt-btn');
    const geminiPromptStatus = settingsPanel.querySelector('.mobile-gemini-prompt-status');

    // Load saved Gemini Live state (OFF by default)
    const savedGeminiLive = localStorage.getItem('gemini_live_enabled');
    geminiLiveToggle.checked = savedGeminiLive === 'true';
    console.log('[Settings] Gemini Live loaded:', savedGeminiLive, '-> checked:', geminiLiveToggle.checked);

    geminiLiveToggle.addEventListener('change', () => {
      const value = geminiLiveToggle.checked ? 'true' : 'false';
      localStorage.setItem('gemini_live_enabled', value);
      console.log('[Settings] Gemini Live saved:', value);
      // Notify the app of the change
      window.dispatchEvent(new CustomEvent('geminiLiveToggle', { detail: geminiLiveToggle.checked }));
    });

    // Load saved Gemini voice
    const savedGeminiVoice = localStorage.getItem('gemini_live_voice') || 'Aoede';
    geminiVoiceSelect.value = savedGeminiVoice;

    geminiVoiceSelect.addEventListener('change', () => {
      localStorage.setItem('gemini_live_voice', geminiVoiceSelect.value);
    });

    // Load saved Gemini Live system prompt
    const savedGeminiPrompt = localStorage.getItem('gemini_live_system_prompt') || '';
    geminiSystemPrompt.value = savedGeminiPrompt;

    // Auto-resize Gemini textarea
    geminiSystemPrompt.addEventListener('input', () => {
      geminiSystemPrompt.style.height = 'auto';
      geminiSystemPrompt.style.height = geminiSystemPrompt.scrollHeight + 'px';
    });

    // Save Gemini Live system prompt
    saveGeminiPromptBtn.addEventListener('click', () => {
      localStorage.setItem('gemini_live_system_prompt', geminiSystemPrompt.value);
      geminiPromptStatus.textContent = '✅ Saved';
      setTimeout(() => geminiPromptStatus.textContent = '', 2000);
    });

    // Venice Prompt toggle
    const savedVenicePrompt = localStorage.getItem('mobile_venice_prompt') !== 'false'; // default true
    venicePromptToggle.checked = savedVenicePrompt;

    venicePromptToggle.addEventListener('change', () => {
      localStorage.setItem('mobile_venice_prompt', venicePromptToggle.checked);
      // Update current config
      import('../state.js').then(module => {
        if (module.state.currentConfig) {
          module.state.currentConfig.include_venice_system_prompt = venicePromptToggle.checked;
        }
      });
    });

    // Web Search toggle
    const savedWebSearch = localStorage.getItem('mobile_web_search') === 'true'; // default false
    webSearchToggle.checked = savedWebSearch;

    webSearchToggle.addEventListener('change', () => {
      localStorage.setItem('mobile_web_search', webSearchToggle.checked);
      // Update current config
      import('../state.js').then(module => {
        if (module.state.currentConfig) {
          module.state.currentConfig.enable_web_search = webSearchToggle.checked;
        }
      });
    });

    // Voice population helper
    const updateVoiceList = async (provider) => {
      const { VENICE_VOICES, GOOGLE_VOICES, DEFAULT_VOICE, DEFAULT_GOOGLE_VOICE } = await import('../core/TTSConfig.js');
      voiceSelect.innerHTML = '';
      const voices = provider === 'google' ? GOOGLE_VOICES : VENICE_VOICES;
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        voiceSelect.appendChild(option);
      });
      
      const audioModule = await import('../services/AudioService.js');
      const savedVoice = localStorage.getItem('mobile_tts_voice');
      const defaultForProvider = provider === 'google' ? DEFAULT_GOOGLE_VOICE : DEFAULT_VOICE;
      
      // Ensure current voice is valid for provider, else use default
      if (savedVoice && voices.some(v => v.id === savedVoice)) {
        voiceSelect.value = savedVoice;
      } else {
        voiceSelect.value = defaultForProvider;
        audioModule.audioService.setVoice(defaultForProvider);
      }
    };

    // Load initial state
    import('../state.js').then(module => {
      textarea.value = module.getDefaultSystemPrompt();
      if (module.state.currentParentConfig) {
        textarea.disabled = true;
        saveBtn.disabled = true;
      }
    });

    import('../services/AudioService.js').then(async (audioModule) => {
      const currentProvider = audioModule.audioService.currentProvider;
      autoReadToggle.checked = audioModule.audioService.isAutoReadEnabled();
      providerSelect.value = currentProvider;
      await updateVoiceList(currentProvider);
    });

    providerSelect.addEventListener('change', async () => {
      const audioModule = await import('../services/AudioService.js');
      audioModule.audioService.setProvider(providerSelect.value);
      await updateVoiceList(providerSelect.value);
    });

    autoReadToggle.addEventListener('change', () => {
      import('../services/AudioService.js').then(module => {
        module.audioService.setAutoRead(autoReadToggle.checked);
      });
    });

    voiceSelect.addEventListener('change', () => {
      import('../services/AudioService.js').then(module => {
        module.audioService.setVoice(voiceSelect.value);
      });
    });

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
    // Initial size
    setTimeout(() => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }, 100);

    testVoiceBtn.addEventListener('click', () => {
      import('../services/AudioService.js').then(module => {
        module.audioService.unlock();
        module.audioService.speak("This is a test of the audio system.");
      });
    });

    // Save functionality
    saveBtn.addEventListener('click', () => {
      import('../state.js').then(module => {
        try {
          module.setDefaultSystemPrompt(textarea.value);
          
          // Dynamically update active configuration for the current session
          if (module.state.currentConfig) {
            module.state.currentConfig.system_prompt = textarea.value;
          }
          
          // If this is a fresh conversation, update the active system message in state
          if (module.state.messages) {
            const systemIndex = module.state.messages.findIndex(m => m.role === 'system');
            if (systemIndex > -1) {
              module.state.messages[systemIndex].content = textarea.value;
            } else if (module.state.messages.length === 0 && textarea.value.trim()) {
              module.state.messages.push({ role: 'system', content: textarea.value });
            }
          }
          
          statusDiv.textContent = '✅ Saved';
          setTimeout(() => statusDiv.textContent = '', 2000);
        } catch (error) {
          statusDiv.textContent = '❌ Error';
        }
      });
    });
    
    this.drawer.appendChild(header);
    this.drawer.appendChild(this.content);
    
    this.container.appendChild(this.overlay);
    this.container.appendChild(this.drawer);
    
    // Touch handling for swipe to close
    this.setupSwipeHandling();
    
    return { overlay: this.overlay, drawer: this.drawer };
  }

  async renderChatList() {
    const list = this.content.querySelector('.mobile-chat-list');
    if (!list) return;

    list.innerHTML = '<div class="mobile-menu-placeholder">Loading...</div>';

    try {
      const { fetchChats, fetchConfigs, fetchConfig, deleteChatApi } = await import('../api.js');
      const { state } = await import('../state.js');

      const [chats, configFiles] = await Promise.all([fetchChats(), fetchConfigs()]);

      // Fetch all character configs in parallel
      const configDetails = {};
      await Promise.all(configFiles.map(async (filename) => {
        const config = await fetchConfig(filename);
        if (config) configDetails[filename] = config;
      }));

      // Group chats by parent_config
      const grouped = {};
      const uncategorized = [];
      for (const chat of chats) {
        if (chat.parent_config && configDetails[chat.parent_config]) {
          if (!grouped[chat.parent_config]) grouped[chat.parent_config] = [];
          grouped[chat.parent_config].push(chat);
        } else {
          uncategorized.push(chat);
        }
      }

      const currentId = state.currentChatId;
      list.innerHTML = '';

      // New Chat button
      const newBtn = document.createElement('button');
      newBtn.className = 'mobile-new-chat-btn';
      newBtn.textContent = '+ New Chat';
      newBtn.addEventListener('click', () => {
        window.mobileApp.handleNewChat();
        this.close();
      });
      list.appendChild(newBtn);

      // Character groups
      for (const [configFile, charChats] of Object.entries(grouped)) {
        const charConfig = configDetails[configFile];
        const charName = charConfig.character_name || configFile.replace('.json', '');
        list.appendChild(this._buildCharGroup(charName, charConfig.avatar_url, charChats, currentId, deleteChatApi));
      }

      // Other chats section
      if (uncategorized.length > 0) {
        if (Object.keys(grouped).length > 0) {
          const label = document.createElement('div');
          label.className = 'mobile-char-group-label';
          label.textContent = 'Other Chats';
          list.appendChild(label);
        }
        for (const chat of uncategorized) {
          list.appendChild(this._buildChatItem(chat, currentId, deleteChatApi));
        }
      }

      if (chats.length === 0) {
        list.innerHTML = '';
        list.appendChild(newBtn);
        const placeholder = document.createElement('div');
        placeholder.className = 'mobile-menu-placeholder';
        placeholder.textContent = 'No saved chats';
        list.appendChild(placeholder);
      }

    } catch (e) {
      console.error('[MobileMenu] Failed to load chats:', e);
      list.innerHTML = '<div class="mobile-menu-placeholder">Failed to load chats</div>';
    }
  }

  _buildCharGroup(charName, avatarUrl, charChats, currentId, deleteChatApi) {
    const groupEl = document.createElement('div');
    groupEl.className = 'mobile-char-group';

    const header = document.createElement('div');
    header.className = 'mobile-char-group-header';

    if (avatarUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'mobile-char-avatar';
      avatar.src = avatarUrl;
      avatar.onerror = () => avatar.style.display = 'none';
      header.appendChild(avatar);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'mobile-char-avatar-placeholder';
      placeholder.textContent = charName[0]?.toUpperCase() || '?';
      header.appendChild(placeholder);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'mobile-char-name';
    nameEl.textContent = charName;
    header.appendChild(nameEl);

    const countEl = document.createElement('span');
    countEl.className = 'mobile-char-count';
    countEl.textContent = charChats.length;
    header.appendChild(countEl);

    const arrow = document.createElement('span');
    arrow.className = 'mobile-char-arrow';
    arrow.textContent = '▶';
    header.appendChild(arrow);

    const chatList = document.createElement('div');
    chatList.className = 'mobile-char-chat-list collapsed';
    for (const chat of charChats) {
      chatList.appendChild(this._buildChatItem(chat, currentId, deleteChatApi, true));
    }

    header.addEventListener('click', () => {
      const collapsed = chatList.classList.toggle('collapsed');
      arrow.textContent = collapsed ? '▶' : '▼';
    });

    groupEl.appendChild(header);
    groupEl.appendChild(chatList);
    return groupEl;
  }

  _buildChatItem(chat, currentId, deleteChatApi, nested = false) {
    const item = document.createElement('div');
    item.className = `mobile-chat-list-item${nested ? ' nested' : ''}${chat.id === currentId ? ' active' : ''}`;

    const title = document.createElement('div');
    title.className = 'mobile-chat-item-title';
    title.textContent = chat.display_name || 'Untitled Chat';

    const date = document.createElement('div');
    date.className = 'mobile-chat-item-date';
    date.textContent = chat.modified ? new Date(chat.modified * 1000).toLocaleDateString() : '';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mobile-chat-item-delete';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteChatApi(chat.id);
      await this.renderChatList();
    });

    item.appendChild(title);
    item.appendChild(date);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => {
      window.mobileApp.loadChatFromBackend(chat.id);
      this.close();
    });

    return item;
  }

  open() {
    if (!this.overlay || !this.drawer) return;
    this.renderChatList(); // Refresh list on open
    this.isOpen = true;
    this.overlay.classList.add('active');
    this.drawer.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (!this.overlay || !this.drawer) return;
    this.isOpen = false;
    this.overlay.classList.remove('active');
    this.drawer.classList.remove('active');
    document.body.style.overflow = '';
    this.onClose();
  }

  setupSwipeHandling() {
    let startX = 0;
    let currentX = 0;
    
    this.drawer.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });
    
    this.drawer.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      
      if (diff > 0) {
        // Swiping right
        this.drawer.style.transform = `translateX(${diff}px)`;
      }
    }, { passive: true });
    
    this.drawer.addEventListener('touchend', () => {
      const diff = currentX - startX;
      this.drawer.style.transform = '';
      
      if (diff > 100) {
        this.close();
      }
    });
  }

  destroy() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this.drawer && this.drawer.parentNode) {
      this.drawer.parentNode.removeChild(this.drawer);
    }
    this.overlay = null;
    this.drawer = null;
  }
}
