/**
 * Mobile Storage Service
 * Manages multiple chat sessions in localStorage
 */

export class MobileStorage {
  constructor() {
    this.STORAGE_KEY = 'mobile_chats_v1';
    this.CURRENT_ID_KEY = 'mobile_current_chat_id';
  }

  // Get all saved chats
  getChats() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse mobile chats:', e);
      return [];
    }
  }

  // Save all chats
  saveChats(chats) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(chats));
  }

  // Get current active chat ID
  getCurrentChatId() {
    return localStorage.getItem(this.CURRENT_ID_KEY);
  }

  // Set current active chat ID
  setCurrentChatId(id) {
    localStorage.setItem(this.CURRENT_ID_KEY, id || '');
  }

  // Save or update a specific chat
  saveChat(chatId, messages, config = {}) {
    if (!chatId) return null;
    
    const chats = this.getChats();
    const existingIndex = chats.findIndex(c => c.id === chatId);
    
    // Generate title from first user message if not exists
    let title = 'New Conversation';
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      title = firstUserMsg.content.split(' ').slice(0, 4).join(' ');
      if (firstUserMsg.content.split(' ').length > 4) title += '...';
    }

    const chatData = {
      id: chatId,
      title: title,
      messages: messages,
      config: config,
      lastUpdated: Date.now()
    };

    if (existingIndex > -1) {
      chats[existingIndex] = chatData;
    } else {
      chats.unshift(chatData);
    }

    this.saveChats(chats);
    return chatData;
  }

  // Delete a chat
  deleteChat(chatId) {
    const chats = this.getChats();
    const filtered = chats.filter(c => c.id !== chatId);
    this.saveChats(filtered);
    if (this.getCurrentChatId() === chatId) {
      this.setCurrentChatId(null);
    }
  }

  // Create a new chat entry
  createNewChat() {
    const newId = 'mobile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.setCurrentChatId(newId);
    return newId;
  }
}

export const mobileStorage = new MobileStorage();
