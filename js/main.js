/**
 * Lagoon V1.3 - Main Entry Point
 * Refactored Architecture
 */

import { store } from './core/Store.js';
import { uiManager } from './core/UIManager.js';
import { modelConfigManager } from './core/ModelConfigManager.js';
import { chatManager } from './components/ChatManager.js';
import { configManager } from './components/ConfigManager.js';
import { sessionManager } from './components/SessionManager.js';
import { initModalDraggability } from './utils/Draggable.js';
import { initMarkdown } from './utils.js';
import { initInstalledModels, populateSelect, getDisplayName, getInstalledModels, getDefaultModel } from './core/InstalledModels.js';
import { showModelManager } from './ui/settings.js';
import { initDialog } from './ui/dialog.js';
import { dualModelManager } from './components/DualModelManager.js';
import { AnchorsManager } from './components/AnchorsManager.js';
import { saveConfigApi } from './api.js';
import { settingsPersistence } from './utils/SettingsPersistence.js';
import { initDesignMode } from './design_mode.js';

// --- Legacy Imports (Still needed by some components/logic) ---
import { state, dom, getDefaultChatConfig, loadPromptHistory, getDefaultSystemPrompt, setDefaultSystemPrompt } from './state.js';
window.state = state; // Expose for debugging/console access
import { refreshSidebar } from './ui/sidebar.js';
window.refreshSidebar = refreshSidebar;
import { setupScrollDetection, handleScrollVisibility, autoScroll } from './ui/scroll.js';

import { showContextViewer, showSettingsMenu, filterModelDropdownForE2EE, toggleAppMode } from './ui/settings.js';

import { imageModeManager } from './components/ImageModeManager.js';
import { videoModeManager } from './components/VideoModeManager.js';
import { togetherVideoModeManager } from './components/TogetherVideoModeManager.js';
import { imageEditor } from './components/ImageEditor.js';
import { lightbox } from './components/Lightbox.js';

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Lagoon V1.3] Bootstrapping...');

    // 1. Populate Legacy DOM References
    populateLegacyDom();

    // 2. Load installed models SSOT, then populate all model selects
    await initInstalledModels();
    ['model', 'overseer-model-select', 'ms-summary-model'].forEach(id =>
        populateSelect(document.getElementById(id))
    );
    // Add SSOT class so VeniceModelsModal can re-populate them after install
    document.querySelectorAll('#model, #overseer-model-select, #ms-summary-model')
        .forEach(sel => sel?.classList.add('model-select-ssot'));
    filterModelDropdownForE2EE(localStorage.getItem('quickchat_e2ee') === 'true');

    // Load Model Configs (async, but don't block — used by backend param validation)
    modelConfigManager.load().then(() => {
        console.log('[Lagoon] Model configs loaded');
    });

    // 3. Initialize Components
    uiManager.init();
    initMarkdown();
    initDialog();
    chatManager.init();
    configManager.init();
    sessionManager.init();
    imageModeManager.init();
    videoModeManager.init();
    togetherVideoModeManager.init();
    imageEditor.init();
    lightbox.init();
    settingsPersistence.init();
    dualModelManager.init();
    const anchorsManager = new AnchorsManager();
    initWritingToolsPanel(anchorsManager);

    initOverseerRules();

    // Load cached Ollama models into model dropdown
    const cachedOllamaModels = JSON.parse(localStorage.getItem('ollama_models') || '[]');
    if (cachedOllamaModels.length) syncOllamaModels(cachedOllamaModels);

    // Load custom endpoints into model dropdown
    syncCustomEndpoints();

    // Gate TTS options and show/hide Venice discovery button based on API keys
    fetch('/api/key_status').then(r => r.json()).then(keys => {
        window._keyStatus = keys;
        const ttsSel = document.getElementById('desktop_tts_provider');
        if (ttsSel) {
            if (!keys.venice) ttsSel.querySelector('option[value="venice"]')?.remove();
            if (!keys.google) ttsSel.querySelector('option[value="google"]')?.remove();
        }
    }).catch(() => {});

    initModalDraggability();
    initDesignMode();

    // Video provider toggle (Venice / Together)
    state.videoProvider = localStorage.getItem('video_provider') || 'venice';
    const vpVenice = document.getElementById('video-provider-venice');
    const vpTogether = document.getElementById('video-provider-together');
    function _applyVideoProvider(provider) {
        state.videoProvider = provider;
        localStorage.setItem('video_provider', provider);
        vpVenice?.classList.toggle('active', provider === 'venice');
        vpTogether?.classList.toggle('active', provider === 'together');
        if (state.mode === 'video') {
            if (provider === 'together') {
                togetherVideoModeManager.refreshParameterPanel();
            } else {
                videoModeManager.refreshParameterPanel();
            }
        }
    }
    vpVenice?.addEventListener('click', () => _applyVideoProvider('venice'));
    vpTogether?.addEventListener('click', () => _applyVideoProvider('together'));
    // Apply persisted state on load (after video mode manager init)
    if (state.videoProvider === 'together') {
        vpVenice?.classList.remove('active');
        vpTogether?.classList.add('active');
    }

    // 4. Restore Theme & Mode
    const savedTheme = localStorage.getItem('theme') || 'hacker';
    document.body.classList.add('theme-' + savedTheme);

    state.mode = localStorage.getItem('app_mode') || 'chat';
    toggleAppMode();

    // Clear any existing style preferences (feature disabled)
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('style_preferences_')) {
            localStorage.removeItem(key);
        }
    });

    // 4. Restore Image Mode (Removed)

    // 5. Initialize Scroll Detection
    setupScrollDetection();

    // 6. Load History
    loadPromptHistory();

    // 7. Initialize UI Utilities
    addGlobalListeners();

    // Initialize custom dropdowns
    const dropdowns = document.querySelectorAll(
        '#model, #desktop_tts_provider, #desktop_tts_voice, #import-character, #image-generate-model, #image-results-count, #glm-image-size, #glm-image-quality, #upscaler-scale, #editor-model-select, #venice-edit-aspect-ratio, #image-param-aspect_ratio, #image-param-resolution, #video-aspect-ratio, #video-resolution, #video-fps'
    );
    dropdowns.forEach(select => uiManager.initCustomDropdown(select));

    // 8. Initial Render
    await refreshSidebar();
    chatManager.startNewChatSession(getDefaultChatConfig(), null);
    
    sessionManager.updateExportButton();

    console.log('[Lagoon V1.3] Ready.');
});

