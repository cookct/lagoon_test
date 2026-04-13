/**
 * Image Editor Component
 * Full-screen modal for masking and image modification.
 */

import { state } from '../state.js';
import { lagoonAlert } from '../ui/dialog.js';

export class ImageEditor {
    constructor() {
        this.active = false;
        this.target = null;
        this.tool = 'draw';
        this.brushSize = 30;
        this.zoom = 1.0;

        this.isDrawing = false;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;

        // Panning state
        this.startX = 0;
        this.startY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;

        // Saved pixels under the mask — set at Save time for later restoration
        this.savedPixels = null; // { origDataUrl, maskDataUrl, target }

        // Original card image snapshot — restored if user hits Cancel
        this.originalCardSrc = null;

        // Pre/post edit sources for Original toggle button
        this.preEditSrc = null;
        this.postEditSrc = null;

        this.dom = {};
    }

    init() {
        this.cacheDom();
        this.bindEvents();
        console.log('[ImageEditor] Initialized');
    }

    cacheDom() {
        this.dom.modal = document.getElementById('image-edit-modal');
        this.dom.workspace = document.getElementById('image-edit-workspace');
        this.dom.container = document.getElementById('image-edit-canvas-container');
        this.dom.baseImg = document.getElementById('image-edit-base-img');
        this.dom.maskCanvas = document.getElementById('image-edit-mask-canvas');
        this.dom.cursor = document.getElementById('image-edit-cursor');

        this.dom.drawBtn = document.getElementById('editor-draw-btn');
        this.dom.eraseBtn = document.getElementById('editor-erase-btn');
        this.dom.brushSlider = document.getElementById('editor-brush-slider');
        this.dom.brushValue = document.getElementById('editor-brush-value');
        this.dom.promptWrapper = document.getElementById('editor-prompt-wrapper');
        this.dom.promptInput = document.getElementById('editor-prompt-input');
        this.dom.saveBtn = document.getElementById('editor-save-btn');
        this.dom.cancelBtn = document.getElementById('editor-cancel-btn');
        this.dom.executeBtn = document.getElementById('editor-execute-btn');
        this.dom.modelSelect = document.getElementById('editor-model-select');
        this.dom.originalBtn = document.getElementById('editor-original-btn');

        this.ctx = this.dom.maskCanvas.getContext('2d');
    }

