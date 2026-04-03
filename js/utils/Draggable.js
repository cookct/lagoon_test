/**
 * Draggable Utility
 * Makes elements draggable by their headers or themselves.
 */

export class Draggable {
    /**
     * @param {HTMLElement} element The element to move
     * @param {HTMLElement} handle The element to drag by (optional, defaults to element)
     */
    constructor(element, handle = null) {
        this.element = element;
        this.handle = handle || element;
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;

        this.init();
    }

    init() {
        this.handle.addEventListener('mousedown', (e) => this.startDragging(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
    }

    startDragging(e) {
        if (e.target.closest('button, input, textarea, select')) return;
        
        this.isDraggingCandidate = true;
        this.startClientX = e.clientX;
        this.startClientY = e.clientY;
        
        // Get current position
        const rect = this.element.getBoundingClientRect();
        this.initialRect = rect;

        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;
    }

    drag(e) {
        if (!this.isDraggingCandidate && !this.isDragging) return;

        // If not dragging yet, check if we've moved enough to call it a drag
        if (!this.isDragging) {
            const moveX = Math.abs(e.clientX - this.startClientX);
            const moveY = Math.abs(e.clientY - this.startClientY);
            if (moveX > 5 || moveY > 5) {
                this.isDragging = true;
                
                // If element is centered using translate(-50%, -50%), we need to switch to absolute pixels
                this.element.style.margin = '0';
                this.element.style.transform = 'none';
                this.element.style.left = this.initialRect.left + 'px';
                this.element.style.top = this.initialRect.top + 'px';
                this.element.style.position = 'fixed';
            } else {
                return;
            }
        }

        const x = e.clientX - this.offsetX;
        const y = e.clientY - this.offsetY;

        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        
        // Prevent text selection ONLY when we are actually dragging
        e.preventDefault();
    }

    stopDragging() {
        this.isDragging = false;
        this.isDraggingCandidate = false;
    }
}

/**
 * Apply draggability to all modals in the application
 */
export function initModalDraggability() {
    const modals = document.querySelectorAll('.modal-content, .censor-modal-content, .config-modal-wide');
    modals.forEach(modal => {
        // Skip the censor mask modal (should remain static)
        if (modal.classList.contains('censor-modal-content')) return;

        // Look for a modal-header first, then fall back to h2/h3
        const handle = modal.querySelector('.modal-header, h2, h3, .config-header');
        if (handle) {
            new Draggable(modal, handle);
        }
    });
    
    // Also dialog box
    const dialog = document.getElementById('dialog-box');
    const dialogHeader = document.getElementById('dialog-header');
    if (dialog && dialogHeader) new Draggable(dialog, dialogHeader);
}
