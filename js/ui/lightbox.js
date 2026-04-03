/**
 * Image/Video Lightbox for viewing generated media
 */

const lightbox = {
    el: null,
    img: null,
    video: null,
    prevBtn: null,
    nextBtn: null,
    numberBadge: null,
    isZoomed: false,
    isDragging: false,
    wasDragged: false,
    posX: 0,
    posY: 0,
    startX: 0,
    startY: 0,
    initialClickX: 0,
    initialClickY: 0,
    scale: 1,
    baseScale: 2.5,
    dragThreshold: 5,
    // Navigation
    media: [],      // Array of {type: 'image'|'video', src: URL}
    currentIndex: 0, // Current media index
    currentType: 'image', // 'image' or 'video'

    init() {
        this.el = document.getElementById('image-lightbox');
        this.img = document.getElementById('lightbox-img');
        this.video = document.getElementById('lightbox-video');
        this.prevBtn = document.getElementById('lightbox-prev');
        this.nextBtn = document.getElementById('lightbox-next');
        this.numberBadge = document.getElementById('lightbox-number');
        if (!this.el || !this.img) return;

        // Close button
        this.el.querySelector('.lightbox-close')?.addEventListener('click', () => this.close());

        // Navigation buttons
        this.prevBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.prev();
        });
        this.nextBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.next();
        });

        // Overlay click to close (only when not zoomed)
        this.el.querySelector('.lightbox-overlay')?.addEventListener('click', () => {
            if (this.scale <= 1) this.close();
        });

        // Wheel zoom (only for images)
        this.el.addEventListener('wheel', (e) => {
            if (!this.el.classList.contains('active')) return;
            if (this.currentType === 'video') return; // No zoom for videos
            e.preventDefault();
            this.handleWheel(e);
        }, { passive: false });

        // Image click to toggle zoom
        this.img.addEventListener('click', (e) => {
            if (this.wasDragged) {
                this.wasDragged = false;
                return;
            }
            e.stopPropagation();
            this.toggleZoom();
        });

        // Drag start (only for images)
        this.el.addEventListener('mousedown', (e) => {
            if (this.scale <= 1 || this.currentType === 'video') return;
            this.isDragging = true;
            this.wasDragged = false;
            this.startX = e.clientX - this.posX;
            this.startY = e.clientY - this.posY;
            this.initialClickX = e.clientX;
            this.initialClickY = e.clientY;
            this.img.classList.add('dragging');
            this.img.style.transition = 'none';
            e.preventDefault();
        });

        // Drag move
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || this.scale <= 1) return;
            e.preventDefault();
            this.posX = e.clientX - this.startX;
            this.posY = e.clientY - this.startY;
            this.updateTransform();
        });

        // Drag end
        window.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.img.classList.remove('dragging');
                const dist = Math.hypot(e.clientX - this.initialClickX, e.clientY - this.initialClickY);
                if (dist > this.dragThreshold) {
                    this.wasDragged = true;
                }
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.el.classList.contains('active')) return;

            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.prev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.next();
            } else if (e.key === ' ' && this.currentType === 'video') {
                // Space to pause/play video
                e.preventDefault();
                if (this.video.paused) {
                    this.video.play();
                } else {
                    this.video.pause();
                }
            }
        });
    },

    // Detect if URL is a video
    isVideoUrl(src) {
        return src.startsWith('data:video/') || src.endsWith('.mp4') || src.endsWith('.webm') || src.endsWith('.mov');
    },

    // Collect media from the same generation batch (same container)
    collectMediaFromBatch(clickedElement) {
        this.media = [];
        if (!clickedElement) return;

        // Find the parent container (.generated-image-container or .message)
        const container = clickedElement.closest('.generated-image-container') || clickedElement.closest('.message');
        if (!container) {
            const src = clickedElement.src || clickedElement.currentSrc;
            if (src) {
                this.media.push({
                    type: this.isVideoUrl(src) ? 'video' : 'image',
                    src: src
                });
            }
            return;
        }

        // Find all generated images and videos in this specific container
        const imgs = container.querySelectorAll('img.generated-image');
        imgs.forEach(img => {
            if (img.src) {
                this.media.push({ type: 'image', src: img.src });
            }
        });

        const videos = container.querySelectorAll('video.generated-image');
        videos.forEach(video => {
            if (video.src || video.currentSrc) {
                this.media.push({ type: 'video', src: video.src || video.currentSrc });
            }
        });
    },

    open(src, clickedElement = null) {
        if (!this.el) this.init();

        const isVideo = this.isVideoUrl(src);

        // Collect media from the same batch only
        if (clickedElement) {
            this.collectMediaFromBatch(clickedElement);
        } else {
            this.media = [{ type: isVideo ? 'video' : 'image', src: src }];
        }

        // Find index
        this.currentIndex = this.media.findIndex(m => m.src === src);
        if (this.currentIndex === -1) {
            this.media = [{ type: isVideo ? 'video' : 'image', src: src }];
            this.currentIndex = 0;
        }

        this.showCurrent();
        this.el.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.updateNavigation();
    },

    close() {
        this.el.classList.remove('active');
        document.body.style.overflow = '';
        this.resetZoom();
        // Pause video when closing
        if (this.video) {
            this.video.pause();
            this.video.currentTime = 0;
        }
    },

    next() {
        if (this.media.length <= 1) return;
        this.currentIndex = (this.currentIndex + 1) % this.media.length;
        this.showCurrent();
    },

    prev() {
        if (this.media.length <= 1) return;
        this.currentIndex = (this.currentIndex - 1 + this.media.length) % this.media.length;
        this.showCurrent();
    },

    showCurrent() {
        const item = this.media[this.currentIndex];
        if (!item) return;

        this.currentType = item.type;
        this.resetZoom();

        if (item.type === 'video') {
            // Show video, hide image
            this.img.style.display = 'none';
            this.video.style.display = 'block';
            this.video.src = item.src;
            this.video.play();
        } else {
            // Show image, hide video
            this.video.style.display = 'none';
            this.video.pause();
            this.img.style.display = 'block';
            this.img.src = item.src;
        }

        this.updateNavigation();
    },

    updateNavigation() {
        const hasMultiple = this.media.length > 1;

        // Show/hide navigation arrows based on whether there are multiple items
        if (this.prevBtn) this.prevBtn.style.display = hasMultiple ? 'flex' : 'none';
        if (this.nextBtn) this.nextBtn.style.display = hasMultiple ? 'flex' : 'none';

        // Show/hide and update number badge
        if (this.numberBadge) {
            if (hasMultiple) {
                this.numberBadge.textContent = this.currentIndex + 1;
                this.numberBadge.style.display = 'block';
            } else {
                this.numberBadge.style.display = 'none';
            }
        }
    },

    handleWheel(e) {
        e.preventDefault();
        
        // Simple fixed zoom step - no normalization needed
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(1, Math.min(5, this.scale * delta));
        
        if (newScale === this.scale) return;

        this.scale = newScale;

        if (this.scale > 1) {
            this.isZoomed = true;
            this.img.classList.add('zoomed');
        } else {
            this.isZoomed = false;
            this.img.classList.remove('zoomed');
            this.posX = 0;
            this.posY = 0;
        }
        
        this.img.style.transition = 'transform 0.1s ease-out';
        this.updateTransform();
    },

    toggleZoom() {
        if (this.scale > 1) {
            this.resetZoom();
        } else {
            this.scale = this.baseScale;
            this.isZoomed = true;
            this.img.classList.add('zoomed');
            this.posX = 0;
            this.posY = 0;
            this.img.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            this.updateTransform();
        }
    },

    updateTransform() {
        this.img.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${this.scale})`;
    },

    resetZoom() {
        this.isZoomed = false;
        this.isDragging = false;
        this.posX = 0;
        this.posY = 0;
        this.scale = 1;
        this.img.classList.remove('zoomed', 'dragging');
        // Disable transition for instant reset, then set explicit transform
        this.img.style.transition = 'none';
        this.img.style.transform = 'translate(0px, 0px) scale(1)';
        // Force reflow to apply the no-transition state immediately
        void this.img.offsetHeight;
    }
};

// Initialize lightbox when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => lightbox.init());
} else {
    lightbox.init();
}

export function openImageLightbox(src, clickedElement = null) {
    lightbox.open(src, clickedElement);
}
