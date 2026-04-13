/**
 * Sidebar Rendering and Management
 */

import { state, dom, defaultChatConfig, getDefaultChatConfig, DEFAULT_USER_AVATAR_IMAGE_PATH } from '../state.js';
import { fetchConfigs, fetchChats, fetchConfig, deleteChatApi, deleteConfigApi, fetchChat, copyConfigApi } from '../api.js';
import { lagoonConfirm, lagoonAlert, lagoonPrompt } from './dialog.js';
import { cleanThinking } from '../utils.js';

// Track which config details are open
function getOpenConfigs() {
    const openConfigs = new Set();
    document.querySelectorAll('.config-item[open]').forEach(details => {
        const nameSpan = details.querySelector('.summary-left span');
        if (nameSpan) openConfigs.add(nameSpan.textContent);
    });
    return openConfigs;
}

function restoreOpenConfigs(openConfigs) {
    document.querySelectorAll('.config-item').forEach(details => {
        const nameSpan = details.querySelector('.summary-left span');
        if (nameSpan && openConfigs.has(nameSpan.textContent)) {
            details.open = true;
        }
    });
}

export async function refreshSidebar() {
    const openConfigs = getOpenConfigs();
    const [configs, chats] = await Promise.all([fetchConfigs(), fetchChats()]);
    await renderSidebar(configs, chats);
    restoreOpenConfigs(openConfigs);
}

async function renderSidebar(configs, chats) {
    if (!dom.configList || !dom.chatList) return;
    
    dom.configList.innerHTML = '';
    dom.chatList.innerHTML = '';

    // Chats already sorted by server (newest first), group by config
    const chatsByConfig = {};
    chats.forEach(chat => {
        const parent = chat.parent_config || 'standalone';
        if (!chatsByConfig[parent]) {
            chatsByConfig[parent] = [];
        }
        chatsByConfig[parent].push(chat);
    });
    // Each group maintains server sort order (newest first)

    for (const configFile of configs) {
        const configName = configFile.replace('.json', '');
        const configData = await fetchConfig(configFile);

        const details = document.createElement('details');
        details.classList.add('config-item');

        // Special styling for Dual Model section
        if (configFile === 'dual-model') {
            details.classList.add('dual-model-section');
            details.style.borderBottom = '1px solid var(--accent-color)';
            details.style.marginBottom = '10px';
        }

        // Summary must be direct child of details for toggle to work
        const summary = document.createElement('summary');
        summary.classList.add('summary-row');

        // Avatar inside summary
        const avatarImg = document.createElement('img');
        if (configFile === 'dual-model') {
            avatarImg.src = 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTE3IDIxaC0xMGEyIDIgMCAwIDEtMi0ydi0xMGEyIDIgMCAwIDEgMi0yaDEwYTIgMiAwIDAgMSAyIDJ2MTBhMiAyIDAgMCAxLTIgMnoiLz48cGF0aCBkPSJNOSA5bDEwIDEwIi8+PHBhdGggZD0iTTE5IDlsLTEwIDEwIi8+PC9zdmc+';
        } else {
            avatarImg.src = (configData && configData.avatar_url)
                ? configData.avatar_url
                : DEFAULT_USER_AVATAR_IMAGE_PATH;
        }
        avatarImg.classList.add('sidebar-avatar');
        summary.appendChild(avatarImg);

        // Button-like wrapper for the actual styled content
        const summaryContent = document.createElement('div');
        summaryContent.classList.add('summary-content');

        const summaryLeft = document.createElement('div');
        summaryLeft.classList.add('summary-left');

        const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowSvg.setAttribute('class', 'arrow');
        arrowSvg.setAttribute('viewBox', '0 0 100 100');
        arrowSvg.innerHTML = '<polygon points="25,10 75,50 25,90" fill="currentColor"/>';
        summaryLeft.appendChild(arrowSvg);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = configFile === 'dual-model' ? 'Dual Conversations' : configName;
        summaryLeft.appendChild(nameSpan);

        const optionsBtn = document.createElement('button');
        optionsBtn.classList.add('options-btn');
        optionsBtn.innerHTML = '&#8801;';
        
        if (configFile !== 'dual-model') {
            optionsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.currentTarget, configFile);
            });
        } else {
            optionsBtn.style.display = 'none';
        }

        summaryContent.appendChild(summaryLeft);
        summaryContent.appendChild(optionsBtn);
        summary.appendChild(summaryContent);

        const subChatList = document.createElement('div');
        subChatList.classList.add('sub-chat-list');
        const relatedChats = chatsByConfig[configFile] || [];
        relatedChats.forEach(chat => subChatList.appendChild(createChatItem(chat)));

        details.appendChild(summary);
        details.appendChild(subChatList);
        
        if (configFile === 'dual-model') {
            dom.configList.insertBefore(details, dom.configList.firstChild);
        } else {
            dom.configList.appendChild(details);
        }
    }

    const standaloneChats = chatsByConfig['standalone'] || [];
    standaloneChats.forEach(chat => dom.chatList.appendChild(createChatItem(chat)));
    
    // Show temporary/unsaved chat session indicator
    if (state.isTemporaryChat && state.messages.length > 0) {
        const tempChatDiv = document.createElement('div');
        tempChatDiv.classList.add('list-item', 'temporary-chat-indicator');
        tempChatDiv.style.borderLeft = '3px solid var(--accent-color, #0e639c)';
        tempChatDiv.style.opacity = '0.8';
        tempChatDiv.style.cursor = 'default';
        tempChatDiv.title = 'This is your current active session. Send a message to save it.';
        
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('chat-name');
        nameSpan.textContent = state.currentParentConfig 
            ? `Unsaved: ${state.currentParentConfig.replace('.json', '')}` 
            : 'Unsaved Quick Chat';
        nameSpan.style.fontStyle = 'italic';
        
        const msgCount = document.createElement('span');
        msgCount.style.fontSize = '0.85em';
        msgCount.style.opacity = '0.7';
        msgCount.textContent = ` (${state.messages.length} msgs)`;
        
        tempChatDiv.appendChild(nameSpan);
        tempChatDiv.appendChild(msgCount);
        dom.chatList.insertBefore(tempChatDiv, dom.chatList.firstChild);
    }
}