/**
 * Writing Tools Panel — Author's Note + Anchors button
 * Only shown when a character chat (parent_config) is active.
 */
function initWritingToolsPanel(anchorsManager) {
    const panel = document.getElementById('writing-tools-panel');
    const noteArea = document.getElementById('session-author-note');
    const depthInput = document.getElementById('session-author-note-depth');
    const applyBtn = document.getElementById('apply-session-an-btn');
    const clearBtn = document.getElementById('clear-session-an-btn');
    const anchorsBtn = document.getElementById('open-anchors-btn');

    if (!panel) return;

    window.updateOverseerTab = function() {
        const tabBtn = document.querySelector('.tab-btn[data-tab="overseer"]');
        const tabPanel = document.getElementById('tab-overseer');
        if (!tabBtn || !tabPanel) return;
        const visible = !!(state.currentParentConfig && state.currentConfig?.style_overseer);
        tabBtn.classList.toggle('hidden', !visible);
        if (!visible && tabPanel.classList.contains('active')) {
            document.querySelectorAll('.sidebar-right .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sidebar-right .tab-panel').forEach(p => p.classList.remove('active'));
            document.querySelector('.tab-btn[data-tab="tools"]')?.classList.add('active');
            document.getElementById('tab-tools')?.classList.add('active');
        }
        tabPanel.classList.toggle('hidden', !visible);
    };

    window.updateWritingToolsPanel = function() {
        if (state.currentParentConfig) {
            panel.classList.remove('hidden');
            // Populate from live character config
            if (noteArea) noteArea.value = state.currentConfig?.author_note || '';
            if (depthInput) depthInput.value = state.currentConfig?.author_note_depth ?? 4;
        } else {
            panel.classList.add('hidden');
        }
    };

    applyBtn?.addEventListener('click', async () => {
        if (!state.currentParentConfig) return;
        const note = noteArea?.value ?? '';
        const depth = parseInt(depthInput?.value) || 4;

        // Update live state
        if (state.currentConfig) {
            state.currentConfig.author_note = note;
            state.currentConfig.author_note_depth = depth;
        }

        // Persist to character config file and refresh prompt monitor
        try {
            const configName = state.currentParentConfig.replace(/\.json$/i, '');
            const { fetchConfig } = await import('./api.js');
            const liveConfig = await fetchConfig(state.currentParentConfig);
            if (liveConfig) {
                liveConfig.author_note = note;
                liveConfig.author_note_depth = depth;
                await saveConfigApi(configName, liveConfig);
            }
            const { chatManager } = await import('./components/ChatManager.js');
            chatManager._refreshPromptMonitor();
            applyBtn.textContent = 'Saved ✓';
        } catch (e) {
            console.warn('[AuthorNote] Failed to persist:', e);
            applyBtn.textContent = 'Error';
        }
        setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1500);
    });

    clearBtn?.addEventListener('click', async () => {
        if (noteArea) noteArea.value = '';
        if (depthInput) depthInput.value = 4;
        applyBtn?.click();
    });

    anchorsBtn?.addEventListener('click', () => {
        if (state.currentParentConfig) {
            anchorsManager.open(state.currentParentConfig);
        }
    });
}

