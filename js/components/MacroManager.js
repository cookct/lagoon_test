/**
 * Macro Manager Component
 * Handles the sidebar chat macros (OOC, etc).
 */

import { dom } from '../state.js';
import { lagoonAlert, lagoonConfirm } from '../ui/dialog.js';
import { toggleSendButtonState } from '../ui/sendButton.js';

export class MacroManager {
    constructor() {
        this.currentEditingMacroId = null;
    }

    init() {
        this.loadMacros();
        this.bindEvents();
        console.log('[MacroManager] Initialized');
    }

    loadMacros() {
        try {
            const macros = JSON.parse(localStorage.getItem('venice_macros') || '{}');
            Object.keys(macros).forEach(id => {
                const btn = document.querySelector(`.macro-item[data-id="${id}"]`);
                if (btn && macros[id]) {
                    const data = macros[id];
                    btn.dataset.prompt = data.text || '';
                    btn.dataset.mode = data.mode || 'ooc';
                    const textSpan = btn.querySelector('.macro-name');
                    if (textSpan) textSpan.textContent = data.name || id;
                    btn.title = `[${data.mode === 'ooc' ? 'OOC' : 'Macro'}] ${(data.text || '').substring(0, 100)}...`;
                }
            });
        } catch (e) {
            console.error('[MacroManager] Error loading macros:', e);
        }
    }

    bindEvents() {
        document.querySelectorAll('.macro-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.dataset.id;
                if (e.target.classList.contains('macro-edit-trigger') || e.target.classList.contains('preset-edit-trigger')) {
                    e.stopPropagation();
                    // Check if it's an image prompt or macro
                    if (btn.classList.contains('image-prompt-item')) {
                        // Image macros handled by ImageGenerationManager
                    } else {
                        this.currentEditingMacroId = id;
                        dom.macroNameInput.value = btn.querySelector('.macro-name').textContent;
                        dom.macroTextInput.value = btn.dataset.prompt || '';
                        dom.macroModal.classList.remove('hidden');
                    }
                    return;
                }
                if (!btn.classList.contains('image-prompt-item')) {
                    btn.classList.toggle('active');
                    toggleSendButtonState();
                }
            });
        });

        dom.saveMacroBtn?.addEventListener('click', async () => {
            if (!this.currentEditingMacroId) return;
            const name = dom.macroNameInput.value.trim() || 'Macro';
            const text = dom.macroTextInput.value.trim();
            const btn = document.querySelector(`.macro-item[data-id="${this.currentEditingMacroId}"]`);
            if (btn) {
                btn.dataset.prompt = text;
                btn.dataset.mode = 'ooc';
                const textSpan = btn.querySelector('.macro-name');
                if (textSpan) textSpan.textContent = name;
                btn.title = `[OOC] ${text.substring(0, 100)}...`;
            }
            // Save to localStorage
            const macros = JSON.parse(localStorage.getItem('venice_macros') || '{}');
            macros[this.currentEditingMacroId] = { name, text, mode: 'ooc' };
            localStorage.setItem('venice_macros', JSON.stringify(macros));
            dom.macroModal.classList.add('hidden');
            this.currentEditingMacroId = null;
        });

        dom.cancelMacroBtn?.addEventListener('click', () => {
            dom.macroModal.classList.add('hidden');
            this.currentEditingMacroId = null;
        });

        dom.resetMacroBtn?.addEventListener('click', async () => {
            if (!this.currentEditingMacroId) return;
            if (!await lagoonConfirm('Reset this macro to default (empty) state?')) return;
            const btn = document.querySelector(`.macro-item[data-id="${this.currentEditingMacroId}"]`);
            if (btn) {
                btn.dataset.prompt = '';
                btn.dataset.mode = '';
                const textSpan = btn.querySelector('.macro-name');
                const macroNum = this.currentEditingMacroId.replace('macro-', '');
                if (textSpan) textSpan.textContent = `Macro ${macroNum}`;
                btn.title = '';
                btn.classList.remove('active');
            }
            const macros = JSON.parse(localStorage.getItem('venice_macros') || '{}');
            delete macros[this.currentEditingMacroId];
            localStorage.setItem('venice_macros', JSON.stringify(macros));
            dom.macroModal.classList.add('hidden');
            this.currentEditingMacroId = null;
        });
    }
}

export const macroManager = new MacroManager();
