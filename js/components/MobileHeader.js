/**
 * Mobile Header Component
 * Top bar with hamburger menu button and model selector
 */

import { getInstalledModels, getDefaultModel } from '../core/InstalledModels.js';

export class MobileHeader {
  constructor(container, options = {}) {
    this.container = container;
    this.onMenuClick = options.onMenuClick || (() => {});
    this.onNewChat = options.onNewChat || (() => {});
    this.onModelChange = options.onModelChange || (() => {});
    this.element = null;
    this.modelSelect = null;
  }

  render() {
    this.element = document.createElement('header');
    this.element.className = 'mobile-header';

    // Hamburger menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.setAttribute('aria-label', 'Open menu');
    menuBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
    `;
    menuBtn.addEventListener('click', () => this.onMenuClick());

    // Model selector dropdown
    this.modelSelect = document.createElement('select');
    this.modelSelect.className = 'mobile-model-select';
    this.modelSelect.setAttribute('aria-label', 'Select model');

    getInstalledModels().forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      this.modelSelect.appendChild(option);
    });

    // Load saved model
    const savedModel = localStorage.getItem('mobile_chat_model') || getDefaultModel();
    this.modelSelect.value = savedModel;

    this.modelSelect.addEventListener('change', () => {
      localStorage.setItem('mobile_chat_model', this.modelSelect.value);
      this.onModelChange(this.modelSelect.value);
    });

    // New Chat button (Right side)
    const right = document.createElement('div');
    right.className = 'mobile-header-right';

    const newChatBtn = document.createElement('button');
    newChatBtn.className = 'mobile-new-chat-btn';
    newChatBtn.setAttribute('aria-label', 'New Chat');
    newChatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    `;
    newChatBtn.addEventListener('click', () => {
      if (this.onNewChat) this.onNewChat();
    });

    right.appendChild(newChatBtn);

    this.element.appendChild(menuBtn);
    this.element.appendChild(this.modelSelect);
    this.element.appendChild(right);

    this.container.appendChild(this.element);
    return this.element;
  }

  getSelectedModel() {
    return this.modelSelect ? this.modelSelect.value : localStorage.getItem('mobile_chat_model') || getDefaultModel();
  }

  setModel(modelId) {
    if (this.modelSelect) {
      this.modelSelect.value = modelId;
      localStorage.setItem('mobile_chat_model', modelId);
    }
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.modelSelect = null;
  }
}