/**
 * Listeners that don't belong to a specific manager yet
 */
function addGlobalListeners() {
    // Close context menus on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.options-btn') && !e.target.closest('#change-model-btn') && !e.target.closest('.settings-menu')) {
            document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
        }
    });

    if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
            showSettingsMenu(e.currentTarget);
        } catch (err) {
            console.error('[Lagoon] Failed to open settings menu:', err);
        }
    });

    if (dom.changeModelBtn) dom.changeModelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showModelSelector(e.currentTarget);
    });

    if (dom.viewContextBtn) dom.viewContextBtn.addEventListener('click', showContextViewer);
    if (dom.closeContextBtn) dom.closeContextBtn.addEventListener('click', () => dom.contextModal.classList.add('hidden'));
    
    if (dom.scrollBottomBtn) dom.scrollBottomBtn.addEventListener('click', () => {
        state.userScrolledAway = false;
        autoScroll(true);
    });
    if (dom.chatMessages) dom.chatMessages.addEventListener('scroll', handleScrollVisibility);

}

function showModelSelector(button) {
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    const rect = button.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;

    // Use appropriate model select based on current mode
    let modelSelect;
    if (state.mode === 'image') {
        modelSelect = document.getElementById('image-generate-model');
    } else if (state.mode === 'video') {
        modelSelect = state.videoProvider === 'together'
            ? document.getElementById('together-video-model-select')
            : document.getElementById('video-model-select');
    } else {
        modelSelect = document.getElementById('model');
    }
    if (!modelSelect) return;

    const createItem = (opt) => {
        const modelName = opt.value;
        const item = document.createElement('button');
        item.textContent = getDisplayName(modelName);
        item.classList.add('context-menu-item');

        // Handle separator/disabled items
        if (opt.disabled || modelName.startsWith('separator-')) {
            item.disabled = true;
        } else {
            // Highlight current selection based on mode
            const currentModel = state.mode === 'image' || state.mode === 'video'
                ? modelSelect.value
                : state.currentConfig.model;
            if (currentModel === modelName) item.style.fontWeight = 'bold';

            item.onclick = () => {
                // For image/video modes, just update the select and let mode manager handle it
                if (state.mode === 'image' || state.mode === 'video') {
                    modelSelect.value = modelName;
                    modelSelect.dispatchEvent(new Event('change'));
                    chatManager.updateModelButtonText();
                    menu.remove();
                    return;
                }

                // Chat mode: update character name if it's a Quick Chat or currently matches a model name.
                const currentName = state.currentConfig.character_name;
                const installed = getInstalledModels();
                const isModelName = installed.some(m => m.id === currentName || m.name === currentName);

                if (state.isTemporaryChat || isModelName) {
                    state.currentConfig.character_name = getDisplayName(modelName);
                }

                state.currentConfig.model = modelName;
                localStorage.setItem('quickchat_model', modelName);
                
                if (opt.dataset.provider === 'ollama') {
                    state.currentConfig.provider = 'ollama';
                    delete state.currentConfig.custom_base_url;
                    delete state.currentConfig.custom_model_id;
                    delete state.currentConfig.custom_api_key;
                } else if (opt.dataset.provider === 'custom') {
                    state.currentConfig.provider = 'custom';
                    state.currentConfig.custom_base_url = opt.dataset.baseUrl;
                    state.currentConfig.custom_model_id = opt.dataset.modelId;
                    state.currentConfig.custom_api_key = opt.dataset.apiKey || '';
                } else if (opt.dataset.provider === 'together') {
                    state.currentConfig.provider = 'together';
                    delete state.currentConfig.custom_base_url;
                    delete state.currentConfig.custom_model_id;
                    delete state.currentConfig.custom_api_key;
                } else {
                    delete state.currentConfig.provider;
                    delete state.currentConfig.custom_base_url;
                    delete state.currentConfig.custom_model_id;
                    delete state.currentConfig.custom_api_key;
                }
                // Sync the hidden <select> so mode managers can read the current model
                modelSelect.value = modelName;
                modelSelect.dispatchEvent(new Event('change'));
                chatManager.updateModelButtonText();
                menu.remove();
            };
        }
        return item;
    };

    Array.from(modelSelect.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            const groupLabel = document.createElement('div');
            groupLabel.className = 'context-menu-group-label';
            groupLabel.textContent = child.label;
            menu.appendChild(groupLabel);

            Array.from(child.children).forEach(opt => {
                menu.appendChild(createItem(opt));
            });
        } else if (child.tagName === 'OPTION') {
            menu.appendChild(createItem(child));
        }
    });
    
    // Manage Models
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    menu.appendChild(sep);

    const manageBtn = document.createElement('button');
    manageBtn.textContent = 'Manage Models';
    manageBtn.className = 'context-menu-item context-menu-item-action';
    manageBtn.onclick = () => { menu.remove(); showModelManager(); };
    menu.appendChild(manageBtn);

    document.body.appendChild(menu);
    menu.style.top = `${rect.bottom + 5}px`;
}


