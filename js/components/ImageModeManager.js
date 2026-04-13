/**
 * Image Mode Manager
 * Handles image card logic, uploads, pasting, and the generate panel.
 */

import { lagoonAlert } from '../ui/dialog.js';
import { imageEditor } from './ImageEditor.js';
import { lightbox } from './Lightbox.js';
import { dom } from '../state.js';
import { addMessageToUI } from '../ui/messages.js';

export class ImageModeManager {
    constructor() {
        this.dom = {
            fileInput: document.getElementById('image-card-file-input'),
            uploadBtns: document.querySelectorAll('.image-card-btn.upload-btn'),
            pasteBtns: document.querySelectorAll('.image-card-btn.paste-btn'),
            generateModel: document.getElementById('image-generate-model'),
            messageInput: document.getElementById('message-input'),
            messagesContainer: document.getElementById('messages-container'),
            chatForm: document.getElementById('chat-form'),
            // Upscaler params
            upscalerParams: null, // Will be cached in init
            upscalerScale: null,
            upscalerEnhance: null,
            upscalerCreativity: null,
            upscalerStyle: null,
            upscalerReplication: null,
        };
        this.currentActiveTarget = null;
    }

    init() {
        this.cacheUpscalerDom();
        this.bindEvents();
        this.bindClearEvents();
        this.bindGenerateEvents();
        this.bindLightboxEvents();
        this.bindUpscalerEvents();
        console.log('[ImageModeManager] Initialized');
    }