function createChatItem(chat) {
    const div = document.createElement('div');
    div.classList.add('list-item');
    div.dataset.chatId = chat.id;

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('chat-name');
    nameSpan.textContent = chat.display_name;
    nameSpan.title = chat.display_name;

    const optionsBtn = document.createElement('span');
    optionsBtn.classList.add('options-btn');
    optionsBtn.innerHTML = '&#8801;'; // Hamburger/3 Lines
    optionsBtn.title = 'Chat Options';
    // Style adjustments for the span acting as button
    optionsBtn.style.cursor = 'pointer';
    optionsBtn.style.padding = '0 5px';
    
    optionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showChatContextMenu(e.currentTarget, chat);
    });

    div.appendChild(nameSpan);
    div.appendChild(optionsBtn);
    
    div.addEventListener('click', async () => {
        const { chatManager } = await import('../components/ChatManager.js');
        chatManager.loadChat(chat.id);
    });
    
    return div;
}

function showChatContextMenu(button, chat) {
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    
    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    menu.setAttribute('tabindex', '-1'); // Make focusable
    const rect = button.getBoundingClientRect();
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Chat';
    deleteButton.classList.add('context-menu-item');
    // Add red styling for delete action
    deleteButton.style.color = 'var(--ansi-red)';
    deleteButton.onclick = async () => {
        closeMenu();
        await deleteChat(chat.id);
    };

    const renameButton = document.createElement('button');
    renameButton.textContent = 'Rename Chat';
    renameButton.classList.add('context-menu-item');
    renameButton.onclick = async () => {
        closeMenu();
        const current = chat.display_name || '';
        const newName = await lagoonPrompt('Rename chat:', current);
        if (newName === null || newName.trim() === '' || newName.trim() === current) return;
        try {
            await fetch(`/api/chat/${chat.id}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
            chat.display_name = newName.trim();
            const nameEl = document.querySelector(`.list-item[data-chat-id="${chat.id}"] .chat-name`);
            if (nameEl) { nameEl.textContent = newName.trim(); nameEl.title = newName.trim(); }
        } catch (e) {
            console.error('[Rename] Failed:', e);
        }
    };

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download Chat';
    downloadButton.classList.add('context-menu-item');
    downloadButton.onclick = async () => {
        closeMenu();
        await downloadSingleChat(chat);
    };

    menu.appendChild(renameButton);
    menu.appendChild(downloadButton);
    menu.appendChild(deleteButton);
    
    document.body.appendChild(menu);

    // Position menu
    menu.style.left = `${rect.left}px`;
    
    // Check for bottom overflow
    const menuHeight = menu.offsetHeight;
    if (rect.bottom + menuHeight > window.innerHeight) {
        menu.style.top = `${rect.top - menuHeight - 5}px`;
    } else {
        menu.style.top = `${rect.bottom}px`;
    }

    // Check for right overflow
    if (rect.left + menu.offsetWidth > window.innerWidth) {
        menu.style.left = `${window.innerWidth - menu.offsetWidth - 10}px`;
    }

    // Keyboard handler for Delete key
    const handleKeyDown = (e) => {
        if (e.key === 'Delete') {
            e.preventDefault();
            closeMenu();
            deleteChat(chat.id);
        } else if (e.key === 'Escape') {
            closeMenu();
        }
    };

    // Close menu and cleanup
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('keydown', handleKeyDown);
    };

    // Click outside to close
    const handleClickOutside = (e) => {
        if (!menu.contains(e.target)) {
            closeMenu();
            document.removeEventListener('click', handleClickOutside);
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    
    // Focus the menu for keyboard events
    menu.focus();
}

async function downloadSingleChat(chatMeta) {
    try {
        const chatData = await fetchChat(chatMeta.id);
        
        let logContent = `Chat Export: ${chatMeta.display_name}\n${'='.repeat(50)}\n\n`;
        
        for (const msg of chatData.messages || []) {
            if (msg.role !== 'system') {
                logContent += `[${msg.role.toUpperCase()}]: ${cleanThinking(msg.content)}\n\n`;
                if (msg.role === 'assistant') {
                    logContent += `\n---\n\n`;
                }
            }
        }
        
        const filename = `${chatMeta.display_name.replace(/[^a-z0-9]/gi, '_')}.txt`;
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        await lagoonAlert(`Error downloading chat: ${error.message}`);
    }
}

async function deleteChat(chatId) {
    try {
        await deleteChatApi(chatId);
        if (state.currentChatId === chatId) {
            await refreshSidebar();
            const { chatManager } = await import('../components/ChatManager.js');
            chatManager.startNewChatSession(getDefaultChatConfig(), null);
        } else {
            await refreshSidebar();
        }
    } catch (error) {
        await lagoonAlert(`Error deleting chat: ${error.message}`);
    }
}

function showContextMenu(button, configFile) {
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    
    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    const rect = button.getBoundingClientRect();
    
    // Add items first to measure height
    const newChatButton = document.createElement('button');
    newChatButton.textContent = 'New Chat';
    newChatButton.classList.add('context-menu-item');
    newChatButton.onclick = async () => {
        menu.remove();
        const configData = await fetchConfig(configFile);
        if (configData) {
            const { chatManager } = await import('../components/ChatManager.js');
            chatManager.startNewChatSession(configData, configFile);
        }
    };

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit Character';
    editButton.classList.add('context-menu-item');
    editButton.onclick = async () => {
        menu.remove();
        const { configManager } = await import('../components/ConfigManager.js');
        configManager.loadConfigToForm(configFile);
    };

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy Character';
    copyButton.classList.add('context-menu-item');
    copyButton.onclick = async () => {
        menu.remove();
        try {
            await copyConfigApi(configFile);
            await refreshSidebar();
        } catch (e) {
            await lagoonAlert(`Failed to copy character: ${e.message}`);
        }
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Character';
    deleteButton.classList.add('context-menu-item');
    deleteButton.onclick = async () => {
        menu.remove();
        if (await lagoonConfirm(`Are you sure you want to delete '${configFile.replace('.json', '')}'?`)) {
            await deleteConfig(configFile);
        }
    };

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download Log';
    downloadButton.classList.add('context-menu-item');
    downloadButton.onclick = async () => {
        menu.remove();
        await downloadCharacterLog(configFile);
    };

    menu.appendChild(newChatButton);
    menu.appendChild(editButton);
    menu.appendChild(copyButton);
    menu.appendChild(deleteButton);
    menu.appendChild(downloadButton);
    
    document.body.appendChild(menu);

    // Position menu
    menu.style.left = `${rect.left}px`;
    
    // Check for bottom overflow
    const menuHeight = menu.offsetHeight;
    if (rect.bottom + menuHeight > window.innerHeight) {
        // Open upwards
        menu.style.top = `${rect.top - menuHeight - 5}px`;
    } else {
        // Open downwards
        menu.style.top = `${rect.bottom}px`;
    }

    // Check for right overflow
    if (rect.left + menu.offsetWidth > window.innerWidth) {
        menu.style.left = `${window.innerWidth - menu.offsetWidth - 10}px`;
    }
}

async function deleteConfig(configFilename) {
    try {
        await deleteConfigApi(configFilename);
        if (state.currentParentConfig === configFilename) {
            await refreshSidebar();
            const { chatManager } = await import('../components/ChatManager.js');
            chatManager.startNewChatSession(getDefaultChatConfig(), null);
        } else {
            await refreshSidebar();
        }
    } catch (error) {
        await lagoonAlert(`Error deleting character: ${error.message}`);
    }
}

async function downloadCharacterLog(configFile) {
    const configData = await fetchConfig(configFile);
    const characterName = configData?.character_name || configFile.replace('.json', '');
    const allChats = await fetchChats();
    const characterChats = allChats.filter(c => c.parent_config === configFile);

    let logContent = `Chat Log for ${characterName}\n${'='.repeat(50)}\n\n`;
    
    for (const chatMeta of characterChats) {
        const chatRes = await fetch(`/api/chat/${chatMeta.id}`);
        const chatData = await chatRes.json();
        logContent += `--- ${chatMeta.display_name || 'Chat'} ---\n`;
        for (const msg of chatData.messages || []) {
            if (msg.role !== 'system') {
                logContent += `[${msg.role.toUpperCase()}]: ${cleanThinking(msg.content)}\n\n`;
            }
        }
        logContent += '\n';
    }

    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
    const filename = `${characterName}-${dateStr.replace(/\//g, '-')}.txt`;

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}