async function syncInstalledModels() {
    const { initInstalledModels, populateSelect } = await import('./core/InstalledModels.js');
    await initInstalledModels();
    document.querySelectorAll('.model-select-ssot').forEach(sel => {
        populateSelect(sel);
    });
}
window.syncInstalledModels = syncInstalledModels;

function syncOllamaModels(models) {
    const select = document.getElementById('model');
    if (!select) return;
    // Remove any existing Ollama group
    select.querySelectorAll('optgroup[label="Ollama"], option[value="separator-ollama"], [data-provider="ollama"]').forEach(o => o.remove());
    if (!models.length) return;
    
    const group = document.createElement('optgroup');
    group.label = 'Ollama';
    models.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.dataset.provider = 'ollama';
        group.appendChild(opt);
    });
    select.appendChild(group);
    uiManager.updateCustomDropdown(select);
}
window.syncOllamaModels = syncOllamaModels;

async function syncCustomEndpoints() {
    const { fetchCustomEndpoints } = await import('./api.js');
    const endpoints = await fetchCustomEndpoints();
    const select = document.getElementById('model');
    if (!select) return;
    // Remove any existing Custom group
    select.querySelectorAll('optgroup[label="Custom"], option[value="separator-custom"], [data-provider="custom"]').forEach(o => o.remove());
    if (!endpoints.length) return;
    
    const group = document.createElement('optgroup');
    group.label = 'Custom';
    endpoints.forEach(ep => {
        const opt = document.createElement('option');
        opt.value = ep.id;
        opt.textContent = ep.name;
        opt.dataset.provider = 'custom';
        opt.dataset.baseUrl = ep.base_url;
        opt.dataset.modelId = ep.model_id;
        opt.dataset.apiKey = ep.api_key || '';
        group.appendChild(opt);
    });
    select.appendChild(group);
    uiManager.updateCustomDropdown(select);
}
window.syncCustomEndpoints = syncCustomEndpoints;

