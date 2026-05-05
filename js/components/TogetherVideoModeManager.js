/**
 * [TOGETHER-VIDEO-MODE]
 * Together.ai video generation manager — completely separate from Venice.
 * Shares CSS classes and the video-cards/video-params-panel DOM, but all
 * logic, API calls, and state are independent.
 *
 * Currently supports: Wan-AI/wan2.7-i2v (image-to-video)
 */

import { lagoonAlert } from '../ui/dialog.js';
import { dom, state } from '../state.js';
import { addMessageToUI } from '../ui/messages.js';
import { modelConfigs } from '../core/modelConfigs.js';
import { uiManager } from '../core/UIManager.js';
import { queueTogetherVideoApi, retrieveTogetherVideoApi } from '../api.js';

export class TogetherVideoModeManager {
    constructor() {
        this.dom = {};
        this.currentActiveTarget = 'video-source';
        this._togetherVideoConfig = {};
    }

    init() {
        this._cacheDom();
        this._bindEvents();
        console.log('[TogetherVideoModeManager] Initialized');
    }

    _cacheDom() {
        this.dom = {
            chatForm: document.getElementById('chat-form'),
            messageInput: document.getElementById('message-input'),
            videoCards: document.getElementById('video-cards-container'),
            videoParamsBody: document.querySelector('#video-params-panel .tool-section-body'),
            fileInput: document.getElementById('image-card-file-input'),
            modelSelect: document.getElementById('together-video-model-select'),
        };
    }

    _isActive() {
        return window.state.mode === 'video' && window.state.videoProvider === 'together';
    }