    bindEvents() {
        // Edit buttons on cards
        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const target = editBtn.dataset.target;
                this.open(target);
            }
        });

        // Tools
        this.dom.drawBtn.onclick = () => this.setTool('draw');
        this.dom.eraseBtn.onclick = () => this.setTool('erase');

        // Brush
        this.dom.brushSlider.oninput = (e) => {
            this.setBrushSize(parseInt(e.target.value));
        };

        // Modal actions
        this.dom.saveBtn.onclick = () => this.save();
        this.dom.cancelBtn.onclick = () => this.cancel();
        this.dom.executeBtn.onclick = () => this.executeEdit();

        // Original toggle button - momentary press to show original
        this.dom.originalBtn.addEventListener('mousedown', () => this.showOriginal());
        this.dom.originalBtn.addEventListener('mouseup', () => this.showEdited());
        this.dom.originalBtn.addEventListener('mouseleave', () => this.showEdited());
        // Touch support
        this.dom.originalBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.showOriginal(); });
        this.dom.originalBtn.addEventListener('touchend', () => this.showEdited());

        // Workspace Events (Panning & Drawing)
        this.dom.workspace.addEventListener('mousedown', (e) => {
            if (!this.active) return;

            if (e.button === 1) { // Middle Click Panning
                e.preventDefault();
                this.startPanning(e);
            } else if (e.button === 0) { // Left Click Drawing
                this.startDrawing(e);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.active) {
                this.handleMouseMove(e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 1) this.stopPanning();
            if (e.button === 0) this.stopDrawing();
        });

        // Zoom logic
        this.dom.workspace.addEventListener('wheel', (e) => {
            if (this.active) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                this.setZoom(this.zoom * delta);
            }
        }, { passive: false });

        // Shortcuts
        window.addEventListener('keydown', (e) => {
            if (!this.active) return;
            if (document.activeElement === this.dom.promptInput) return;

            const key = e.key.toLowerCase();
            if (key === 'd') this.setTool('draw');
            if (key === 'e') this.setTool('erase');
            if (key === '[') this.setBrushSize(this.brushSize - 5);
            if (key === ']') this.setBrushSize(this.brushSize + 5);
            if (e.key === 'Escape') this.cancel();
        });
    }

    open(target) {
        const previewImg = document.querySelector(`#preview-${target} img`);
        if (!previewImg) {
            lagoonAlert('No image to edit.');
            return;
        }

        this.target = target;
        this.active = true;
        this.savedPixels = null; // clear any prior saved state for a fresh session
        this.originalCardSrc = previewImg.src; // snapshot for cancel restoration
        this.preEditSrc = previewImg.src;
        this.postEditSrc = null;
        this.dom.originalBtn.classList.add('hidden');
        this.dom.baseImg.src = previewImg.src;

        this.dom.baseImg.onload = () => {
            const w = this.dom.baseImg.naturalWidth;
            const h = this.dom.baseImg.naturalHeight;
            this.dom.maskCanvas.width = w;
            this.dom.maskCanvas.height = h;
            this.ctx.clearRect(0, 0, w, h);

            const padding = 100;
            const scaleX = (window.innerWidth - padding) / w;
            const scaleY = (window.innerHeight - padding - 60) / h;
            this.setZoom(Math.min(scaleX, scaleY, 1.0));

            this.dom.modal.classList.remove('hidden');
            this.updateCursor();

            setTimeout(() => this.centerWorkspace(), 50);

            // Null out after initial setup so updating baseImg.src later
            // (e.g. after Qwen generates clothing) doesn't reset the zoom.
            this.dom.baseImg.onload = null;
        };
    }

    close() {
        this.active = false;
        this.dom.modal.classList.add('hidden');
    }

    cancel() {
        // Restore the card to whatever it was before the editor was opened,
        // discarding any Execute iterations that updated the preview mid-session.
        if (this.originalCardSrc) {
            this.updateCardPreview(this.target, this.originalCardSrc);
        }
        this.savedPixels = null;
        this.originalCardSrc = null;
        this.dom.originalBtn.classList.add('hidden');
        this.close();
    }

    setTool(tool) {
        this.tool = tool;
        this.dom.drawBtn.classList.toggle('active', tool === 'draw');
        this.dom.eraseBtn.classList.toggle('active', tool === 'erase');
        this.updateCursor();
    }

    setBrushSize(size) {
        this.brushSize = Math.max(5, Math.min(200, size));
        this.dom.brushSlider.value = this.brushSize;
        this.dom.brushValue.textContent = this.brushSize;
        this.updateCursor();
    }

    setZoom(value) {
        this.zoom = Math.max(0.1, Math.min(5.0, value));
        this.dom.container.style.transform = `scale(${this.zoom})`;
        this.updateCursor();
    }

    centerWorkspace() {
        const cw = this.dom.container.offsetWidth * this.zoom;
        const ch = this.dom.container.offsetHeight * this.zoom;
        this.dom.workspace.scrollLeft = (cw - window.innerWidth) / 2;
        this.dom.workspace.scrollTop = (ch - window.innerHeight) / 2;
    }

    updateCursor() {
        const visualSize = this.brushSize * this.zoom;
        this.dom.cursor.style.width = `${visualSize}px`;
        this.dom.cursor.style.height = `${visualSize}px`;
        this.dom.cursor.style.backgroundColor = 'rgba(255, 165, 0, 0.4)';
        this.dom.cursor.style.borderColor = 'rgba(255, 165, 0, 0.6)';
    }

    handleMouseMove(e) {
        // Only show custom cursor in workspace
        const overWorkspace = e.target.closest('#image-edit-workspace');
        this.dom.cursor.style.display = overWorkspace ? 'block' : 'none';

        this.dom.cursor.style.left = `${e.clientX}px`;
        this.dom.cursor.style.top = `${e.clientY}px`;

        if (this.isPanning) {
            this.doPanning(e);
        } else if (this.isDrawing) {
            this.draw(e);
        }
    }

    startPanning(e) {
        this.isPanning = true;
        this.startX = e.pageX - this.dom.workspace.offsetLeft;
        this.startY = e.pageY - this.dom.workspace.offsetTop;
        this.scrollLeft = this.dom.workspace.scrollLeft;
        this.scrollTop = this.dom.workspace.scrollTop;
        this.dom.workspace.style.cursor = 'grabbing';
    }

    doPanning(e) {
        if (!this.isPanning) return;
        const x = e.pageX - this.dom.workspace.offsetLeft;
        const y = e.pageY - this.dom.workspace.offsetTop;
        const walkX = (x - this.startX);
        const walkY = (y - this.startY);
        this.dom.workspace.scrollLeft = this.scrollLeft - walkX;
        this.dom.workspace.scrollTop = this.scrollTop - walkY;
    }

    stopPanning() {
        this.isPanning = false;
        this.dom.workspace.style.cursor = 'none';
    }

    getCanvasCoords(e) {
        const rect = this.dom.maskCanvas.getBoundingClientRect();
        const scaleX = this.dom.maskCanvas.width / rect.width;
        const scaleY = this.dom.maskCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    startDrawing(e) {
        if (this.isPanning) return;
        this.isDrawing = true;
        const coords = this.getCanvasCoords(e);
        [this.lastX, this.lastY] = [coords.x, coords.y];
        this.draw(e);
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    draw(e) {
        if (!this.isDrawing) return;
        const coords = this.getCanvasCoords(e);
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = this.brushSize;
        if (this.tool === 'draw') {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = '#ffa500';
        } else {
            this.ctx.globalCompositeOperation = 'destination-out';
        }
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(coords.x, coords.y);
        this.ctx.stroke();
        [this.lastX, this.lastY] = [coords.x, coords.y];
    }

    /**
     * Save: snapshot pixels under the mask RIGHT NOW (mask defines which pixels to preserve),
     * send to Qwen to generate clothing, update card with clothed result, close.
     */
    async save() {
        // If an execute edit was already accepted, just close — card is already updated.
        if (this.postEditSrc) {
            this.close();
            return;
        }

        const imgData = this.ctx.getImageData(0, 0, this.dom.maskCanvas.width, this.dom.maskCanvas.height);
        const hasMask = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
        if (!hasMask) {
            this.close();
            return;
        }

        this.dom.saveBtn.disabled = true;
        this.dom.promptWrapper.classList.add('working');

        try {
            // 1. Capture PROTECTED pixels (everything UNDER the mask) for chat restoration.
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = this.dom.maskCanvas.width;
            snapCanvas.height = this.dom.maskCanvas.height;
            const snapCtx = snapCanvas.getContext('2d');
            snapCtx.drawImage(this.dom.baseImg, 0, 0);
            snapCtx.globalCompositeOperation = 'destination-in'; // Keep only the masked area
            snapCtx.drawImage(this.dom.maskCanvas, 0, 0);
            
            this.savedPixels = {
                target: this.target,
                origDataUrl: snapCanvas.toDataURL('image/png'),
                maskDataUrl: this.dom.maskCanvas.toDataURL()
            };

            // 2. Build binary mask for the AI (painted area -> white)
            const binaryCanvas = document.createElement('canvas');
            binaryCanvas.width = this.dom.maskCanvas.width;
            binaryCanvas.height = this.dom.maskCanvas.height;
            const binaryCtx = binaryCanvas.getContext('2d');
            binaryCtx.drawImage(this.dom.maskCanvas, 0, 0);
            const px = binaryCtx.getImageData(0, 0, binaryCanvas.width, binaryCanvas.height);
            for (let i = 0; i < px.data.length; i += 4) {
                const val = px.data[i + 3] > 0 ? 255 : 0;
                px.data[i] = val; px.data[i + 1] = val; px.data[i + 2] = val; px.data[i + 3] = 255;
            }
            binaryCtx.putImageData(px, 0, 0);
            const maskB64 = binaryCanvas.toDataURL('image/png');

            // 3. Send to model
            const response = await fetch('/api/image/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelId: 'qwen-image-2-edit',
                    prompt: 'Add clothing to the masked area only. Do not change the subject\'s pose, face, hair, skin tone, or body shape. Do not alter the background. Add appropriate clothing.',
                    images: [this.dom.baseImg.src, maskB64]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newB64 = result.images ? result.images[0] : result.image;
            if (newB64) {
                const finalSrc = newB64.startsWith('data:') ? newB64 : `data:image/png;base64,${newB64}`;
                const resultImg = new Image();
                resultImg.onload = () => {
                    const w = this.dom.baseImg.naturalWidth;
                    const h = this.dom.baseImg.naturalHeight;
                    const outCanvas = document.createElement('canvas');
                    outCanvas.width = w; outCanvas.height = h;
                    const outCtx = outCanvas.getContext('2d');
                    // Draw original card, then stamp AI result into the mask hole
                    outCtx.drawImage(this.dom.baseImg, 0, 0);
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = w; tempCanvas.height = h;
                    const tCtx = tempCanvas.getContext('2d');
                    tCtx.drawImage(resultImg, 0, 0, w, h);
                    tCtx.globalCompositeOperation = 'destination-in';
                    // Use raw mask canvas — alpha=0 outside painted area correctly clips the result
                    tCtx.drawImage(this.dom.maskCanvas, 0, 0);
                    outCtx.drawImage(tempCanvas, 0, 0);

                    this.updateCardPreview(this.target, outCanvas.toDataURL('image/png'));
                };
                resultImg.src = finalSrc;
            }
            this.close();
        } catch (err) {
            console.error('[ImageEditor] Save failed:', err);
            lagoonAlert(`Failed: ${err.message}`);
            this.savedPixels = null;
        } finally {
            this.dom.saveBtn.disabled = false;
            this.dom.promptWrapper.classList.remove('working');
        }
    }

    async executeEdit() {
        const prompt = this.dom.promptInput.value.trim();
        if (!prompt) {
            lagoonAlert('Please enter an instruction for the edit.');
            return;
        }

        // Show Light Chase Spinner around prompt box and image
        this.dom.promptWrapper.classList.add('working');
        this.dom.container.classList.add('working');
        this.dom.executeBtn.disabled = true;

        try {
            // Always apply edits to the original image, not any intermediate result
            const baseImage = this.originalCardSrc;
            const origImg = await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = baseImage;
            });

            // Prepare Binary Mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.dom.maskCanvas.width;
            tempCanvas.height = this.dom.maskCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.dom.maskCanvas, 0, 0);
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                const val = alpha > 0 ? 255 : 0;
                data[i] = val; data[i+1] = val; data[i+2] = val; data[i+3] = 255;
            }
            tempCtx.putImageData(imgData, 0, 0);
            const maskB64 = tempCanvas.toDataURL('image/png');

            const response = await fetch('/api/image/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelId: this.dom.modelSelect.value,
                    prompt: `Add clothing to the masked area only. Do not change the subject's pose, face, hair, skin tone, or body shape. Do not alter the background. ${prompt}`,
                    images: [baseImage, maskB64]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newImageB64 = result.images ? result.images[0] : result.image;
            if (newImageB64) {
                const finalSrc = newImageB64.startsWith('data:') ? newImageB64 : `data:image/png;base64,${newImageB64}`;
                
                // 1. Capture PROTECTED pixels (everything UNDER the mask) for chat restoration.
                const snapCanvas = document.createElement('canvas');
                const origW = origImg.naturalWidth;
                const origH = origImg.naturalHeight;
                snapCanvas.width = origW;
                snapCanvas.height = origH;
                const snapCtx = snapCanvas.getContext('2d');
                snapCtx.drawImage(origImg, 0, 0);
                snapCtx.globalCompositeOperation = 'destination-in'; // Keep only the masked area
                snapCtx.drawImage(this.dom.maskCanvas, 0, 0, origW, origH);
                
                this.savedPixels = {
                    target: this.target,
                    origDataUrl: snapCanvas.toDataURL('image/png'),
                    maskDataUrl: this.dom.maskCanvas.toDataURL()
                };

                const resultImg = new Image();
                resultImg.onload = () => {
                    const outCanvas = document.createElement('canvas');
                    outCanvas.width = origW;
                    outCanvas.height = origH;
                    const outCtx = outCanvas.getContext('2d');
                    
                    // Draw original card, then stamp AI result into the mask hole
                    outCtx.drawImage(origImg, 0, 0);

                    const compCanvas = document.createElement('canvas');
                    compCanvas.width = origW;
                    compCanvas.height = origH;
                    const cCtx = compCanvas.getContext('2d');
                    cCtx.drawImage(resultImg, 0, 0, origW, origH);
                    cCtx.globalCompositeOperation = 'destination-in';
                    // Use raw mask canvas — alpha=0 outside painted area correctly clips the result
                    cCtx.drawImage(this.dom.maskCanvas, 0, 0, origW, origH);
                    
                    outCtx.drawImage(compCanvas, 0, 0);

                    const compositedSrc = outCanvas.toDataURL('image/png');
                    this.updateCardPreview(this.target, compositedSrc);
                    this.dom.baseImg.src = compositedSrc;

                    // Store post-edit and show Original toggle button
                    this.postEditSrc = compositedSrc;
                    this.dom.originalBtn.classList.remove('hidden');
                    
                    // Clear mask after successful edit
                    this.ctx.clearRect(0, 0, this.dom.maskCanvas.width, this.dom.maskCanvas.height);
                };
                resultImg.src = finalSrc;
            }
        } catch (err) {
            console.error('[ImageEditor] Edit failed:', err);
            lagoonAlert(`Edit failed: ${err.message}`);
        } finally {
            // Hide spinner and re-enable button
            this.dom.promptWrapper.classList.remove('working');
            this.dom.container.classList.remove('working');
            this.dom.executeBtn.disabled = false;
        }
    }

    /**
     * Show the original (pre-edit) image while holding the Original button.
     */
    showOriginal() {
        if (this.preEditSrc) {
            this.dom.baseImg.src = this.preEditSrc;
        }
    }

    /**
     * Show the edited image when releasing the Original button.
     */
    showEdited() {
        if (this.postEditSrc) {
            this.dom.baseImg.src = this.postEditSrc;
        }
    }

    /**
     * Restore the saved original pixels (from under the mask) back onto a result image,
     * with a feathered edge so the composite blends naturally.
     * Called by ImageModeManager after the main model edit returns.
     * @param {string} resultDataUrl - the edited image from the main model
     * @returns {Promise<string>} - composited dataUrl with original pixels restored
     */
    async restorePixels(resultDataUrl) {
        if (!this.savedPixels) return resultDataUrl;

        const { origDataUrl, maskDataUrl } = this.savedPixels;

        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        const [resultImg, origPixelsImg, maskImg] = await Promise.all([
            loadImage(resultDataUrl),
            loadImage(origDataUrl),
            loadImage(maskDataUrl)
        ]);

        // Dimensions come from the saved original pixels — these match the source image.
        const w = origPixelsImg.naturalWidth;
        const h = origPixelsImg.naturalHeight;

        // Feathered mask: blur the mask shape to create a soft transition at the edges.
        const featherCanvas = document.createElement('canvas');
        featherCanvas.width = w;
        featherCanvas.height = h;
        const featherCtx = featherCanvas.getContext('2d');
        featherCtx.filter = 'blur(3px)';
        featherCtx.drawImage(maskImg, 0, 0, w, h);
        featherCtx.filter = 'none';

        // Restore layer: original pixels clipped to the feathered mask shape.
        const restoreCanvas = document.createElement('canvas');
        restoreCanvas.width = w;
        restoreCanvas.height = h;
        const restoreCtx = restoreCanvas.getContext('2d');
        restoreCtx.drawImage(origPixelsImg, 0, 0, w, h);
        restoreCtx.globalCompositeOperation = 'destination-in';
        restoreCtx.drawImage(featherCanvas, 0, 0, w, h);

        // Output: result image at original dimensions, restore layer stamped on top.
        const outCanvas = document.createElement('canvas');
        outCanvas.width = w;
        outCanvas.height = h;
        const outCtx = outCanvas.getContext('2d');
        outCtx.drawImage(resultImg, 0, 0, w, h);
        outCtx.drawImage(restoreCanvas, 0, 0);

        return outCanvas.toDataURL('image/png');
    }

    updateCardPreview(target, dataUrl) {
        const preview = document.getElementById(`preview-${target}`);
        if (!preview) return;
        preview.innerHTML = `<img src="${dataUrl}" alt="${target} preview">`;
    }
}

export const imageEditor = new ImageEditor();
