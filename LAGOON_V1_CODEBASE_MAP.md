# Lagoon V1 Codebase Map

## Project Overview

Lagoon V1 is a sophisticated AI chat application with:
- **Backend**: Python/Flask with SocketIO for real-time features
- **Frontend**: Vanilla JavaScript with ES6 modules
- **Features**: Multi-provider AI chat, E2EE encryption, RAG memory, anchors/lore system, image/video generation, mobile-responsive design

---

## Directory Structure

```
/
├── app.py                    # Main Flask entry point
├── config.py                 # Constants, context windows, API settings
├── routes/                   # Flask blueprints
│   ├── __init__.py
│   ├── chat.py              # Core streaming chat endpoint
│   ├── chats.py             # Chat history CRUD
│   ├── configs.py           # Character config CRUD
│   ├── anchors.py           # Lore/anchors API
│   ├── files.py             # File upload/parsing
│   ├── macros.py            # Macro storage
│   ├── models.py            # Model registry, installed models
│   ├── system_prompts.py    # System prompt templates
│   ├── custom_endpoints.py # Custom API endpoints
│   ├── design.py            # CSS override API
│   ├── video.py             # Venice video generation
│   ├── video_together.py    # Together.ai video
│   └── gemini_live.py       # Gemini Live WebSocket
├── services/                 # Business logic
│   ├── storage.py           # JSON file I/O
│   ├── context.py           # Token counting, summarization
│   ├── context_rag.py       # Context file RAG
│   ├── rag.py               # Conversation RAG
│   ├── e2ee.py              # End-to-end encryption
│   ├── anchors.py           # Lore keyword matching
│   ├── memory_settings.py   # RAG/lore config
│   ├── model_registry.py    # Model configurations
│   ├── installed_models.py  # Installed models SSOT
│   ├── css_manager.py       # Design mode CSS
│   └── export_service.py    # Chat export
├── js/                       # Frontend JavaScript
│   ├── main.js              # App bootstrap
│   ├── state.js             # Global state object
│   ├── api.js               # API client functions
│   ├── utils.js             # Markdown, utilities
│   ├── mobile.js            # Mobile-specific UI
│   ├── design_mode.js       # Visual customization
│   ├── core/                # Core modules
│   │   ├── Store.js         # Event bus + state
│   │   ├── UIManager.js     # Layout, dropdowns
│   │   ├── Constants.js     # Model logos, context windows
│   │   ├── InstalledModels.js
│   │   ├── ModelConfigManager.js
│   │   └── TTSConfig.js
│   ├── components/          # Feature modules
│   │   ├── ChatManager.js   # Chat sessions, streaming
│   │   ├── ConfigManager.js # Character configs
│   │   ├── SessionManager.js
│   │   ├── ImageModeManager.js
│   │   ├── VideoModeManager.js
│   │   ├── TogetherVideoModeManager.js
│   │   ├── DualModelManager.js
│   │   ├── AnchorsManager.js # Lore editing UI
│   │   ├── Lightbox.js
│   │   ├── ImageEditor.js
│   │   └── MacroManager.js
│   ├── ui/                   # UI utilities
│   │   ├── settings.js      # Settings modal
│   │   ├── messages.js      # Message rendering
│   │   ├── sidebar.js       # Chat list
│   │   ├── scroll.js        # Auto-scroll
│   │   └── dialog.js        # Alerts/confirms
│   └── services/             # Frontend services
│       ├── GeminiLiveService.js
│       └── AudioService.js
├── css/                      # Stylesheets
│   └── user-overrides.css    # Design mode output
├── configs/                   # Character configs (JSON)
│   └── .ctx/                 # Context RAG embeddings
├── chats/                    # Chat history (JSON)
│   ├── .rag/                 # RAG embeddings
│   └── .summaries/           # Summary stacks
├── model_avatars/            # Model avatar images
└── installed_models.json     # Installed models SSOT
```

---

## Backend Architecture

### app.py - Main Entry Point

```python
# Key components:
- Flask app with session-based auth (admin/lagoon)
- SocketIO for Gemini Live real-time
- Blueprints: configs, chats, system_prompts, files, chat, macros, models, anchors, custom_endpoints, design, video, together_video
- HTTPS support with self-signed certs
- Default port: 5007
```

### routes/chat.py - Core Chat Endpoint

**Main function: `stream_chat()` (lines 92-741)**

This is the heart of the application. Key flow:

1. **Request parsing**: Extracts messages, config, model, provider
2. **Provider inference**: `_infer_provider()` determines API target
3. **Context management**: 
   - Token counting with `count_message_tokens()`
   - RAG retrieval via `services/rag.py`
   - Context file RAG via `services/context_rag.py`
   - Lore/anchors injection via `services/anchors.py`
4. **E2EE encryption**: If `e2ee_enabled`, encrypts all messages
5. **Streaming**: Yields SSE events for real-time response
6. **Lore extraction**: Extracts new lore entries from assistant response
7. **Cost tracking**: Calculates input/output/cache tokens and costs

**Key helper functions:**
- `_process_lore_chunk()` - Extracts lore from streaming chunks
- `_flush_lore_buf()` - Flushes accumulated lore
- `overseer_check()` - Style overseer validation
- `preview_prompt()` - Shows full prompt for debugging
- `tts_stream()` - Text-to-speech streaming
- `asr_transcribe()` - Speech-to-text

### services/context.py - Token Management

```python
# Key functions:
- count_tokens(text) → int
- count_message_tokens(messages) → int
- manage_context(messages, config, api_key) → pruned messages
- generate_detailed_summary(messages, api_key) → summary dict
- trigger_background_summarization() → async summarization
- load_summary_stack() / append_to_summary_stack() / delete_summary_entry()
```

**Context window sizes** (config.py):
```python
CONTEXT_WINDOWS = {
    'zai-org/GLM-5': 200000,
    'deepseek-v3.2': 160000,
    'venice-uncensored': 30000,
    # ... etc
}
DEFAULT_CONTEXT_WINDOW = 200000
```

### services/e2ee.py - End-to-End Encryption

Full Venice E2EE protocol implementation:

```python
# Protocol:
1. Generate secp256k1 session keypair
2. Fetch TEE attestation from Venice (cached 30 min)
3. Verify attestation (nonce match, debug mode check)
4. ECDH key exchange with model's public key
5. HKDF-SHA256 key derivation (info=b'ecdsa_encryption')
6. AES-256-GCM encryption of all message content

# Key functions:
- generate_session_keypair() → (private_key, public_hex)
- fetch_attestation(model_id, api_key) → model_pub_hex
- encrypt_messages(messages, model_pub_hex) → encrypted_messages
- decrypt_chunk(hex_chunk, session_priv) → plaintext
```

### services/rag.py - Conversation RAG

```python
# Semantic memory retrieval using sentence-transformers/all-MiniLM-L6-v2

# Key functions:
- chunk_and_embed(chat_id, messages) → embed and store
- retrieve(chat_id, query) → relevant chunks
- invalidate_rag_store(chat_id) → clear cache

# Settings (memory_settings.py):
- rag_enabled: True
- rag_top_k: 3
- rag_min_similarity: 0.35
- rag_token_budget: 800
- rag_chunk_size: 4 (turn-pairs)
```

### services/context_rag.py - Context File RAG

```python
# Chunks and embeds uploaded context files (PDFs, text, code)

# Key functions:
- embed_context_file(config_name, content, source_file)
- retrieve(config_name, query) → relevant chunks
- delete_context_store(config_name)

# Settings:
- ctx_rag_enabled: True
- ctx_rag_top_k: 5
- ctx_rag_min_similarity: 0.25
- ctx_rag_token_budget: 1500
- ctx_rag_chunk_size: 400 (tokens)
```

### services/anchors.py - Lore/Anchors System

```python
# Keyword-triggered content injection

# Storage: configs/.lore/{config_name}.lore.json

# Entry structure:
{
    "id": "uuid",
    "keywords": ["sword", "blade"],
    "content": "The character wields a legendary blade...",
    "priority": 0,
    "character_aware": true,
    "enabled": true
}

# Key functions:
- load_anchors(config_name) → entries
- scan_and_inject(messages, config_name) → injected messages
- get_matched_entries(messages, config_name) → matched entries
```

**Injection logic:**
1. Scans last N messages (lore_scan_depth, default 15)
2. Matches keywords case-insensitively
3. Injects matched entries as system messages
4. Respects token budget (lore_token_budget, default 4000)
5. Marks as "character_aware" or "not yet aware"

---

## Frontend Architecture

### js/main.js - Bootstrap

