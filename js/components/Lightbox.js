/**
 * Lightbox Component
 * Full-screen image viewer with zoom and navigation.
 */

export class Lightbox {
    constructor() {
        this.active = false;
        this.scale = 1.0;
        this.minScale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        
        // Navigation
        this.collection = null;  // Array of image sources
        this.currentIndex = 0;
        
        // Drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartTranslateX = 0;
        this.dragStartTranslateY = 0;
        
        this.dom = {};
    }

    init() {
        this.cacheDom();
        if (!this.dom.modal) {
            console.warn('[Lightbox] Modal element not found, skipping initialization');
            return;
        }
        this.bindEvents();
        console.log('[Lightbox] Initialized');
    }

    cacheDom() {
        this.dom.modal = document.getElementById('lightbox-modal');
        this.dom.container = document.getElementById('lightbox-container');
        this.dom.image = document.getElementById('lightbox-image');
        this.dom.prevBtn = document.getElementById('lightbox-prev');
        this.dom.nextBtn = document.getElementById('lightbox-next');
        this.dom.counter = document.getElementById('lightbox-counter');
    }

    bindEvents() {
        // Close on overlay click
        this.dom.modal.addEventListener('click', (e) => {
            if (e.target === this.dom.modal || e.target === this.dom.container) {
                this.close();
            }
        });

        // Navigation buttons
        this.dom.prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.navigate(-1);
        });
        this.dom.nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.navigate(1);
        });

        // Mouse wheel zoom
        this.dom.container.addEventListener('wheel', (e) => {
            if (!this.active) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.clientX, e.clientY);
        }, { passive: false });

        // Drag to pan
        this.dom.container.addEventListener('mousedown', (e) => {
            if (!this.active) return;
            if (e.button === 0) {
                this.startDrag(e);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.doDrag(e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.stopDrag();
            }
        });

        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            if (!this.active) return;
            
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowLeft') {
                this.navigate(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigate(1);
            }
        });
    }

    /**
     * Open the lightbox with an image.
     * @param {string} src - Image source URL
     * @param {Array<string>} collection - Optional array of image sources for navigation
     * @param {number} index - Current index in collection
     */
    open(src, collection = null, index = 0) {
        this.collection = collection;
        this.currentIndex = index;
        this.active = true;
        
        // Reset transform state
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        
        // Load image
        this.dom.image.src = src;
        this.dom.image.onload = () => {
            this.calculateFitToScreen();
            this.updateTransform();
        };
        
        // Update UI
        this.updateNavigation();
        this.dom.modal.classList.remove('hidden');
    }

    close() {
        this.active = false;
        this.collection = null;
        this.currentIndex = 0;
        this.dom.modal.classList.add('hidden');
        this.dom.image.src = '';
    }

    /**
     * Calculate the minimum scale to fit image to screen.
     */
    calculateFitToScreen() {
        const imgWidth = this.dom.image.naturalWidth;
        const imgHeight = this.dom.image.naturalHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Leave some padding
        const padding = 40;
        const availableWidth = viewportWidth - padding * 2;
        const availableHeight = viewportHeight - padding * 2;
        
        const scaleX = availableWidth / imgWidth;
        const scaleY = availableHeight / imgHeight;
        
        // Use the smaller scale to ensure image fits, cap at 1.0
        this.minScale = Math.min(scaleX, scaleY, 1.0);
        this.scale = 1.0; // Start at 1.0 (fit-to-screen as base)
        this.translateX = 0;
        this.translateY = 0;
    }

    /**
     * Zoom the image, centered on cursor position.
     */
    zoom(delta, cursorX, cursorY) {
        const oldScale = this.scale;
        const newScale = Math.max(1.0, Math.min(10, this.scale * delta));
        
        if (newScale === oldScale) return;
        
        // Get current image position and dimensions
        const rect = this.dom.image.getBoundingClientRect();
        
        // Calculate the point on the image that's currently under the cursor
        // as a fraction (0-1) of the image dimensions
        const pointX = (cursorX - rect.left) / rect.width;
        const pointY = (cursorY - rect.top) / rect.height;
        
        // Get the natural image dimensions
        const naturalWidth = this.dom.image.naturalWidth;
        const naturalHeight = this.dom.image.naturalHeight;
        
        // Calculate the new translation to keep that point under cursor
        // The image is centered, so we work from center
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        
        // New image dimensions at new scale
        const newWidth = naturalWidth * newScale * this.minScale;
        const newHeight = naturalHeight * newScale * this.minScale;
        
        // Position of the point on the scaled image relative to its center
        const pointFromCenterX = (pointX - 0.5) * newWidth;
        const pointFromCenterY = (pointY - 0.5) * newHeight;
        
        // Translate so the point is under the cursor
        this.translateX = cursorX - viewportCenterX - pointFromCenterX;
        this.translateY = cursorY - viewportCenterY - pointFromCenterY;
        this.scale = newScale;
        
        this.updateTransform();
    }

    /**
     * Navigate between images in collection.
     */
    navigate(direction) {
        if (!this.collection || this.collection.length <= 1) return;
        
        this.currentIndex += direction;
        
        // Wrap around
        if (this.currentIndex < 0) {
            this.currentIndex = this.collection.length - 1;
        } else if (this.currentIndex >= this.collection.length) {
            this.currentIndex = 0;
        }
        
        // Reset transform for new image
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        
        // Load new image
        this.dom.image.src = this.collection[this.currentIndex];
        this.dom.image.onload = () => {
            this.calculateFitToScreen();
            this.updateTransform();
            this.updateNavigation();
        };
    }

    /**
     * Update the CSS transform on the image.
     */
    updateTransform() {
        // Scale is relative to fit-to-screen size (1.0 = fit to screen)
        this.dom.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    /**
     * Update navigation UI (arrows and counter).
     */
    updateNavigation() {
        const hasCollection = this.collection && this.collection.length > 1;
        
        this.dom.prevBtn.style.display = hasCollection ? 'flex' : 'none';
        this.dom.nextBtn.style.display = hasCollection ? 'flex' : 'none';
        
        if (hasCollection) {
            this.dom.counter.textContent = `${this.currentIndex + 1} / ${this.collection.length}`;
            this.dom.counter.style.display = 'block';
        } else {
            this.dom.counter.style.display = 'none';
        }
    }

    startDrag(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartTranslateX = this.translateX;
        this.dragStartTranslateY = this.translateY;
        this.dom.container.style.cursor = 'grabbing';
    }

    doDrag(e) {
        if (!this.isDragging) return;
        
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        
        this.translateX = this.dragStartTranslateX + dx;
        this.translateY = this.dragStartTranslateY + dy;
        
        this.updateTransform();
    }

    stopDrag() {
        this.isDragging = false;
        this.dom.container.style.cursor = '';
    }
}

export const lightbox = new Lightbox();