    cacheUpscalerDom() {
        this.dom.upscalerParams = document.getElementById('upscaler-params');
        this.dom.upscalerScale = document.getElementById('upscaler-scale');
        this.dom.upscalerEnhance = document.getElementById('upscaler-enhance');
        this.dom.upscalerCreativity = document.getElementById('upscaler-creativity');
        this.dom.upscalerStyle = document.getElementById('upscaler-style');
        this.dom.upscalerReplication = document.getElementById('upscaler-replication');
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
        // Intercept the main chat form submit in capture phase — fires before ChatManager's
        // bubble-phase listener. Only takes over when image mode is active.
        this.dom.chatForm.addEventListener('submit', (e) => {
            if (!document.body.classList.contains('mode-image')) return;
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
        this.dom.generateModel.addEventListener('change', () => {
            this.toggleUpscalerParams();
        });

        // Enhance checkbox - show/hide enhance-only params
        if (this.dom.upscalerEnhance) {
            this.dom.upscalerEnhance.addEventListener('change', () => {
                this.toggleEnhanceParams();
            });
        }

        // Slider value displays
        if (this.dom.upscalerCreativity) {
            this.dom.upscalerCreativity.addEventListener('input', (e) => {
                document.getElementById('upscaler-creativity-value').textContent = e.target.value;
            });
        }
        if (this.dom.upscalerReplication) {
            this.dom.upscalerReplication.addEventListener('input', (e) => {
                document.getElementById('upscaler-replication-value').textContent = e.target.value;
            });
        }

        // Initial state
        this.toggleUpscalerParams();
    }

    toggleUpscalerParams() {
        const isUpscaler = this.dom.generateModel.value === 'upscaler';
        if (this.dom.upscalerParams) {
            this.dom.upscalerParams.classList.toggle('hidden', !isUpscaler);
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
        console.log(`[ImageModeManager] Updated preview for: ${target}`);
    }

    clearPreview(target) {
        const preview = document.getElementById(`preview-${target}`);
        if (!preview) return;
        preview.innerHTML = '';
        console.log(`[ImageModeManager] Cleared preview for: ${target}`);
    }

    /**
     * Gather images from all cards, send to the selected model via appropriate endpoint,
     * and restore any saved pixels (from a prior mask/clothing session) with feathering.
     */
    async generateEdit() {
        const modelId = this.dom.generateModel.value;

        // Handle upscaler separately
        if (modelId === 'upscaler') {
            return await this.upscaleImage();
        }

        const prompt = this.dom.messageInput.value.trim();
        if (!prompt) {
            await lagoonAlert('Enter a prompt in the message box first.');
            return;
        }

        // Edit models that only use the target image card
        const editModels = ['qwen-image-2-edit', 'grok-imagine-edit', 'seedream-v5-lite-edit', 'seedream-v4-edit'];

        // Gather images based on model type
        let images = [];
        
        if (editModels.includes(modelId)) {
            // Edit models only use the target image card
            const targetImg = document.querySelector(`#preview-target img`);
            if (!targetImg || !targetImg.src) {
                await lagoonAlert(`Load an image in the Target card for ${modelId}.`);
                return;
            }
            images = [targetImg.src];
        } else {
            // Generate models: gather images from all cards with checked checkboxes
            for (const cardId of ['ref-1', 'ref-2', 'target']) {
                const checkbox = document.querySelector(`.image-card-checkbox[data-target="${cardId}"]`);
                if (checkbox && !checkbox.checked) continue;
                const img = document.querySelector(`#preview-${cardId} img`);
                if (img && img.src) images.push(img.src);
            }
        }

        if (images.length === 0) {
            await lagoonAlert('Load at least one image before generating.');
            return;
        }

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.disabled = true;

        const isGemini = modelId.startsWith('gemini-');
        const endpoint = isGemini ? '/api/image/generate/gemini' : '/api/image/edit';
        const body = isGemini
            ? { model: modelId, prompt, images }
            : { modelId, prompt, images };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();
            console.log('[ImageModeManager] Generate response:', response.status, Object.keys(result));
            if (result.error) throw new Error(result.error);

            const newB64 = result.images ? result.images[0] : result.image;
            if (!newB64) throw new Error('No image returned from model.');

            let finalSrc = newB64.startsWith('data:') ? newB64 : `data:image/png;base64,${newB64}`;
            console.log('[ImageModeManager] Got image, src length:', finalSrc.length);

            // If saved pixels exist, restore them with feathering.
            if (imageEditor.savedPixels) {
                console.log('[ImageModeManager] Saved pixels found, restoring onto result...');
                finalSrc = await imageEditor.restorePixels(finalSrc);
            }

            this.displayResult(finalSrc);

        } catch (err) {
            console.error('[ImageModeManager] Generate failed:', err);
            await lagoonAlert(`Generate failed: ${err.message}`);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
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
        const style = this.dom.upscalerStyle?.value?.trim() || '';
        const replication = parseFloat(this.dom.upscalerReplication?.value || '0.35');
        const prompt = this.dom.messageInput.value.trim();

        // Validate: scale=1 requires enhance=true
        if (scale === 1 && !enhance) {
            await lagoonAlert('Scale of 1 requires Enhance to be enabled.');
            return;
        }

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.disabled = true;

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
            if (style || prompt) {
                body.enhancePrompt = style || prompt;
            }
        }

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
                const finalSrc = URL.createObjectURL(blob);
                console.log('[ImageModeManager] Upscaled image received');
                this.displayResult(finalSrc);
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
            if (sendBtn) sendBtn.disabled = false;
        }
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
                            <img src="${finalSrc}" alt="Generated result" style="max-width:100%;border-radius:4px;display:block;">
                        </div>
                        <div class="assistant-actions image-actions">
                            <button type="button" class="action-btn set-ref-btn" title="Set as Reference 1">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            </button>
                            <button type="button" class="action-btn set-target-btn" title="Set as Target Card">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
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
            resultGroup.querySelector('.delete-image-btn').onclick = () => resultGroup.remove();

            targetContainer.appendChild(resultGroup);
        }

        // Scroll #chat-messages to bottom directly
        if (dom.chatMessages) {
            requestAnimationFrame(() => {
                dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
            });
        }
        console.log('[ImageModeManager] Result manually appended to container');
    }
}

export const imageModeManager = new ImageModeManager();
