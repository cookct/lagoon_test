/**
 * API Communication Layer
 */

export async function fetchConfigs() {
    const response = await fetch('/api/configs');
    return response.json();
}

export async function fetchChats() {
    const response = await fetch('/api/chats');
    return response.json();
}

export async function fetchConfig(configFilename) {
    try {
        const response = await fetch(`/api/config/${configFilename}`);
        if (!response.ok) throw new Error('Config not found');
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch config:", error);
        return null;
    }
}

export async function fetchChat(chatId) {
    const response = await fetch(`/api/chat/${chatId}`);
    return response.json();
}

export async function deleteConfigApi(configFilename) {
    const response = await fetch(`/api/config/${configFilename}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete');
    return response.json();
}

export async function copyConfigApi(configName) {
    const response = await fetch('/api/copy_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_name: configName })
    });
    if (!response.ok) throw new Error('Failed to copy character');
    return response.json();
}

export async function fetchLocalModels(url = 'http://localhost:11434') {
    const res = await fetch(`/api/models/local?url=${encodeURIComponent(url)}`);
    return res.ok ? res.json() : { models: [], error: 'Request failed' };
}

export async function fetchCustomEndpoints() {
    const r = await fetch('/api/custom_endpoints');
    return r.ok ? r.json() : [];
}

export async function saveCustomEndpoint(ep) {
    const r = await fetch('/api/custom_endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep)
    });
    return r.json();
}

export async function deleteCustomEndpoint(id) {
    const r = await fetch(`/api/custom_endpoints/${id}`, { method: 'DELETE' });
    return r.json();
}

export async function overseerCheckApi(responseText, configName, customRules = [], useBuiltinRules = true, overseerModel = '') {
    const response = await fetch('/api/overseer_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_text: responseText, config_name: configName, custom_rules: customRules, use_builtin_rules: useBuiltinRules, overseer_model: overseerModel })
    });
    return response.ok ? response.json() : null;
}


export async function deleteChatApi(chatId) {
    const response = await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete chat');
    return response.json();
}

export async function reparentChatsApi(oldParent, newParent) {
    const response = await fetch('/api/chats/reparent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_parent: oldParent, new_parent: newParent })
    });
    if (!response.ok) throw new Error('Failed to reparent chats');
    return response.json();
}
export async function saveConfigApi(filename, configData) {
    const response = await fetch('/api/save_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, config: configData })
    });
    return response.json();
}

export async function queueVideoApi(payload) {
    const response = await fetch('/api/video/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

export async function retrieveVideoApi(model, queueId) {
    const response = await fetch('/api/video/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, queue_id: queueId })
    });
    return response.json();
}

export async function queueTogetherVideoApi(payload) {
    const response = await fetch('/api/together/video/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

export async function retrieveTogetherVideoApi(jobId) {
    const response = await fetch(`/api/together/video/retrieve/${encodeURIComponent(jobId)}`);
    return response.json();
}

export async function saveChatApi(chatId, messages, config, parentConfig, displayName, keptMessages = null) {
    // Use provided keptMessages or import from state (with  to match other imports)
    let kept = keptMessages;
    if (kept === null) {
        const stateModule = await import('./state.js');
        kept = stateModule.state.keptMessages;
    }

    const response = await fetch('/api/save_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            messages,
            config,
            parent_config: parentConfig,
            display_name: displayName,
            kept_messages: Array.isArray(kept) ? kept : Array.from(kept || [])
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save chat.');
    }
    return response.json();
}

export async function uploadAvatarApi(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch('/api/upload_avatar', { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    return result;
}

export async function parseFileApi(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/parse_file', { method: 'POST', body: formData });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to parse file');
    }
    return response.json();
}

export async function importChatApi(text, displayName, config = {}) {
    const response = await fetch('/api/import_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, display_name: displayName, config })
    });
    return response.json();
}

export async function fetchSystemPrompts() {
    const response = await fetch('/api/system_prompts');
    return response.json();
}

export async function createSystemPrompt(name, content) {
    const response = await fetch('/api/system_prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content })
    });
    return response.json();
}

export async function updateSystemPrompt(id, data) {
    const response = await fetch(`/api/system_prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

export async function deleteSystemPrompt(id) {
    const response = await fetch(`/api/system_prompts/${id}`, { method: 'DELETE' });
    return response.json();
}

export function streamChat(chatId, messages, config, parentConfig, signal, sessionOverrides = {}, image = null) {
    // Strip avatar_url from config - it's only for UI display, not needed by API
    // Base64 avatars can be 40KB+, bloating every request
    const { avatar_url, ...apiConfig } = config;

    if (sessionOverrides.enable_e2ee !== undefined) apiConfig.enable_e2ee = sessionOverrides.enable_e2ee;

    const payload = {
        chat_id: chatId,
        messages,
        config: apiConfig,
        parent_config: parentConfig,
        summarize_mode: localStorage.getItem('summarize_mode') || 'auto'
    };

    if (image) {
        payload.image = image.data;
        payload.image_mime = image.mime;
    }

    if (config.provider === 'ollama') {
        payload.ollama_url = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
    }
    if (config.provider === 'custom') {
        payload.custom_base_url = config.custom_base_url;
        payload.custom_model_id = config.custom_model_id;
        payload.custom_api_key = config.custom_api_key || '';
    }

    return fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
}

export async function generateDetailedSummaryApi(chatId, messages) {
    const response = await fetch('/api/generate_detailed_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, messages })
    });
    return response.json();
}

export async function applySummaryApi(chatId, summaryText, messagesToDropCount, messages) {
    const response = await fetch('/api/apply_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, summary_text: summaryText, messages_to_drop_count: messagesToDropCount, messages })
    });
    return response.json();
}

export async function deleteSummaryApi(chatId, summaryId) {
    const response = await fetch('/api/delete_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, summary_id: summaryId })
    });
    return response.json();
}

export async function approveSummaryApi(chatId, summaryId, messages) {
    const response = await fetch('/api/approve_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, summary_id: summaryId, messages })
    });
    return response.json();
}

export async function analyzeEditApi(original, edited) {
    const response = await fetch('/api/analyze_edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original, edited })
    });
    return response.json();
}

export async function contextStatusApi(chatId, messages, model) {
    const response = await fetch('/api/context_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, messages, model })
    });
    return response.json();
}

export async function previewPrompt(chatId, messages, config, parentConfig) {
    try {
        const response = await fetch('/api/preview_prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                messages,
                config: config || {},
                parent_config: parentConfig || null
            })
        });
        return response.ok ? response.json() : null;
    } catch (e) {
        console.warn('[API] previewPrompt failed:', e);
        return null;
    }
}

export function updateBalanceDisplay(val) {
    const floatVal = parseFloat(val);
    const displayVal = isNaN(floatVal) ? val : floatVal.toFixed(2);
    const balanceEl = document.getElementById('balance-usd');
    if (balanceEl) balanceEl.textContent = displayVal;
}

export async function refreshBalance() {
    try {
        const resp = await fetch('/api/balance');
        const data = await resp.json();
        if (data.success && data.balance) {
            updateBalanceDisplay(data.balance);
            localStorage.setItem('lagoon_balance_usd', data.balance);
        }
    } catch (e) {
        console.debug('[API] refreshBalance failed:', e.message);
    }
}
