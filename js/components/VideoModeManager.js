/**
 * [VIDEO-MODE-ARCHITECTURE]
 * This component manages the dynamic UI generation for video models
 * based on the specs in modelConfigs.js.
 */

import { lagoonAlert, lagoonConfirm } from '../ui/dialog.js';
import { dom, state } from '../state.js';
import { addMessageToUI } from '../ui/messages.js';
import { modelConfigs } from '../core/modelConfigs.js';
import { uiManager } from '../core/UIManager.js';
import { queueVideoApi, retrieveVideoApi, refreshBalance, updateBalanceDisplay } from '../api.js';

export class VideoModeManager {
    constructor() {
        this.dom = {};
        this.currentActiveTarget = 'video-source';
        this.abortController = null;
    }



    init() {
        this.cacheDom();
        this.bindEvents();
        console.log('[VideoModeManager] Initialized');
    }

    cacheDom() {
        this.dom = {
            chatForm: document.getElementById('chat-form'),
            messageInput: document.getElementById('message-input'),
            videoCards: document.getElementById('video-cards-container'),
            videoParams: document.getElementById('video-params-panel'),
            videoParamsBody: document.querySelector('#video-params-panel .tool-section-body'),
            fileInput: document.getElementById('image-card-file-input'),
            modelSelect: document.getElementById('video-model-select'),
        };
    }

    bindEvents() {
        // Intercept form submit (Venice only — Together has its own handler)
        this.dom.chatForm.addEventListener('submit', (e) => {
            if (window.state.mode !== 'video') return;
            if (window.state.videoProvider === 'together') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this.generateVideo();
        }, true);

        // Model change -> refresh parameters (Venice only)
        this.dom.modelSelect.addEventListener('change', () => {
            if (window.state.mode === 'video' && window.state.videoProvider !== 'together') {
                this.refreshParameterPanel();
            }
        });

        // Card Upload/Paste/Clear
        const container = document.getElementById('video-cards-container');
        container.addEventListener('click', async (e) => {
            if (window.state.mode !== 'video') return;

            const uploadBtn = e.target.closest('.upload-btn');
            if (uploadBtn) {
                this.currentActiveTarget = uploadBtn.dataset.target;
                this.dom.fileInput.click();
                return;
            }

            const pasteBtn = e.target.closest('.paste-btn');
            if (pasteBtn) {
                const target = pasteBtn.dataset.target;
                try {
                    const clipboardItems = await navigator.clipboard.read();
                    for (const item of clipboardItems) {
                        for (const type of item.types) {
                            if (type.startsWith('image/')) {
                                const blob = await item.getType(type);
                                this.handleFile(blob, target);
                                return;
                            }
                        }
                    }
                    await lagoonAlert('No image found in clipboard.');
                } catch (err) {
                    console.error('[VideoModeManager] Paste failed:', err);
                    await lagoonAlert('Failed to read clipboard. Ensure you have granted permission.');
                }
                return;
            }

            const clearBtn = e.target.closest('.image-card-clear-btn');
            if (clearBtn) {
                const target = clearBtn.dataset.target;
                this.clearPreview(target);
                return;
            }
        });

        this.dom.fileInput.addEventListener('change', (e) => {
            if (window.state.mode !== 'video') return;
            const file = e.target.files[0];
            if (file) this.handleFile(file, this.currentActiveTarget);
            e.target.value = '';
        });

        // Re-fetch cost estimate when any parameter control changes
        this.dom.videoParamsBody.addEventListener('change', () => {
            clearTimeout(this._costDebounce);
            this._costDebounce = setTimeout(() => this.fetchCostEstimate(), 400);
        });
    }

    clearPreview(target) {
        const preview = document.getElementById(`preview-${target}`);
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }

        // Uncheck the box when cleared
        const checkbox = document.querySelector(`input.image-card-checkbox[data-target="${target}"]`);
        if (checkbox) checkbox.checked = false;
        
        // Remove from state based on target name
        if (target === 'video-source') {
            delete window.state.currentVideoConfig.image_data;
        } else if (target === 'video-end') {
            delete window.state.currentVideoConfig.end_image_data;
        } else if (target.startsWith('video-ref-')) {
            const idx = parseInt(target.split('-').pop(), 10) - 1;
            if (!window.state.currentVideoConfig.ref_images) return;
            window.state.currentVideoConfig.ref_images[idx] = null;
        }
    }

    /**
 * [VIDEO-DYNAMIC-UI]
 * Rebuilds the parameter panel and card visibility based on modelConfigs.js specs
 */