    _bindEvents() {
        // Intercept form submit — only fires for Together provider
        this.dom.chatForm.addEventListener('submit', (e) => {
            if (!this._isActive()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this._generateVideo();
        }, true);

        // Model change → refresh params
        this.dom.modelSelect.addEventListener('change', () => {
            if (this._isActive()) this.refreshParameterPanel();
        });

        // Card events — delegated to the shared container
        const container = document.getElementById('video-cards-container');
        container.addEventListener('click', async (e) => {
            if (!this._isActive()) return;

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
                                this._handleFile(blob, target);
                                return;
                            }
                        }
                    }
                    await lagoonAlert('No image found in clipboard.');
                } catch (err) {
                    console.error('[TogetherVideoModeManager] Paste failed:', err);
                    await lagoonAlert('Failed to read clipboard. Ensure you have granted permission.');
                }
                return;
            }

            const clearBtn = e.target.closest('.image-card-clear-btn');
            if (clearBtn) {
                this._clearPreview(clearBtn.dataset.target);
            }
        });

        this.dom.fileInput.addEventListener('change', (e) => {
            if (!this._isActive()) return;
            const file = e.target.files[0];
            if (file) this._handleFile(file, this.currentActiveTarget);
            e.target.value = '';
        });
    }

    _clearPreview(target) {
        const preview = document.getElementById(`preview-${target}`);
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
        const checkbox = document.querySelector(`input.image-card-checkbox[data-target="${target}"]`);
        if (checkbox) checkbox.checked = false;

        if (target === 'video-source') {
            delete this._togetherVideoConfig.source_image;
        } else if (target === 'video-end') {
            delete this._togetherVideoConfig.end_image;
        }
    }

    /**
     * Rebuilds the parameter panel for the currently selected Together model.
     * Called whenever the provider toggles to Together or the model changes.
     */
    refreshParameterPanel() {
        if (!this._isActive()) return;

        const modelKey = this.dom.modelSelect.value;
        const config = modelConfigs.models?.[modelKey] || null;

        if (!this.dom.videoParamsBody) return;
        this.dom.videoParamsBody.innerHTML = '';

        // Preserve image data across param refresh
        const savedSource = this._togetherVideoConfig.source_image;
        const savedEnd = this._togetherVideoConfig.end_image;
        this._togetherVideoConfig = { modelKey };
        if (savedSource) this._togetherVideoConfig.source_image = savedSource;
        if (savedEnd && config?.supports_end_image) this._togetherVideoConfig.end_image = savedEnd;

        // Card visibility
        const sourceCard = document.getElementById('card-video-source');
        const endCard = document.getElementById('card-video-end');
        const refCards = document.getElementById('video-ref-cards');

        if (sourceCard) {
            const showSource = config && config.category !== 'text-to-video' && config.supports_start_image !== false;
            sourceCard.style.display = showSource ? '' : 'none';
        }
        if (endCard) {
            endCard.style.display = config?.supports_end_image === true ? '' : 'none';
        }
        if (refCards) {
            refCards.style.display = 'none';
        }

        if (!config) {
            this.dom.videoParamsBody.innerHTML = '<p class="tool-hint">Select a model to see parameters.</p>';
            this._renderVideoLibrary();
            return;
        }
        if (!config.ui_controls || config.ui_controls.length === 0) {
            this.dom.videoParamsBody.innerHTML = '<p class="tool-hint">No adjustable parameters for this model.</p>';
            this._renderVideoLibrary();
            return;
        }

        config.ui_controls.forEach(ctrlKey => {
            const param = config.params[ctrlKey];
            if (!param) return;

            const row = document.createElement('div');
            row.style.marginBottom = '10px';

            const label = document.createElement('label');
            label.className = 'field-label-muted';
            label.style.cssText = 'display:block; margin-bottom:4px;';
            label.textContent = this._formatLabel(ctrlKey);
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
                input.onchange = (e) => { this._togetherVideoConfig[ctrlKey] = e.target.value; };
                this._togetherVideoConfig[ctrlKey] = input.value;
            } else if (param.type === 'bool') {
                const wrap = document.createElement('label');
                wrap.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer;';
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = param.default || false;
                input.onchange = (e) => { this._togetherVideoConfig[ctrlKey] = e.target.checked; };
                const span = document.createElement('span');
                span.className = 'field-label-muted';
                span.textContent = 'Enable';
                wrap.appendChild(input);
                wrap.appendChild(span);
                row.appendChild(wrap);
                this._togetherVideoConfig[ctrlKey] = input.checked;
            } else if (param.type === 'int' || param.type === 'float') {
                input = document.createElement('input');
                input.type = 'number';
                if (param.min !== undefined) input.min = param.min;
                if (param.max !== undefined) input.max = param.max;
                input.value = param.default !== undefined && param.default !== null ? param.default : '';
                if (param.default === undefined || param.default === null) input.placeholder = 'optional';
                input.oninput = (e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                        delete this._togetherVideoConfig[ctrlKey];
                    } else {
                        this._togetherVideoConfig[ctrlKey] = param.type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
                    }
                };
                if (param.default !== undefined && param.default !== null) {
                    this._togetherVideoConfig[ctrlKey] = param.type === 'int' ? parseInt(input.value, 10) : parseFloat(input.value);
                }
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = param.default || '';
                input.placeholder = 'optional';
                input.oninput = (e) => {
                    if (e.target.value) {
                        this._togetherVideoConfig[ctrlKey] = e.target.value;
                    } else {
                        delete this._togetherVideoConfig[ctrlKey];
                    }
                };
                if (param.default) this._togetherVideoConfig[ctrlKey] = param.default;
            }

            if (param.type !== 'bool') row.appendChild(input);
            this.dom.videoParamsBody.appendChild(row);

            if (param.type === 'enum') uiManager.initCustomDropdown(input);
        });

        this._renderVideoLibrary();
    }

    _formatLabel(key) {
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    _handleFile(file, target) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(`preview-${target}`);
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
                preview.style.display = 'flex';
                const checkbox = document.querySelector(`input.image-card-checkbox[data-target="${target}"]`);
                if (checkbox) checkbox.checked = true;
                if (target === 'video-source') {
                    this._togetherVideoConfig.source_image = e.target.result;
                } else if (target === 'video-end') {
                    this._togetherVideoConfig.end_image = e.target.result;
                }
            }
        };
        reader.readAsDataURL(file);
    }

    async _generateVideo() {
        const prompt = this.dom.messageInput.value.trim();
        if (!prompt) {
            lagoonAlert('Please enter a prompt for video generation.');
            return;
        }

        const modelKey = this.dom.modelSelect.value;
        const config = modelConfigs.models?.[modelKey] || null;

        // Validation: I2V requires source image
        const requiresStartImage = config?.category === 'image-to-video' && config?.supports_start_image !== false;
        if (requiresStartImage && !this._togetherVideoConfig.source_image) {
            lagoonAlert('This model requires a source image. Please upload one in the left sidebar.');
            return;
        }

        const msgConfig = { model: modelKey, character_name: config?.display_name || modelKey };
        addMessageToUI('user', prompt);
        this.dom.messageInput.value = '';
        this.dom.messageInput.style.height = '44px';

        // Build payload — use config.model_id as the actual API model string
        const apiModelId = config?.model_id || modelKey;
        const payload = { model: apiModelId, prompt };

        // Copy configured params (skip internal tracking fields and "Auto" sentinel)
        const skip = new Set(['modelKey', 'source_image', 'end_image']);
        for (const [k, v] of Object.entries(this._togetherVideoConfig)) {
            if (!skip.has(k) && v !== undefined && v !== null && v !== '' && v !== 'Auto') {
                payload[k] = v;
            }
        }

        // Package frame images via media object
        const frameImages = [];
        if (this._togetherVideoConfig.source_image) {
            const srcCheckbox = document.querySelector('input.image-card-checkbox[data-target="video-source"]');
            if (!srcCheckbox || srcCheckbox.checked) {
                frameImages.push({ input_image: this._togetherVideoConfig.source_image, frame: 'first' });
            }
        }
        if (this._togetherVideoConfig.end_image && config?.supports_end_image) {
            const endCheckbox = document.querySelector('input.image-card-checkbox[data-target="video-end"]');
            if (!endCheckbox || endCheckbox.checked) {
                frameImages.push({ input_image: this._togetherVideoConfig.end_image, frame: 'last' });
            }
        }
        if (frameImages.length > 0) {
            payload.media = { frame_images: frameImages };
        }

        console.log('[TogetherVideoModeManager] Dispatching job:', { ...payload, media: payload.media ? '[media]' : undefined });

        try {
            const response = await queueTogetherVideoApi(payload);
            const jobId = response.id;

            if (!jobId) {
                const errMsg = response.error || response.message || JSON.stringify(response);
                addMessageToUI('assistant', `**Error queuing video:** ${errMsg}`, msgConfig);
                return;
            }

            const statusMsgId = `together-video-${jobId}`;
            addMessageToUI('assistant', `[[TOGETHER_VIDEO_MARKER:${jobId}]]`, msgConfig);
            this._pollJobStatus(jobId, statusMsgId, config?.display_name || modelKey);
        } catch (err) {
            console.error('[TogetherVideoModeManager] Generation failed:', err);
            addMessageToUI('assistant', `**Generation failed:** ${err.message}`, msgConfig);
        }
    }

    _renderPending(container, label = 'Queued…') {
        container.innerHTML = `
            <div class="video-gauge-box">
                <div style="font-size:12px; color:var(--text-dim);">${label}</div>
            </div>
        `;
    }

    _renderSpinner(container, label = 'Generating…') {
        container.innerHTML = `
            <div class="video-gauge-box">
                <div class="together-video-spinner"></div>
                <div style="font-size:12px; color:var(--text-dim); margin-top:8px;">${label}</div>
                <div style="font-size:10px; color:var(--text-dim); margin-top:4px;">Together · Wan 2.7 I2V</div>
            </div>
        `;
    }

    async _pollJobStatus(jobId, elementId, modelLabel) {
        // Phase 1: attach container
        let container = null;
        let attachAttempts = 0;
        while (!container) {
            const messages = document.querySelectorAll('.message-content');
            for (const msg of messages) {
                if (msg.innerHTML.includes(`[[TOGETHER_VIDEO_MARKER:${jobId}]]`)) {
                    msg.innerHTML = msg.innerHTML.replace(
                        `[[TOGETHER_VIDEO_MARKER:${jobId}]]`,
                        `<div id="${elementId}" class="video-status-container"></div>`
                    );
                    container = document.getElementById(elementId);
                    if (container) this._renderPending(container, 'Registering job…');
                    break;
                }
            }
            if (!container) {
                if (++attachAttempts > 20) return;
                await new Promise(r => setTimeout(r, 300));
            }
        }

        await new Promise(r => setTimeout(r, 2000));

        // Phase 2: poll until done
        while (true) {
            try {
                const data = await retrieveTogetherVideoApi(jobId);
                const status = data.status;

                if (status === 'completed') {
                    const videoUrl = data.cached_url || (data.outputs || {}).video_url;
                    if (!videoUrl) {
                        container.innerHTML = `<div class="video-error">Completed but no video URL returned.</div>`;
                        return;
                    }

                    // Preload
                    this._renderSpinner(container, 'Finalizing…');
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
                            <div class="video-success">Video Ready · Together · ${modelLabel}</div>
                            <video controls src="${videoUrl}" style="width:100%; border-radius:8px; border:1px solid var(--border);"></video>
                            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center;">
                                <a href="${videoUrl}" target="_blank" download class="tool-btn-sm primary" style="text-decoration:none; display:inline-block; font-size:11px;">Download MP4</a>
                                <button class="tool-btn-sm vid-gif-btn" style="font-size:11px;">Create GIF</button>
                                <button class="tool-btn-sm vid-apng-btn" style="font-size:11px;">Create APNG</button>
                                <button class="tool-btn-sm vid-webm-btn" style="font-size:11px;">Create WebM</button>
                            </div>
                        </div>
                    `;
                    container.querySelector('.vid-gif-btn').addEventListener('click', () => this._showGifPicker(videoUrl));
                    container.querySelector('.vid-apng-btn').addEventListener('click', () => this._showApngPicker(videoUrl));
                    container.querySelector('.vid-webm-btn').addEventListener('click', () => this._showWebmPicker(videoUrl));
                    this._renderVideoLibrary();
                    return;
                }

                if (status === 'failed' || status === 'cancelled') {
                    const errors = (data.info || {}).errors;
                    const errText = errors ? JSON.stringify(errors) : status;
                    container.innerHTML = `<div class="video-error">Generation ${status}: ${errText}</div>`;
                    return;
                }

                if (status === 'queued') {
                    this._renderPending(container, 'Queued — waiting for GPU…');
                } else if (status === 'in_progress') {
                    this._renderSpinner(container, 'Generating…');
                } else {
                    this._renderPending(container, `Status: ${status || 'unknown'}`);
                }

                await new Promise(r => setTimeout(r, 5000));
            } catch (err) {
                console.error('[TogetherVideoModeManager] Poll error:', err);
                await new Promise(r => setTimeout(r, 8000));
            }
        }
    }

    async _renderVideoLibrary() {
        const body = document.getElementById('video-library-body');
        if (!body) return;
        try {
            const resp = await fetch('/api/video/files');
            const files = await resp.json();
            if (!files.length) {
                body.innerHTML = '<p class="tool-hint">No videos cached.</p>';
                return;
            }
            body.innerHTML = '';
            files.forEach(f => {
                const mb = (f.size / 1048576).toFixed(1);
                const date = new Date(f.mtime * 1000);
                const label = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${mb} MB`;
                const videoUrl = `/api/video/file/${f.filename}`;
                const modelId = f.model || null;

                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 0; border-bottom:1px solid var(--border);';

                const info = document.createElement('div');
                info.style.cssText = 'flex:1; min-width:0;';
                const ts = document.createElement('button');
                ts.style.cssText = 'background:none; border:none; padding:0; font-size:11px; color:var(--ansi-cyan); cursor:pointer; text-align:left;';
                ts.textContent = label;
                ts.addEventListener('click', () => this._openVideoInChat(videoUrl, modelId));
                info.appendChild(ts);

                const del = document.createElement('button');
                del.textContent = '✕';
                del.title = 'Delete';
                del.className = 'tool-btn-sm';
                del.style.cssText = 'flex-shrink:0; color:#f38ba8; padding:2px 6px;';
                del.addEventListener('click', async () => {
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
        } catch {
            body.innerHTML = '<p class="tool-hint" style="color:#f38ba8;">Failed to load.</p>';
        }
    }

    _openVideoInChat(videoUrl, modelId = null) {
        const markerId = `tlib-${Date.now()}`;
        const msgConfig = modelId ? { model: modelId, character_name: modelId } : {};
        addMessageToUI('assistant', `[[TOGETHER_LIB_MARKER:${markerId}]]`, msgConfig);
        requestAnimationFrame(() => {
            const messages = document.querySelectorAll('.message-content');
            for (const msg of messages) {
                if (msg.innerHTML.includes(`[[TOGETHER_LIB_MARKER:${markerId}]]`)) {
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
                    msg.querySelector('.vid-gif-btn')?.addEventListener('click', () => this._showGifPicker(videoUrl));
                    msg.querySelector('.vid-apng-btn')?.addEventListener('click', () => this._showApngPicker(videoUrl));
                    msg.querySelector('.vid-webm-btn')?.addEventListener('click', () => this._showWebmPicker(videoUrl));
                    break;
                }
            }
        });
    }

    _showGifPicker(videoUrl) {
        const filename = videoUrl.split('/').pop();
        const baseName = filename.replace(/\.mp4$/i, '');
        this._showConvertPicker('GIF', filename, baseName, async (dir, name, statusEl, confirmBtn) => {
            const resp = await fetch('/api/video/create_gif', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
            });
            const result = await resp.json();
            if (result.success) {
                statusEl.style.color = 'var(--ansi-green,#a6e3a1)';
                statusEl.innerHTML = `Done!<br>GIF: <code>${result.gif_path}</code>`;
                confirmBtn.textContent = 'Close';
                return true;
            }
            throw new Error(result.error || 'GIF failed');
        });
    }

    _showApngPicker(videoUrl) {
        const filename = videoUrl.split('/').pop();
        const baseName = filename.replace(/\.mp4$/i, '');
        this._showConvertPicker('APNG', filename, baseName, async (dir, name, statusEl, confirmBtn) => {
            const resp = await fetch('/api/video/create_apng', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
            });
            const result = await resp.json();
            if (result.success) {
                statusEl.style.color = 'var(--ansi-green,#a6e3a1)';
                statusEl.innerHTML = `Done!<br>APNG: <code>${result.apng_path}</code>`;
                confirmBtn.textContent = 'Close';
                return true;
            }
            throw new Error(result.error || 'APNG failed');
        });
    }

    _showWebmPicker(videoUrl) {
        const filename = videoUrl.split('/').pop();
        const baseName = filename.replace(/\.mp4$/i, '');
        this._showConvertPicker('WebM', filename, baseName, async (dir, name, statusEl, confirmBtn) => {
            const resp = await fetch('/api/video/create_webm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_filename: filename, output_dir: dir, output_name: name })
            });
            const result = await resp.json();
            if (result.success) {
                statusEl.style.color = 'var(--ansi-green,#a6e3a1)';
                statusEl.innerHTML = `Done!<br>WebM: <code>${result.webm_path}</code>`;
                confirmBtn.textContent = 'Close';
                return true;
            }
            throw new Error(result.error || 'WebM failed');
        });
    }

    _showConvertPicker(type, filename, baseName, onConfirm) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999;';
        overlay.innerHTML = `
            <div style="background:var(--bg-2,#1e1e2e);border:1px solid var(--border);border-radius:10px;padding:24px;min-width:360px;max-width:500px;width:90%;">
                <div style="font-size:14px;font-weight:600;margin-bottom:16px;color:var(--fg,#cdd6f4);">Create ${type}</div>
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Output directory</label>
                <input id="cv-out-dir" type="text" value="~/Videos" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:12px;">
                <label style="display:block;font-size:11px;color:var(--fg-muted,#6c7086);margin-bottom:4px;">Base filename (no extension)</label>
                <input id="cv-out-name" type="text" value="${baseName}" style="width:100%;box-sizing:border-box;background:var(--bg-1,#181825);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg,#cdd6f4);font-size:12px;margin-bottom:16px;">
                <div id="cv-status" style="font-size:11px;min-height:16px;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="cv-cancel" class="tool-btn-sm" style="font-size:11px;">Cancel</button>
                    <button id="cv-confirm" class="tool-btn-sm primary" style="font-size:11px;">Create ${type}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const statusEl = overlay.querySelector('#cv-status');
        const confirmBtn = overlay.querySelector('#cv-confirm');

        overlay.querySelector('#cv-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });

        confirmBtn.addEventListener('click', async () => {
            const dir = overlay.querySelector('#cv-out-dir').value.trim();
            const name = overlay.querySelector('#cv-out-name').value.trim();
            if (!dir || !name) return;
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing…';
            statusEl.style.color = 'var(--ansi-cyan,#89dceb)';
            statusEl.textContent = `Encoding ${type} — this may take a moment…`;
            try {
                const done = await onConfirm(dir, name, statusEl, confirmBtn);
                if (done) {
                    confirmBtn.disabled = false;
                    confirmBtn.addEventListener('click', () => overlay.remove(), { once: true });
                } else {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `Create ${type}`;
                }
            } catch (err) {
                statusEl.style.color = '#f38ba8';
                statusEl.textContent = `Error: ${err.message}`;
                confirmBtn.disabled = false;
                confirmBtn.textContent = `Create ${type}`;
            }
        });
    }
}

export const togetherVideoModeManager = new TogetherVideoModeManager();