```javascript
// Initialization order:
1. populateLegacyDom() - Cache DOM elements
2. initInstalledModels() - Load installed models SSOT
3. modelConfigManager.load() - Load model configs
4. uiManager.init() - Layout, tabs, splitters
5. initMarkdown() - Configure marked.js
6. chatManager.init() - Chat form, input handlers
7. configManager.init() - Character config management
8. sessionManager.init() - Session persistence
9. imageModeManager.init() - Image generation
10. videoModeManager.init() - Video generation
11. anchorsManager = new AnchorsManager() - Lore editing
12. initDesignMode() - Visual customization
13. refreshSidebar() - Load chat list
14. chatManager.startNewChatSession() - Start fresh chat
```

### js/state.js - Global State

```javascript
// Key state properties:
state = {
    currentChatId: null,
    messages: [],
    currentConfig: {},
    currentParentConfig: null,
    isStreaming: false,
    keptMessages: new Set(),
    promptHistory: [],
    promptHistoryIndex: -1,
    mode: 'chat', // 'chat' | 'image' | 'video'
    videoProvider: 'venice', // 'venice' | 'together'
    currentVideoConfig: {},
    contextFileContent: null,
    contextFileName: null,
    // ...
}

// DOM element cache:
dom = {
    chatForm, messageInput, chatMessages, sendBtn,
    changeModelBtn, viewContextBtn, settingsBtn,
    // ...
}
```

### js/api.js - API Client

```javascript
// Key functions:
- streamChat(messages, config, callbacks) → streaming response
- fetchConfigs() / fetchConfig(name) / saveConfigApi(name, config)
- fetchChats() / fetchChat(id) / saveChatApi(chatId, data)
- queueVideoApi(payload) / retrieveVideoApi(requestId)
- embedContextApi(configName, content, filename)
- contextStatusApi(chatId)
- analyzeEditApi(chatId, messageId, newContent)
- overseerCheckApi(messages, config)
- refreshBalance() / updateBalanceDisplay(balance)
```

### js/components/ChatManager.js - Core Chat Logic

```javascript
// Key methods:
- init() - Bind form events, input handlers
- startNewChatSession(config, parentConfig) - Initialize new chat
- loadChat(chatId) - Load existing chat
- handleSendMessage(prompt, systemInjections) - Send message
- handleStopGeneration() - Abort streaming
- renderMessages() - Render message list
- updateContextGauge() - Update token usage display
- _resetSessionCost() - Reset cost tracking

// Pricing data (VENICE_PRICING object):
// Per-million-token costs for input, output, cache read/write

// Streaming flow:
1. Create abort controller
2. Build payload (messages, config, model, provider)
3. Call streamChat() API
4. Handle onToken, onComplete, onError callbacks
5. Update UI in real-time
6. Track tokens and costs
```

### js/components/ImageModeManager.js - Image Generation

```javascript
// Handles Venice image generation models

// Key methods:
- init() - Bind mode switch, parameter controls
- refreshParameterPanel() - Dynamic UI from modelConfigs
- generateImage() - Queue image generation
- pollJobStatus(requestId) - Poll for completion

// State:
state.currentImageConfig = {
    model: 'flux-dev',
    width: 1024,
    height: 1024,
    // ... model-specific params
}
```

### js/components/VideoModeManager.js - Video Generation

```javascript
// Handles Venice video generation

// Key methods:
- init() - Bind form submit, file inputs
- refreshParameterPanel() - Dynamic UI from modelConfigs
- generateVideo() - Queue video job
- pollJobStatus(requestId) - Poll for completion
- renderGauge(container, percent, remainingSec) - Progress display

// Supports:
- Image-to-video (source image upload)
- End frame (for models that support it)
- Reference images
- Aspect ratio, duration, FPS parameters
```

### js/components/AnchorsManager.js - Lore Editing UI

```javascript
// Modal-based UI for editing anchors entries

// Key methods:
- open(configName, sharedLore) - Open modal
- _loadEntries() - Fetch entries from API
- _renderEntries() - Render entry list
- _openEditor(entryId) - Open edit form
- _saveEntry() - Create/update entry
- _toggleEntry(entryId, currentlyEnabled) - Enable/disable
- _deleteEntry(entryId) - Remove entry
- _openShareLore() - Share lore between characters

// Tab system:
- 'own' tab - Character's own entries
- Shared tabs - Entries from linked characters
```

### js/core/UIManager.js - Layout Management

```javascript
// Key methods:
- init() - Cache DOM, bind events, setup splitters
- initCustomDropdown(select) - Convert native select to custom dropdown
- updateCustomDropdown(select) - Refresh dropdown options
- toggleSidebar() - Toggle left sidebar
- setupSplitters() - Draggable sidebar resize
- applyTypographySettings() - Font, size, line height
```