function initOverseerRules() {
    const textarea = document.getElementById('overseer-rules-input');
    const saveBtn = document.getElementById('save-overseer-rules-btn');
    if (!textarea || !saveBtn) return;

    const modelSel = document.getElementById('overseer-model-select');
    if (modelSel) {
        modelSel.value = localStorage.getItem('overseer_model') || getDefaultModel();
        uiManager.initCustomDropdown(modelSel);
        modelSel.addEventListener('change', () => {
            localStorage.setItem('overseer_model', modelSel.value);
        });
    }

    let activePreset = null;

    function setActivePreset(key) {
        activePreset = key;
        document.querySelectorAll('.overseer-preset-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.preset === key);
        });
    }

    // Load general rules on init (no preset active)
    textarea.value = localStorage.getItem('overseer_custom_rules') || '';

    const builtinRulesChk = document.getElementById('overseer-builtin-rules');
    if (builtinRulesChk) {
        builtinRulesChk.checked = localStorage.getItem('overseer_builtin_rules') !== 'false';
        builtinRulesChk.addEventListener('change', () => {
            localStorage.setItem('overseer_builtin_rules', builtinRulesChk.checked);
        });
    }

    const autoAcceptChk = document.getElementById('overseer-auto-accept');
    if (autoAcceptChk) {
        autoAcceptChk.checked = localStorage.getItem('overseer_auto_accept') === 'true';
        autoAcceptChk.addEventListener('change', () => {
            localStorage.setItem('overseer_auto_accept', autoAcceptChk.checked);
            chatManager._overseerAutoAccept = autoAcceptChk.checked;
        });
    }

    saveBtn.addEventListener('click', () => {
        const key = activePreset
            ? `overseer_preset_${activePreset}`
            : 'overseer_custom_rules';
        localStorage.setItem(key, textarea.value);
        // Always keep overseer_custom_rules in sync — ChatManager reads it
        if (activePreset) localStorage.setItem('overseer_custom_rules', textarea.value);
        saveBtn.textContent = 'Saved ✓';
        setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
    });

    document.querySelectorAll('.overseer-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setActivePreset(btn.dataset.preset);
            textarea.value = localStorage.getItem(`overseer_preset_${btn.dataset.preset}`) || '';
        });
    });
}

function populateLegacyDom() {
    const ids = [
        'chat-messages', 'chat-form', 'message-input', 'quick-chat-btn', 'create-char-btn',
        'import-chat-btn', 'import-modal', 'import-name', 'import-character', 'import-file-input', 'import-drop-zone',
        'import-file-name', 'cancel-import-btn', 'do-import-btn',
        'config-modal', 'config-form', 'cancel-config-btn', 'save-config-btn',
        'config-list', 'chat-list', 'sidebar', 'toggle-sidebar-btn', 
        'avatar-upload-btn', 'avatar-upload', 'avatar-preview',
        'temperature', 'top_p', 'repetition_penalty', 'temp-value', 'top-p-value', 'rep-pen-value',
        'config-name', 'model', 'system_prompt', 'intro_statement', 'character_card',
        'max_tokens', 'enable_web_search', 'include_venice_system_prompt', 'uncensored_mode',
        'context-file-input', 'context-file-btn', 'file-cancel-btn', 
        'system-context-btn', 'system-context-input',
        'change-model-btn', 'view-context-btn', 'context-modal', 'context-list', 'close-context-btn', 'summarize-now-btn',
        'scroll-bottom-btn', 'scroll-top-btn', 'send-btn', 
        'splitter-left', 'splitter-right', 'sidebar-left', 'messages-container',
        'export-btn', 'export-count',
        'settings-btn', 'app-container'
    ];
    
    const toCamelCase = (str) => {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    };

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            dom[id] = el;
            const camel = toCamelCase(id);
            if (camel !== id) dom[camel] = el;
        }
    });
}
