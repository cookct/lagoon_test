/**
 * Image Mode Manager
 * Handles image card logic, uploads, pasting, and the generate panel.
 */

import { lagoonAlert } from '../ui/dialog.js';
import { imageEditor } from './ImageEditor.js';
import { lightbox } from './Lightbox.js';
import { dom, addToPromptHistory } from '../state.js';
import { addMessageToUI } from '../ui/messages.js';

export class ImageModeManager {
    constructor() {
        this.dom = {};
        this.currentActiveTarget = null;
        this.editModeActive = false;
        this.activeEditBtn = null;
        this.editSourceImage = null;
        this.editHistory = [];
        this.abortController = null;
    }

    init() {
        this.cacheDom();
        this.cacheUpscalerDom();
        this.cacheGlmDom();
        this.bindEvents();
        this.bindClearEvents();
        this.bindGenerateEvents();
        this.bindLightboxEvents();
        this.bindUpscalerEvents();
        console.log('[ImageModeManager] Initialized');
    }

    cacheDom() {
        this.dom = {
            fileInput: document.getElementById('image-card-file-input'),
            uploadBtns: document.querySelectorAll('.image-card-btn.upload-btn'),
            pasteBtns: document.querySelectorAll('.image-card-btn.paste-btn'),
            generateModel: document.getElementById('image-generate-model'),
            messageInput: document.getElementById('message-input'),
            messagesContainer: document.getElementById('messages-container'),
            chatForm: document.getElementById('chat-form'),
            contextFileBtn: document.getElementById('context-file-btn'),
        };
    }

    cacheUpscalerDom() {
        this.dom.upscalerParams = document.getElementById('upscaler-params');
        this.dom.upscalerScale = document.getElementById('upscaler-scale');
        this.dom.upscalerEnhance = document.getElementById('upscaler-enhance');
        this.dom.upscalerCreativity = document.getElementById('upscaler-creativity');

        this.dom.upscalerReplication = document.getElementById('upscaler-replication');
    }

    cacheGlmDom() {
        this.dom.glmParams = document.getElementById('glm-image-params');
        this.dom.glmSize = document.getElementById('glm-image-size');
        this.dom.glmQuality = document.getElementById('glm-image-quality');
    }

