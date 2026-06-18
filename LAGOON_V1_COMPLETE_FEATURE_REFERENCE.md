# Lagoon V1 - Complete Feature Reference

## Table of Contents
1. [Application Overview](#application-overview)
2. [Character Creation System](#character-creation-system)
3. [Chat System](#chat-system)
4. [Quick Action Buttons](#quick-action-buttons)
5. [Context Management](#context-management)
6. [Anchors/Lore System](#anchorslore-system)
7. [Image Generation](#image-generation)
8. [Video Generation](#video-generation)
9. [Design Mode](#design-mode)
10. [Mobile Interface](#mobile-interface)
11. [Settings & Configuration](#settings--configuration)
12. [Backend Services](#backend-services)
13. [API Endpoints](#api-endpoints)
14. [Data Structures](#data-structures)

---

## Application Overview

Lagoon V1 is a sophisticated AI chat application built with:
- **Backend**: Python/Flask with SocketIO for real-time features
- **Frontend**: Vanilla JavaScript with ES6 modules
- **Architecture**: Component-based with centralized state management

### Core Capabilities
- Multi-provider AI chat (Venice, OpenAI, Anthropic, Google, Together, Ollama, custom endpoints)
- End-to-end encryption for privacy-focused models
- RAG (Retrieval-Augmented Generation) memory for long conversations
- Anchors/Lore system for character consistency
- Image generation with multiple models
- Video generation (Venice and Together.ai)
- Visual design customization via CSS editor
- Mobile-responsive interface

---

## Character Creation System

### Location
`js/components/ConfigManager.js` + `js/ui/settings.js`

### Character Config Structure
```json
{
    "character_name": "Character Name",
    "model": "zai-org-glm-5",
    "system_prompt": "You are...",
    "system_context": "Additional context...",
    "character_card": "User-defined instructions...",
    "intro_statement": "Hello!",
    "context_mode": "always",
    "author_note": "Author's note text",
    "author_note_depth": 4,
    "uncensored_mode": true,
    "strip_thinking": false,
    "style_overseer": null,
    "fiction_prompt_text": "",
    "include_venice_system_prompt": true,
    "shared_lore": ["OtherCharacter"],
    "lore_labels": [],
    "avatar": "data:image/png;base64,..."
}
```

### Character Creation Flow

#### 1. Create Button
Located in left sidebar. Opens the character creation modal.

#### 2. Modal Fields

**Basic Settings:**
| Field | Description | Location |
|-------|-------------|----------|
| `character_name` | Display name for the character | Text input |
| `model` | AI model selection | Dropdown with provider groups |
| `avatar` | Character avatar image | Upload button + preview |

**System Configuration:**
| Field | Description | Location |
|-------|-------------|----------|
| `system_prompt` | Main system instructions | Textarea |
| `system_context` | Additional context (always injected or RAG) | Textarea |
| `context_mode` | "always" or "rag" | Dropdown |
| `character_card` | User-defined instructions | Textarea |
| `intro_statement` | First message from character | Text input |

**Advanced Settings:**
| Field | Description | Location |
|-------|-------------|----------|
| `author_note` | Note injected at depth | Textarea |
| `author_note_depth` | Message depth for author note | Number input |
| `uncensored_mode` | Skip content filtering | Checkbox |
| `strip_thinking` | Remove thinking blocks | Checkbox |
| `style_overseer` | Style validation prompt | Textarea |
| `fiction_prompt_text` | Fiction mode prompt | Textarea |
| `include_venice_system_prompt` | Include Venice's system prompt | Checkbox |

**Lore Settings:**
| Field | Description | Location |
|-------|-------------|----------|
| `shared_lore` | Other characters' lore to include | Multi-select |
| `lore_labels` | Tags for lore organization | Tag input |

#### 3. Context File Attachment
- Upload PDFs, text files, or code files
- Files are parsed and embedded for RAG retrieval
- Stored in `configs/.ctx/{config_name}.json`

#### 4. Context Modes

**Always Mode:**
- Full context injected every message
- Higher token usage
- Simpler setup

**RAG Mode:**
- Context chunked and embedded
- Only relevant chunks retrieved
- Lower token usage
- Requires embedding step

#### 5. Save Process
```javascript
// ConfigManager.js - saveConfig()
async saveConfig() {
    const config = {
        character_name: this.dom.configName.value,
        model: this.dom.model.value,
        system_prompt: this.dom.systemPrompt.value,
        // ... all fields
    };
    
    // Upload avatar if changed
    if (avatarChanged) {
        const result = await uploadAvatarApi(avatarData);
        config.avatar = result.avatar_url;
    }
    
    // Save to backend
    await saveConfigApi(configName, config);
    
    // Embed context if in RAG mode
    if (config.context_mode === 'rag' && contextText) {
        await embedContextApi(configName, contextText);
    }
}
```

### Character Editing
- Click character name in sidebar to load
- All fields populate from saved config
- Changes tracked for dirty state warning

### Character Copy/Duplicate
```javascript
// Copy character with new name
async copyConfigApi(originalName, newName) {
    const original = await fetchConfig(originalName);
    original.character_name = newName;
    await saveConfigApi(newName, original);
}
```

### Character Deletion
- Confirmation dialog required
- Chats reparented to "Default" or deleted
- Lore file deleted if exists

---

## Chat System

### Location
`js/components/ChatManager.js` + `routes/chat.py`

### Chat Flow

#### 1. Message Construction
```javascript
// ChatManager.js - handleSendMessage()
async handleSendMessage(prompt, systemInjections) {
    // Build messages array
    const messages = [];
    
    // System message
    const systemContent = buildSystemMessage(config);
    messages.push({ role: 'system', content: systemContent });
    
    // Add RAG context if enabled
    if (config.context_mode === 'rag') {
        const ragChunks = await retrieveRagContext(chatId, prompt);
        messages.push({ role: 'system', content: ragChunks });
    }
    
    // Add lore/anchors
    const loreEntries = scanAndInject(messages, configName);
    messages.push(...loreEntries);
    
    // Add conversation history
    messages.push(...state.messages);
    
    // Add user message
    messages.push({ role: 'user', content: prompt });
}
```

#### 2. System Message Building
```python
# routes/chat.py - build_system_message()
def build_system_message(config):
    parts = []
    
    # Base system prompt
    if config.get('system_prompt'):
        parts.append(config['system_prompt'])
    
    # Character card (USER-DEFINED INSTRUCTIONS)
    if config.get('character_card'):
        parts.append(f"USER-DEFINED INSTRUCTIONS:\n{config['character_card']}")
    
    # System context
    if config.get('system_context') and config.get('context_mode') == 'always':
        parts.append(f"CONTEXT:\n{config['system_context']}")
    
    # Author note at depth
    if config.get('author_note'):
        parts.append(f"AUTHOR'S NOTE:\n{config['author_note']}")
    
    return '\n\n'.join(parts)
```

#### 3. Streaming Response
```javascript
// api.js - streamChat()
async function* streamChat(messages, config, callbacks) {
    const response = await fetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ messages, config, ... })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                    callbacks.onToken(data.content);
                }
            }
        }
    }
}
```

#### 4. Token Tracking
```javascript
// ChatManager.js - Cost tracking
VENICE_PRICING = {
    'zai-org-glm-5': { in: 1.00, out: 3.20 },
    'venice-uncensored': { in: 0.20, out: 0.90 },
    // ... more models
};

function updateCost(inputTokens, outputTokens, model) {
    const pricing = VENICE_PRICING[model];
    const cost = (inputTokens / 1_000_000 * pricing.in) + 
                 (outputTokens / 1_000_000 * pricing.out);
    sessionCost += cost;
    updateBalanceDisplay(sessionCost);
}
```

### Message Actions

#### User Message Actions
- **Edit**: Modify message content, triggers regeneration
- **Delete**: Remove message pair
- **Keep**: Mark message to survive summarization

#### Assistant Message Actions
- **Regenerate**: Re-run with same prompt
- **Continue**: Append to response
- **Copy**: Copy raw text
- **TTS**: Text-to-speech playback

---

## Quick Action Buttons

### Location
`js/ui/sendButton.js` + HTML template

### Send Button States
```javascript
// sendButton.js - Button states
const BUTTON_STATES = {
    SEND: {
        icon: '➤',
        label: 'Send',
        action: 'sendMessage'
    },
    STOP: {
        icon: '■',
        label: 'Stop',
        action: 'stopGeneration'
    },
    EDIT: {
        icon: '✓',
        label: 'Save Edit',
        action: 'saveEdit'
    }
};
```

### Quick Action Bar (Below Input)

#### Left Sidebar Actions
| Button | Action | Description |
|--------|--------|-------------|
| `+ New Chat` | Start new conversation | Clears messages, resets state |
| `Create Character` | Open character editor | Modal for new character |
| `Settings` | Open settings modal | Model management, preferences |

#### Right Sidebar Actions
| Button | Action | Description |
|--------|--------|-------------|
| `Context` | View context | Shows system messages, RAG status |
| `Anchors` | Edit lore | Opens anchors manager (character chats) |
| `Tools` | Mode selection | Switch between chat/image/video |

#### Input Area Actions
| Button | Action | Description |
|--------|--------|-------------|
| `📎` | Attach file | Upload PDF/TXT/code for context |
| `🎤` | Voice input | Speech-to-text (if supported) |
| `➤` | Send | Submit message |
| `■` | Stop | Abort streaming (during generation) |

### Mode Switching
```javascript
// Mode buttons in Tools tab
const MODES = ['chat', 'image', 'video'];

function switchMode(mode) {
    state.mode = mode;
    document.body.classList.remove('mode-chat', 'mode-image', 'mode-video');
    document.body.classList.add(`mode-${mode}`);
    
    // Update UI
    if (mode === 'image') {
        imageModeManager.refreshParameterPanel();
    } else if (mode === 'video') {
        videoModeManager.refreshParameterPanel();
    }
}
```

---

## Context Management

### Location
`services/context.py` + `js/ui/settings.js`

### Context Window Management

#### Token Counting
```python
# services/context.py
def count_tokens(text):
    """Count tokens using tiktoken."""
    encoder = _get_encoder()
    return len(encoder.encode(text))

def count_message_tokens(messages):
    """Count total tokens in message array."""
    total = 0
    for msg in messages:
        total += count_tokens(msg.get('content', ''))
        total += 4  # Role overhead
    return total
```

#### Context Pruning
```python
def manage_context(messages, config, api_key):
    """Prune context if over threshold."""
    max_tokens = CONTEXT_WINDOWS.get(config['model'], DEFAULT_CONTEXT_WINDOW)
    threshold = max_tokens * SUMMARIZE_THRESHOLD
    
    current_tokens = count_message_tokens(messages)
    
    if current_tokens > threshold:
        # Trigger background summarization
        trigger_background_summarization(chat_id, messages)
        
        # Prune old messages (keep recent + kept)
        kept_ids = set(config.get('kept_messages', []))
        recent_to_keep = config.get('recent_messages_to_keep', 5)
        
        pruned = []
        for msg in reversed(messages):
            if msg.get('id') in kept_ids:
                pruned.insert(0, msg)
            elif len(pruned) < recent_to_keep:
                pruned.insert(0, msg)
        
        return pruned
    
    return messages
```

### Summarization System

#### Auto Mode
- Triggers when context exceeds threshold
- Generates summary in background
- Adds to summary stack
- Prunes old messages

#### Manual Mode
- User clicks "Summarize Now"
- Generates detailed summary
- Shows preview for approval
- Prunes after approval

#### Summary Stack
```json
// chats/.summaries/{chat_id}.json
[
    {
        "id": "uuid",
        "text": "Summary of conversation...",
        "message_count": 50,
        "message_range": [0, 50],
        "token_count": 500,
        "approved": true,
        "created_at": "2024-01-01T00:00:00Z"
    }
]
```

### Context Viewer UI
```javascript
// settings.js - showContextViewer()
async function showContextViewer() {
    // Show summary stack
    const summaries = await fetchSummaryStack(chatId);
    
    // Show pending files
    if (state.contextFileName) {
        // Show attached file preview
    }
    
    // Show embedded context
    const embedded = await fetchContextStatus(chatId);
    
    // Show token gauge
    updateContextGauge();
}
```

---

## Anchors/Lore System

### Location
`services/anchors.py` + `js/components/AnchorsManager.js`

### Purpose
Keyword-triggered content injection for character consistency. When keywords appear in recent messages, associated content is injected as a system message.

### Lore Entry Structure
```json
{
    "id": "uuid",
    "keywords": ["sword", "blade", "weapon"],
    "content": "The character wields a legendary blade named Nightfall...",
    "priority": 0,
    "character_aware": true,
    "enabled": true
}
```

### Storage
```
configs/.lore/{character_name}.lore.json
```

### Injection Flow
```python
# services/anchors.py - scan_and_inject()
def scan_and_inject(messages, config_name):
    """Scan recent messages for keywords and inject matching entries."""
    entries = load_anchors(config_name)
    scan_depth = get_memory_settings().get('lore_scan_depth', 15)
    token_budget = get_memory_settings().get('lore_token_budget', 4000)
    
    # Get last N messages
    recent = messages[-scan_depth:]
    recent_text = ' '.join(m.get('content', '') for m in recent).lower()
    
    # Find matches
    matched = []
    for entry in entries:
        if not entry.get('enabled', True):
            continue
        for kw in entry.get('keywords', []):
            if kw.lower() in recent_text:
                matched.append(entry)
                break
    
    # Sort by priority
    matched.sort(key=lambda e: e.get('priority', 0), reverse=True)
    
    # Inject within token budget
    injected = []
    total_tokens = 0
    for entry in matched:
        tokens = count_tokens(entry['content'])
        if total_tokens + tokens <= token_budget:
            injected.append({
                'role': 'system',
                'content': entry['content']
            })
            total_tokens += tokens
    
    return injected
```

### AnchorsManager UI
```javascript
// AnchorsManager.js
class AnchorsManager {
    async open(configName, sharedLore) {
        // Load entries from API
        this._entries = await fetchEntries(configName);
        
        // Load shared lore entries
        for (const source of sharedLore) {
            const entries = await fetchEntries(source);
            this._sharedEntries.push({ source, entries });
        }
        
        // Render with tabs
        this._renderEntries();
    }
    
    // Actions:
    // - Add entry
    // - Edit entry
    // - Delete entry
    // - Toggle enabled
    // - Share lore with other characters
}
```

### Character Awareness
- `character_aware: true` - Character knows this information
- `character_aware: false` - "Not yet aware" - shown in UI with badge

---

## Image Generation

### Location
`js/components/ImageModeManager.js` + `routes/image.py`

### Supported Models
```javascript
const IMAGE_MODELS = {
    // Venice models
    'flux-dev': { type: 'text-to-image', price: 0.05 },
    'flux-pro': { type: 'text-to-image', price: 0.10 },
    'seedream-v4': { type: 'text-to-image', price: 0.05 },
    'seedream-v4-edit': { type: 'image-edit', price: 0.05 },
    'wan-2-7-text-to-image': { type: 'text-to-image', price: 0.04 },
    'lustify-v8': { type: 'text-to-image', price: 0.01 },
    
    // Edit models
    'qwen-image-2-edit': { type: 'image-edit', price: 0.05 },
    'firered-image-edit': { type: 'image-edit', price: 0.04 },
    'gemini-3-pro-edit': { type: 'image-edit', price: 0.03 },
    
    // Upscaler
    'upscaler': { type: 'upscaler', price: { 2: 0.02, 4: 0.08 } }
};
```

### Image Cards System
```javascript
// Three card slots: target, ref-1, ref-2
// Each can be:
// - Uploaded via file picker
// - Pasted from clipboard
// - Dragged from generated results

// Card states:
state.currentImageConfig = {
    image_data: "data:image/png;base64,...",  // Target image
    ref_images: ["data:image/...", "..."],     // Reference images
    model: "flux-dev",
    // Model-specific params
};
```

### Generation Flow
```javascript
async generateEdit() {
    // 1. Collect images
    const targetImage = state.currentImageConfig.image_data;
    const refImages = state.currentImageConfig.ref_images?.filter(Boolean) || [];
    
    // 2. Build payload
    const payload = {
        model: selectedModel,
        prompt: promptText,
        // Model-specific params
    };
    
    if (targetImage) {
        payload.image_url = targetImage;
    }
    if (refImages.length > 0) {
        payload.reference_image_urls = refImages;
    }
    
    // 3. Queue generation
    const response = await fetch('/api/image/generate', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    
    // 4. Poll for completion
    if (response.request_id) {
        await pollImageStatus(response.request_id);
    }
}
```

### Image Editor Integration
```javascript
// ImageEditor.js - Mask-based editing
class ImageEditor {
    // Canvas-based mask painting
    // Brush size, opacity controls
    // Undo/redo stack
    // Export masked image for edit models
}
```

---

## Video Generation

### Location
`js/components/VideoModeManager.js` + `routes/video.py`

### Supported Models
```javascript
// modelConfigs.js
const VIDEO_MODELS = {
    'wan-2-7-i2v': {
        category: 'image-to-video',
        supports_start_image: true,
        supports_end_image: false,
        params: {
            duration: { type: 'enum', options: ['5', '10'], default: '5' },
            aspect_ratio: { type: 'enum', options: ['16:9', '9:16', '1:1'], default: '16:9' }
        }
    },
    'veo-3': {
        category: 'text-to-video',
        supports_start_image: true,
        supports_end_image: true,
        params: {
            duration: { type: 'int', min: 5, max: 60, default: 10 },
            aspect_ratio: { type: 'enum', options: ['16:9', '9:16', '1:1'], default: '16:9' }
        }
    }
};
```

### Video Cards
```javascript
// Similar to image cards but for video
state.currentVideoConfig = {
    model: 'wan-2-7-i2v',
    image_data: "data:image/...",      // Start frame
    end_image_data: "data:image/...",  // End frame (if supported)
    ref_images: [],                    // Reference images
    // Model params
    duration: 5,
    aspect_ratio: '16:9'
};
```

### Generation Flow
```javascript
async generateVideo() {
    // 1. Validate
    const config = modelConfigs.models[modelId];
    if (config.category === 'image-to-video' && !image_data) {
        lagoonAlert('This model requires a source image.');
        return;
    }
    
    // 2. Build payload
    const payload = {
        model: modelId,
        prompt: promptText,
        ...state.currentVideoConfig
    };
    
    // 3. Queue job
    const response = await queueVideoApi(payload);
    const queueId = response.queue_id || response.request_id;
    
    // 4. Poll status
    this.pollJobStatus(modelId, queueId);
}

async pollJobStatus(modelId, queueId) {
    const poll = async () => {
        const status = await retrieveVideoApi(queueId);
        
        if (status.status === 'completed') {
            // Show video in chat
            addMessageToUI('assistant', `[[VIDEO:${status.download_url}]]`);
        } else if (status.status === 'failed') {
            addMessageToUI('assistant', `**Error:** ${status.error}`);
        } else {
            // Update progress gauge
            this.renderGauge(container, status.progress, status.estimated_remaining);
            setTimeout(poll, 2000);
        }
    };
    
    poll();
}
```

### Together.ai Video
```javascript
// TogetherVideoModeManager.js - Separate handler for Together provider
// Uses Together's video API instead of Venice
```

---

## Design Mode

### Location
`js/design_mode.js` + `services/css_manager.py`

### Purpose
Visual CSS editor for customizing the application's appearance without editing code.

### Activation
```javascript
// Toggle via settings or localStorage
localStorage.setItem('lagoon_design_mode', 'true');
designMode.enable();

// Or via UI toggle
document.getElementById('design-mode-toggle').checked = true;
```

### How It Works

#### 1. Element Selection
```javascript
// Click any element to select it
// Crosshair cursor indicates selection mode
// Alt key temporarily pauses selection

_onClick(e) {
    const el = e.target;
    const selector = this._generateSelector(el);
    this.openModal(el, selector);
}
```

#### 2. Selector Generation
```javascript
// Generates unique CSS selector for element
_generateSelector(el) {
    // Priority:
    // 1. data-dm-id attribute (unique)
    // 2. ID selector
    // 3. data-role/data-type attributes
    // 4. Class-based selector
    
    // Adds data-dm-id if needed
    if (!el.hasAttribute('data-dm-id')) {
        el.setAttribute('data-dm-id', 'dm-' + Math.random().toString(36).substr(2, 9));
    }
    return `[data-dm-id="${el.getAttribute('data-dm-id')}"]`;
}
```

#### 3. Style Editor Panel
```javascript
// Editable properties:
const SLIDER_PROPS = [
    { prop: 'font-size', label: 'Font Size', min: 0, max: 72, unit: 'px' },
    { prop: 'border-radius', label: 'Bdr Radius', min: 0, max: 50, unit: 'px' },
    { prop: 'border-width', label: 'Bdr Width', min: 0, max: 20, unit: 'px' },
    { prop: 'opacity', label: 'Opacity', min: 0, max: 1, unit: '' }
];

const COLOR_PROPS = [
    { prop: 'color', label: 'Text' },
    { prop: 'background-color', label: 'Background' },
    { prop: 'border-color', label: 'Border' }
];

// State variants: '', ':hover', ':focus', ':active'
```

#### 4. Live Preview
```javascript
// Styles applied in real-time via style element
_applyPreview(selector, styles) {
    const css = `${selector} { ${Object.entries(styles)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ')} }`;
    this._previewStyleEl.textContent = css;
}
```

#### 5. Persistence
```javascript
// Saved to css/user-overrides.css
// Backend validates and stores

// css_manager.py - Whitelist
ALLOWED_SELECTORS = [
    r'^\.sidebar-',
    r'^\.chat-',
    r'^\.message-',
    r'^\.button-',
    # ... more patterns
];

ALLOWED_PROPERTIES = [
    'color', 'background', 'background-color',
    'font-size', 'border-radius', 'opacity',
    # ... more properties
];
```

### Peek Through Feature
```javascript
// Cycle through stacked elements at click position
// Useful for reaching elements under overlays

_peekThrough() {
    this._elementStackIndex = (this._elementStackIndex + 1) % this._elementStack.length;
    const el = this._elementStack[this._elementStackIndex];
    this._targetEl = el;
    this._targetSelector = this._generateSelector(el);
}
```

---

## Mobile Interface

### Location
`js/mobile.js` + `js/components/Mobile*.js`

### Components

#### MobileHeader
- Model selector dropdown
- New chat button
- Menu button

#### MobileChat
- Message list
- Regenerate/delete actions
- TTS button on assistant messages

#### MobileInput
- Text input
- Send button
- Voice input (if supported)

#### MobileMenu
- Settings
- Chat history
- Model selection

### Mobile Detection
```javascript
isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches ||
           window.matchMedia('(pointer: coarse)').matches;
}
```

### Mobile Storage
```javascript
// MobileStorage.js - Local storage for offline support
class MobileStorage {
    createNewChat() {
        const id = 'mobile_' + Date.now() + '.json';
        localStorage.setItem('mobile_current_chat', id);
        return id;
    }
    
    saveChat(id, messages, config) {
        const chats = JSON.parse(localStorage.getItem('mobile_chats') || '{}');
        chats[id] = { messages, config, modified: Date.now() };
        localStorage.setItem('mobile_chats', JSON.stringify(chats));
    }
}
```

### Sync with Backend
```javascript
// Backend chats use .json extension
isBackendChat() {
    return state.currentChatId && state.currentChatId.endsWith('.json');
}

// Save to backend when online
async saveChat() {
    if (this.isBackendChat()) {
        await saveChatApi(state.currentChatId, state.messages, state.currentConfig);
    } else {
        mobileStorage.saveChat(state.currentChatId, state.messages, state.currentConfig);
    }
}
```

---

## Settings & Configuration

### Location
`js/ui/settings.js`

### Settings Modal Sections

#### 1. Model Management
```javascript
// Show installed models
// Add/remove models
// Set default model

async function showModelManager() {
    const installed = await fetch('/api/installed_models');
    const available = await fetch('/api/venice/models');
    
    // Render list with:
    // - Model name
    // - Provider
    // - Pricing
    // - Install/remove button
}
```

#### 2. System Prompts
```javascript
// Create/edit/delete system prompt templates
// Apply to characters

async function showSystemPromptEditor() {
    const prompts = await fetchSystemPrompts();
    
    // CRUD operations:
    // - Create new prompt
    // - Edit existing
    // - Delete
    // - Apply to character
}
```

#### 3. Writing Tools
```javascript
// Configure writing assistance options
const DEFAULT_WRITING_TOOLS = {
    enabled: false,
    grammar: true,
    clarity: true,
    tone: 'neutral'
};
```

#### 4. Custom Endpoints
```javascript
// Add custom API endpoints
async function saveCustomEndpoint(endpoint) {
    await fetch('/api/custom_endpoints', {
        method: 'POST',
        body: JSON.stringify({
            name: endpoint.name,
            url: endpoint.url,
            api_key: endpoint.api_key,
            models: endpoint.models
        })
    });
}
```

#### 5. Typography
```javascript
// Font family, size, line height
function applyTypographySettings() {
    const font = localStorage.getItem('chat_font') || 'system';
    const textSize = localStorage.getItem('chat_text_size') || '16';
    const lineSpacing = localStorage.getItem('chat_line_spacing') || '1.5';
    
    container.style.setProperty('--chat-font-family', fontFamily);
    container.style.setProperty('--chat-font-size', `${textSize}px`);
    container.style.setProperty('--chat-line-height', lineSpacing);
}
```

#### 6. TTS Settings
```javascript
// Text-to-speech configuration
const VENICE_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const GOOGLE_VOICES = ['...']; // Google TTS voices

// Settings stored in localStorage
localStorage.setItem('tts_voice', voice);
localStorage.setItem('tts_provider', provider);
```

---

## Backend Services

### services/context.py
```python
# Token counting and context management
- count_tokens(text) → int
- count_message_tokens(messages) → int
- manage_context(messages, config) → pruned messages
- generate_detailed_summary(messages) → summary
- trigger_background_summarization(chat_id, messages)
- load_summary_stack(chat_id) → summaries
- append_to_summary_stack(chat_id, summary)
- delete_summary_entry(chat_id, entry_id)
```

### services/e2ee.py
```python
# End-to-end encryption
- generate_session_keypair() → (private_key, public_hex)
- fetch_attestation(model_id, api_key) → model_pub_hex
- encrypt_messages(messages, model_pub_hex) → encrypted_messages
- decrypt_chunk(hex_chunk, session_priv) → plaintext
```

### services/rag.py
```python
# Conversation RAG
- chunk_and_embed(chat_id, messages) → embed and store
- retrieve(chat_id, query) → relevant chunks
- invalidate_rag_store(chat_id) → clear cache
```

### services/context_rag.py
```python
# Context file RAG
- embed_context_file(config_name, content, filename)
- retrieve(config_name, query) → relevant chunks
- delete_context_store(config_name)
```

### services/anchors.py
```python
# Lore/anchors management
- load_anchors(config_name) → entries
- save_anchors(config_name, entries)
- add_entry(config_name, keywords, content, priority, character_aware)
- update_entry(config_name, entry_id, updates)
- delete_entry(config_name, entry_id)
- scan_and_inject(messages, config_name) → injected messages
- get_matched_entries(messages, config_name) → matched entries
```

### services/storage.py
```python
# JSON file I/O
- load_json(path) → data
- save_json(path, data)
- delete_file(path)
- list_files(directory) → files
```

---

## API Endpoints

### Chat
```
POST /chat                    # Streaming chat (SSE)
POST /api/chat/save           # Save chat
POST /api/chat/import         # Import chat
GET  /api/chats               # List chats
GET  /api/chat/<id>           # Get chat
DELETE /api/chat/<id>         # Delete chat
POST /api/chat/<id>/rename    # Rename chat
POST /api/chats/reparent      # Update parent config
POST /api/force_summarize     # Force summarization
POST /api/summary_stack       # Get summary stack
POST /api/apply_summary       # Apply summary
DELETE /api/summary/<id>      # Delete summary
POST /api/approve_summary     # Approve pending summary
```

### Configs
```
GET  /api/configs             # List character configs
GET  /api/config/<name>       # Get config
POST /api/config/<name>       # Save config
DELETE /api/config/<name>     # Delete config
POST /api/config/<name>/copy  # Copy config
POST /api/config/<name>/embed_context    # Embed context file
GET  /api/config/<name>/context_status   # Check context status
DELETE /api/config/<name>/embed_context  # Delete embedded context
```

### Anchors/Lore
```
GET  /api/lore/<config_name>              # Get entries
POST /api/lore/<config_name>              # Create entry
PUT  /api/lore/<config_name>/<entry_id>   # Update entry
DELETE /api/lore/<config_name>/<entry_id> # Delete entry
GET  /api/configs/lore_files              # List lore files
```

### Models
```
GET  /api/models              # Get all model configs
GET  /api/models/list         # Simplified model list
GET  /api/models/<model_id>   # Get specific model
GET  /api/providers           # Get provider configs
GET  /api/models/local       # Get Ollama models
GET  /api/installed_models    # Get installed models
POST /api/installed_models    # Add installed model
DELETE /api/installed_models/<model_id>  # Remove model
GET  /api/venice/models       # Get Venice models (requires API key)
```

### Video
```
POST /api/video/queue        # Queue video generation
GET  /api/video/retrieve/<id> # Poll video status
GET  /api/video/files        # List generated videos
DELETE /api/video/files/<filename>  # Delete video
```

### Image
```
POST /api/image/generate     # Generate image
POST /api/image/edit         # Edit image
POST /api/image/upscale      # Upscale image
```

### Other
```
POST /api/parse_file         # Parse PDF/TXT upload
POST /api/upload_avatar      # Upload avatar image
GET  /api/model_avatars      # List avatar files
GET  /api/key_status         # Check API key status
POST /api/analyze_edit       # Analyze edit for token diff
POST /api/overseer_check     # Style overseer validation
POST /api/preview_prompt     # Preview full prompt
POST /api/tts/stream         # Text-to-speech
POST /api/asr/transcribe     # Speech-to-text
```

---

## Data Structures

### Character Config
```json
{
    "character_name": "string",
    "model": "string",
    "system_prompt": "string",
    "system_context": "string",
    "character_card": "string",
    "intro_statement": "string",
    "context_mode": "always|rag",
    "author_note": "string",
    "author_note_depth": 4,
    "uncensored_mode": false,
    "strip_thinking": false,
    "style_overseer": "string|null",
    "fiction_prompt_text": "string",
    "include_venice_system_prompt": true,
    "shared_lore": ["string"],
    "lore_labels": ["string"],
    "avatar": "data:image/png;base64,..."
}
```

### Chat File
```json
{
    "chat_id": "uuid",
    "display_name": "First message preview",
    "parent_config": "Character.json",
    "config": { /* snapshot of character config */ },
    "messages": [
        { "role": "system", "content": "..." },
        { "role": "user", "content": "..." },
        { "role": "assistant", "content": "..." }
    ],
    "kept_messages": ["msg_id_1", "msg_id_2"],
    "created": "ISO timestamp",
    "modified": "ISO timestamp"
}
```

### Lore Entry
```json
{
    "id": "uuid",
    "keywords": ["keyword1", "keyword2"],
    "content": "Content to inject when keywords match",
    "priority": 0,
    "character_aware": true,
    "enabled": true
}
```

### Summary Entry
```json
{
    "id": "uuid",
    "text": "Summary text...",
    "message_count": 50,
    "message_range": [0, 50],
    "token_count": 500,
    "approved": true,
    "pending_review": false,
    "created_at": "ISO timestamp"
}
```

### Model Config
```json
{
    "id": "model-id",
    "display_name": "Model Name",
    "provider": "venice|openai|anthropic|google|together|ollama|custom",
    "pricing": {
        "input": 1.00,
        "output": 3.20,
        "cache_read": 0.30,
        "cache_write": 0.60
    },
    "context_window": 200000,
    "supports_vision": false,
    "supports_e2ee": false,
    "category": "text-to-image|image-to-video|text-to-video"
}
```

---

## Summary

Lagoon V1 is a comprehensive AI chat platform with:

1. **Character System**: Full character creation with system prompts, context files, lore, and advanced settings
2. **Chat System**: Streaming responses, token tracking, message actions, context management
3. **Quick Actions**: Mode switching, file attachment, voice input, regeneration
4. **Context Management**: Auto/manual summarization, RAG retrieval, token budgets
5. **Anchors/Lore**: Keyword-triggered content injection for character consistency
6. **Image Generation**: Multiple models, image editing, upscaling, reference images
7. **Video Generation**: Text-to-video and image-to-video with polling
8. **Design Mode**: Visual CSS editor with live preview
9. **Mobile Interface**: Responsive design with offline support
10. **Settings**: Model management, system prompts, custom endpoints, typography

All features integrate through a centralized state management system and communicate with a Flask backend via REST API and Server-Sent Events for streaming.