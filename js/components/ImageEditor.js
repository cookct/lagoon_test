/**
 * Masking Modal Component
 * Full-screen modal for mask-based image editing.
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
        this.dilation = 10;
        this.feather = 4;

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

        // True originals per target — first image ever loaded into each slot,
        // used as the AI edit base so iterating edits always branch from the source.
        this.trueOriginals = new Map();

        // Pre/post edit sources for Original toggle button
        this.preEditSrc = null;
        this.postEditSrc = null;

        this.maskVisible = true;

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
        this.dom.previewCanvas = document.getElementById('image-edit-preview-canvas');
        this.dom.cursor = document.getElementById('image-edit-cursor');

        this.dom.drawBtn = document.getElementById('editor-draw-btn');
        this.dom.eraseBtn = document.getElementById('editor-erase-btn');
        this.dom.brushSlider = document.getElementById('editor-brush-slider');
        this.dom.brushValue = document.getElementById('editor-brush-value');
        this.dom.promptWrapper = document.getElementById('editor-prompt-wrapper');
        this.dom.promptInput = document.getElementById('editor-prompt-input');
        this.dom.doneBtn = document.getElementById('editor-done-btn');
        this.dom.cancelBtn = document.getElementById('editor-cancel-btn');
        this.dom.executeBtn = document.getElementById('editor-execute-btn');
        this.dom.maskToggleBtn = document.getElementById('editor-mask-toggle-btn');
        this.dom.modelSelect = document.getElementById('editor-model-select');
        this.dom.originalBtn = document.getElementById('editor-original-btn');

        this.dom.dilationGroup = document.getElementById('editor-dilation-group');
        this.dom.dilationValue = document.getElementById('editor-dilation-value');
        this.dom.featherGroup = document.getElementById('editor-feather-group');
        this.dom.featherValue = document.getElementById('editor-feather-value');

        this.ctx = this.dom.maskCanvas.getContext('2d');
        this.ctxPreview = this.dom.previewCanvas.getContext('2d');
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

        // Dilation Wheel Control
        if (this.dom.dilationGroup) {
            this.dom.dilationGroup.onwheel = (e) => {
                e.preventDefault();
                const step = e.deltaY < 0 ? 1 : -1;
                this.dilation = Math.max(0, Math.min(100, this.dilation + step));
                this.dom.dilationValue.textContent = this.dilation;
                this.updatePreviewMask();
            };
        }

        // Feather Wheel Control
        if (this.dom.featherGroup) {
            this.dom.featherGroup.onwheel = (e) => {
                e.preventDefault();
                const step = e.deltaY < 0 ? 1 : -1;
                this.feather = Math.max(0, Math.min(50, this.feather + step));
                this.dom.featherValue.textContent = this.feather;
                this.updatePreviewMask();
            };
        }

        // Modal actions
        this.dom.doneBtn.onclick = () => this.done();
        this.dom.cancelBtn.onclick = () => this.cancel();
        this.dom.executeBtn.onclick = () => this.executeEdit();
        this.dom.maskToggleBtn.onclick = () => this.toggleMaskVisibility();

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
            if (e.target.closest('button')) return; // buttons handle their own clicks

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

        // Zoom to cursor
        this.dom.workspace.addEventListener('wheel', (e) => {
            if (!this.active) return;
            e.preventDefault();

            const oldZoom = this.zoom;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5.0, oldZoom * factor));
            if (newZoom === oldZoom) return;

            // Cursor position relative to the workspace viewport
            const rect = this.dom.workspace.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Image-space point currently under the cursor
            const imgX = (this.dom.workspace.scrollLeft + mouseX) / oldZoom;
            const imgY = (this.dom.workspace.scrollTop + mouseY) / oldZoom;

            this.setZoom(newZoom);

            // Reposition scroll so the same image point stays under the cursor
            this.dom.workspace.scrollLeft = imgX * newZoom - mouseX;
            this.dom.workspace.scrollTop  = imgY * newZoom - mouseY;
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

        // If switching to a different slot, we must clear the old mask state
        if (this.target && this.target !== target) {
            this.clearMaskState();
        }

        this.target = target;
        this.active = true;

        // Seed the true original on first open for this target — never overwritten,
        // so iterating edits across multiple sessions always branch from the source image.
        if (!this.trueOriginals.has(target)) {
            this.trueOriginals.set(target, previewImg.src);
        }

        // originalCardSrc is the restore point for Cancel (this session only)
        this.originalCardSrc = previewImg.src;
        this.preEditSrc = previewImg.src;
        this.postEditSrc = null;
        this.dom.originalBtn.classList.add('hidden');

        this.dom.baseImg.onload = () => {
            const w = this.dom.baseImg.naturalWidth;
            const h = this.dom.baseImg.naturalHeight;
            
            // Only resize/clear if dimensions changed or canvases are empty
            if (this.dom.maskCanvas.width !== w || this.dom.maskCanvas.height !== h) {
                this.dom.maskCanvas.width = w;
                this.dom.maskCanvas.height = h;
                this.dom.previewCanvas.width = w;
                this.dom.previewCanvas.height = h;
                this.ctx.clearRect(0, 0, w, h);
                this.ctxPreview.clearRect(0, 0, w, h);
            }

            const padding = 100;
            const scaleX = (window.innerWidth - padding) / w;
            const scaleY = (window.innerHeight - padding - 60) / h;
            this.setZoom(Math.min(scaleX, scaleY, 1.0));

            this.dom.modal.classList.remove('hidden');
            this.updateCursor();

            setTimeout(() => this.centerWorkspace(), 50);

            // Re-render the red preview in case dilation/feather changed or we just opened
            this.updatePreviewMask();

            this.dom.baseImg.onload = null;
        };

        this.dom.baseImg.src = previewImg.src;
    }

    close() {
        this.active = false;
        // Always restore mask visibility for the next open
        if (!this.maskVisible) this.toggleMaskVisibility();
        this.dom.modal.classList.remove('hidden'); // Ensure working state doesn't stick
        this.dom.modal.classList.add('hidden');
    }

    toggleMaskVisibility() {
        this.maskVisible = !this.maskVisible;
        this.dom.maskCanvas.style.opacity = this.maskVisible ? '' : '0';
        this.dom.previewCanvas.style.opacity = this.maskVisible ? '' : '0';
        this.dom.maskToggleBtn.classList.toggle('active', !this.maskVisible);
        this.dom.maskToggleBtn.title = this.maskVisible ? 'Hide mask' : 'Show mask';
    }

    async done() {
        // If a mask is drawn but no AI edit was executed, auto-redact the masked area
        const imgData = this.ctx.getImageData(0, 0, this.dom.maskCanvas.width, this.dom.maskCanvas.height);
        const hasMask = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
        if (hasMask && !this.postEditSrc) {
            await this.save();
        } else {
            this.close();
        }
    }

    clearMaskState() {
        this.savedPixels = null;
        this.postEditSrc = null;
        const rpLabel = document.getElementById('restore-pixels-label');
        const rpCheck = document.getElementById('restore-pixels-checkbox');
        if (rpLabel) rpLabel.style.display = 'none';
        if (rpCheck) rpCheck.checked = false;
        if (this.dom.maskCanvas && this.dom.maskCanvas.width) {
            this.ctx.clearRect(0, 0, this.dom.maskCanvas.width, this.dom.maskCanvas.height);
            this.ctxPreview.clearRect(0, 0, this.dom.previewCanvas.width, this.dom.previewCanvas.height);
        }
    }

    cancel() {
        // Restore the card to whatever it was before the editor was opened,
        // discarding any Execute iterations that updated the preview mid-session.
        if (this.originalCardSrc) {
            this.updateCardPreview(this.target, this.originalCardSrc);
        }
        this.savedPixels = null;
        this.originalCardSrc = null;
        const rpLabel = document.getElementById('restore-pixels-label');
        const rpCheck = document.getElementById('restore-pixels-checkbox');
        if (rpLabel) rpLabel.style.display = 'none';
        if (rpCheck) rpCheck.checked = false;
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
        
        // Use layout scaling instead of transform scaling to ensure the browser 
        // handles scrollable bounds and 'margin: auto' correctly.
        const w = this.dom.baseImg.naturalWidth * this.zoom;
        const h = this.dom.baseImg.naturalHeight * this.zoom;
        
        this.dom.container.style.width = `${w}px`;
        this.dom.container.style.height = `${h}px`;
        
        this.updateCursor();
    }

    centerWorkspace() {
        // If image is larger than workspace, center the scroll position.
        // If smaller, flex margin:auto handles the visual centering.
        const sw = this.dom.workspace.scrollWidth;
        const sh = this.dom.workspace.scrollHeight;
        const vw = this.dom.workspace.clientWidth;
        const vh = this.dom.workspace.clientHeight;

        if (sw > vw) this.dom.workspace.scrollLeft = (sw - vw) / 2;
        if (sh > vh) this.dom.workspace.scrollTop = (sh - vh) / 2;
    }

    updateCursor() {
        // Use visual size for cursor
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
        if (!this.maskVisible) this.toggleMaskVisibility();
        this.isDrawing = true;
        const coords = this.getCanvasCoords(e);
        [this.lastX, this.lastY] = [coords.x, coords.y];
        this.draw(e);
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.updatePreviewMask();
        }
    }

    updatePreviewMask() {
        const w = this.dom.maskCanvas.width;
        const h = this.dom.maskCanvas.height;
        if (!w || !h) return;

        this.ctxPreview.clearRect(0, 0, w, h);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');

        // Apply Dilation
        if (this.dilation > 0) {
            tCtx.filter = `blur(${this.dilation}px)`;
            tCtx.drawImage(this.dom.maskCanvas, 0, 0);
            tCtx.filter = 'none';
            tCtx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 3; i++) tCtx.drawImage(tempCanvas, 0, 0);
        } else {
            tCtx.drawImage(this.dom.maskCanvas, 0, 0);
        }

        // Apply Feathering
        if (this.feather > 0) {
            const fCanvas = document.createElement('canvas');
            fCanvas.width = w;
            fCanvas.height = h;
            const fCtx = fCanvas.getContext('2d');
            fCtx.filter = `blur(${this.feather}px)`;
            fCtx.drawImage(tempCanvas, 0, 0);
            
            tCtx.clearRect(0, 0, w, h);
            tCtx.drawImage(fCanvas, 0, 0);
        }

        // Color it RED
        this.ctxPreview.fillStyle = '#ff0000';
        this.ctxPreview.fillRect(0, 0, w, h);
        this.ctxPreview.globalCompositeOperation = 'destination-in';
        this.ctxPreview.drawImage(tempCanvas, 0, 0);
        this.ctxPreview.globalCompositeOperation = 'source-over';
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
     * Save: Apply the mask as a solid color (Redact) using current dilation/feather settings,
     * update the card, and close.
     */
    async save() {
        const imgData = this.ctx.getImageData(0, 0, this.dom.maskCanvas.width, this.dom.maskCanvas.height);
        const hasMask = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
        if (!hasMask) {
            this.close();
            return;
        }

        this.dom.doneBtn.disabled = true;
        this.dom.modal.classList.add('working');

        try {
            const w = this.dom.baseImg.naturalWidth;
            const h = this.dom.baseImg.naturalHeight;

            // 1. Capture PROTECTED pixels (everything UNDER the mask) for chat restoration.
            // This allows the user to later "restore" the original even after a redaction.
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = w;
            snapCanvas.height = h;
            const snapCtx = snapCanvas.getContext('2d');
            snapCtx.drawImage(this.dom.baseImg, 0, 0);
            snapCtx.globalCompositeOperation = 'destination-in'; 
            snapCtx.drawImage(this.dom.maskCanvas, 0, 0);
            
            this.savedPixels = {
                target: this.target,
                origDataUrl: snapCanvas.toDataURL('image/png'),
                maskDataUrl: this.dom.maskCanvas.toDataURL(),
                dilation: this.dilation,
                feather: this.feather
            };
            const rpLabel = document.getElementById('restore-pixels-label');
            const rpCheck = document.getElementById('restore-pixels-checkbox');
            if (rpLabel) rpLabel.style.display = '';
            if (rpCheck) rpCheck.checked = true;

            // 2. Process the mask for the final composite (using dilation/feather settings)
            const processedMaskUrl = await this.getProcessedMaskDataUrl();
            const maskImg = await new Promise(res => {
                const img = new Image();
                img.onload = () => res(img);
                img.src = processedMaskUrl;
            });

            // 3. Composite: Base Image + Solid Color (Black/Dark Gray) clipped by mask
            const outCanvas = document.createElement('canvas');
            outCanvas.width = w; outCanvas.height = h;
            const outCtx = outCanvas.getContext('2d');
            
            outCtx.drawImage(this.dom.baseImg, 0, 0);
            
            // Draw the redaction layer
            const redactionCanvas = document.createElement('canvas');
            redactionCanvas.width = w; redactionCanvas.height = h;
            const rCtx = redactionCanvas.getContext('2d');
            rCtx.fillStyle = '#050505'; // Deep lagoon black
            rCtx.fillRect(0, 0, w, h);
            rCtx.globalCompositeOperation = 'destination-in';
            rCtx.drawImage(maskImg, 0, 0);

            outCtx.drawImage(redactionCanvas, 0, 0);

            this.updateCardPreview(this.target, outCanvas.toDataURL('image/png'));
            this.close();
        } catch (err) {
            console.error('[ImageEditor] Save failed:', err);
            lagoonAlert(`Failed: ${err.message}`);
        } finally {
            this.dom.doneBtn.disabled = false;
            this.dom.modal.classList.remove('working');
        }
    }

    /**
     * Helper to get the dilated/feathered mask as a data URL based on current settings.
     */
    async getProcessedMaskDataUrl() {
        const w = this.dom.maskCanvas.width;
        const h = this.dom.maskCanvas.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');

        // Apply Dilation
        if (this.dilation > 0) {
            tCtx.filter = `blur(${this.dilation}px)`;
            tCtx.drawImage(this.dom.maskCanvas, 0, 0);
            tCtx.filter = 'none';
            tCtx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 3; i++) tCtx.drawImage(tempCanvas, 0, 0);
        } else {
            tCtx.drawImage(this.dom.maskCanvas, 0, 0);
        }

        // Apply Feathering
        if (this.feather > 0) {
            const fCanvas = document.createElement('canvas');
            fCanvas.width = w;
            fCanvas.height = h;
            const fCtx = fCanvas.getContext('2d');
            fCtx.filter = `blur(${this.feather}px)`;
            fCtx.drawImage(tempCanvas, 0, 0);
            
            tCtx.clearRect(0, 0, w, h);
            tCtx.drawImage(fCanvas, 0, 0);
        }
        return tempCanvas.toDataURL();
    }

    async executeEdit() {
        const prompt = this.dom.promptInput.value.trim();
        if (!prompt) {
            lagoonAlert('Please enter an instruction for the edit.');
            return;
        }

        // Show Morphing Core Spinner
        this.dom.modal.classList.add('working');
        this.dom.executeBtn.disabled = true;

        try {
            // Always apply edits to the true original (first image ever loaded into this slot),
            // not the card's current state — so iterating edits never compound across sessions.
            const baseImage = this.trueOriginals.get(this.target) || this.originalCardSrc;
            const origImg = await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = baseImage;
            });

            // Build the processed (dilated + feathered) mask — matches the red preview the user sees
            const processedMaskUrl = await this.getProcessedMaskDataUrl();
            const processedMaskImg = await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = processedMaskUrl;
            });

            // Binarize the processed mask for the API (white = edit here, black = leave alone)
            const binCanvas = document.createElement('canvas');
            binCanvas.width = this.dom.maskCanvas.width;
            binCanvas.height = this.dom.maskCanvas.height;
            const binCtx = binCanvas.getContext('2d');
            binCtx.drawImage(processedMaskImg, 0, 0);
            const imgData = binCtx.getImageData(0, 0, binCanvas.width, binCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const val = data[i + 3] > 0 ? 255 : 0;
                data[i] = val; data[i+1] = val; data[i+2] = val; data[i+3] = 255;
            }
            binCtx.putImageData(imgData, 0, 0);
            const maskB64 = binCanvas.toDataURL('image/png');

            // Check model's mask capability via data attribute; non-capable models
            // get only the base image — the backend strips it too, and the mask is
            // enforced locally via compositing after the result arrives.
            const selectedOpt = this.dom.modelSelect.options[this.dom.modelSelect.selectedIndex];
            const maskCapable = selectedOpt?.dataset.maskCapable === 'true';
            const apiImages = maskCapable ? [baseImage, maskB64] : [baseImage];
            const apiPrompt = maskCapable
                ? `Add clothing to the masked area only. Do not change the subject's pose, face, hair, skin tone, or body shape. Do not alter the background. ${prompt}`
                : prompt;

            const response = await fetch('/api/image/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelId: this.dom.modelSelect.value,
                    prompt: apiPrompt,
                    images: apiImages
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);

            const newImageB64 = result.images ? result.images[0] : result.image;
            if (newImageB64) {
                const finalSrc = newImageB64.startsWith('data:') ? newImageB64 : `data:image/png;base64,${newImageB64}`;
                
                // 1. Capture PROTECTED pixels (everything UNDER the processed mask) for chat restoration.
                const origW = origImg.naturalWidth;
                const origH = origImg.naturalHeight;
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = origW;
                snapCanvas.height = origH;
                const snapCtx = snapCanvas.getContext('2d');
                snapCtx.drawImage(origImg, 0, 0);
                snapCtx.globalCompositeOperation = 'destination-in';
                snapCtx.drawImage(processedMaskImg, 0, 0, origW, origH);

                this.savedPixels = {
                    target: this.target,
                    origDataUrl: snapCanvas.toDataURL('image/png'),
                    maskDataUrl: this.dom.maskCanvas.toDataURL(), // raw mask stored for restorePixels re-processing
                    dilation: this.dilation,
                    feather: this.feather
                };
                const rpLabel = document.getElementById('restore-pixels-label');
                const rpCheck = document.getElementById('restore-pixels-checkbox');
                if (rpLabel) rpLabel.style.display = '';
                if (rpCheck) rpCheck.checked = true;

                const resultImg = new Image();
                resultImg.onload = () => {
                    const outCanvas = document.createElement('canvas');
                    outCanvas.width = origW;
                    outCanvas.height = origH;
                    const outCtx = outCanvas.getContext('2d');

                    // Draw original, then stamp AI result clipped to the processed mask
                    outCtx.drawImage(origImg, 0, 0);

                    const compCanvas = document.createElement('canvas');
                    compCanvas.width = origW;
                    compCanvas.height = origH;
                    const cCtx = compCanvas.getContext('2d');
                    cCtx.drawImage(resultImg, 0, 0, origW, origH);
                    cCtx.globalCompositeOperation = 'destination-in';
                    cCtx.drawImage(processedMaskImg, 0, 0, origW, origH);

                    outCtx.drawImage(compCanvas, 0, 0);

                    const compositedSrc = outCanvas.toDataURL('image/png');
                    this.updateCardPreview(this.target, compositedSrc);
                    this.dom.baseImg.src = compositedSrc;

                    // Store post-edit and show Original toggle button
                    this.postEditSrc = compositedSrc;
                    this.dom.originalBtn.classList.remove('hidden');
                };
                resultImg.src = finalSrc;
            }
        } catch (err) {
            console.error('[ImageEditor] Edit failed:', err);
            lagoonAlert(`Edit failed: ${err.message}`);
        } finally {
            // Hide spinner and re-enable button
            this.dom.modal.classList.remove('working');
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
     * using a Dilation + Feathering strategy to ensure a perfect blend without white seams.
     * @param {string} resultDataUrl - the edited image from the main model
     * @returns {Promise<string>} - composited dataUrl with original pixels restored
     */
    async restorePixels(resultDataUrl) {
        if (!this.savedPixels) return resultDataUrl;

        const { origDataUrl, maskDataUrl, dilation: savedDilation, feather: savedFeather } = this.savedPixels;
        const dilation = savedDilation !== undefined ? savedDilation : this.dilation;
        const feather = savedFeather !== undefined ? savedFeather : this.feather;

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

        const w = origPixelsImg.naturalWidth;
        const h = origPixelsImg.naturalHeight;

        // 1. Create a Dilated & Feathered Mask
        // We expand the mask so the original pixels overlap the AI-generated area slightly.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const mCtx = maskCanvas.getContext('2d');

        // Apply Dilation
        if (dilation > 0) {
            mCtx.filter = `blur(${dilation}px)`;
            mCtx.drawImage(maskImg, 0, 0, w, h);
            mCtx.filter = 'none';
            // Boost alpha to make dilated area opaque before feathering
            mCtx.globalCompositeOperation = 'source-over';
            for(let i=0; i<3; i++) mCtx.drawImage(maskCanvas, 0, 0);
        } else {
            mCtx.drawImage(maskImg, 0, 0, w, h);
        }

        // Apply Feathering
        if (feather > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w;
            tempCanvas.height = h;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.filter = `blur(${feather}px)`;
            tCtx.drawImage(maskCanvas, 0, 0);
            
            mCtx.clearRect(0, 0, w, h);
            mCtx.drawImage(tempCanvas, 0, 0);
        }

        // 2. Restore Layer: original pixels clipped to the "Fat & Soft" mask shape.
        const restoreCanvas = document.createElement('canvas');
        restoreCanvas.width = w;
        restoreCanvas.height = h;
        const rCtx = restoreCanvas.getContext('2d');
        rCtx.drawImage(origPixelsImg, 0, 0, w, h);
        rCtx.globalCompositeOperation = 'destination-in';
        rCtx.drawImage(maskCanvas, 0, 0, w, h);

        // 3. Output: result image as base, feathered restore layer on top.
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