refreshParameterPanel() {
    if (window.state.mode !== 'video') return;
    if (window.state.videoProvider === 'together') return;

    const modelId = this.dom.modelSelect.value;
    const config = modelConfigs.models?.[modelId] || null;
    
    if (!this.dom.videoParamsBody) return;
    this.dom.videoParamsBody.innerHTML = '';

    // Preserve existing image data before reset
    const preservedImageData = window.state.currentVideoConfig?.image_data;
    const preservedEndImageData = window.state.currentVideoConfig?.end_image_data;

    // Reset current config for the new model
    window.state.currentVideoConfig = { model: modelId };

    // Restore preserved image data (only restore end image if new model supports it)
    if (preservedImageData) window.state.currentVideoConfig.image_data = preservedImageData;
    if (preservedEndImageData && config?.supports_end_image === true) {
        window.state.currentVideoConfig.end_image_data = preservedEndImageData;
    }

    // Init hidden params (in params but not ui_controls) that have defaults
    if (config) {
        Object.entries(config.params || {}).forEach(([key, param]) => {
            if (!(config.ui_controls || []).includes(key) && param.default !== undefined) {
                state.currentVideoConfig[key] = param.default;
            }
        });
    }

    // --- 1. Dynamic Card Visibility (Left Sidebar) ---
    const sourceCard = document.getElementById('card-video-source');
    const endCard = document.getElementById('card-video-end');
    const hasConfig = config !== null;
    
    if (sourceCard) {
        const showSource = hasConfig && config.category !== 'text-to-video' && config.supports_start_image !== false;
        sourceCard.style.display = showSource ? '' : 'none';
    }

    if (endCard) {
        const hasEndSupport = config?.supports_end_image === true;
        endCard.style.display = hasEndSupport ? '' : 'none';
    }

    const refCards = document.getElementById('video-ref-cards');
    if (refCards) {
        const hasRefSupport = config?.supports_reference_images === true;
        refCards.style.display = hasRefSupport ? 'flex' : 'none';
        refCards.style.flexDirection = 'column';
    }

    // --- 2. Dynamic Parameter Panel (Right Sidebar) ---
    if (!hasConfig) {
        this.dom.videoParamsBody.innerHTML = '<p class="tool-hint">Select a model to see parameters.</p>';
        this.fetchCostEstimate();
        this.renderVideoLibrary();
        return;
    }
    if (!config.ui_controls || config.ui_controls.length === 0) {
        this.dom.videoParamsBody.innerHTML = '<p class="tool-hint">No adjustable parameters for this model.</p>';
        this.fetchCostEstimate();
        this.renderVideoLibrary();
        return;
    }

    config.ui_controls.forEach(ctrlKey => {
            const param = config.params[ctrlKey];
            if (!param) return;

            const row = document.createElement('div');
            row.className = 'param-row';
            row.style.marginBottom = '12px';

            const label = document.createElement('label');
            label.className = 'field-label-muted';
            label.style.display = 'block';
            label.style.marginBottom = '4px';
            label.textContent = this.formatLabel(ctrlKey);
            row.appendChild(label);

            let input;
            if (param.type === 'enum') {
                input = document.createElement('select');
                input.className = 'select-input';
                param.options.forEach(opt => {
                    const o = new Option(opt, opt);
                    if (opt === param.default) o.selected = true;
                    input.appendChild(o);
                });
                input.onchange = (e) => state.currentVideoConfig[ctrlKey] = e.target.value;
                // Init state
                state.currentVideoConfig[ctrlKey] = input.value;
            } else if (param.type === 'bool') {
                const labelWrap = document.createElement('label');
                labelWrap.style.display = 'flex';
                labelWrap.style.alignItems = 'center';
                labelWrap.style.gap = '8px';
                labelWrap.style.cursor = 'pointer';
                
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = param.default || false;
                input.onchange = (e) => state.currentVideoConfig[ctrlKey] = e.target.checked;
                
                const span = document.createElement('span');
                span.style.fontSize = '0.8rem';
                span.textContent = 'Enable';
                
                labelWrap.appendChild(input);
                labelWrap.appendChild(span);
                row.appendChild(labelWrap);
                // Init state
                state.currentVideoConfig[ctrlKey] = input.checked;
            } else if (param.type === 'int' || param.type === 'float') {
                input = document.createElement('input');
                input.type = 'number';
                input.className = 'input-small-num';
                input.style.width = '100%';
                input.style.background = 'var(--bg-darker)';
                input.style.border = '1px solid var(--border)';
                input.style.color = 'var(--text-main)';
                input.style.padding = '4px 8px';
                input.style.borderRadius = '4px';
                
                if (param.min !== undefined) input.min = param.min;
                if (param.max !== undefined) input.max = param.max;
                input.value = param.default !== undefined ? param.default : '';
                
                input.oninput = (e) => {
                    const val = param.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                    state.currentVideoConfig[ctrlKey] = val;
                };
                // Init state
                state.currentVideoConfig[ctrlKey] = param.type === 'int' ? parseInt(input.value, 10) : parseFloat(input.value);
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'input-small-num'; // Reuse style
                input.style.width = '100%';
                input.value = param.default || '';
                input.oninput = (e) => state.currentVideoConfig[ctrlKey] = e.target.value;
                // Init state
                state.currentVideoConfig[ctrlKey] = input.value;
            }

            if (input && param.type !== 'bool') row.appendChild(input);
            this.dom.videoParamsBody.appendChild(row);

            // Initialize custom dropdown if it's a select
            if (param.type === 'enum') {
                uiManager.initCustomDropdown(input);
            }
        });

        this.fetchCostEstimate();
        this.renderVideoLibrary();
    }

    formatLabel(key) {
        return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    async handleFile(file, target) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(`preview-${target}`);
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
                preview.style.display = 'flex';

                // Automatically check the box when image is loaded
                const checkbox = document.querySelector(`input.image-card-checkbox[data-target="${target}"]`);
                if (checkbox) checkbox.checked = true;

                // Store in specific state properties
                if (target === 'video-source') {
                    state.currentVideoConfig.image_data = e.target.result;
                } else if (target === 'video-end') {
                    state.currentVideoConfig.end_image_data = e.target.result;
                } else if (target.startsWith('video-ref-')) {
                    const idx = parseInt(target.split('-').pop(), 10) - 1;
                    if (!state.currentVideoConfig.ref_images) state.currentVideoConfig.ref_images = [];
                    state.currentVideoConfig.ref_images[idx] = e.target.result;
                }
            }
        };
        reader.readAsDataURL(file);
    }

    async generateVideo() {
        const prompt = this.dom.messageInput.value.trim();
        if (!prompt) {
            lagoonAlert('Please enter a prompt for video generation.');
            return;
        }

        const modelId = this.dom.modelSelect.value;
        const config = modelConfigs.models?.[modelId] || null;
        const msgConfig = { model: modelId, character_name: config?.display_name || modelId };

        // Validation
        const requiresStartImage = config?.category === 'image-to-video' && config?.supports_start_image !== false;
        if (requiresStartImage && !state.currentVideoConfig.image_data) {
            lagoonAlert('This model requires a source image. Please upload one in the left sidebar.');
            return;
        }

        addMessageToUI('user', prompt);
        this.dom.messageInput.value = '';
        this.dom.messageInput.style.height = '44px';

        // Prepare the payload according to Venice Docs
        const payload = {
            model: modelId,
            prompt: prompt,
            ...state.currentVideoConfig
        };

        // aspect_ratio "Auto" means omit the key (model determines it); duration "Auto" is a real API value
        if (payload.aspect_ratio === 'Auto') delete payload.aspect_ratio;

        // Clean up internal data names to match API expected names
        if (payload.image_data) {
            payload.image_url = payload.image_data;
            delete payload.image_data;
        } else if ('image_url' in payload && !payload.image_url) {
            delete payload.image_url;
        }

        if (payload.end_image_data && config?.supports_end_image !== false) {
            payload.end_image_url = payload.end_image_data;
        }
        delete payload.end_image_data;

        // Collect checked reference images
        if (payload.ref_images) {
            const refs = [];
            payload.ref_images.forEach((data, idx) => {
                if (!data) return;
                const checkbox = document.querySelector(`input.image-card-checkbox[data-target="video-ref-${idx + 1}"]`);
                if (checkbox?.checked) refs.push(data);
            });
            delete payload.ref_images;
            if (refs.length > 0) {
                payload.reference_image_urls = refs;
            }
        }

        console.log('[VideoModeManager] Dispatching job:', payload);

        try {
            const response = await queueVideoApi(payload);
            const queueId = response.queue_id || response.request_id;
            const returnedModel = response.model || modelId;
            const queueDownloadUrl = response.download_url || null;

            if (response._balance) {
                updateBalanceDisplay(response._balance);
                localStorage.setItem('lagoon_balance_usd', response._balance);
            } else {
                refreshBalance();
            }

            if (queueId) {
                const statusMsgId = `video-status-${queueId}`;
                addMessageToUI('assistant', `[[VIDEO_STATUS_MARKER:${queueId}]]`, msgConfig);
                this.pollJobStatus(returnedModel, queueId, statusMsgId, queueDownloadUrl);
            } else {
                const errorMsg = response.error || 'Unknown error';
                addMessageToUI('assistant', `**Error queuing video:** ${errorMsg}`, msgConfig);
                if (response.details) console.error('[VideoModeManager] Error details:', response.details);
            }
        } catch (err) {
            console.error('[VideoModeManager] Generation failed:', err);
            addMessageToUI('assistant', `**Generation failed:** ${err.message}`, msgConfig);
        }
    }

    renderGauge(container, percent, remainingSec) {
        const pct = Math.max(0, Math.min(100, Math.round(percent)));
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - pct / 100);
        let remainingLabel = 'Est. Remaining: —';
        if (remainingSec != null && isFinite(remainingSec) && remainingSec >= 0) {
            const total = Math.ceil(remainingSec);
            const mm = String(Math.floor(total / 60)).padStart(2, '0');
            const ss = String(total % 60).padStart(2, '0');
            remainingLabel = `Est. Remaining: ${mm}:${ss}`;
        }

        container.innerHTML = `
            <div class="video-gauge-box">
                <svg width="140" height="140" viewBox="0 0 140 140" style="transform:rotate(-90deg);">
                    <circle cx="70" cy="70" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
                    <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#3872aa" stroke-width="10"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
                            style="transition: stroke-dashoffset 0.5s ease;"/>
                    <text x="70" y="75" text-anchor="middle" fill="var(--text-main)" font-size="22" font-weight="600"
                          style="transform:rotate(90deg); transform-origin:70px 70px;">${pct}%</text>
                </svg>
                <div style="font-size:12px; color:var(--text-dim);">${remainingLabel}</div>
            </div>
        `;
    }

    renderPending(container) {
        container.innerHTML = `
            <div class="video-gauge-box">
                <div style="font-size:12px; color:var(--text-dim);">Registering Job…</div>
            </div>
        `;
    }

    async pollJobStatus(model, queueId, elementId, queueDownloadUrl) {
        // Phase 1: attach container and show pending gauge immediately
        let container = null;
        let attachAttempts = 0;
        while (!container) {
            const messages = document.querySelectorAll('.message-content');
            for (const msg of messages) {
                if (msg.innerHTML.includes(`[[VIDEO_STATUS_MARKER:${queueId}]]`)) {
                    msg.innerHTML = msg.innerHTML.replace(
                        `[[VIDEO_STATUS_MARKER:${queueId}]]`,
                        `<div id="${elementId}" class="video-status-container"></div>`
                    );
                    container = document.getElementById(elementId);
                    if (container) this.renderPending(container);
                    break;
                }
            }
            if (!container) {
                if (++attachAttempts > 20) return;
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Give Venice a moment to register the job before first poll
        await new Promise(r => setTimeout(r, 3000));

        // Phase 2: poll until done
        while (true) {
            try {
                const data = await retrieveVideoApi(model, queueId);
                const status = data.status;

                if (data._balance) {
                    updateBalanceDisplay(data._balance);
                    localStorage.setItem('lagoon_balance_usd', data._balance);
                } else {
                    refreshBalance();
                }

                if (status === 'COMPLETED' || data.video_url || data.download_url) {
                    const videoUrl = data.video_url || data.download_url || queueDownloadUrl;

                    // Hold at 100% while video preloads so there's no blank gap
                    this.renderGauge(container, 100, 0);
                    await new Promise(resolve => {
                        const vid = document.createElement('video');
                        const done = () => resolve();
                        vid.addEventListener('loadeddata', done, { once: true });
                        vid.addEventListener('error', done, { once: true });
                        setTimeout(done, 5000);
                        vid.src = videoUrl;
                    });

                    container.innerHTML = `
                        <div class="video-result">
                            <div class="video-success">Video Ready</div>
                            <video controls src="${videoUrl}" style="width:100%; border-radius:8px; border:1px solid var(--border);"></video>
                            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center;">
                                <a href="${videoUrl}" target="_blank" download class="tool-btn-sm primary" style="text-decoration:none; display:inline-block; font-size:11px;">Download MP4</a>
                                <button class="tool-btn-sm vid-gif-btn" style="font-size:11px;">Create GIF</button>
                                <button class="tool-btn-sm vid-apng-btn" style="font-size:11px;">Create APNG</button>
                                <button class="tool-btn-sm vid-webm-btn" style="font-size:11px;">Create WebM</button>
                            </div>
                        </div>
                    `;
                    container.querySelector('.vid-gif-btn').addEventListener('click', () => this.showGifPicker(videoUrl));
                    container.querySelector('.vid-apng-btn').addEventListener('click', () => this.showApngPicker(videoUrl));
                    container.querySelector('.vid-webm-btn').addEventListener('click', () => this.showWebmPicker(videoUrl));
                    this.renderVideoLibrary();
                    return;
                }

                if (status === 'FAILED') {
                    container.innerHTML = `<div class="video-error">Generation Failed: ${data.error || 'Venice Error'}</div>`;
                    return;
                }

                if (status === 'PENDING') {
                    this.renderPending(container);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }

                // PROCESSING (or unknown) — show gauge
                const avg = Number(data.average_execution_time) || 0;
                const cur = Number(data.execution_duration) || 0;
                const percent = avg > 0 ? (cur / avg) * 100 : 0;
                const remainingSec = avg > 0 ? Math.max(0, (avg - cur) / 1000) : null;
                this.renderGauge(container, percent, remainingSec);

                await new Promise(r => setTimeout(r, 3000));
            } catch (err) {
                console.error('[VideoModeManager] Polling error:', err);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    async renderVideoLibrary() {
        const body = document.getElementById('video-library-body');
        if (!body) return;

        let files;
        try {
            const resp = await fetch('/api/video/files');
            files = await resp.json();
        } catch {
            body.innerHTML = '<p class="tool-hint" style="color:#f38ba8;">Failed to load.</p>';
            return;
        }

        if (!files.length) {
            body.innerHTML = '<p class="tool-hint">No videos cached.</p>';
            return;
        }

        body.innerHTML = '';
        files.forEach(f => {
            const mb = (f.size / 1048576).toFixed(1);
            const date = new Date(f.mtime * 1000);
            const label = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · ${mb} MB`;
            const videoUrl = `/api/video/file/${f.filename}`;
            const modelId = f.model || null;  // Model ID parsed from filename

            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 0; border-bottom:1px solid var(--border);';

            const info = document.createElement('div');
            info.style.cssText = 'flex:1; min-width:0;';
            const ts = document.createElement('button');
            ts.style.cssText = 'background:none; border:none; padding:0; font-size:11px; color:var(--ansi-cyan); cursor:pointer; text-align:left;';
            ts.textContent = label;
            ts.addEventListener('click', () => this.openVideoInChat(videoUrl, modelId));
            info.appendChild(ts);

            const del = document.createElement('button');
            del.textContent = '✕';
            del.title = 'Delete';
            del.className = 'tool-btn-sm';
            del.style.cssText = 'flex-shrink:0; color:#f38ba8; padding:2px 6px;';
            del.addEventListener('click', async () => {
                const ok = await lagoonConfirm('Delete this video from cache? This cannot be undone.');
                if (!ok) return;
                del.disabled = true;
                const r = await fetch(`/api/video/file/${f.filename}`, { method: 'DELETE' });
                if ((await r.json()).success) {
                    row.remove();
                    if (!body.children.length) body.innerHTML = '<p class="tool-hint">No videos cached.</p>';
                } else {
                    del.disabled = false;
                }
            });

            row.appendChild(info);
            row.appendChild(del);
            body.appendChild(row);
        });
    }

    openVideoInChat(videoUrl, modelId = null) {
        const markerId = `vlib-${Date.now()}`;
        // Build config with model for avatar/logo lookup
        const msgConfig = modelId ? { model: modelId, character_name: modelId } : {};
        addMessageToUI('assistant', `[[VIDEO_LIB_MARKER:${markerId}]]`, msgConfig);
        requestAnimationFrame(() => {
            const messages = document.querySelectorAll('.message-content');
            for (const msg of messages) {
                if (msg.innerHTML.includes(`[[VIDEO_LIB_MARKER:${markerId}]]`)) {
                    msg.innerHTML = `
                        <div class="video-result">
                            <video controls src="${videoUrl}" style="width:100%; border-radius:8px; border:1px solid var(--border);"></video>
                            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                <a href="${videoUrl}" download class="tool-btn-sm primary" style="text-decoration:none; display:inline-block; font-size:11px;">Download MP4</a>
                                <button class="tool-btn-sm vid-gif-btn" style="font-size:11px;">Create GIF</button>
                                <button class="tool-btn-sm vid-apng-btn" style="font-size:11px;">Create APNG</button>
                                <button class="tool-btn-sm vid-webm-btn" style="font-size:11px;">Create WebM</button>
                            </div>
                        </div>
                    `;
                    msg.querySelector('.vid-gif-btn')?.addEventListener('click', () => this.showGifPicker(videoUrl));
                    msg.querySelector('.vid-apng-btn')?.addEventListener('click', () => this.showApngPicker(videoUrl));
                    msg.querySelector('.vid-webm-btn')?.addEventListener('click', () => this.showWebmPicker(videoUrl));
                    break;
                }
            }
        });
    }

    async fetchCostEstimate() {
        const el = document.getElementById('video-cost-estimate');
        if (!el) return;
        const cfg = window.state.currentVideoConfig;
        if (!cfg?.model) { el.textContent = ''; return; }

        el.textContent = '…';
        const config = modelConfigs.models?.[cfg.model];
        const duration = cfg.duration || config?.params?.duration?.default || '5s';

        const payload = { model: cfg.model, duration };
        for (const k of ['resolution', 'aspect_ratio', 'audio']) {
            if (cfg[k] !== undefined) payload[k] = cfg[k];
        }
        try {
            const resp = await fetch('/api/video/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            el.textContent = data.quote != null ? `~$${Number(data.quote).toFixed(2)}` : '';
        } catch {
            el.textContent = '';
        }
    }

    showGifPicker(videoUrl) {
        const filename = videoUrl.split('/').pop();
        const baseName = filename.replace(/\.mp4$/i, '');

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999;';
        overlay.innerHTML = `
            <div style="background:var(--bg-2,#1e1e2e);border:1px solid var(--border);border-radius:10px;padding:24px;min-width:360px;max-width:500px;width:90%;">
                <div style="font-size:14px;font-weight:600;margin-bottom:16px;color:var(--fg,#cdd6f4);">Create GIF</div>
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Output directory</label>
                <input id="gif-out-dir" type="text" value="~/Videos" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:12px;" />
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Base filename (no extension)</label>
                <input id="gif-out-name" type="text" value="${baseName}" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:16px;" />
                <div id="gif-status" style="font-size:11px;min-height:16px;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="gif-cancel-btn" class="tool-btn-sm" style="font-size:11px;">Cancel</button>
                    <button id="gif-confirm-btn" class="tool-btn-sm primary" style="font-size:11px;">Create GIF</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const statusEl = overlay.querySelector('#gif-status');
        const confirmBtn = overlay.querySelector('#gif-confirm-btn');

        overlay.querySelector('#gif-cancel-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });

        confirmBtn.addEventListener('click', async () => {
            const dir = overlay.querySelector('#gif-out-dir').value.trim();
            const name = overlay.querySelector('#gif-out-name').value.trim();
            if (!dir || !name) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing…';
            statusEl.style.color = 'var(--ansi-cyan,#89dceb)';
            statusEl.textContent = 'Extracting frames and encoding GIF — this may take a moment…';

            try {
                const resp = await fetch('/api/video/create_gif', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
                });
                const result = await resp.json();
                if (result.success) {
                    statusEl.style.color = 'var(--ansi-green,#a6e3a1)';
                    statusEl.innerHTML = `Done!<br>GIF: <code>${result.gif_path}</code><br>Frames: <code>${result.frames_dir}</code>`;
                    confirmBtn.textContent = 'Close';
                    confirmBtn.disabled = false;
                    confirmBtn.addEventListener('click', () => overlay.remove(), { once: true });
                } else {
                    statusEl.style.color = '#f38ba8';
                    statusEl.textContent = `Error: ${result.error}`;
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Create GIF';
                }
            } catch (err) {
                statusEl.style.color = '#f38ba8';
                statusEl.textContent = `Network error: ${err.message}`;
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Create GIF';
            }
        });
    }

    showApngPicker(videoUrl) {
        const filename = videoUrl.split('/').pop();
        const baseName = filename.replace(/\.mp4$/i, '');

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999;';
        overlay.innerHTML = `
            <div style="background:var(--bg-2,#1e1e2e);border:1px solid var(--border);border-radius:10px;padding:24px;min-width:360px;max-width:500px;width:90%;">
                <div style="font-size:14px;font-weight:600;margin-bottom:16px;color:var(--fg,#cdd6f4);">Create APNG</div>
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Output directory</label>
                <input id="apng-out-dir" type="text" value="~/Videos" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:12px;" />
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Base filename (no extension)</label>
                <input id="apng-out-name" type="text" value="${baseName}" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:16px;" />
                <div id="apng-status" style="font-size:11px;min-height:16px;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="apng-cancel-btn" class="tool-btn-sm" style="font-size:11px;">Cancel</button>
                    <button id="apng-confirm-btn" class="tool-btn-sm primary" style="font-size:11px;">Create APNG</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const statusEl = overlay.querySelector('#apng-status');
        const confirmBtn = overlay.querySelector('#apng-confirm-btn');

        overlay.querySelector('#apng-cancel-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });

        confirmBtn.addEventListener('click', async () => {
            const dir = overlay.querySelector('#apng-out-dir').value.trim();
            const name = overlay.querySelector('#apng-out-name').value.trim();
            if (!dir || !name) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing…';
            statusEl.style.color = 'var(--ansi-cyan,#89dceb)';
            statusEl.textContent = 'Extracting frames and encoding APNG — this may take a moment…';

            try {
                const resp = await fetch('/api/video/create_apng', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
                });
                const result = await resp.json();
                if (result.success) {
                    statusEl.style.color = 'var(--ansi-green,#a6e3a1)';
                    statusEl.innerHTML = `Done!<br>APNG: <code>${result.apng_path}</code><br>Frames: <code>${result.frames_dir}</code>`;
                    confirmBtn.textContent = 'Close';
                    confirmBtn.disabled = false;
                    confirmBtn.addEventListener('click', () => overlay.remove(), { once: true });
                } else {
                    statusEl.style.color = '#f38ba8';
                    statusEl.textContent = `Error: ${result.error}`;
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Create APNG';
                }
            } catch (err) {
                statusEl.style.color = '#f38ba8';
                statusEl.textContent = `Network error: ${err.message}`;
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Create APNG';
            }
        });
    }

    showWebmPicker(videoUrl) {
        const filename = videoUrl ? videoUrl.split('/').pop() : null;
        const baseName = filename ? filename.replace(/\.mp4$/i, '') : '';

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999;';
        document.body.appendChild(overlay);
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });

        const modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg-2,#1e1e2e);border:1px solid var(--border);border-radius:10px;padding:24px;min-width:440px;max-width:580px;width:90%;max-height:85vh;overflow-y:auto;';
        overlay.appendChild(modal);

        // No source video — skip convert tab, land on extract
        let activeTab = filename ? 'convert' : 'extract';

        // ── helpers ──────────────────────────────────────────────────────────

        const lbl = (text) => {
            const el = document.createElement('label');
            el.style.cssText = 'display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;';
            el.textContent = text;
            return el;
        };

        const textInput = (value) => {
            const el = document.createElement('input');
            el.type = 'text';
            el.value = value;
            el.style.cssText = 'width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:12px;';
            return el;
        };

        const makeFps = (def = 24) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;';

            const label = document.createElement('span');
            label.style.cssText = 'font-size:11px;color:var(--fg-muted,#6c7086);white-space:nowrap;';
            label.textContent = 'FPS';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 1; slider.max = 60; slider.value = def;
            slider.style.cssText = 'flex:1;accent-color:var(--accent,#89b4fa);';

            const num = document.createElement('input');
            num.type = 'number';
            num.min = 1; num.max = 120; num.value = def;
            num.style.cssText = 'width:52px;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--fg,#cdd6f4);font-size:12px;text-align:center;';

            slider.addEventListener('input', () => { num.value = slider.value; });
            num.addEventListener('input', () => { slider.value = Math.min(60, parseInt(num.value) || def); });

            row.append(label, slider, num);
            return { el: row, getValue: () => parseInt(num.value) || def };
        };

        // Path picker — opens a fixed-position browser dropdown
        const makePicker = (mode, defaultPath) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'margin-bottom:12px;';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;';
            wrapper.appendChild(row);

            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultPath;
            input.style.cssText = 'flex:1;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;min-width:0;';
            row.appendChild(input);

            const browseBtn = document.createElement('button');
            browseBtn.className = 'tool-btn-sm';
            browseBtn.style.cssText = 'font-size:11px;white-space:nowrap;flex-shrink:0;';
            browseBtn.textContent = 'Browse';
            row.appendChild(browseBtn);

            // Dropdown — fixed so it escapes overflow:auto on the modal
            const drop = document.createElement('div');
            drop.style.cssText = 'display:none;position:fixed;z-index:10000;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.6);flex-direction:column;min-width:320px;';
            document.body.appendChild(drop);

            const navBar = document.createElement('div');
            navBar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--border);flex-shrink:0;';
            drop.appendChild(navBar);

            const upBtn = document.createElement('button');
            upBtn.className = 'tool-btn-sm';
            upBtn.style.cssText = 'font-size:10px;flex-shrink:0;';
            upBtn.textContent = '↑ Up';
            navBar.appendChild(upBtn);

            const pathSpan = document.createElement('span');
            pathSpan.style.cssText = 'font-size:10px;color:var(--fg-muted,#6c7086);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            navBar.appendChild(pathSpan);

            if (mode === 'dir') {
                const useBtn = document.createElement('button');
                useBtn.className = 'tool-btn-sm primary';
                useBtn.style.cssText = 'font-size:10px;white-space:nowrap;flex-shrink:0;';
                useBtn.textContent = 'Use Folder';
                useBtn.addEventListener('click', () => {
                    input.value = pathSpan.dataset.path || '';
                    closeDrop();
                });
                navBar.appendChild(useBtn);
            }

            const entriesDiv = document.createElement('div');
            entriesDiv.style.cssText = 'overflow-y:auto;max-height:180px;';
            drop.appendChild(entriesDiv);

            const positionDrop = () => {
                const rect = row.getBoundingClientRect();
                drop.style.top = `${rect.bottom + 4}px`;
                drop.style.left = `${rect.left}px`;
                drop.style.width = `${rect.width}px`;
            };

            const loadEntries = async (path) => {
                entriesDiv.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--fg-muted,#6c7086);">Loading…</div>';
                try {
                    const filter = mode === 'webm' ? 'webm' : 'dirs';
                    const r = await fetch(`/api/video/browse?path=${encodeURIComponent(path)}&filter=${filter}`);
                    const data = await r.json();

                    pathSpan.textContent = data.path;
                    pathSpan.dataset.path = data.path;
                    upBtn.disabled = !data.parent;
                    upBtn.onclick = () => { if (data.parent) loadEntries(data.parent); };

                    entriesDiv.innerHTML = '';
                    if (!data.entries.length) {
                        entriesDiv.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--fg-muted,#6c7086);">Empty</div>';
                        return;
                    }
                    data.entries.forEach(entry => {
                        const item = document.createElement('div');
                        item.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;font-size:12px;color:${entry.is_dir ? 'var(--fg,#cdd6f4)' : 'var(--ansi-green,#a6e3a1)'};`;
                        item.textContent = (entry.is_dir ? '📁 ' : '📄 ') + entry.name;
                        item.addEventListener('mouseover', () => { item.style.background = 'var(--bg-3,#313244)'; });
                        item.addEventListener('mouseout', () => { item.style.background = ''; });
                        item.addEventListener('click', () => {
                            if (entry.is_dir) {
                                loadEntries(entry.path);
                            } else {
                                input.value = entry.path;
                                closeDrop();
                            }
                        });
                        entriesDiv.appendChild(item);
                    });
                } catch {
                    entriesDiv.innerHTML = '<div style="padding:8px;font-size:11px;color:#f38ba8;">Error loading directory</div>';
                }
            };

            const openDrop = () => {
                positionDrop();
                drop.style.display = 'flex';
                loadEntries(input.value.trim() || defaultPath);
            };

            const closeDrop = () => { drop.style.display = 'none'; };

            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                drop.style.display === 'none' ? openDrop() : closeDrop();
            });

            // Close when clicking outside
            const outsideClick = (e) => {
                if (!wrapper.contains(e.target) && !drop.contains(e.target)) closeDrop();
            };
            document.addEventListener('click', outsideClick);

            // Reposition on scroll/resize
            const reposition = () => { if (drop.style.display !== 'none') positionDrop(); };
            window.addEventListener('resize', reposition);
            modal.addEventListener('scroll', reposition);

            // Cleanup drop from body when overlay closes
            const observer = new MutationObserver(() => {
                if (!document.body.contains(overlay)) {
                    drop.remove();
                    document.removeEventListener('click', outsideClick);
                    window.removeEventListener('resize', reposition);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true });

            return { el: wrapper, getValue: () => input.value.trim() };
        };

        const makeFooter = (actionLabel, onAction) => {
            const statusEl = document.createElement('div');
            statusEl.style.cssText = 'font-size:11px;min-height:16px;margin-bottom:12px;word-break:break-all;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'tool-btn-sm';
            cancelBtn.style.fontSize = '11px';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => overlay.remove());

            const actionBtn = document.createElement('button');
            actionBtn.className = 'tool-btn-sm primary';
            actionBtn.style.fontSize = '11px';
            actionBtn.textContent = actionLabel;
            actionBtn.addEventListener('click', () => onAction(statusEl, actionBtn));

            btnRow.append(cancelBtn, actionBtn);
            return { statusEl, btnRow };
        };

        // ── tab renderers ────────────────────────────────────────────────────

        const renderConvert = () => {
            const dirPicker = makePicker('dir', '~/Videos');
            modal.appendChild(lbl('Output folder'));
            modal.appendChild(dirPicker.el);

            const nameInput = textInput(baseName);
            modal.appendChild(lbl('Filename (no extension)'));
            modal.appendChild(nameInput);

            const { statusEl, btnRow } = makeFooter('Create WebM', async (status, btn) => {
                const dir = dirPicker.getValue();
                const name = nameInput.value.trim();
                if (!dir || !name) return;

                btn.disabled = true;
                btn.textContent = 'Processing…';
                status.style.color = 'var(--ansi-cyan,#89dceb)';
                status.textContent = 'Encoding WebM with alpha — this may take a moment…';

                try {
                    const resp = await fetch('/api/video/create_webm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
                    });
                    const result = await resp.json();
                    if (result.success) {
                        status.style.color = 'var(--ansi-green,#a6e3a1)';
                        status.innerHTML = `Done!<br>Saved: <code>${result.webm_path}</code>`;
                        btn.textContent = 'Close'; btn.disabled = false;
                        btn.addEventListener('click', () => overlay.remove(), { once: true });
                    } else {
                        status.style.color = '#f38ba8';
                        status.textContent = `Error: ${result.error}`;
                        btn.disabled = false; btn.textContent = 'Create WebM';
                    }
                } catch (err) {
                    status.style.color = '#f38ba8';
                    status.textContent = `Network error: ${err.message}`;
                    btn.disabled = false; btn.textContent = 'Create WebM';
                }
            });
            modal.appendChild(statusEl);
            modal.appendChild(btnRow);
        };

        const renderExtract = () => {
            const filePicker = makePicker('webm', '~/Videos');
            modal.appendChild(lbl('Source WebM file'));
            modal.appendChild(filePicker.el);

            const dirPicker = makePicker('dir', '~/Videos');
            modal.appendChild(lbl('Output folder (frames saved here)'));
            modal.appendChild(dirPicker.el);

            const fps = makeFps(24);
            modal.appendChild(lbl('FPS'));
            modal.appendChild(fps.el);

            const { statusEl, btnRow } = makeFooter('Extract Frames', async (status, btn) => {
                const webmPath = filePicker.getValue();
                const dir = dirPicker.getValue();
                if (!webmPath || !dir) {
                    status.style.color = '#f38ba8';
                    status.textContent = 'Select a WebM file and output folder.';
                    return;
                }

                btn.disabled = true;
                btn.textContent = 'Extracting…';
                status.style.color = 'var(--ansi-cyan,#89dceb)';
                status.textContent = 'Extracting frames…';

                try {
                    const resp = await fetch('/api/video/extract_frames', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ webm_path: webmPath, output_dir: dir, fps: fps.getValue() })
                    });
                    const result = await resp.json();
                    if (result.success) {
                        status.style.color = 'var(--ansi-green,#a6e3a1)';
                        status.innerHTML = `Done! ${result.frame_count} frames<br>Folder: <code>${result.frames_dir}</code>`;
                        btn.textContent = 'Close'; btn.disabled = false;
                        btn.addEventListener('click', () => overlay.remove(), { once: true });
                    } else {
                        status.style.color = '#f38ba8';
                        status.textContent = `Error: ${result.error}`;
                        btn.disabled = false; btn.textContent = 'Extract Frames';
                    }
                } catch (err) {
                    status.style.color = '#f38ba8';
                    status.textContent = `Network error: ${err.message}`;
                    btn.disabled = false; btn.textContent = 'Extract Frames';
                }
            });
            modal.appendChild(statusEl);
            modal.appendChild(btnRow);
        };

        const renderCombine = () => {
            const framesDirPicker = makePicker('dir', '~/Videos');
            modal.appendChild(lbl('Frames folder'));
            modal.appendChild(framesDirPicker.el);

            const outDirPicker = makePicker('dir', '~/Videos');
            modal.appendChild(lbl('Output folder'));
            modal.appendChild(outDirPicker.el);

            const nameInput = textInput('output');
            modal.appendChild(lbl('Output filename (no extension)'));
            modal.appendChild(nameInput);

            const fps = makeFps(24);
            modal.appendChild(lbl('FPS (match the rate used during extraction)'));
            modal.appendChild(fps.el);

            const { statusEl, btnRow } = makeFooter('Create WebM', async (status, btn) => {
                const framesDir = framesDirPicker.getValue();
                const outDir = outDirPicker.getValue();
                const name = nameInput.value.trim();
                if (!framesDir || !outDir || !name) {
                    status.style.color = '#f38ba8';
                    status.textContent = 'Please fill in all fields.';
                    return;
                }

                btn.disabled = true;
                btn.textContent = 'Processing…';
                status.style.color = 'var(--ansi-cyan,#89dceb)';
                status.textContent = 'Combining frames into WebM…';

                try {
                    const resp = await fetch('/api/video/frames_to_webm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ frames_dir: framesDir, output_dir: outDir, output_name: name, fps: fps.getValue() })
                    });
                    const result = await resp.json();
                    if (result.success) {
                        status.style.color = 'var(--ansi-green,#a6e3a1)';
                        status.innerHTML = `Done!<br>Saved: <code>${result.webm_path}</code>`;
                        btn.textContent = 'Close'; btn.disabled = false;
                        btn.addEventListener('click', () => overlay.remove(), { once: true });
                    } else {
                        status.style.color = '#f38ba8';
                        status.textContent = `Error: ${result.error}`;
                        btn.disabled = false; btn.textContent = 'Create WebM';
                    }
                } catch (err) {
                    status.style.color = '#f38ba8';
                    status.textContent = `Network error: ${err.message}`;
                    btn.disabled = false; btn.textContent = 'Create WebM';
                }
            });
            modal.appendChild(statusEl);
            modal.appendChild(btnRow);
        };

        // ── tab bar + render ─────────────────────────────────────────────────

        const render = () => {
            modal.innerHTML = '';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:16px;color:var(--fg,#cdd6f4);';
            title.textContent = 'WebM Tools';
            modal.appendChild(title);

            const tabBar = document.createElement('div');
            tabBar.style.cssText = 'display:flex;margin-bottom:16px;border:1px solid var(--border);border-radius:6px;overflow:hidden;';

            const tabDefs = filename
                ? [['convert', 'MP4 → WebM'], ['extract', 'Extract Frames'], ['combine', 'Frames → WebM']]
                : [['extract', 'Extract Frames'], ['combine', 'Frames → WebM']];

            tabDefs.forEach(([id, label], i, arr) => {
                const btn = document.createElement('button');
                const active = id === activeTab;
                btn.style.cssText = `flex:1;padding:6px 4px;font-size:11px;border:none;${i < arr.length - 1 ? 'border-right:1px solid var(--border);' : ''}cursor:pointer;background:${active ? 'var(--accent,#89b4fa)' : 'var(--bg-1,#181825)'};color:${active ? '#1e1e2e' : 'var(--fg,#cdd6f4)'};font-weight:${active ? '600' : '400'};`;
                btn.textContent = label;
                btn.addEventListener('click', () => { activeTab = id; render(); });
                tabBar.appendChild(btn);
            });
            modal.appendChild(tabBar);

            if (activeTab === 'convert') renderConvert();
            else if (activeTab === 'extract') renderExtract();
            else renderCombine();
        };

        render();
    }
}

export const videoModeManager = new VideoModeManager();