    bindEvents() {
        // Upload button logic
        this.dom.uploadBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentActiveTarget = btn.dataset.target;
                this.dom.fileInput.click();
            });
        });

        // File input change
        this.dom.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFile(file, this.currentActiveTarget);
            }
            // Reset for same file re-upload
            e.target.value = '';
        });

        // Paste button logic
        this.dom.pasteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const target = btn.dataset.target;
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
                    console.error('[ImageModeManager] Paste failed:', err);
                    await lagoonAlert('Failed to read clipboard. Ensure you have granted permission.');
                }
            });
        });

        // Checkbox change — re-evaluate model filter when user manually toggles a card
        document.querySelectorAll('.image-card-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.updateModelFilter());
        });

        // Clear all cards button (image mode only)
        const imageClearBtn = document.getElementById('image-clear-btn');
        if (imageClearBtn) {
            imageClearBtn.addEventListener('click', () => {
                ['ref-1', 'ref-2', 'target'].forEach(id => this.clearPreview(id));
            });
        }

        // Toggle edit off from main attachment/edit button
        if (this.dom.contextFileBtn) {
            this.dom.contextFileBtn.addEventListener('click', (e) => {
                if (document.body.classList.contains('mode-image')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.editModeActive) {
                        this.toggleEditMode(this.editSourceImage, this.activeEditBtn);
                    }
                }
            });
        }
    }

    bindClearEvents() {
        // Use event delegation for clear buttons inside previews
        document.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('.image-card-clear-btn');
            if (clearBtn) {
                e.stopPropagation();
                const target = clearBtn.dataset.target;
                this.clearPreview(target);
            }
        });
    }

    bindGenerateEvents() {
        // Intercept the main chat form submit.
        this.dom.chatForm.addEventListener('submit', (e) => {
            // Only take over if Image Mode is active
            if (!document.body.classList.contains('mode-image')) return;
            
            console.log('[ImageModeManager] Form submit intercepted');
            e.preventDefault();
            e.stopImmediatePropagation();
            this.generateEdit();
        }, true);
    }

    bindLightboxEvents() {
        // Click on image card previews to open lightbox
        document.addEventListener('click', (e) => {
            // Don't interfere with button clicks
            if (e.target.closest('.image-card-btn')) return;
            
            // Image card previews (ref-1, ref-2, target)
            const cardImg = e.target.closest('.image-card-preview img');
            if (cardImg) {
                e.stopPropagation();
                lightbox.open(cardImg.src);
                return;
            }

            // Generated result images in chat area
            const resultImg = e.target.closest('.image-result img');
            if (resultImg) {
                e.stopPropagation();
                // Collect all generated images for navigation
                const allResultImgs = Array.from(document.querySelectorAll('.image-result img'));
                const collection = allResultImgs.map(img => img.src);
                const index = allResultImgs.indexOf(resultImg);
                lightbox.open(resultImg.src, collection, index);
                return;
            }
        });
    }

    bindUpscalerEvents() {
        // Model select change - show/hide upscaler params
        if (this.dom.generateModel) {
            this.dom.generateModel.addEventListener('change', () => {
                this.toggleUpscalerParams();
            });
        }

        // Enhance checkbox - show/hide enhance-only params
        if (this.dom.upscalerEnhance) {
            this.dom.upscalerEnhance.addEventListener('change', () => {
                this.toggleEnhanceParams();
            });
        }

        // Slider value displays
        const creativitySlider = document.getElementById('upscaler-creativity');
        if (creativitySlider) {
            creativitySlider.addEventListener('input', (e) => {
                document.getElementById('upscaler-creativity-value').textContent = e.target.value;
            });
        }
        const replicationSlider = document.getElementById('upscaler-replication');
        if (replicationSlider) {
            replicationSlider.addEventListener('input', (e) => {
                document.getElementById('upscaler-replication-value').textContent = e.target.value;
            });
        }

        // Initial state
        this.toggleUpscalerParams();
    }

    toggleUpscalerParams() {
        const selectedModel = this.dom.generateModel.value;
        const isUpscaler = selectedModel === 'upscaler';
        const isGlm = selectedModel === 'glm-image';
        const isGemini = selectedModel.startsWith('gemini-') || selectedModel.startsWith('nano-');
        
        // Edit models should not show dimension params
        const editModels = ['qwen-image-2-edit', 'seedream-v5-lite-edit', 'seedream-v4-edit', 'firered-image-edit', 'gemini-3-pro-edit', 'nano-banana-pro-edit', 'grok-imagine-edit'];
        const isEditModel = editModels.includes(selectedModel) || this.editModeActive;

        if (this.dom.upscalerParams) {
            this.dom.upscalerParams.classList.toggle('hidden', !isUpscaler);
        }
        if (this.dom.glmParams) {
            this.dom.glmParams.classList.toggle('hidden', !isGlm);
        }
        
        const geminiParams = document.getElementById('gemini-params');
        if (geminiParams) {
            // Only show Gemini params if it's a Gemini model AND NOT an edit model
            geminiParams.style.display = (isGemini && !isEditModel) ? 'block' : 'none';
        }

        const veniceAspectModels = ['grok-imagine-edit', 'seedream-v4-edit', 'nano-banana-pro-edit', 'grok-imagine-image-pro'];
        const veniceEditParams = document.getElementById('venice-edit-params');
        if (veniceEditParams) {
            veniceEditParams.style.display = veniceAspectModels.includes(selectedModel) ? 'block' : 'none';
        }
        
        // Hide message input for upscaler (no prompt needed)
        if (this.dom.messageInput) {
            this.dom.messageInput.placeholder = isUpscaler ? 'Optional style prompt for enhancement...' : 'Type your message...';
        }
    }

    toggleEnhanceParams() {
        const enhanceChecked = this.dom.upscalerEnhance?.checked;
        const enhanceRows = document.querySelectorAll('.upscaler-param-row.enhance-only');
        enhanceRows.forEach(row => {
            row.classList.toggle('hidden', !enhanceChecked);
        });
    }

    handleFile(file, target) {
        if (!file.type.startsWith('image/')) {
            lagoonAlert('Please select an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            this.updatePreview(target, dataUrl);
        };
        reader.readAsDataURL(file);
    }

    updatePreview(target, dataUrl) {
        const preview = document.getElementById(`preview-${target}`);
        if (!preview) return;
        preview.innerHTML = `<img src="${dataUrl}" alt="${target} preview">`;

        // Auto-check the checkbox when an image is loaded
        const checkbox = document.querySelector(`.image-card-checkbox[data-target="${target}"]`);
        if (checkbox) checkbox.checked = true;

        // New image loaded into this slot — invalidate the cached true original so the
        // editor seeds fresh on next open instead of editing the previously-loaded image.
        imageEditor.trueOriginals.delete(target);

        this.updateModelFilter();
        console.log(`[ImageModeManager] Updated preview for: ${target}`);
    }

    clearPreview(target) {
        const preview = document.getElementById(`preview-${target}`);
        if (!preview) return;
        preview.innerHTML = '';

        // Uncheck the checkbox when the preview is cleared
        const checkbox = document.querySelector(`.image-card-checkbox[data-target="${target}"]`);
        if (checkbox) checkbox.checked = false;

        // Clear editor state if this was the target card
        if (target === 'target') {
            imageEditor.clearMaskState();
        }

        // Slot is empty — drop the cached true original so the next load seeds fresh
        imageEditor.trueOriginals.delete(target);

        this.updateModelFilter();
        console.log(`[ImageModeManager] Cleared preview for: ${target}`);
    }

    updateModelFilter() {
        // Disabled - users can select any model regardless of loaded images
    }

    /**
     * Fire a single fetch to the image endpoint and return the final image src.
     */
    async _fetchSingle(endpoint, body, signal) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);

        const newB64 = result.images ? result.images[0] : result.image;
        if (!newB64) throw new Error('No image returned from model.');

        let finalSrc = (newB64.startsWith('data:') || newB64.startsWith('http'))
            ? newB64
            : `data:image/png;base64,${newB64}`;

        const restoreCheckbox = document.getElementById('restore-pixels-checkbox');
        if (imageEditor.savedPixels && restoreCheckbox?.checked) {
            finalSrc = await imageEditor.restorePixels(finalSrc);
        }
        return finalSrc;
    }

    /**
     * Gather images from all cards, send to the selected model via appropriate endpoint,
     * and restore any saved pixels (from a prior mask/clothing session) with feathering.
     */
    async generateEdit() {
        const selectedModel = this.dom.generateModel.value;

        // Handle upscaler separately (edit mode does not override upscale)
        if (selectedModel === 'upscaler') {
            return await this.upscaleImage();
        }

        // When edit mode is active, force grok-imagine-edit regardless of dropdown
        const modelId = this.editModeActive ? 'grok-imagine-edit' : selectedModel;

        const prompt = this.dom.messageInput.value.trim();
        if (!prompt) {
            await lagoonAlert('Enter a prompt in the message box first.');
            return;
        }

        // Add to prompt history
        addToPromptHistory(prompt);

        // Target-only models in the main area — no reference cards, just the target card.
        // Separate from masking modal models (editor-model-select in index.html).
        const editModels = ['qwen-image-2-edit', 'firered-image-edit'];

        // Gather images based on model type
        let images = [];

        if (this.editModeActive && this.editSourceImage) {
            // Edit mode: use the stored source image directly — no card needed
            images = [this.editSourceImage];
        } else if (editModels.includes(modelId)) {
            // Edit models only use the target image card
            const targetImg = document.querySelector(`#preview-target img`);
            if (!targetImg || !targetImg.src) {
                await lagoonAlert(`Load an image in the Target card for ${modelId}.`);
                return;
            }
            images = [targetImg.src];
        } else {
            // Generate models: gather images from all cards with checked checkboxes.
            // Card order: target first, then references (reversed for API).
            const order = ['target', 'ref-2', 'ref-1'];
            for (const cardId of order) {
                const checkbox = document.querySelector(`.image-card-checkbox[data-target="${cardId}"]`);
                if (checkbox && !checkbox.checked) continue;
                const img = document.querySelector(`#preview-${cardId} img`);
                if (img && img.src) images.push(img.src);
            }
        }

        const sendBtn = document.getElementById('send-btn');
        const sendBtnOriginalHTML = sendBtn?.innerHTML;
        const sendBtnOriginalType = sendBtn?.type;

        this.abortController = new AbortController();
        const { signal } = this.abortController;

        const stopHandler = () => { this.abortController?.abort(); };

        if (sendBtn) {
            sendBtn.type = 'button';
            sendBtn.disabled = false;
            sendBtn.classList.remove('loading');
            sendBtn.classList.add('stop-btn');
            sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
            sendBtn.addEventListener('click', stopHandler);
        }

        // Clear and disable message input during generation
        if (this.dom.messageInput) {
            this.dom.messageInput.value = '';
            this.dom.messageInput.disabled = true;
            this.dom.messageInput.style.height = '44px';
        }

        const isGemini = modelId.startsWith('gemini-');
        const isZai = modelId === 'glm-image';

        let endpoint = '/api/image/edit';
        if (isGemini) endpoint = '/api/image/generate/gemini';
        if (isZai) endpoint = '/api/image/generate/zai';

        // multi_ref = true only when 2 reference cards are checked+loaded (not counting target)
        const refCount = ['ref-1', 'ref-2'].filter(id => {
            const cb = document.querySelector(`.image-card-checkbox[data-target="${id}"]`);
            const img = document.querySelector(`#preview-${id} img`);
            return (!cb || cb.checked) && img && img.src;
        }).length;

        const body = (isGemini || isZai)
            ? { model: modelId, prompt, images }
            : { modelId, prompt, images, multi_ref: refCount > 1, single_edit: this.editModeActive };

        const veniceAspectModels = ['grok-imagine-edit', 'seedream-v4-edit', 'nano-banana-pro-edit', 'grok-imagine-image-pro'];
        if (veniceAspectModels.includes(modelId)) {
            const ratio = document.getElementById('venice-edit-aspect-ratio')?.value;
            if (ratio && ratio !== 'auto') body.aspect_ratio = ratio;
        }

        if (isGemini && !editModels.includes(modelId)) {
            const ratio = document.getElementById('image-param-aspect_ratio')?.value;
            const res = document.getElementById('image-param-resolution')?.value;
            if (ratio && ratio !== 'Auto') body.aspect_ratio = ratio;
            if (res && res !== 'Auto') body.resolution = res;
        }

        if (isZai) {
            body.size = this.dom.glmSize?.value || '1280x1280';
            body.quality = this.dom.glmQuality?.value || 'hd';
        }

        const resultsCount = parseInt(document.getElementById('image-results-count')?.value || '1', 10);

        this.showGeneratingSpinner(resultsCount);
        try {
            if (resultsCount === 1) {
                const finalSrc = await this._fetchSingle(endpoint, body, signal);
                this.displayResult(finalSrc);
            } else {
                const settled = await Promise.allSettled(
                    Array.from({ length: resultsCount }, () => this._fetchSingle(endpoint, body, signal))
                );
                const srcs = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
                const failed = settled.filter(r => r.status === 'rejected').length;
                if (srcs.length > 0) this.displayMultipleResults(srcs);
                if (failed > 0) console.warn(`[ImageModeManager] ${failed} image(s) failed in batch`);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[ImageModeManager] Generate failed:', err);
                await lagoonAlert(`Generate failed: ${err.message}`);
            }
        } finally {
            this.removeGeneratingSpinner();
            this.abortController = null;
            if (sendBtn) {
                sendBtn.removeEventListener('click', stopHandler);
                sendBtn.type = sendBtnOriginalType || 'submit';
                sendBtn.innerHTML = sendBtnOriginalHTML || '';
                sendBtn.disabled = false;
                sendBtn.classList.remove('stop-btn');
            }
            if (this.dom.messageInput) {
                this.dom.messageInput.disabled = false;
                this.dom.messageInput.focus();
            }
        }
    }

    /**
     * Upscale image using Venice's dedicated upscale endpoint.
     */
    async upscaleImage() {
        // Get target image - always use target card regardless of checkbox
        const targetPreview = document.getElementById('preview-target');
        const targetImg = targetPreview?.querySelector('img');
        
        console.log('[ImageModeManager] upscaleImage - targetPreview:', !!targetPreview, 'targetImg:', !!targetImg, 'src:', !!targetImg?.src);
        
        if (!targetImg || !targetImg.src) {
            await lagoonAlert('Load an image in the Target card to upscale.');
            return;
        }

        // Get upscaler parameters
        const scale = parseInt(this.dom.upscalerScale?.value || '2', 10);
        const enhance = this.dom.upscalerEnhance?.checked || false;
        const creativity = parseFloat(this.dom.upscalerCreativity?.value || '0.5');

        const replication = parseFloat(this.dom.upscalerReplication?.value || '0.35');
        const prompt = this.dom.messageInput.value.trim();

        // Validate: scale=1 requires enhance=true
        if (scale === 1 && !enhance) {
            await lagoonAlert('Scale of 1 requires Enhance to be enabled.');
            return;
        }

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.classList.add('loading');
        }

        // Strip data URI prefix for the image
        let imageData = targetImg.src;
        if (imageData.includes(',')) {
            imageData = imageData.split(',')[1];
        }
        
        console.log('[ImageModeManager] Upscaling image, data length:', imageData?.length);

        const body = {
            image: imageData,
            scale: scale,
            enhance: enhance,
        };

        // Add enhance-only params if enhance is enabled
        if (enhance) {
            body.enhanceCreativity = creativity;
            body.replication = replication;
            if (prompt) {
                body.enhancePrompt = prompt;
            }
        }

        this.showGeneratingSpinner();
        try {
            const response = await fetch('/api/image/upscale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // Handle binary response (image/png)
            const contentType = response.headers.get('Content-Type') || '';
            
            if (contentType.includes('image/')) {
                const blob = await response.blob();
                // Convert blob to base64 data URL so "set as target" works correctly
                const reader = new FileReader();
                reader.onload = () => {
                    const finalSrc = reader.result;
                    console.log('[ImageModeManager] Upscaled image received');
                    this.displayResult(finalSrc);
                };
                reader.readAsDataURL(blob);
            } else {
                // JSON response (error or base64)
                const result = await response.json();
                console.log('[ImageModeManager] Upscale response:', response.status, result);
                
                if (result.error) throw new Error(result.error);
                
                const newB64 = result.images ? result.images[0] : result.image;
                if (!newB64) throw new Error('No image returned from upscaler.');
                
                let finalSrc = newB64.startsWith('data:') ? newB64 : `data:image/png;base64,${newB64}`;
                this.displayResult(finalSrc);
            }

        } catch (err) {
            console.error('[ImageModeManager] Upscale failed:', err);
            await lagoonAlert(`Upscale failed: ${err.message}`);
        } finally {
            this.removeGeneratingSpinner();
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.classList.remove('loading');
            }
            if (this.dom.messageInput) {
                this.dom.messageInput.disabled = false;
                this.dom.messageInput.focus();
            }
        }
    }

    toggleEditMode(src, btn) {
        if (this.editModeActive && this.activeEditBtn === btn) {
            // Same button clicked — toggle off, clear history
            this.editModeActive = false;
            this.editSourceImage = null;
            this.editHistory = [];
            this.activeEditBtn.classList.remove('active');
            this.activeEditBtn.title = 'Edit with Grok Imagine';
            this.activeEditBtn = null;
            document.body.classList.remove('image-edit-mode');
        } else {
            // Switching source — push current state to history before overwriting
            if (this.editModeActive && this.editSourceImage) {
                this.editHistory.push({ src: this.editSourceImage, btn: this.activeEditBtn });
            }
            if (this.activeEditBtn) {
                this.activeEditBtn.classList.remove('active');
                this.activeEditBtn.title = 'Edit with Grok Imagine';
            }
            this.editModeActive = true;
            this.editSourceImage = src;
            this.activeEditBtn = btn;
            btn.classList.add('active');
            btn.title = 'Editing with Grok — click to stop';
            document.body.classList.add('image-edit-mode');
        }
        this.syncContextFileBtn();
    }

    syncContextFileBtn() {
        const btn = this.dom.contextFileBtn;
        if (!btn) return;

        const isImageMode = document.body.classList.contains('mode-image');
        
        if (isImageMode && this.editModeActive) {
            btn.disabled = false;
            btn.classList.add('active-edit');
            btn.title = 'Stop Editing Image';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    <line x1="18" y1="9" x2="12" y2="15" stroke="red" stroke-width="3"/>
                </svg>
            `;
        } else if (isImageMode) {
            btn.disabled = true;
            btn.classList.remove('active-edit');
            btn.title = 'Select an image to edit';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            `;
        } else {
            // Restore chat mode icon (Paperclip)
            btn.classList.remove('active-edit');
            btn.title = 'Upload file (code, PDF, TXT)';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <span class="file-cancel-badge" id="file-cancel-btn">&times;</span>
            `;
            // Note: chat mode will re-enable based on ChatManager logic
        }
    }

    showGeneratingSpinner(count = 1) {
        const container = dom.messagesContainer || dom.chatMessages;
        if (!container) return;

        const spinnerHtml = `<div class="spinner-fold">
                <div class="fold-sq"></div>
                <div class="fold-sq"></div>
                <div class="fold-sq"></div>
                <div class="fold-sq"></div>
            </div>`;

        const wrap = document.createElement('div');
        wrap.id = 'image-gen-loading';
        wrap.className = 'image-gen-placeholder' + (count > 1 ? ' multi' : '');

        if (count === 1) {
            wrap.innerHTML = `<div class="placeholder-cell">
                ${spinnerHtml}
                <span class="image-gen-label">Generating Image...</span>
            </div>`;
        } else {
            wrap.innerHTML = Array.from({ length: count }, () =>
                `<div class="placeholder-cell">${spinnerHtml}</div>`
            ).join('');
        }

        container.appendChild(wrap);
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    removeGeneratingSpinner() {
        document.getElementById('image-gen-loading')?.remove();
    }

    /**
     * Display multiple results in a 2-column grid.
     * Does NOT auto-chain edit mode — user picks which one to continue with.
     */
    displayMultipleResults(srcs) {
        const targetContainer = dom.messagesContainer || dom.chatMessages;
        if (!targetContainer) return;

        const group = document.createElement('div');
        group.className = 'message-group assistant image-result';

        const grid = document.createElement('div');
        grid.className = 'image-result-grid';

        srcs.forEach(src => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.innerHTML = `
                <img src="${src}" alt="Generated result">
                <div class="assistant-actions image-actions">
                    <button type="button" class="action-btn set-ref-btn" title="Set as Reference 1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <button type="button" class="action-btn set-target-btn" title="Set as Target Card">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                    <button type="button" class="action-btn edit-mode-btn" title="Edit with Grok Imagine">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button type="button" class="action-btn delete-image-btn" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>`;

            const editBtn = cell.querySelector('.edit-mode-btn');
            cell.querySelector('.set-ref-btn').onclick = () => this.updatePreview('ref-1', src);
            cell.querySelector('.set-target-btn').onclick = () => this.updatePreview('target', src);
            cell.querySelector('.edit-mode-btn').onclick = () => this.toggleEditMode(src, editBtn);
            cell.querySelector('.delete-image-btn').onclick = () => {
                if (this.editModeActive) {
                    if (this.activeEditBtn === editBtn) {
                        const prev = this.editHistory.pop();
                        if (prev) {
                            this.editSourceImage = prev.src;
                            this.activeEditBtn = prev.btn;
                            if (prev.btn && document.contains(prev.btn)) {
                                prev.btn.classList.add('active');
                                prev.btn.title = 'Editing with Grok — click to stop';
                            }
                        } else {
                            this.editModeActive = false;
                            this.editSourceImage = null;
                            this.activeEditBtn = null;
                            document.body.classList.remove('image-edit-mode');
                        }
                        this.syncContextFileBtn();
                    } else {
                        this.editHistory = this.editHistory.filter(e => e.btn !== editBtn);
                    }
                }
                // If this was the last cell, remove the whole group
                if (grid.querySelectorAll('.grid-cell').length === 1) {
                    group.remove();
                } else {
                    cell.remove();
                }
            };

            grid.appendChild(cell);
        });

        group.appendChild(grid);
        targetContainer.appendChild(group);
        // Delay slightly to ensure any auto-scroll from DOM changes is finished
        setTimeout(() => {
            group.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    /**
     * Display result image in the chat area.
     */
    displayResult(finalSrc) {
        const targetContainer = dom.messagesContainer || dom.chatMessages;
        if (targetContainer) {
            const resultGroup = document.createElement('div');
            resultGroup.className = 'message-group assistant image-result';
            resultGroup.innerHTML = `
                <div class="message-content">
                    <div class="bubble-wrapper">
                        <div class="message-bubble">
                            <img src="${finalSrc}" alt="Generated result">
                        </div>
                        <div class="assistant-actions image-actions">
                            <button type="button" class="action-btn set-ref-btn" title="Set as Reference 1">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            </button>
                            <button type="button" class="action-btn set-target-btn" title="Set as Target Card">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            </button>
                            <button type="button" class="action-btn edit-mode-btn" title="Edit with Grok Imagine">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button type="button" class="action-btn delete-image-btn" title="Delete result">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                </div>`;

            // Bind actions
            resultGroup.querySelector('.set-ref-btn').onclick = () => this.updatePreview('ref-1', finalSrc);
            resultGroup.querySelector('.set-target-btn').onclick = () => this.updatePreview('target', finalSrc);
            resultGroup.querySelector('.delete-image-btn').onclick = () => {
                if (this.editModeActive) {
                    if (this.activeEditBtn === editBtn) {
                        // Deleted the active source — restore previous from history
                        const prev = this.editHistory.pop();
                        if (prev) {
                            this.editSourceImage = prev.src;
                            this.activeEditBtn = prev.btn;
                            if (prev.btn && document.contains(prev.btn)) {
                                prev.btn.classList.add('active');
                                prev.btn.title = 'Editing with Grok — click to stop';
                            }
                        } else {
                            // Nothing to fall back to — turn off
                            this.editModeActive = false;
                            this.editSourceImage = null;
                            this.activeEditBtn = null;
                            document.body.classList.remove('image-edit-mode');
                        }
                        this.syncContextFileBtn();
                    } else {
                        // Non-active image deleted — purge it from history so we never fall back to a ghost
                        this.editHistory = this.editHistory.filter(e => e.btn !== editBtn);
                    }
                }
                resultGroup.remove();
            };

            const editBtn = resultGroup.querySelector('.edit-mode-btn');
            editBtn.onclick = () => this.toggleEditMode(finalSrc, editBtn);

            targetContainer.appendChild(resultGroup);

            // If edit mode is already active, auto-chain: new image becomes the edit source
            if (this.editModeActive) {
                this.toggleEditMode(finalSrc, editBtn);
            }

            // Wait for image to load so dimensions are known before scrolling
            const img = resultGroup.querySelector('img');
            if (img) {
                img.onload = () => {
                    // Delay slightly to ensure any auto-scroll from DOM changes is finished
                    setTimeout(() => {
                        resultGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                };
                // Fallback if cached or fails
                if (img.complete) img.onload();
            }
        }
        console.log('[ImageModeManager] Result manually appended to container');
    }
}

export const imageModeManager = new ImageModeManager();
