/**
 * Mobile Chat Area Component
 * Scrollable message container with markdown support
 */

import { parseMarkdown } from '../utils.js';

export class MobileChat {
  constructor(container, options = {}) {
    this.container = container;
    this.onRegenerate = options.onRegenerate || (() => {});
    this.onDeletePair = options.onDeletePair || (() => {});
    this.element = null;
    this.messagesContainer = null;
  }

  render() {
    this.element = document.createElement('div');
    this.element.className = 'mobile-chat-area';
    
    // Messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'mobile-messages';
    
    // Scroll-to-bottom button
    this.scrollBtn = document.createElement('button');
    this.scrollBtn.className = 'mobile-scroll-bottom-btn hidden';
    this.scrollBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
      <span class="mobile-scroll-alert hidden"></span>
    `;
    this.scrollBtn.addEventListener('click', () => {
      this.scrollToBottom(true);
      this.hideScrollBtn();
    });
    
    // Empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'mobile-chat-empty';
    emptyState.innerHTML = `
      <div class="mobile-chat-empty-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>
      <p class="mobile-chat-empty-text">Start a conversation</p>
    `;
    
    this.element.appendChild(this.messagesContainer);
    this.element.appendChild(this.scrollBtn);
    this.element.appendChild(emptyState);
    this.container.appendChild(this.element);
    
    // Scroll detection
    this.element.addEventListener('scroll', () => this.handleScroll());
    
    return this.element;
  }

  handleScroll() {
    const threshold = 100;
    const isNearBottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < threshold;
    
    if (isNearBottom) {
      this.hideScrollBtn();
    } else if (this.element.scrollTop < this.element.scrollHeight - this.element.clientHeight - 200) {
      // Only show if we've scrolled up a decent amount
      this.showScrollBtn();
    }
  }

  showScrollBtn() {
    this.scrollBtn.classList.remove('hidden');
  }

  hideScrollBtn() {
    this.scrollBtn.classList.add('hidden');
    const alert = this.scrollBtn.querySelector('.mobile-scroll-alert');
    if (alert) alert.classList.add('hidden');
  }

  showNewMessageAlert() {
    const isNearBottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < 150;
    if (!isNearBottom) {
      this.showScrollBtn();
      const alert = this.scrollBtn.querySelector('.mobile-scroll-alert');
      if (alert) alert.classList.remove('hidden');
    }
  }

  addMessage(text, isUser = true, isStreaming = false) {
    // Remove empty state if present
    const emptyState = this.element.querySelector('.mobile-chat-empty');
    if (emptyState) {
      emptyState.remove();
    }
    
    const message = document.createElement('div');
    message.className = `mobile-message ${isUser ? 'user' : 'assistant'}`;
    if (isStreaming) {
      message.classList.add('streaming');
      message.dataset.streaming = 'true';
    }
    if (!isUser) {
      message.dataset.rawText = text;
    }
    message.innerHTML = `
      <div class="mobile-message-bubble">${this.formatMessage(text)}</div>
      ${!isUser ? `
        <div class="mobile-assistant-actions ${isStreaming ? 'hidden' : ''}">
          <button class="mobile-action-btn tts-btn" title="Read aloud">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <button class="mobile-action-btn regen-btn" title="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <button class="mobile-action-btn delete-btn" title="Delete Pair">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      ` : ''}
    `;
    
    this.messagesContainer.appendChild(message);

    // Add event listeners if not streaming (must be after appendChild so index is correct)
    if (!isUser && !isStreaming) {
      this.attachActionListeners(message);
    }
    
    // Only auto-scroll if near bottom or if it's a user message
    if (isUser || (this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < 200)) {
      this.scrollToBottom();
    } else {
      this.showNewMessageAlert();
    }
    
    return message;
  }

  scrollToBottom(smooth = false) {
    if (this.element) {
      if (smooth) {
        this.element.scrollTo({
          top: this.element.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        this.element.scrollTop = this.element.scrollHeight;
      }
    }
  }

  updateLastMessage(text) {
    console.log('MobileChat.updateLastMessage called with:', JSON.stringify(text));
    const messages = this.messagesContainer.querySelectorAll('.mobile-message');
    console.log('Found messages:', messages.length);
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      console.log('Last message element:', lastMessage);
      console.log('Last message classes:', lastMessage.className);
      lastMessage.dataset.rawText = text;
      const bubble = lastMessage.querySelector('.mobile-message-bubble');
      console.log('Bubble element:', bubble);
      if (bubble) {
        const formattedText = this.formatMessage(text);
        console.log('Setting bubble HTML to:', JSON.stringify(formattedText));
        bubble.innerHTML = formattedText;
        console.log('Bubble HTML set successfully');
        
        // Auto-scroll or show alert during streaming updates
        const threshold = 200;
        const isNearBottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight < threshold;
        if (isNearBottom) {
          this.scrollToBottom();
        } else {
          this.showNewMessageAlert();
        }
      } else {
        console.log('No bubble found!');
      }
      // Remove streaming indicator
      lastMessage.classList.remove('streaming');
      delete lastMessage.dataset.streaming;
      
      // Show actions and attach listeners (only once)
      const actions = lastMessage.querySelector('.mobile-assistant-actions');
      if (actions && !lastMessage.dataset.listenersAttached) {
        actions.classList.remove('hidden');
        this.attachActionListeners(lastMessage);
        lastMessage.dataset.listenersAttached = 'true';
      }
    } else {
      console.log('No messages found!');
    }
    this.scrollToBottom();
  }

  reset() {
    this.clear();
    // Re-add empty state if not present
    if (!this.element.querySelector('.mobile-chat-empty')) {
      const emptyState = document.createElement('div');
      emptyState.className = 'mobile-chat-empty';
      emptyState.innerHTML = `
        <div class="mobile-chat-empty-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </div>
        <p class="mobile-chat-empty-text">Start a conversation</p>
      `;
      this.element.appendChild(emptyState);
    }
  }

  clear() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }
  }

  getLastMessage() {
    if (!this.messagesContainer) return null;
    const messages = this.messagesContainer.querySelectorAll('.mobile-message');
    if (messages.length === 0) return null;
    return messages[messages.length - 1].querySelector('.mobile-message-bubble');
  }

  removeLastMessage() {
    if (!this.messagesContainer) return;
    const messages = this.messagesContainer.querySelectorAll('.mobile-message');
    if (messages.length > 0) {
      messages[messages.length - 1].remove();
    }
  }

  formatMessage(text) {
    console.log('formatMessage input:', JSON.stringify(text));
    
    // Handle null/undefined/empty text
    if (!text || text.length === 0) {
      console.log('formatMessage: empty text detected, returning empty string');
      return '';
    }
    
    try {
      // Parse markdown first
      const markdownHtml = parseMarkdown(text);
      console.log('Markdown parsed:', JSON.stringify(markdownHtml));
      
      // If markdown parsing didn't change anything (no markdown found), 
      // fall back to HTML escaping for safety
      if (markdownHtml === text) {
        console.log('No markdown found, using HTML escaping');
        const div = document.createElement('div');
        div.textContent = text;
        const result = div.innerHTML;
        console.log('HTML escaped result:', JSON.stringify(result));
        return result;
      }
      
      console.log('Using markdown result:', JSON.stringify(markdownHtml));
      return markdownHtml;
      
    } catch (e) {
      console.error('formatMessage error:', e);
      // Fallback to HTML escaping on error
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  attachActionListeners(messageEl) {
    const messages = this.messagesContainer.querySelectorAll('.mobile-message');
    const index = Array.from(messages).indexOf(messageEl);

    const ttsBtn = messageEl.querySelector('.tts-btn');
    const regenBtn = messageEl.querySelector('.regen-btn');
    const deleteBtn = messageEl.querySelector('.delete-btn');

    if (ttsBtn) {
      ttsBtn.addEventListener('click', async () => {
        const { audioService } = await import('../services/AudioService.js');
        audioService.unlock();

        if (audioService.activeButton === ttsBtn) {
          audioService.stop();
        } else {
          const rawText = messageEl.dataset.rawText || messageEl.querySelector('.mobile-message-bubble')?.innerText || '';
          audioService.setActiveButton(ttsBtn);
          audioService.speak(rawText);
        }
      });
    }
    if (regenBtn) {
      regenBtn.addEventListener('click', () => this.onRegenerate(index));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.onDeletePair(index));
    }
  }

  getLastAssistantTtsBtn() {
    const msgs = this.messagesContainer?.querySelectorAll('.mobile-message.assistant');
    if (!msgs || msgs.length === 0) return null;
    return msgs[msgs.length - 1].querySelector('.tts-btn');
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.messagesContainer = null;
  }
}