### js/core/Store.js - State Management

```javascript
class Store {
    constructor() {
        this.state = { /* ... */ };
        this.listeners = new Map();
    }
    
    subscribe(event, callback) → unsubscribe function
    set(key, value, silent) → update state + emit
    emit(event, data) → notify subscribers
    update(updates) → batch update
}

// Usage:
store.subscribe('messages', (msgs) => { /* ... */ });
store.set('currentChatId', 'abc123');
```

---

## Key Data Structures

### Character Config (configs/*.json)

```json
{
    "character_name": "Character Name",
    "model": "zai-org-glm-5",
    "system_prompt": "You are...",
    "system_context": "Additional context...",
    "character_card": "User-defined instructions...",
    "intro_statement": "Hello!",
    "context_mode": "always",  // "always" | "rag"
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

### Chat File (chats/*.json)

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
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z"
}
```

### Lore Entry (configs/.lore/*.lore.json)

```json
[
    {
        "id": "uuid",
        "keywords": ["keyword1", "keyword2"],
        "content": "Content to inject when keywords match",
        "priority": 0,
        "character_aware": true,
        "enabled": true
    }
]
```

### Summary Stack (chats/.summaries/*.json)

```json
[
    {
        "id": "uuid",
        "summary": "Summary text...",
        "message_range": [0, 50],
        "token_count": 500,
        "approved": true,
        "created": "2024-01-01T00:00:00Z"
    }
]
```

---

## API Endpoints

### Chat
- `POST /chat` - Streaming chat (SSE)
- `POST /api/chat/save` - Save chat
- `POST /api/chat/import` - Import chat
- `GET /api/chats` - List chats
- `GET /api/chat/<id>` - Get chat
- `DELETE /api/chat/<id>` - Delete chat
- `POST /api/chat/<id>/rename` - Rename chat
- `POST /api/chats/reparent` - Update parent config

### Configs
- `GET /api/configs` - List character configs
- `GET /api/config/<name>` - Get config
- `POST /api/config/<name>` - Save config
- `DELETE /api/config/<name>` - Delete config
- `POST /api/config/<name>/copy` - Copy config
- `POST /api/config/<name>/embed_context` - Embed context file
- `GET /api/config/<name>/context_status` - Check context status
- `DELETE /api/config/<name>/embed_context` - Delete embedded context

### Anchors/Lore
- `GET /api/lore/<config_name>` - Get entries
- `POST /api/lore/<config_name>` - Create entry
- `PUT /api/lore/<config_name>/<entry_id>` - Update entry
- `DELETE /api/lore/<config_name>/<entry_id>` - Delete entry

### Models
- `GET /api/models` - Get all model configs
- `GET /api/models/list` - Simplified model list
- `GET /api/models/<model_id>` - Get specific model
- `GET /api/providers` - Get provider configs
- `GET /api/models/local` - Get Ollama models
- `GET /api/installed_models` - Get installed models
- `POST /api/installed_models` - Add installed model
- `DELETE /api/installed_models/<model_id>` - Remove model
- `GET /api/venice/models` - Get Venice models (requires API key)

### Video
- `POST /api/video/queue` - Queue video generation
- `GET /api/video/retrieve/<request_id>` - Poll video status
- `GET /api/video/files` - List generated videos
- `DELETE /api/video/files/<filename>` - Delete video

### Other
- `POST /api/parse_file` - Parse PDF/TXT upload
- `POST /api/upload_avatar` - Upload avatar image
- `GET /api/model_avatars` - List avatar files
- `GET /api/key_status` - Check API key status
- `POST /api/analyze_edit` - Analyze edit for token diff
- `POST /api/overseer_check` - Style overseer validation
- `POST /api/preview_prompt` - Preview full prompt
- `POST /api/tts/stream` - Text-to-speech
- `POST /api/asr/transcribe` - Speech-to-text

---

## Model Providers

### Supported Providers
1. **Venice** - Primary provider (api.venice.ai)
2. **OpenAI** - GPT models
3. **Anthropic** - Claude models
4. **Google** - Gemini models
5. **Together** - Together.ai models
6. **Ollama** - Local models (localhost:11434)
7. **Custom** - User-defined endpoints

### Provider Inference Logic

```python
def _infer_provider(model_id, config):
    # Priority:
    # 1. config.provider (explicit)
    # 2. 'ollama' if model in Ollama models
    # 3. 'together' if model starts with 'together-'
    # 4. 'venice' (default)
```

