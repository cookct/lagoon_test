/**
 * Lagoon V1.3 UI Manager
 * Handles general layout, sidebar toggles, and modal visibility.
 */

import { store } from '../core/Store.js';

class UIManager {
    constructor() {
        this.dom = {};
        this.typographySettings = null;
    }

    init() {
        this.dom = {
            sidebar: document.getElementById('sidebar-left'),
            sidebarLeft: document.getElementById('sidebar-left'),
            sidebarRight: document.querySelector('.sidebar-right'),
            toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
            messagesContainer: document.getElementById('messages-container'),
            messageInput: document.getElementById('message-input'),
            chatMessages: document.getElementById('chat-messages'),
            appContainer: document.getElementById('app-container')
        };

        this.bindEvents();
        this.setupSplitters();
        this.initTabs();
        this.applyTypographySettings();
        
    }

    bindEvents() {
        if (this.dom.toggleSidebarBtn) {
            this.dom.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
        }
        window.addEventListener('resize', () => this.syncMessagesContainer());
    }

    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sidebar = e.target.closest('.sidebar-left') || e.target.closest('.sidebar-right');
                if (!sidebar) return;

                const targetTab = e.target.dataset.tab;
                const sidebarTabs = sidebar.querySelectorAll('.tab-btn');
                const sidebarPanels = sidebar.querySelectorAll('.tab-panel');

                sidebarTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                sidebarPanels.forEach(p => {
                    p.classList.remove('active');
                    if (p.id === `tab-${targetTab}`) {
                        p.classList.add('active');
                    }
                });
            });
        });
    }

    applyTypographySettings() {
        const font = localStorage.getItem('chat_font') || 'system';
        const textSize = localStorage.getItem('chat_text_size') || '16';
        const lineSpacing = localStorage.getItem('chat_line_spacing') || '1.5';

        const fontMap = {
            'system': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'quattro': '"Quattro", "Courier New", monospace',
            'serif': 'Georgia, "Times New Roman", serif',
            'mono': '"Courier New", Courier, monospace'
        };

        const fontFamily = fontMap[font] || fontMap['system'];
        const fontSize = `${textSize}px`;
        const lineHeight = lineSpacing;

        // Apply via CSS variables on the container for efficiency and robustness
        const container = this.dom.messagesContainer || document.getElementById('messages-container');
        if (container) {
            container.style.setProperty('--chat-font-family', fontFamily);
            container.style.setProperty('--chat-font-size', fontSize);
            container.style.setProperty('--chat-line-height', lineHeight);
        }

        // Store for components that might still need direct access
        this.typographySettings = { font: fontFamily, size: fontSize, lineHeight: lineHeight };
    }

    /**
     * Initialize a custom scrollable dropdown for a native select element
     */
    initCustomDropdown(select) {
        if (!select) return;
        // Prevent double initialization
        if (select.previousElementSibling?.className === 'custom-dropdown-container') return;

        const container = document.createElement('div');
        container.className = 'custom-dropdown-container';
        
        const selected = document.createElement('div');
        selected.className = 'custom-dropdown-selected';
        selected.textContent = select.options[select.selectedIndex]?.textContent || 'Select...';
        
        const optionsList = document.createElement('div');
        optionsList.className = 'custom-dropdown-options';
        
        // Sync function
        const syncSelected = () => {
            selected.textContent = select.options[select.selectedIndex]?.textContent;
            Array.from(optionsList.children).forEach((item, idx) => {
                item.classList.toggle('selected', idx === select.selectedIndex);
            });
        };

        // Check if this is the model dropdown (for delete buttons)
        const isModelDropdown = select.id === 'image-model-select';

        // Populate options
        Array.from(select.options).forEach((opt, idx) => {
            if (opt.hidden) return; // Skip hidden options

            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            item.dataset.value = opt.value;
            if (idx === select.selectedIndex) item.classList.add('selected');

            // Create label span
            const label = document.createElement('span');
            label.className = 'dropdown-item-label';
            label.textContent = opt.textContent;
            item.appendChild(label);

            // Select on click (on label area)
            label.onclick = (e) => {
                e.stopPropagation();
                select.selectedIndex = idx;
                select.dispatchEvent(new Event('change'));
                syncSelected();
                optionsList.classList.remove('show');
                selected.style.borderRadius = '4px';
            };
            optionsList.appendChild(item);
        });

        // Toggle list
        selected.onclick = (e) => {
            e.stopPropagation();
            const isShowing = optionsList.classList.contains('show');
            
            // Close ALL other custom dropdowns
            document.querySelectorAll('.custom-dropdown-options').forEach(el => {
                el.classList.remove('show');
                if (el.previousSibling && el.previousSibling.classList.contains('custom-dropdown-selected')) {
                    el.previousSibling.style.borderRadius = '4px';
                }
            });

            if (!isShowing) {
                optionsList.classList.add('show');
                selected.style.borderRadius = '4px 4px 0 0';
            } else {
                selected.style.borderRadius = '4px';
            }
        };

        // Mouse wheel cycling on selected area
        selected.onwheel = (e) => {
            e.preventDefault();
            const delta = Math.sign(e.deltaY);
            let newIndex = select.selectedIndex + delta;
            if (newIndex >= 0 && newIndex < select.options.length) {
                select.selectedIndex = newIndex;
                select.dispatchEvent(new Event('change'));
                syncSelected();
            }
        };

        // Global close
        document.addEventListener('click', () => {
            optionsList.classList.remove('show');
            selected.style.borderRadius = '4px';
        });

        // Sync when select changes from external (like localStorage load)
        select.addEventListener('change', syncSelected);

        // Assembly
        container.appendChild(selected);
        container.appendChild(optionsList);
        select.parentNode.insertBefore(container, select);
        select.style.display = 'none'; // Hide native select
    }

    /**
     * Refresh a custom dropdown's options from its native select
     */
    updateCustomDropdown(select) {
        if (!select) return;
        const container = select.previousSibling;
        if (!container || container.className !== 'custom-dropdown-container') return;

        const selected = container.querySelector('.custom-dropdown-selected');
        const optionsList = container.querySelector('.custom-dropdown-options');
        if (!selected || !optionsList) return;

        // Check if this is the model dropdown (for delete buttons)
        const isModelDropdown = select.id === 'image-model-select';

        // Clear and repopulate options
        optionsList.innerHTML = '';
        Array.from(select.options).forEach((opt, idx) => {
            if (opt.hidden) return;

            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            item.dataset.value = opt.value;
            if (idx === select.selectedIndex) item.classList.add('selected');

            // Create label span
            const label = document.createElement('span');
            label.className = 'dropdown-item-label';
            label.textContent = opt.textContent;
            item.appendChild(label);

            // Select on click
            label.onclick = (e) => {
                e.stopPropagation();
                select.selectedIndex = idx;
                select.dispatchEvent(new Event('change'));
                selected.textContent = opt.textContent;
                Array.from(optionsList.children).forEach((it, i) => it.classList.toggle('selected', i === idx));
                optionsList.classList.remove('show');
                selected.style.borderRadius = '4px';
            };
            optionsList.appendChild(item);
        });

        // Update current selection text
        selected.textContent = select.options[select.selectedIndex]?.textContent || 'Select...';
    }

    toggleSidebar() {
        if (!this.dom.sidebar) return; 
        
        this.dom.sidebar.classList.toggle('hidden');
        this.dom.toggleSidebarBtn.classList.toggle('sidebar-hidden');
        setTimeout(() => this.syncMessagesContainer(), 250);
    }

    syncMessagesContainer() {
        const textarea = this.dom.messageInput;
        const container = this.dom.messagesContainer;
        const chatMessages = this.dom.chatMessages;
        
        if (!textarea || !container || !chatMessages) return;

        const textareaRect = textarea.getBoundingClientRect();
        const chatMessagesRect = chatMessages.getBoundingClientRect();

        const leftOffset = textareaRect.left - chatMessagesRect.left;
        const rightOffset = chatMessagesRect.right - textareaRect.right;

        container.style.marginLeft = leftOffset + 'px';
        container.style.marginRight = rightOffset + 'px';
    }

    setupSplitters() {
        const leftSplitter = document.getElementById('splitter-left');
        const rightSplitter = document.getElementById('splitter-right');
        
        if (leftSplitter) this.initSplitter(leftSplitter, 'left');
        if (rightSplitter) this.initSplitter(rightSplitter, 'right');
    }

    initSplitter(element, side) {
        let isDragging = false;

        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            document.body.style.cursor = 'col-resize';
            element.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const containerWidth = this.dom.appContainer.offsetWidth;
            
            if (side === 'left' && this.dom.sidebarLeft) {
                let newWidth = e.clientX;
                if (newWidth > 150 && newWidth < containerWidth * 0.5) {
                    this.dom.sidebarLeft.style.width = `${newWidth}px`;
                }
            } else if (side === 'right' && this.dom.sidebarRight) {
                let newWidth = containerWidth - e.clientX;
                if (newWidth > 165 && newWidth < containerWidth * 0.5) {
                    this.dom.sidebarRight.style.width = `${newWidth}px`;
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
                element.classList.remove('dragging');
                setTimeout(() => this.syncMessagesContainer(), 50);
            }
        });
    }

}

export const uiManager = new UIManager();