### E2EE Models
Models prefixed with `e2ee-` use end-to-end encryption:
- `e2ee-venice-uncensored-24b-p`
- `e2ee-gemma-3-27b-p`
- `e2ee-glm-4-7-p`
- etc.

---

## Context Management Flow

```
User Message
    ↓
[1] Load character config
    ↓
[2] Build system message:
    - system_prompt
    - system_context (if mode='always')
    - character_card
    - author_note (at depth)
    ↓
[3] RAG retrieval:
    - Conversation RAG (services/rag.py)
    - Context file RAG (services/context_rag.py)
    ↓
[4] Lore injection (services/anchors.py):
    - Scan last N messages for keywords
    - Inject matched entries as system messages
    ↓
[5] Token counting:
    - Count total tokens
    - Compare to context window
    ↓
[6] If over threshold:
    - Trigger background summarization
    - Prune old messages
    - Keep recent + kept messages
    ↓
[7] E2EE encryption (if enabled):
    - Generate session keypair
    - Fetch attestation
    - Encrypt all messages
    ↓
[8] Stream to provider API
    ↓
[9] Stream response to frontend
    ↓
[10] Extract lore from response
    ↓
[11] Save chat
```

---

## Pricing System

```javascript
// VENICE_PRICING in ChatManager.js
// All prices per million tokens

{
    'model-id': {
        in: 0.20,      // Input tokens
        out: 0.90,     // Output tokens
        cacheRead: 0.30,  // Cache read (optional)
        cacheWrite: 0.60, // Cache write (optional)
        tierAt: 200000,   // Tier threshold (optional)
        inTier: 5.00      // Tiered input price (optional)
    }
}

// Cost calculation:
sessionCost = (inputTokens/1M * in) + (outputTokens/1M * out)
            + (cacheReadTokens/1M * cacheRead)
            + (cacheWriteTokens/1M * cacheWrite)
```

---

## Design Mode

Visual customization system for CSS overrides:

```javascript
// js/design_mode.js
- Click elements to select
- Edit properties in sidebar
- Save to css/user-overrides.css

// services/css_manager.py
- validate_selector() - Whitelist allowed selectors
- validate_styles() - Whitelist allowed properties
- save_rule() - Upsert CSS rule
- reset_rule() - Remove CSS rule
```

**Allowed CSS properties:**
- color, background, background-color, background-image
- border-color, border-width, border-style, border-radius
- margin, padding, font-size, opacity, gap, box-shadow
- display, width, height, flex-*, align-self, justify-self

---

## Mobile Support

```javascript
// js/mobile.js
- Touch event handling
- Swipe gestures for sidebar
- Mobile-specific UI adjustments
- Viewport management
```

---

## Key Configuration Files

### installed_models.json
```json
{
    "models": [
        {
            "id": "zai-org-glm-5",
            "name": "GLM 5",
            "provider": "venice",
            "pricing": { "in": 1.00, "out": 3.20 }
        }
    ]
}
```

### memory_settings.json
```json
{
    "summarize_threshold": 0.75,
    "recent_messages_to_keep": 5,
    "rag_enabled": true,
    "rag_top_k": 3,
    "rag_min_similarity": 0.35,
    "lore_scan_depth": 15,
    "lore_token_budget": 4000
}
```

### app_config.json
```json
{
    "venice_api_key": "...",
    "together_api_key": "...",
    "google_api_key": "...",
    "zai_api_key": "..."
}
```

---

## Authentication

Simple session-based auth in `app.py`:

```python
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "lagoon"

@app.before_request
def require_login():
    # Allow login route, static files, images
    # Redirect to /login if not authenticated
    # Return 401 for API calls
```

---

## WebSocket (Gemini Live)

```python
# routes/gemini_live.py
# Socket.IO handlers for real-time voice/video

socketio = SocketIO(app, cors_allowed_origins="*")
register_gemini_live(socketio)
```

---

## Summary

This is a production-grade AI chat, LONG FORM FICTION application with:
- **Multi-provider support** (Venice, OpenAI, Anthropic, Google, Together, Ollama, custom)
- **End-to-end encryption** for privacy-focused models
- **RAG memory** for long conversations
- **Anchors/lore system** for character consistency
- **Multimodal generation** (images, videos)
- **Context management** with automatic summarization
- **Design customization** via CSS overrides
- **Mobile-responsive** design

The architecture separates concerns cleanly:
- Backend handles API routing, encryption, RAG, lore injection
- Frontend manages UI state, streaming, mode switching
- Services layer provides reusable business logic
