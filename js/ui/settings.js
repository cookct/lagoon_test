/**
 * Settings and Context Viewer
 */

import { state, dom, getDefaultSystemPrompt, setDefaultSystemPrompt } from '../state.js';
import { fetchSystemPrompts, createSystemPrompt, updateSystemPrompt, deleteSystemPrompt, saveConfigApi,
         generateDetailedSummaryApi, applySummaryApi, deleteSummaryApi, approveSummaryApi,
         fetchCustomEndpoints, saveCustomEndpoint, deleteCustomEndpoint } from '../api.js';
import { lagoonAlert, lagoonPrompt, lagoonConfirm } from './dialog.js';
import { getWritingToolsOptions, saveWritingToolsOptions, DEFAULT_WRITING_TOOLS } from './messages.js';
import { uiManager } from '../core/UIManager.js';
import { VENICE_VOICES, DEFAULT_VOICE, GOOGLE_VOICES, DEFAULT_GOOGLE_VOICE, DEFAULT_PROVIDER } from '../core/TTSConfig.js';
import { VENICE_PRICING } from '../components/ChatManager.js';

import { imageModeManager } from '../components/ImageModeManager.js';
import { inferLogoKey } from '../core/InstalledModels.js';
import { videoModeManager } from '../components/VideoModeManager.js';
import { togetherVideoModeManager } from '../components/TogetherVideoModeManager.js';

function formatPricing(m, provider) {
    let inputPrice = null;
    let outputPrice = null;
    let cachePrice = null;

    // Try pricing from API response first
    if (m.pricing) {
        inputPrice = m.pricing.input ?? m.pricing.in ?? null;
        outputPrice = m.pricing.output ?? m.pricing.out ?? null;
        cachePrice = m.pricing.cacheRead ?? null;
    }

    // Fall back to hardcoded VENICE_PRICING for Venice models
    if (!inputPrice && provider === 'venice' && VENICE_PRICING[m.id]) {
        const vp = VENICE_PRICING[m.id];
        inputPrice = vp.in ?? null;
        outputPrice = vp.out ?? null;
        cachePrice = vp.cacheRead ?? null;
    }

    if (inputPrice === null && outputPrice === null) return '';

    const inStr = inputPrice !== null ? `$${inputPrice.toFixed(2)}` : '—';
    const outStr = outputPrice !== null ? `$${outputPrice.toFixed(2)}` : '—';
    let priceLine = `in ${inStr} / out ${outStr}`;
    if (cachePrice !== null) priceLine += ` / cache $${cachePrice.toFixed(2)}`;
    return priceLine;
}

// Store all children (options and optgroups) once so we can restore them
let _allModelChildren = null;

// E2EE-capable models that don't follow the e2ee- naming convention
const E2EE_EXTRA_MODELS = new Set(['venice-uncensored', 'venice-uncensored-role-play']);

export function filterModelDropdownForE2EE(e2eeOn) {
    const sel = document.getElementById('model');
    if (!sel) return;

    // Snapshot all children on first call
    if (!_allModelChildren) {
        _allModelChildren = Array.from(sel.children).map(child => child.cloneNode(true));
    }

    const currentVal = sel.value;
    sel.innerHTML = '';

    const isE2EEModel = (val) => val.startsWith('e2ee-') || E2EE_EXTRA_MODELS.has(val);

    _allModelChildren.forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            const group = child.cloneNode(false); // Clone without children
            const options = Array.from(child.children).filter(opt => {
                return !e2eeOn || isE2EEModel(opt.value);
            });
            if (options.length > 0) {
                options.forEach(opt => group.appendChild(opt.cloneNode(true)));
                sel.appendChild(group);
            }
        } else if (child.tagName === 'OPTION') {
            if (!e2eeOn || isE2EEModel(child.value)) {
                sel.appendChild(child.cloneNode(true));
            }
        }
    });

    // Restore selection if still available, otherwise pick first valid option
    const match = sel.querySelector(`option[value="${currentVal}"]`);
    if (match) {
        sel.value = currentVal;
    } else {
        const firstOpt = sel.querySelector('option:not([disabled])');
        if (firstOpt) {
            sel.value = firstOpt.value;
            localStorage.setItem('quickchat_model', sel.value);
            sel.dispatchEvent(new Event('change'));
        }
    }
    
    // Sync custom dropdown UI if it exists
    const { uiManager } = import('../core/UIManager.js').then(m => {
        m.uiManager.updateCustomDropdown(sel);
    });
}

export async function showContextViewer() {
    if (!dom.contextList || !dom.contextModal) return;

    const modalContent = dom.contextModal.querySelector('.modal-content');
    const modalActions = dom.contextModal.querySelector('.modal-actions');
    let saveBtn = modalActions?.querySelector('.save-context-btn');
    if (saveBtn) saveBtn.remove();

    modalContent.classList.remove('compact-modal');
    dom.contextList.innerHTML = '';

    // ── Auto / Manual mode toggle ──────────────────────────────────────────
    const currentMode = localStorage.getItem('summarize_mode') || 'auto';
    const modeToggle = document.createElement('div');
    modeToggle.className = 'summary-mode-toggle';
    modeToggle.innerHTML = `
        <span class="mode-toggle-label">Summarization:</span>
        <div class="mode-toggle-btns">
            <button class="mode-btn ${currentMode === 'auto' ? 'active' : ''}" data-mode="auto">Auto</button>
            <button class="mode-btn ${currentMode === 'manual' ? 'active' : ''}" data-mode="manual">Manual</button>
        </div>
    `;
    modeToggle.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.setItem('summarize_mode', btn.dataset.mode);
            showContextViewer();
        });
    });
    dom.contextList.appendChild(modeToggle);

    // ── Stacked Summaries section — fetch from API (authoritative source) ──
    let summaryStack = [];
    if (state.currentChatId) {
        try {
            const stackRes = await fetch('/api/summary_stack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: state.currentChatId })
            });
            if (stackRes.ok) {
                const stackData = await stackRes.json();
                summaryStack = stackData.summaries || [];
            }
        } catch (e) {
            console.warn('Failed to load summary stack:', e);
        }
    }

    if (summaryStack.length > 0) {
        const summaryHeader = document.createElement('div');
        summaryHeader.className = 'context-section-header';
        summaryHeader.textContent = `Stacked Summaries (${summaryStack.length})`;
        dom.contextList.appendChild(summaryHeader);

        summaryStack.forEach((entry, idx) => {
            const isPending = !!entry.pending_review;
            const card = document.createElement('div');
            card.className = 'summary-stack-card' + (isPending ? ' summary-pending-review' : '');
            const date = entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '';
            card.innerHTML = `
                <div class="summary-card-body">
                    <span class="summary-card-label">
                        ${isPending ? '<span class="pending-badge">PENDING REVIEW</span> ' : ''}Summary ${idx + 1}${date ? ' &mdash; ' + date : ''} (${entry.message_count || '?'} msgs)
                    </span>
                    ${isPending ? '<p class="pending-warning">Messages will NOT be pruned until you approve this summary.</p>' : ''}
                    <pre class="summary-card-preview">${entry.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
                <div class="summary-card-actions">
                    ${isPending ? '<button class="context-approve-btn summary-approve-btn">Approve</button>' : ''}
                    <button class="context-copy-btn">Copy</button>
                    <button class="context-delete-btn summary-delete-btn">Del</button>
                </div>
            `;
            card.querySelector('.context-copy-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(entry.text);
            });
            card.querySelector('.summary-delete-btn').addEventListener('click', async () => {
                if (!await lagoonConfirm('Delete this summary entry? This cannot be undone.')) return;
                try {
                    await deleteSummaryApi(state.currentChatId, entry.id);
                    showContextViewer();
                } catch (e) {
                    lagoonAlert('Failed to delete summary: ' + e.message);
                }
            });
            if (isPending) {
                card.querySelector('.summary-approve-btn').addEventListener('click', async () => {
                    if (!await lagoonConfirm('Approve this summary? This will prune old messages from the chat history. This cannot be undone.')) return;
                    try {
                        const result = await approveSummaryApi(state.currentChatId, entry.id, state.messages);
                        if (result.error) throw new Error(result.error);
                        if (result.messages) {
                            state.messages = result.messages;
                            const { chatManager } = await import('../components/ChatManager.js');
                            chatManager.renderMessages();
                            chatManager.updateContextGauge();
                        }
                        // Remove review_needed banner if present
                        document.getElementById('review-needed-banner')?.remove();
                        showContextViewer();
                    } catch (e) {
                        lagoonAlert('Failed to approve summary: ' + e.message);
                    }
                });
            }
            dom.contextList.appendChild(card);
        });
    }

    // ── Manual summarization panel ─────────────────────────────────────────
    const mode = localStorage.getItem('summarize_mode') || 'auto';
    if (mode === 'manual' && state.currentChatId) {
        const manualPanel = document.createElement('div');
        manualPanel.className = 'manual-summarize-panel';

        const convMsgCount = state.messages.filter(m => m.role !== 'system').length;
        const dropCount = Math.max(0, convMsgCount - 10); // keep last 10 messages

        manualPanel.innerHTML = `
            <div class="manual-panel-header">
                <strong>Manual Summarization</strong>
                <span class="manual-panel-hint">${convMsgCount} conversation messages &mdash; will prune oldest ${dropCount} after applying</span>
            </div>
            <button class="manual-gen-btn">Generate Detailed Summary</button>
            <textarea class="manual-summary-textarea" placeholder="Generated summary will appear here. Edit it, then click Apply." style="display:none"></textarea>
            <div class="manual-panel-actions" style="display:none">
                <button class="manual-apply-btn">Apply &amp; Prune</button>
                <button class="manual-cancel-btn">Cancel</button>
            </div>
        `;

        const genBtn = manualPanel.querySelector('.manual-gen-btn');
        const textarea = manualPanel.querySelector('.manual-summary-textarea');
        const actionsDiv = manualPanel.querySelector('.manual-panel-actions');
        const applyBtn = manualPanel.querySelector('.manual-apply-btn');
        const cancelBtn = manualPanel.querySelector('.manual-cancel-btn');

        genBtn.addEventListener('click', async () => {
            genBtn.disabled = true;
            genBtn.textContent = 'Generating...';
            try {
                const result = await generateDetailedSummaryApi(state.currentChatId, state.messages);
                if (result.error) throw new Error(result.error);
                textarea.value = result.summary_text;
                textarea.style.display = 'block';
                actionsDiv.style.display = 'flex';
                genBtn.style.display = 'none';
            } catch (e) {
                lagoonAlert('Failed to generate summary: ' + e.message);
                genBtn.disabled = false;
                genBtn.textContent = 'Generate Detailed Summary';
            }
        });

        applyBtn.addEventListener('click', async () => {
            const summaryText = textarea.value.trim();
            if (!summaryText) { lagoonAlert('Summary is empty.'); return; }
            applyBtn.disabled = true;
            applyBtn.textContent = 'Applying...';
            try {
                const result = await applySummaryApi(state.currentChatId, summaryText, dropCount, state.messages);
                if (result.error) throw new Error(result.error);
                if (result.messages) {
                    state.messages = result.messages;
                    const { chatManager } = await import('../components/ChatManager.js');
                    chatManager.renderMessages();
                    chatManager.updateContextGauge();
                }
                showContextViewer();
            } catch (e) {
                lagoonAlert('Failed to apply summary: ' + e.message);
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply & Prune';
            }
        });

        cancelBtn.addEventListener('click', () => {
            textarea.style.display = 'none';
            actionsDiv.style.display = 'none';
            genBtn.style.display = '';
            genBtn.disabled = false;
            genBtn.textContent = 'Generate Detailed Summary';
        });

        dom.contextList.appendChild(manualPanel);
    }

    // ── Auto mode: Summarize Now button ───────────────────────────────────
    if (mode === 'auto') {
        const summarizeBtn = document.getElementById('summarize-now-btn');
        if (summarizeBtn) {
            summarizeBtn.style.display = '';
            summarizeBtn.onclick = async () => {
                if (!state.currentChatId) { lagoonAlert('No active chat to summarize'); return; }
                summarizeBtn.disabled = true;
                summarizeBtn.classList.add('summarizing');
                summarizeBtn.querySelector('.btn-label').textContent = 'Summarizing...';
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 120000);
                    const response = await fetch('/api/force_summarize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: state.currentChatId, messages: state.messages }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Summarization failed');
                    const { chatManager } = await import('../components/ChatManager.js');
                    if (result.pending_review) {
                        chatManager._showReviewNeededBanner();
                        showContextViewer();
                    } else {
                        if (result.messages) {
                            state.messages = result.messages;
                            chatManager.renderMessages();
                            chatManager.updateContextGauge();
                        }
                        showContextViewer();
                        await lagoonAlert(`Summary added to stack! Compressed ${result.message_count} messages.`);
                    }
                } catch (err) {
                    lagoonAlert(`${err.name === 'AbortError' ? 'Summarization timed out.' : err.message}`);
                } finally {
                    summarizeBtn.disabled = false;
                    summarizeBtn.classList.remove('summarizing');
                    summarizeBtn.querySelector('.btn-label').textContent = 'Summarize Now';
                }
            };
        }
    } else {
        const summarizeBtn = document.getElementById('summarize-now-btn');
        if (summarizeBtn) summarizeBtn.style.display = 'none';
    }

    // ── System/Character context items ────────────────────────────────────
    const hasComplexContext = state.messages.some(m =>
        m.role === 'system' && (
            m.content.includes('USER-DEFINED INSTRUCTIONS') ||
            m.content.includes('CONTEXT FILE') ||
            m.content.includes('CODE FILE')
        )
    );

    // ── Uploaded / attached documents ─────────────────────────────────────
    // Pending file (loaded but not yet sent)
    if (state.contextFileName && state.contextFileContent) {
        const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(state.contextFileName);
        const contentPreview = isImage
            ? `<img src="${state.contextFileContent}" alt="${state.contextFileName}" style="max-width:100%;max-height:300px;border-radius:4px;">`
            : `<pre class="context-content">${state.contextFileContent.substring(0, 2000).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${state.contextFileContent.length > 2000 ? '...\n[truncated]' : ''}</pre>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="context-item">
                <div class="context-item-header">
                    <span class="context-label">📎 ${state.contextFileName} <em style="font-size:0.75rem;color:var(--text-dim)">(pending — not yet sent)</em></span>
                    <div class="context-item-actions"><button class="context-clear-btn">Clear</button></div>
                </div>
                ${contentPreview}
            </div>`;
        wrapper.querySelector('.context-clear-btn').addEventListener('click', async () => {
            const { chatManager } = await import('../components/ChatManager.js');
            chatManager.clearContextFile();
            showContextViewer();
        });
        dom.contextList.appendChild(wrapper);
    }

    // Files already sent (live in state.messages as user messages)
    const attachedFiles = state.messages.filter(m =>
        m.role === 'user' && m.content && m.content.startsWith('[ATTACHED FILE:')
    );
    if (attachedFiles.length > 0) {
        const docsHeader = document.createElement('div');
        docsHeader.className = 'context-section-header';
        docsHeader.textContent = `Attached Documents (${attachedFiles.length})`;
        dom.contextList.appendChild(docsHeader);

        attachedFiles.forEach((msg) => {
            const match = msg.content.match(/^\[ATTACHED FILE: ([^\]]+)\]\n\n([\s\S]*)$/);
            const fileName = match ? match[1] : 'Unknown file';
            const fileContent = match ? match[2] : msg.content;
            const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);
            const contentPreview = (isImage && fileContent.startsWith('data:'))
                ? `<img src="${fileContent}" alt="${fileName}" style="max-width:100%;max-height:300px;border-radius:4px;">`
                : `<pre class="context-content">${fileContent.substring(0, 2000).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${fileContent.length > 2000 ? '...\n[truncated]' : ''}</pre>`;
            const item = document.createElement('div');
            item.classList.add('context-item');
            item.innerHTML = `
                <div class="context-item-header">
                    <span class="context-label">📎 ${fileName}</span>
                    <div class="context-item-actions">
                        <button class="context-copy-btn">Copy</button>
                        <button class="context-delete-btn">Delete</button>
                    </div>
                </div>
                ${contentPreview}`;
            item.querySelector('.context-copy-btn').addEventListener('click', () => navigator.clipboard.writeText(fileContent));
            item.querySelector('.context-delete-btn').addEventListener('click', async () => {
                if (!await lagoonConfirm(`Delete attached file "${fileName}" from context?`)) return;
                const msgIndex = state.messages.indexOf(msg);
                if (msgIndex > -1) { state.messages.splice(msgIndex, 1); showContextViewer(); }
            });
            dom.contextList.appendChild(item);
        });
    }

    dom.contextModal.classList.remove('hidden');
}

export function showSystemPromptEditor() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:20px;width:90%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;';
    modal.onclick = (e) => e.stopPropagation();

    const title = document.createElement('h3');
    title.textContent = 'Edit Default System Prompt';
    title.style.cssText = 'margin:0 0 12px 0;color:var(--text);font-size:16px;';
    modal.appendChild(title);

    const textarea = document.createElement('textarea');
    textarea.value = getDefaultSystemPrompt();
    textarea.style.cssText = 'width:100%;height:200px;padding:10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box;';
    textarea.placeholder = 'Enter your default system prompt for quick chats...';
    modal.appendChild(textarea);

    // Fiction Mode toggle (repurposed from uncensored_mode)
    const uncensoredRow = document.createElement('div');
    uncensoredRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;';
    const uncensoredCheckbox = document.createElement('input');
    uncensoredCheckbox.type = 'checkbox';
    uncensoredCheckbox.id = 'quickchat-uncensored';
    uncensoredCheckbox.checked = localStorage.getItem('quickchat_uncensored') === 'true';
    uncensoredCheckbox.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    const uncensoredLabel = document.createElement('label');
    uncensoredLabel.htmlFor = 'quickchat-uncensored';
    uncensoredLabel.textContent = 'Fiction Mode';
    uncensoredLabel.style.cssText = 'color:var(--text);font-size:13px;cursor:pointer;';
    const uncensoredHint = document.createElement('span');
    uncensoredHint.textContent = 'Adds an authorial framing prompt \u2014 keeps models in-character for creative writing';
    uncensoredHint.style.cssText = 'color:var(--text-muted, #888);font-size:11px;';
    uncensoredRow.appendChild(uncensoredCheckbox);
    uncensoredRow.appendChild(uncensoredLabel);
    uncensoredRow.appendChild(uncensoredHint);
    modal.appendChild(uncensoredRow);

    // Fiction prompt editor (expandable textarea)
    const fictionEditor = document.createElement('div');
    fictionEditor.id = 'fiction-prompt-editor';
    fictionEditor.style.cssText = 'margin-top:8px;display:' + (uncensoredCheckbox.checked ? 'block' : 'none') + ';';
    const fictionTextarea = document.createElement('textarea');
    fictionTextarea.id = 'fiction-prompt-text';
    fictionTextarea.rows = 5;
    fictionTextarea.placeholder = 'Leave blank to use the default authorial framing...';
    fictionTextarea.value = localStorage.getItem('quickchat_fiction_prompt') || '';
    fictionTextarea.style.cssText = 'width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px;resize:vertical;box-sizing:border-box;';
    const fictionResetBtn = document.createElement('button');
    fictionResetBtn.textContent = 'Reset to Default';
    fictionResetBtn.style.cssText = 'margin-top:4px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);cursor:pointer;font-size:12px;';
    fictionResetBtn.onclick = () => { fictionTextarea.value = ''; };
    fictionEditor.appendChild(fictionTextarea);
    fictionEditor.appendChild(fictionResetBtn);
    modal.appendChild(fictionEditor);

    uncensoredCheckbox.addEventListener('change', () => {
        fictionEditor.style.display = uncensoredCheckbox.checked ? 'block' : 'none';
    });


    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);cursor:pointer;';
    cancelBtn.onclick = () => overlay.remove();
    buttonRow.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:4px;background:var(--accent);color:white;cursor:pointer;';
    saveBtn.onclick = () => {
        setDefaultSystemPrompt(textarea.value);
        localStorage.setItem('quickchat_uncensored', uncensoredCheckbox.checked ? 'true' : 'false');
        localStorage.setItem('quickchat_fiction_prompt', fictionTextarea.value);
        // Also update current chat if it's a quick chat (no parent config)
        if (!state.currentParentConfig) {
            state.currentConfig.system_prompt = textarea.value;
            state.currentConfig.uncensored_mode = uncensoredCheckbox.checked;
            state.currentConfig.fiction_prompt_text = fictionTextarea.value;

            // Update the system message in state.messages if it exists
            const systemMsgIndex = state.messages.findIndex(m =>
                m.role === 'system' &&
                !m.content.includes('CONTEXT FILE') &&
                !m.content.includes('USER-DEFINED INSTRUCTIONS')
            );
            if (systemMsgIndex > -1) {
                state.messages[systemMsgIndex].content = textarea.value;
            } else if (textarea.value.trim()) {
                state.messages.unshift({ role: 'system', content: textarea.value });
            }
        }

        overlay.remove();
    };
    buttonRow.appendChild(saveBtn);

    modal.appendChild(buttonRow);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.onmousedown = (e) => {
        if (e.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
    textarea.focus();
}

export async function showModelManager() {
    const modal = document.getElementById('model-manager-modal');
    const list = document.getElementById('model-manager-list');
    const closeBtn = document.getElementById('close-model-manager-btn');
    const installBtn = document.getElementById('install-model-manager-btn');

    if (!modal || !list) return;

    modal.classList.remove('hidden');
    list.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-dim)">Loading models...</p>';
    installBtn.classList.add('hidden');

    // Create tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'sidebar-tabs';
    tabsContainer.style.marginBottom = '10px';
    tabsContainer.innerHTML = `
        <button class="tab-btn active" data-tab="venice">venice.ai</button>
        <button class="tab-btn" data-tab="together">together.ai</button>
        <button class="tab-btn" data-tab="zai">z.ai</button>
        <button class="tab-btn" data-tab="installed">Installed</button>
    `;
    
    const contentContainer = document.createElement('div');
    contentContainer.id = 'model-manager-content';
    contentContainer.style.flex = '1';
    contentContainer.style.overflowY = 'auto';

    modal.querySelector('.modal-content').insertBefore(tabsContainer, list);
    modal.querySelector('.modal-content').replaceChild(contentContainer, list);

    let activeTab = 'venice';
    let availableModels = [];
    let installedModels = [];

    async function refreshInstalled() {
        const res = await fetch('/api/installed_models');
        const data = await res.json();
        installedModels = data.models || [];
    }

    async function render() {
        contentContainer.innerHTML = '';
        installBtn.classList.add('hidden');

        if (activeTab === 'installed') {
            await refreshInstalled();
            if (installedModels.length === 0) {
                contentContainer.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-dim)">No models installed.</p>';
                return;
            }
            installedModels.forEach(m => {
                const row = document.createElement('div');
                row.className = 'anchor-entry-row'; // Reuse existing styles
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.padding = '10px';
                row.style.borderBottom = '1px solid var(--border-subtle)';
                row.innerHTML = `
                    <div style="flex:1">
                        <div style="font-weight:bold;color:var(--text-bright)">${m.name}</div>
                        <div style="font-size:0.75rem;color:var(--text-dim)">${m.id}</div>
                    </div>
                    <button class="btn-icon delete-model-btn" title="Remove model">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                `;
                row.querySelector('.delete-model-btn').onclick = async () => {
                    if (await lagoonConfirm(`Remove ${m.name}?`)) {
                        await fetch(`/api/installed_models/${m.id}`, { method: 'DELETE' });
                        const { modelConfigManager } = await import('../core/ModelConfigManager.js');
                        await modelConfigManager.refresh();
                        window.syncInstalledModels?.(); // Helper to update dropdowns
                        render();
                    }
                };
                contentContainer.appendChild(row);
            });
        } else {
            const provider = activeTab;
            contentContainer.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-dim)">Fetching available models...</p>';
            
            try {
                const res = await fetch(`/api/${provider}/models`);
                if (res.status === 403) {
                    contentContainer.innerHTML = `<p style="padding:20px;text-align:center;color:var(--ansi-red)">API Key missing for ${provider}. Add it in Settings.</p>`;
                    return;
                }
                const data = await res.json();
                availableModels = data.models || [];
                
                contentContainer.innerHTML = '';
                if (availableModels.length === 0) {
                    contentContainer.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-dim)">No models found.</p>';
                    return;
                }

                await refreshInstalled();
                // Check ID+provider combination to distinguish same model from different providers
                const installedKeys = new Set(installedModels.map(m => `${m.id}::${m.provider}`));

availableModels.forEach(m => {
                    const key = `${m.id}::${provider}`;
                    const isInstalled = installedKeys.has(key);
                    // Build pricing string
                    const formatPrice = (p) => (p === 0) ? 'Free' : (p != null ? `$${Number(p).toFixed(2)}` : null);
                    let priceHtml = '';
                    if (m.pricing) {
                        const inp = formatPrice(m.pricing.input ?? m.pricing.in);
                        const out = formatPrice(m.pricing.output ?? m.pricing.out);
                        const cache = formatPrice(m.pricing.cache);
                        
                        if (inp != null && out != null) {
                            priceHtml = `<div style="font-size:0.7rem;color:var(--text-dim);opacity:0.7">in ${inp} · ${cache != null ? `cache ${cache} · ` : ''}out ${out} /1M tok</div>`;
                        }
                    }
                    const row = document.createElement('div');
                    row.className = 'anchor-entry-row';
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';
                    row.style.padding = '10px';
                    row.style.opacity = isInstalled ? '0.6' : '1';
                    row.style.borderBottom = '1px solid var(--border-subtle)';
                    
                    row.innerHTML = `
                        <div style="flex:1">
                            <div style="font-weight:bold;color:var(--text-bright)">${m.name}</div>
                            <div style="font-size:0.75rem;color:var(--text-dim)">${m.id} ${m.context_tokens ? `(${Math.round(m.context_tokens/1024)}k ctx)` : ''}</div>
                            ${priceHtml}
                        </div>
                        <button class="btn-small install-model-btn" ${isInstalled ? 'disabled' : ''}>
                            ${isInstalled ? '✓ Added' : '+ Add'}
                        </button>
                    `;
                    
                    row.querySelector('.install-model-btn').onclick = async (e) => {
                        const btn = e.target;
                        btn.disabled = true;
                        btn.textContent = 'Adding...';
                        try {
                            const res = await fetch('/api/installed_models', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: m.id, name: m.name, provider: provider, logo: inferLogoKey(m.id) })
                            });
                            const result = await res.json();
                            if (!res.ok) {
                                if (result.error === 'duplicate_id') {
                                    const confirmed = await lagoonConfirm(`${result.message}\n\nRemove the existing ${result.existing_provider} version first?`);
                                    if (confirmed) {
                                        // Remove existing and re-add with new provider
                                        await fetch(`/api/installed_models/${m.id}`, { method: 'DELETE' });
                                        await fetch('/api/installed_models', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: m.id, name: m.name, provider: provider, logo: inferLogoKey(m.id) })
                                        });
                                        const { modelConfigManager } = await import('../core/ModelConfigManager.js');
                                        await modelConfigManager.refresh();
                                        window.syncInstalledModels?.();
                                        render();
                                    } else {
                                        btn.disabled = false;
                                        btn.textContent = '+ Add';
                                    }
                                } else {
                                    alert(result.message || 'Failed to add model');
                                    btn.disabled = false;
                                    btn.textContent = '+ Add';
                                }
                                return;
                            }
                            const { modelConfigManager } = await import('../core/ModelConfigManager.js');
                            await modelConfigManager.refresh();
                            window.syncInstalledModels?.();
                            render();
                        } catch (err) {
                            alert('Error: ' + err.message);
                            btn.disabled = false;
                            btn.textContent = '+ Add';
                        }
                    };
                    contentContainer.appendChild(row);
                });
            } catch (error) {
                contentContainer.innerHTML = `<p style="padding:20px;text-align:center;color:var(--ansi-red)">Error: ${error.message}</p>`;
            }
        }
    }

    tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            render();
        };
    });

    closeBtn.onclick = () => {
        modal.classList.add('hidden');
        tabsContainer.remove();
    };

    render();
}

export function showWritingToolsModal() {
    const modal = document.getElementById('writing-tools-modal');
    const list = document.getElementById('writing-tools-list');
    const saveBtn = document.getElementById('save-writing-tools-btn');
    const closeBtn = document.getElementById('close-writing-tools-btn');

    const currentTools = getWritingToolsOptions();

    // Helper to check if a tool matches its default
    const getDefault = (id) => DEFAULT_WRITING_TOOLS.find(t => t.id === id);
    const isToolDefault = (tool) => {
        const def = getDefault(tool.id);
        return def && tool.label === def.label && tool.prompt === def.prompt;
    };

    // Render the form with editable labels
    list.innerHTML = currentTools.map(tool => {
        const isDefault = isToolDefault(tool);
        return `
            <div class="writing-tool-item" data-id="${tool.id}">
                <div class="writing-tool-header">
                    <input type="text" class="writing-tool-label-input" value="${tool.label}" placeholder="Tool name">
                    <button type="button" class="reset-tool-btn ${isDefault ? 'hidden' : ''}" title="Reset to default">Reset</button>
                </div>
                <textarea class="writing-tool-prompt" rows="3">${tool.prompt}</textarea>
            </div>
        `;
    }).join('');

    // Wire up reset buttons and change detection
    list.querySelectorAll('.writing-tool-item').forEach(item => {
        const id = item.dataset.id;
        const labelInput = item.querySelector('.writing-tool-label-input');
        const textarea = item.querySelector('.writing-tool-prompt');
        const resetBtn = item.querySelector('.reset-tool-btn');

        const checkDefault = () => {
            const def = getDefault(id);
            const isDefault = def && labelInput.value === def.label && textarea.value === def.prompt;
            resetBtn.classList.toggle('hidden', isDefault);
        };

        labelInput.addEventListener('input', checkDefault);
        textarea.addEventListener('input', checkDefault);

        resetBtn.addEventListener('click', () => {
            const def = getDefault(id);
            if (def) {
                labelInput.value = def.label;
                textarea.value = def.prompt;
                resetBtn.classList.add('hidden');
            }
        });
    });

    // Save handler
    const handleSave = () => {
        const newTools = [];
        list.querySelectorAll('.writing-tool-item').forEach(item => {
            const id = item.dataset.id;
            const label = item.querySelector('.writing-tool-label-input').value.trim() || 'Unnamed Tool';
            const prompt = item.querySelector('.writing-tool-prompt').value;
            newTools.push({ id, label, prompt });
        });
        saveWritingToolsOptions(newTools);
        modal.classList.add('hidden');
    };

    // Close handler
    const handleClose = () => {
        modal.classList.add('hidden');
    };

    // Remove old listeners and add new ones
    saveBtn.onclick = handleSave;
    closeBtn.onclick = handleClose;

    // Close on overlay click
    modal.onmousedown = (e) => {
        if (e.target === modal) handleClose();
    };

    modal.classList.remove('hidden');
}

const MEMORY_SETTINGS_DEFAULTS = {
    summarize_threshold: 0.75,
    recent_messages_to_keep: 5,
    summary_model: 'grok-4-20-beta',
    summary_max_tokens: 10000,
    rag_enabled: true,
    rag_top_k: 3,
    rag_min_similarity: 0.35,
    rag_token_budget: 800,
    rag_chunk_size: 4,
    lore_scan_depth: 15,
    lore_token_budget: 4000,
};

export async function showMemorySettingsModal() {
    const modal = document.getElementById('memory-settings-modal');

    // Fetch current settings
    let settings = { ...MEMORY_SETTINGS_DEFAULTS };
    try {
        const res = await fetch('/api/memory_settings');
        if (res.ok) settings = await res.json();
    } catch (e) {
        console.warn('[MemSettings] Failed to fetch settings', e);
    }

    // Helper to populate fields
    function populate(s) {
        // Summarize threshold range
        const threshEl = document.getElementById('ms-summarize-threshold');
        const threshVal = document.getElementById('ms-summarize-threshold-val');
        threshEl.value = s.summarize_threshold;
        threshVal.textContent = Math.round(s.summarize_threshold * 100) + '%';
        threshEl.oninput = () => { threshVal.textContent = Math.round(threshEl.value * 100) + '%'; };

        document.getElementById('ms-recent-keep').value = s.recent_messages_to_keep;
        document.getElementById('ms-summary-max-tokens').value = s.summary_max_tokens;

        // Summary model dropdown
        const modelSel = document.getElementById('ms-summary-model');
        modelSel.value = s.summary_model;
        // If saved model not in list, add it
        if (modelSel.value !== s.summary_model) {
            const opt = document.createElement('option');
            opt.value = s.summary_model;
            opt.textContent = s.summary_model;
            modelSel.appendChild(opt);
            modelSel.value = s.summary_model;
        }

        document.getElementById('ms-rag-enabled').checked = !!s.rag_enabled;
        document.getElementById('ms-rag-top-k').value = s.rag_top_k;

        const simEl = document.getElementById('ms-rag-min-similarity');
        const simVal = document.getElementById('ms-rag-min-similarity-val');
        simEl.value = s.rag_min_similarity;
        simVal.textContent = parseFloat(s.rag_min_similarity).toFixed(2);
        simEl.oninput = () => { simVal.textContent = parseFloat(simEl.value).toFixed(2); };

        document.getElementById('ms-rag-token-budget').value = s.rag_token_budget;
        document.getElementById('ms-rag-chunk-size').value = s.rag_chunk_size;
        document.getElementById('ms-lore-scan-depth').value = s.lore_scan_depth;
        document.getElementById('ms-lore-token-budget').value = s.lore_token_budget;
    }

    populate(settings);

    // Init custom dropdown for summary model (guard in initCustomDropdown prevents double-init)
    uiManager.initCustomDropdown(document.getElementById('ms-summary-model'));

    // Save
    document.getElementById('save-memory-settings-btn').onclick = async () => {
        const payload = {
            summarize_threshold: parseFloat(document.getElementById('ms-summarize-threshold').value),
            recent_messages_to_keep: parseInt(document.getElementById('ms-recent-keep').value, 10),
            summary_model: document.getElementById('ms-summary-model').value,
            summary_max_tokens: parseInt(document.getElementById('ms-summary-max-tokens').value, 10),
            rag_enabled: document.getElementById('ms-rag-enabled').checked,
            rag_top_k: parseInt(document.getElementById('ms-rag-top-k').value, 10),
            rag_min_similarity: parseFloat(document.getElementById('ms-rag-min-similarity').value),
            rag_token_budget: parseInt(document.getElementById('ms-rag-token-budget').value, 10),
            rag_chunk_size: parseInt(document.getElementById('ms-rag-chunk-size').value, 10),
            lore_scan_depth: parseInt(document.getElementById('ms-lore-scan-depth').value, 10),
            lore_token_budget: parseInt(document.getElementById('ms-lore-token-budget').value, 10),
        };
        const saveBtn = document.getElementById('save-memory-settings-btn');
        const orig = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
        try {
            const res = await fetch('/api/memory_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                saveBtn.textContent = 'Saved';
                setTimeout(() => { saveBtn.textContent = orig; saveBtn.disabled = false; }, 1500);
            } else {
                saveBtn.textContent = 'Error';
                setTimeout(() => { saveBtn.textContent = orig; saveBtn.disabled = false; }, 1500);
            }
        } catch {
            saveBtn.textContent = 'Error';
            setTimeout(() => { saveBtn.textContent = orig; saveBtn.disabled = false; }, 1500);
        }
    };

    // Reset defaults
    document.getElementById('reset-memory-settings-btn').onclick = () => {
        populate(MEMORY_SETTINGS_DEFAULTS);
        // Re-sync custom dropdown display
        document.getElementById('ms-summary-model').dispatchEvent(new Event('change'));
    };

    // Close
    const closeBtn = document.getElementById('close-memory-settings-btn');
    closeBtn.onclick = () => modal.classList.add('hidden');
    modal.onmousedown = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

    modal.classList.remove('hidden');
}

export function showSettingsMenu(button) {
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    const menu = document.createElement('div');
    menu.classList.add('context-menu', 'settings-menu');
    const rect = button.getBoundingClientRect();

    const e2eeEnabled = localStorage.getItem('quickchat_e2ee') === 'true';

    // Mode Toggle Section
    const modeSection = document.createElement('div');
    modeSection.classList.add('settings-section');
    modeSection.style.paddingTop = '4px';

    const modeLabel = document.createElement('div');
    modeLabel.classList.add('settings-section-title');
    modeLabel.textContent = 'App Mode';
    modeSection.appendChild(modeLabel);

    const modeToggleContainer = document.createElement('div');
    modeToggleContainer.classList.add('mode-toggle-btns');
    modeToggleContainer.style.justifyContent = 'center';
    modeToggleContainer.style.marginTop = '6px';
    modeToggleContainer.style.display = 'flex';
    modeToggleContainer.style.gap = '4px';

    const chatBtn = document.createElement('button');
    chatBtn.classList.add('mode-btn');
    if (state.mode === 'chat') chatBtn.classList.add('active');
    chatBtn.textContent = 'Chat';
    chatBtn.onclick = (e) => {
        e.stopPropagation();
        if (state.mode === 'chat') return;
        state.mode = 'chat';
        localStorage.setItem('app_mode', 'chat');
        chatBtn.classList.add('active');
        imageBtn.classList.remove('active');
        videoBtn.classList.remove('active');
        toggleAppMode();
    };

    const imageBtn = document.createElement('button');
    imageBtn.classList.add('mode-btn');
    if (state.mode === 'image') imageBtn.classList.add('active');
    imageBtn.textContent = 'Image';
    imageBtn.onclick = (e) => {
        e.stopPropagation();
        if (state.mode === 'image') return;
        state.mode = 'image';
        localStorage.setItem('app_mode', 'image');
        imageBtn.classList.add('active');
        chatBtn.classList.remove('active');
        videoBtn.classList.remove('active');
        toggleAppMode();
    };

    const videoBtn = document.createElement('button');
    videoBtn.classList.add('mode-btn');
    if (state.mode === 'video') videoBtn.classList.add('active');
    videoBtn.textContent = 'Video';
    videoBtn.onclick = (e) => {
        e.stopPropagation();
        if (state.mode === 'video') return;
        state.mode = 'video';
        localStorage.setItem('app_mode', 'video');
        videoBtn.classList.add('active');
        chatBtn.classList.remove('active');
        imageBtn.classList.remove('active');
        toggleAppMode();
    };

    modeToggleContainer.appendChild(chatBtn);
    modeToggleContainer.appendChild(imageBtn);
    modeToggleContainer.appendChild(videoBtn);
    modeSection.appendChild(modeToggleContainer);
    menu.appendChild(modeSection);

    const modeSeparator = document.createElement('div');
    modeSeparator.style.cssText = 'height:1px;background:var(--border);margin:8px 0;';
    menu.appendChild(modeSeparator);

    const currentTheme = localStorage.getItem('theme') || 'hacker';
    const themes = [
        { id: 'hacker', label: 'Hacker Console' },
        { id: 'dark', label: 'Dark' },
        { id: '90s', label: '90s Retro' },
        { id: 'glassmorphism', label: 'Glassmorphism' },
        { id: 'abyss', label: 'Abyss' }
    ];

    // Theme Section
    const themeSection = document.createElement('div');
    themeSection.classList.add('settings-section');

    const themeLabel = document.createElement('div');
    themeLabel.classList.add('settings-section-title');
    themeLabel.textContent = 'Theme';
    themeSection.appendChild(themeLabel);

    const themeSelect = document.createElement('select');
    themeSelect.classList.add('settings-font-select');
    themeSelect.onclick = (e) => e.stopPropagation();
    
    themes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme.id;
        option.textContent = theme.label;
        if (currentTheme === theme.id) option.selected = true;
        themeSelect.appendChild(option);
    });

    themeSelect.onchange = () => {
        const selectedTheme = themeSelect.value;
        document.body.classList.remove('theme-hacker', 'theme-dark', 'theme-90s', 'theme-glassmorphism', 'theme-cyberpunk', 'theme-cyberpunk2077', 'theme-abyss', 'theme-millennium');
        document.body.classList.add('theme-' + selectedTheme);
        localStorage.setItem('theme', selectedTheme);
    };

    themeSection.appendChild(themeSelect);
    menu.appendChild(themeSection);

    const separator = document.createElement('div');
    separator.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(separator);

    // Typography Section
    const typoSection = document.createElement('div');
    typoSection.classList.add('settings-section');

    // Font selector
    const fontLabel = document.createElement('div');
    fontLabel.classList.add('settings-section-title');
    fontLabel.textContent = 'Font';
    typoSection.appendChild(fontLabel);

    const fontSelect = document.createElement('select');
    fontSelect.classList.add('settings-font-select');
    const fonts = [
        { id: 'system', label: 'System Default' },
        { id: 'quattro', label: 'Quattro' },
        { id: 'serif', label: 'Serif' },
        { id: 'mono', label: 'Monospace' }
    ];
    const currentFont = localStorage.getItem('chat_font') || 'system';
    fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font.id;
        option.textContent = font.label;
        if (currentFont === font.id) option.selected = true;
        fontSelect.appendChild(option);
    });
    fontSelect.onchange = () => {
        localStorage.setItem('chat_font', fontSelect.value);
        uiManager.applyTypographySettings();
    };
    fontSelect.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    typoSection.appendChild(fontSelect);

    // Text Size slider
    const sizeLabel = document.createElement('div');
    sizeLabel.classList.add('settings-section-title');
    sizeLabel.style.marginTop = '0.75rem';
    sizeLabel.textContent = 'Text Size';
    typoSection.appendChild(sizeLabel);

    const sizeControl = document.createElement('div');
    sizeControl.classList.add('text-size-control');

    const smallA = document.createElement('span');
    smallA.classList.add('size-label');
    smallA.textContent = 'A';

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.classList.add('text-size-slider');
    sizeSlider.min = '12';
    sizeSlider.max = '20';
    sizeSlider.value = localStorage.getItem('chat_text_size') || '16';
    sizeSlider.oninput = () => {
        localStorage.setItem('chat_text_size', sizeSlider.value);
        uiManager.applyTypographySettings();
    };

    const largeA = document.createElement('span');
    largeA.classList.add('size-label', 'large');
    largeA.textContent = 'A';

    sizeControl.appendChild(smallA);
    sizeControl.appendChild(sizeSlider);
    sizeControl.appendChild(largeA);
    typoSection.appendChild(sizeControl);

    // Line Spacing buttons
    const spacingLabel = document.createElement('div');
    spacingLabel.classList.add('settings-section-title');
    spacingLabel.style.marginTop = '0.75rem';
    spacingLabel.textContent = 'Line Spacing';
    typoSection.appendChild(spacingLabel);

    const spacingControl = document.createElement('div');
    spacingControl.classList.add('line-spacing-control');

    const spacings = [
        { value: '1', label: '1' },
        { value: '1.5', label: '1.5' },
        { value: '2', label: '2' }
    ];
    const currentSpacing = localStorage.getItem('chat_line_spacing') || '1.5';

    spacings.forEach(spacing => {
        const btn = document.createElement('button');
        btn.classList.add('line-spacing-btn');
        if (currentSpacing === spacing.value) btn.classList.add('active');
        btn.innerHTML = `${spacing.label} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
        btn.onclick = () => {
            spacingControl.querySelectorAll('.line-spacing-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            localStorage.setItem('chat_line_spacing', spacing.value);
            uiManager.applyTypographySettings();
        };
        spacingControl.appendChild(btn);
    });
    typoSection.appendChild(spacingControl);

    menu.appendChild(typoSection);

    // Separator
    const separatorVoices = document.createElement('div');
    separatorVoices.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(separatorVoices);

    // Voice Selection Section
    const voiceSection = document.createElement('div');
    voiceSection.classList.add('settings-section');

    const providerLabel = document.createElement('div');
    providerLabel.classList.add('settings-section-title');
    providerLabel.textContent = 'Audio Provider';
    voiceSection.appendChild(providerLabel);

    const providerSelect = document.createElement('select');
    providerSelect.classList.add('settings-font-select');
    providerSelect.onclick = (e) => e.stopPropagation();
    providerSelect.innerHTML = `
        <option value="venice">Venice AI (Fast)</option>
        <option value="google">Google Cloud (Premium)</option>
    `;
    const currentProvider = localStorage.getItem('mobile_tts_provider') || DEFAULT_PROVIDER;
    providerSelect.value = currentProvider;
    voiceSection.appendChild(providerSelect);

    const voiceLabel = document.createElement('div');
    voiceLabel.classList.add('settings-section-title');
    voiceLabel.style.marginTop = '0.75rem';
    voiceLabel.textContent = 'Voice';
    voiceSection.appendChild(voiceLabel);

    const voiceRow = document.createElement('div');
    voiceRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

    const voiceSelect = document.createElement('select');
    voiceSelect.classList.add('settings-font-select');
    voiceSelect.style.flex = '1';
    voiceSelect.onclick = (e) => e.stopPropagation();
    
    const updateVoiceOptions = () => {
        const provider = providerSelect.value;
        const voices = provider === 'google' ? GOOGLE_VOICES : VENICE_VOICES;
        const currentVoice = localStorage.getItem('mobile_tts_voice');
        const defaultForProvider = provider === 'google' ? DEFAULT_GOOGLE_VOICE : DEFAULT_VOICE;
        
        voiceSelect.innerHTML = '';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            if (currentVoice === voice.id) option.selected = true;
            voiceSelect.appendChild(option);
        });

        if (!voices.some(v => v.id === voiceSelect.value)) {
            voiceSelect.value = defaultForProvider;
            localStorage.setItem('mobile_tts_voice', defaultForProvider);
            import('../services/AudioService.js').then(module => {
                module.audioService.setVoice(defaultForProvider);
            });
        }
        uiManager.updateCustomDropdown(voiceSelect);
    };

    updateVoiceOptions();

    const testBtn = document.createElement('button');
    testBtn.innerHTML = '▶';
    testBtn.title = 'Test Voice';
    testBtn.style.cssText = 'position:relative;background:var(--accent);color:white;border:none;border-radius:4px;width:32px;height:32px;cursor:pointer;flex-shrink:0;';
    
    // Add edit badge
    const editBadge = document.createElement('span');
    editBadge.innerHTML = '✎';
    editBadge.title = 'Edit Test Message';
    editBadge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:var(--bg-darker);border:1px solid var(--border);color:var(--text-dim);border-radius:50%;width:16px;height:16px;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;z-index:10;';
    
    editBadge.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const testVoiceModal = document.getElementById('test-voice-modal');
        const testVoiceInput = document.getElementById('test-voice-input');
        if (testVoiceModal && testVoiceInput) {
            testVoiceInput.value = localStorage.getItem('desktop_test_voice_message') || "This is a test of the audio system.";
            testVoiceModal.classList.remove('hidden');
            testVoiceInput.focus();
        }
    };
    testBtn.appendChild(editBadge);

    testBtn.onclick = () => {
        const msg = localStorage.getItem('desktop_test_voice_message') || "This is a test of the audio system.";
        import('../services/AudioService.js').then(module => {
            module.audioService.unlock();
            module.audioService.speak(msg);
        }).catch(err => {
            console.error('Failed to load AudioService:', err);
            // Fallback: try to use the global audioService if available
            if (window.audioService) {
                window.audioService.unlock();
                window.audioService.speak(msg);
            }
        });
    };

    providerSelect.onchange = () => {
        localStorage.setItem('mobile_tts_provider', providerSelect.value);
        import('../services/AudioService.js').then(module => {
            module.audioService.setProvider(providerSelect.value);
            updateVoiceOptions();
        });
    };

    voiceSelect.onchange = () => {
        localStorage.setItem('mobile_tts_voice', voiceSelect.value);
        import('../services/AudioService.js').then(module => {
            module.audioService.setVoice(voiceSelect.value);
        });
    };

    voiceRow.appendChild(voiceSelect);
    voiceRow.appendChild(testBtn);
    voiceSection.appendChild(voiceRow);

    // Auto-read Toggle for Desktop
    const autoReadRow = document.createElement('div');
    autoReadRow.style.cssText = 'display:flex;align-items:center;margin-top:12px;gap:8px;';
    autoReadRow.onclick = (e) => e.stopPropagation();

    const isAutoRead = localStorage.getItem('mobile_auto_read') === 'true';
    const arLabel = document.createElement('label');
    arLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const arInput = document.createElement('input');
    arInput.type = 'checkbox';
    arInput.checked = isAutoRead;
    arInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const arSlider = document.createElement('span');
    arSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${isAutoRead ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const arKnob = document.createElement('span');
    arKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${isAutoRead ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    arSlider.appendChild(arKnob);
    arLabel.appendChild(arInput);
    arLabel.appendChild(arSlider);
    
    arInput.onchange = (e) => {
        e.stopPropagation();
        const newValue = arInput.checked;
        localStorage.setItem('mobile_auto_read', newValue ? 'true' : 'false');
        arSlider.style.background = newValue ? 'var(--accent)' : '#444';
        arKnob.style.left = newValue ? '16px' : '2px';
        import('../services/AudioService.js').then(module => {
            module.audioService.unlock();
            module.audioService.setAutoRead(newValue);
        });
    };

    const arText = document.createElement('span');
    arText.textContent = 'Auto-read responses';
    arText.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    
    autoReadRow.appendChild(arLabel);
    autoReadRow.appendChild(arText);
    voiceSection.appendChild(autoReadRow);

    menu.appendChild(voiceSection);

    // Separator
    const separator2 = document.createElement('div');
    separator2.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(separator2);

    // System Prompt row with toggle and edit button
    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    promptRow.onclick = (e) => e.stopPropagation();

    // Toggle switch
    const useDefaultPrompt = localStorage.getItem('use_default_prompt') !== 'false';
    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = useDefaultPrompt;
    toggleInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const toggleSlider = document.createElement('span');
    toggleSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${useDefaultPrompt ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const toggleKnob = document.createElement('span');
    toggleKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${useDefaultPrompt ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    toggleSlider.appendChild(toggleKnob);
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);
    toggleInput.onchange = (e) => {
        e.stopPropagation();
        const newValue = toggleInput.checked;
        localStorage.setItem('use_default_prompt', newValue ? 'true' : 'false');
        toggleSlider.style.background = newValue ? 'var(--accent)' : '#444';
        toggleKnob.style.left = newValue ? '16px' : '2px';
    };
    promptRow.appendChild(toggleLabel);

    // Label
    const promptLabel = document.createElement('span');
    promptLabel.textContent = 'System Prompt';
    promptLabel.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    promptRow.appendChild(promptLabel);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit system prompt';
    editBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;';
    editBtn.onmouseenter = () => editBtn.style.background = 'var(--hover)';
    editBtn.onmouseleave = () => editBtn.style.background = 'none';
    editBtn.onclick = () => {
        menu.remove();
        showSystemPromptEditor();
    };
    promptRow.appendChild(editBtn);

    menu.appendChild(promptRow);

    // Web Search toggle row
    const webSearchRow = document.createElement('div');
    webSearchRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    webSearchRow.onclick = (e) => e.stopPropagation();

    const webSearchEnabled = localStorage.getItem('quickchat_web_search') === 'true';
    const webSearchLabel = document.createElement('label');
    webSearchLabel.style.cssText = `position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};opacity:${e2eeEnabled ? '0.5' : '1'};`;
    const webSearchInput = document.createElement('input');
    webSearchInput.type = 'checkbox';
    webSearchInput.checked = webSearchEnabled && !e2eeEnabled;
    webSearchInput.disabled = e2eeEnabled;
    webSearchInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const webSearchSlider = document.createElement('span');
    webSearchSlider.style.cssText = `position:absolute;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};top:0;left:0;right:0;bottom:0;background:${webSearchInput.checked ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const webSearchKnob = document.createElement('span');
    webSearchKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${webSearchInput.checked ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    webSearchSlider.appendChild(webSearchKnob);
    webSearchLabel.appendChild(webSearchInput);
    webSearchLabel.appendChild(webSearchSlider);
    webSearchInput.onchange = (e) => {
        if (e2eeEnabled) return;
        e.stopPropagation();
        const newValue = webSearchInput.checked;
        localStorage.setItem('quickchat_web_search', newValue ? 'true' : 'false');
        webSearchSlider.style.background = newValue ? 'var(--accent)' : '#444';
        webSearchKnob.style.left = newValue ? '16px' : '2px';
        // Update current config if it's a quick chat
        if (!state.currentParentConfig && state.currentConfig) {
            state.currentConfig.enable_web_search = newValue;
        }
    };
    webSearchRow.appendChild(webSearchLabel);

    const webSearchText = document.createElement('span');
    webSearchText.textContent = 'Web Search';
    webSearchText.style.cssText = `flex:1;color:var(--text);font-size:13px;opacity:${e2eeEnabled ? '0.5' : '1'};`;
    if (e2eeEnabled) webSearchText.title = 'Web search is disabled in E2EE mode to prevent data leaks.';
    webSearchRow.appendChild(webSearchText);

    menu.appendChild(webSearchRow);

    // Web Scraping toggle row
    const webScrapeRow = document.createElement('div');
    webScrapeRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    webScrapeRow.onclick = (e) => e.stopPropagation();

    const webScrapeEnabled = localStorage.getItem('quickchat_web_scraping') !== 'false'; // Default true
    const webScrapeLabel = document.createElement('label');
    webScrapeLabel.style.cssText = `position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};opacity:${e2eeEnabled ? '0.5' : '1'};`;
    const webScrapeInput = document.createElement('input');
    webScrapeInput.type = 'checkbox';
    webScrapeInput.checked = webScrapeEnabled && !e2eeEnabled;
    webScrapeInput.disabled = e2eeEnabled;
    webScrapeInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const webScrapeSlider = document.createElement('span');
    webScrapeSlider.style.cssText = `position:absolute;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};top:0;left:0;right:0;bottom:0;background:${webScrapeInput.checked ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const webScrapeKnob = document.createElement('span');
    webScrapeKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${webScrapeInput.checked ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    webScrapeSlider.appendChild(webScrapeKnob);
    webScrapeLabel.appendChild(webScrapeInput);
    webScrapeLabel.appendChild(webScrapeSlider);
    webScrapeInput.onchange = (e) => {
        if (e2eeEnabled) return;
        e.stopPropagation();
        const newValue = webScrapeInput.checked;
        localStorage.setItem('quickchat_web_scraping', newValue ? 'true' : 'false');
        webScrapeSlider.style.background = newValue ? 'var(--accent)' : '#444';
        webScrapeKnob.style.left = newValue ? '16px' : '2px';
        // Update current config if it's a quick chat
        if (!state.currentParentConfig && state.currentConfig) {
            state.currentConfig.enable_web_scraping = newValue;
        }
    };
    webScrapeRow.appendChild(webScrapeLabel);

    const webScrapeText = document.createElement('span');
    webScrapeText.textContent = 'Web Scraping';
    webScrapeText.style.cssText = `flex:1;color:var(--text);font-size:13px;opacity:${e2eeEnabled ? '0.5' : '1'};`;
    if (e2eeEnabled) webScrapeText.title = 'Web scraping is disabled in E2EE mode to prevent data leaks.';
    webScrapeRow.appendChild(webScrapeText);

    menu.appendChild(webScrapeRow);

    // X Search toggle row (Grok models only)
    const currentModel = state.model || document.getElementById('model')?.value || '';
    if (currentModel.toLowerCase().includes('grok')) {
        const xSearchEnabled = localStorage.getItem('quickchat_x_search') === 'true';
        const xSearchRow = document.createElement('div');
        xSearchRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
        xSearchRow.onclick = (e) => e.stopPropagation();

        const xSearchToggleLabel = document.createElement('label');
        xSearchToggleLabel.style.cssText = `position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};opacity:${e2eeEnabled ? '0.5' : '1'};`;
        const xSearchInput = document.createElement('input');
        xSearchInput.type = 'checkbox';
        xSearchInput.checked = xSearchEnabled && !e2eeEnabled;
        xSearchInput.disabled = e2eeEnabled;
        xSearchInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
        const xSearchSlider = document.createElement('span');
        xSearchSlider.style.cssText = `position:absolute;cursor:${e2eeEnabled ? 'not-allowed' : 'pointer'};top:0;left:0;right:0;bottom:0;background:${xSearchInput.checked ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
        const xSearchKnob = document.createElement('span');
        xSearchKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${xSearchInput.checked ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
        xSearchSlider.appendChild(xSearchKnob);
        xSearchToggleLabel.appendChild(xSearchInput);
        xSearchToggleLabel.appendChild(xSearchSlider);
        xSearchInput.onchange = (e) => {
            if (e2eeEnabled) return;
            e.stopPropagation();
            const newValue = xSearchInput.checked;
            localStorage.setItem('quickchat_x_search', newValue ? 'true' : 'false');
            xSearchSlider.style.background = newValue ? 'var(--accent)' : '#444';
            xSearchKnob.style.left = newValue ? '16px' : '2px';
            if (state.currentConfig) state.currentConfig.enable_x_search = newValue;
        };
        xSearchRow.appendChild(xSearchToggleLabel);

        const xSearchText = document.createElement('span');
        xSearchText.textContent = 'X Search';
        xSearchText.style.cssText = `flex:1;color:var(--text);font-size:13px;opacity:${e2eeEnabled ? '0.5' : '1'};`;
        if (e2eeEnabled) xSearchText.title = 'X Search is disabled in E2EE mode to prevent data leaks.';
        xSearchRow.appendChild(xSearchText);

        menu.appendChild(xSearchRow);
    }

    // Strip Thinking (COT) toggle row
    const stripThinkingEnabled = localStorage.getItem('quickchat_strip_thinking') !== 'false'; // Default true
    const stripThinkingRow = document.createElement('div');
    stripThinkingRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    stripThinkingRow.onclick = (e) => e.stopPropagation();

    const stripThinkingLabel = document.createElement('label');
    stripThinkingLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const stripThinkingInput = document.createElement('input');
    stripThinkingInput.type = 'checkbox';
    stripThinkingInput.checked = stripThinkingEnabled;
    stripThinkingInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const stripThinkingSlider = document.createElement('span');
    stripThinkingSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${stripThinkingEnabled ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const stripThinkingKnob = document.createElement('span');
    stripThinkingKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${stripThinkingEnabled ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    stripThinkingSlider.appendChild(stripThinkingKnob);
    stripThinkingLabel.appendChild(stripThinkingInput);
    stripThinkingLabel.appendChild(stripThinkingSlider);
    stripThinkingInput.onchange = (e) => {
        e.stopPropagation();
        const newValue = stripThinkingInput.checked;
        localStorage.setItem('quickchat_strip_thinking', newValue ? 'true' : 'false');
        stripThinkingSlider.style.background = newValue ? 'var(--accent)' : '#444';
        stripThinkingKnob.style.left = newValue ? '16px' : '2px';
        // Update current config if it's a quick chat
        if (!state.currentParentConfig && state.currentConfig) {
            state.currentConfig.strip_thinking = newValue;
        }
    };
    stripThinkingRow.appendChild(stripThinkingLabel);

    const stripThinkingText = document.createElement('span');
    stripThinkingText.textContent = 'Strip Thinking (COT)';
    stripThinkingText.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    stripThinkingRow.appendChild(stripThinkingText);

    menu.appendChild(stripThinkingRow);

    // Disable Thinking (COT) toggle row
    const disableThinkingEnabled = localStorage.getItem('quickchat_disable_thinking') === 'true';
    const disableThinkingRow = document.createElement('div');
    disableThinkingRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    disableThinkingRow.onclick = (e) => e.stopPropagation();

    const disableThinkingLabel = document.createElement('label');
    disableThinkingLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const disableThinkingInput = document.createElement('input');
    disableThinkingInput.type = 'checkbox';
    disableThinkingInput.checked = disableThinkingEnabled;
    disableThinkingInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const disableThinkingSlider = document.createElement('span');
    disableThinkingSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${disableThinkingEnabled ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const disableThinkingKnob = document.createElement('span');
    disableThinkingKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${disableThinkingEnabled ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    disableThinkingSlider.appendChild(disableThinkingKnob);
    disableThinkingLabel.appendChild(disableThinkingInput);
    disableThinkingLabel.appendChild(disableThinkingSlider);
    disableThinkingInput.onchange = (e) => {
        e.stopPropagation();
        const newValue = disableThinkingInput.checked;
        localStorage.setItem('quickchat_disable_thinking', newValue ? 'true' : 'false');
        disableThinkingSlider.style.background = newValue ? 'var(--accent)' : '#444';
        disableThinkingKnob.style.left = newValue ? '16px' : '2px';
        if (!state.currentParentConfig && state.currentConfig) {
            state.currentConfig.disable_thinking = newValue;
        }
    };
    disableThinkingRow.appendChild(disableThinkingLabel);

    const disableThinkingText = document.createElement('span');
    disableThinkingText.textContent = 'Disable Thinking (COT)';
    disableThinkingText.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    disableThinkingRow.appendChild(disableThinkingText);

    menu.appendChild(disableThinkingRow);

    // E2EE toggle row
    const e2eeRow = document.createElement('div');
    e2eeRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    e2eeRow.onclick = (e) => e.stopPropagation();

    const e2eeLabel = document.createElement('label');
    e2eeLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const e2eeInput = document.createElement('input');
    e2eeInput.type = 'checkbox';
    e2eeInput.checked = e2eeEnabled;
    e2eeInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const e2eeSlider = document.createElement('span');
    e2eeSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${e2eeEnabled ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const e2eeKnob = document.createElement('span');
    e2eeKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${e2eeEnabled ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    e2eeSlider.appendChild(e2eeKnob);
    e2eeLabel.appendChild(e2eeInput);
    e2eeLabel.appendChild(e2eeSlider);
    e2eeInput.onchange = (e) => {
        e.stopPropagation();
        const newValue = e2eeInput.checked;
        localStorage.setItem('quickchat_e2ee', newValue ? 'true' : 'false');
        e2eeSlider.style.background = newValue ? 'var(--accent)' : '#444';
        e2eeKnob.style.left = newValue ? '16px' : '2px';
        if (state.currentConfig) state.currentConfig.enable_e2ee = newValue;
        filterModelDropdownForE2EE(newValue);
    };
    e2eeRow.appendChild(e2eeLabel);

    const e2eeText = document.createElement('span');
    e2eeText.textContent = 'E2EE (Venice TEE)';
    e2eeText.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    e2eeRow.appendChild(e2eeText);

    menu.appendChild(e2eeRow);

    // Manage Models button
    const manageModelsBtn = document.createElement('button');
    manageModelsBtn.classList.add('context-menu-item');
    manageModelsBtn.textContent = 'Manage Models';
    manageModelsBtn.onclick = () => {
        menu.remove();
        showModelManager();
    };
    menu.appendChild(manageModelsBtn);

    // Writing Tools button
    const writingToolsBtn = document.createElement('button');
    writingToolsBtn.classList.add('context-menu-item');
    writingToolsBtn.textContent = 'Writing Tools';
    writingToolsBtn.onclick = () => {
        menu.remove();
        showWritingToolsModal();
    };
    menu.appendChild(writingToolsBtn);

    // Memory Settings button
    const memSettingsBtn = document.createElement('button');
    memSettingsBtn.classList.add('context-menu-item');
    memSettingsBtn.textContent = 'Memory Settings';
    memSettingsBtn.onclick = () => {
        menu.remove();
        showMemorySettingsModal();
    };
    menu.appendChild(memSettingsBtn);

    // Agent Chat button
    const agentChatBtn = document.createElement('button');
    agentChatBtn.classList.add('context-menu-item');
    agentChatBtn.textContent = 'Agent Chat';
    agentChatBtn.onclick = () => {
        menu.remove();
        import('../components/DualModelManager.js').then(module => {
            module.dualModelManager.openModal();
        });
    };
    menu.appendChild(agentChatBtn);

    // Design Tools section
    const designSep = document.createElement('div');
    designSep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(designSep);

    const designActive = localStorage.getItem('lagoon_design_mode') === 'true';
    const designRow = document.createElement('div');
    designRow.style.cssText = 'display:flex;align-items:center;padding:6px 12px;gap:8px;';
    designRow.onclick = e => e.stopPropagation();

    const designLabel = document.createElement('label');
    designLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';
    const designInput = document.createElement('input');
    designInput.type = 'checkbox';
    designInput.id = 'design-mode-toggle';
    designInput.checked = designActive;
    designInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const designSlider = document.createElement('span');
    designSlider.style.cssText = `position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${designActive ? 'var(--accent)' : '#444'};transition:.2s;border-radius:18px;`;
    const designKnob = document.createElement('span');
    designKnob.style.cssText = `position:absolute;height:14px;width:14px;left:${designActive ? '16px' : '2px'};bottom:2px;background:white;transition:.2s;border-radius:50%;`;
    designSlider.appendChild(designKnob);
    designLabel.appendChild(designInput);
    designLabel.appendChild(designSlider);
    designInput.onchange = async (e) => {
        e.stopPropagation();
        const on = designInput.checked;
        designSlider.style.background = on ? 'var(--accent)' : '#444';
        designKnob.style.left = on ? '16px' : '2px';
        const { designMode } = await import('../design_mode.js');
        if (on) {
            menu.remove();
            designMode.enable();
        } else {
            designMode.disable();
        }
    };
    designRow.appendChild(designLabel);

    const designText = document.createElement('span');
    designText.textContent = 'Design Mode';
    designText.style.cssText = 'flex:1;color:var(--text);font-size:13px;';
    designRow.appendChild(designText);
    menu.appendChild(designRow);

    // Ollama section
    const ollamaSep = document.createElement('div');
    ollamaSep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(ollamaSep);

    const ollamaSection = document.createElement('div');
    ollamaSection.classList.add('settings-section');
    ollamaSection.onclick = e => e.stopPropagation();

    const ollamaTitle = document.createElement('div');
    ollamaTitle.classList.add('settings-section-title');
    ollamaTitle.textContent = 'Local (Ollama)';
    ollamaSection.appendChild(ollamaTitle);

    const ollamaRow = document.createElement('div');
    ollamaRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const ollamaInput = document.createElement('input');
    ollamaInput.type = 'text';
    ollamaInput.placeholder = 'http://localhost:11434';
    ollamaInput.value = localStorage.getItem('ollama_base_url') || '';
    ollamaInput.style.cssText = 'flex:1;padding:4px 8px;font-size:12px;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:4px;color:var(--text-main);min-width:0;';
    ollamaInput.onclick = e => e.stopPropagation();

    const ollamaSyncBtn = document.createElement('button');
    ollamaSyncBtn.textContent = 'Sync';
    ollamaSyncBtn.classList.add('tool-btn-sm');
    ollamaSyncBtn.onclick = async (e) => {
        e.stopPropagation();
        const url = ollamaInput.value.trim() || 'http://localhost:11434';
        localStorage.setItem('ollama_base_url', url);
        ollamaSyncBtn.textContent = '...';
        ollamaSyncBtn.disabled = true;
        try {
            const { fetchLocalModels } = await import('../api.js');
            const result = await fetchLocalModels(url);
            if (result.models?.length) {
                localStorage.setItem('ollama_models', JSON.stringify(result.models));
                window.syncOllamaModels?.(result.models);
                ollamaSyncBtn.textContent = `✓ ${result.models.length}`;
            } else {
                ollamaSyncBtn.textContent = result.error ? 'Error' : 'None';
            }
        } catch {
            ollamaSyncBtn.textContent = 'Error';
        }
        ollamaSyncBtn.disabled = false;
        setTimeout(() => { ollamaSyncBtn.textContent = 'Sync'; }, 2500);
    };

    ollamaRow.appendChild(ollamaInput);
    ollamaRow.appendChild(ollamaSyncBtn);
    ollamaSection.appendChild(ollamaRow);
    menu.appendChild(ollamaSection);

    // Custom Endpoints section
    const ceSep = document.createElement('div');
    ceSep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(ceSep);

    const ceSection = document.createElement('div');
    ceSection.classList.add('settings-section');
    ceSection.onclick = e => e.stopPropagation();

    const ceTitle = document.createElement('div');
    ceTitle.classList.add('settings-section-title');
    ceTitle.textContent = 'Custom Endpoints';
    ceSection.appendChild(ceTitle);

    async function renderCeList() {
        ceSection.querySelectorAll('.ce-entry').forEach(el => el.remove());
        const endpoints = await fetchCustomEndpoints();
        endpoints.forEach(ep => {
            const row = document.createElement('div');
            row.className = 'ce-entry';
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
            const label = document.createElement('span');
            label.textContent = ep.name;
            label.style.cssText = 'flex:1;font-size:12px;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.classList.add('tool-btn-sm');
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                await deleteCustomEndpoint(ep.id);
                window.syncCustomEndpoints?.();
                renderCeList();
            };
            row.appendChild(label);
            row.appendChild(delBtn);
            ceSection.appendChild(row);
        });
    }
    renderCeList();

    const addCeBtn = document.createElement('button');
    addCeBtn.textContent = '+ Add Endpoint';
    addCeBtn.classList.add('tool-btn-sm');
    addCeBtn.style.marginTop = '6px';
    addCeBtn.onclick = async (e) => {
        e.stopPropagation();
        const name = await lagoonPrompt('Display name (e.g. "KoboldCpp"):', '');
        if (!name) return;
        const baseUrl = await lagoonPrompt('Base URL (e.g. http://localhost:5001/v1):', '');
        if (!baseUrl) return;
        const modelId = await lagoonPrompt('Model ID to send in requests\n(check your tool\'s docs — can often be anything):', '');
        if (!modelId) return;
        const apiKey = await lagoonPrompt('API key (leave blank if none):', '') || '';
        const id = crypto.randomUUID();
        await saveCustomEndpoint({ id, name, base_url: baseUrl.trim(), model_id: modelId.trim(), api_key: apiKey });
        window.syncCustomEndpoints?.();
        renderCeList();
    };
    ceSection.appendChild(addCeBtn);
    menu.appendChild(ceSection);

    document.body.appendChild(menu);

    // Convert native selects to custom dropdowns for full CSS control
    uiManager.initCustomDropdown(themeSelect);
    uiManager.initCustomDropdown(fontSelect);
    uiManager.initCustomDropdown(providerSelect);
    uiManager.initCustomDropdown(voiceSelect);
    const vcont = voiceSelect.previousSibling;
    if (vcont?.className === 'custom-dropdown-container') vcont.style.flex = '1';

    // Smart positioning
    const menuRect = menu.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    menu.style.left = `${rect.left}px`;
    
    if (spaceBelow >= menuRect.height + 10) {
        menu.style.top = `${rect.bottom + 5}px`;
    } else {
        menu.style.top = `${rect.top - menuRect.height - 5}px`;
    }
}

// Desktop TTS Initialization and Controls
function initDesktopTTS() {
    const desktopProviderSelect = document.getElementById('desktop_tts_provider');
    const desktopVoiceSelect = document.getElementById('desktop_tts_voice');
    const desktopTestBtn = document.getElementById('desktop_test_voice_btn');
    const desktopAutoReadToggle = document.getElementById('desktop_auto_read');

    if (!desktopProviderSelect || !desktopVoiceSelect || !desktopTestBtn) return;

    // Load saved settings
    const savedProvider = localStorage.getItem('desktop_tts_provider') || 'venice';
    const savedVoice = localStorage.getItem('desktop_tts_voice');
    const savedAutoRead = localStorage.getItem('desktop_auto_read') === 'true';

    desktopProviderSelect.value = savedProvider;
    desktopAutoReadToggle.checked = savedAutoRead;

    // Update voice options based on provider
    async function updateDesktopVoiceOptions() {
        const { VENICE_VOICES, GOOGLE_VOICES, DEFAULT_VOICE, DEFAULT_GOOGLE_VOICE } = await import('../core/TTSConfig.js');
        desktopVoiceSelect.innerHTML = '';
        
        const voices = desktopProviderSelect.value === 'google' ? GOOGLE_VOICES : VENICE_VOICES;
        const defaultVoice = desktopProviderSelect.value === 'google' ? DEFAULT_GOOGLE_VOICE : DEFAULT_VOICE;
        
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            desktopVoiceSelect.appendChild(option);
        });

        // Set saved voice or default
        const voiceToUse = savedVoice && voices.find(v => v.id === savedVoice) ? savedVoice : defaultVoice;
        desktopVoiceSelect.value = voiceToUse;

        // Sync custom dropdown (init on first call, update on subsequent)
        uiManager.updateCustomDropdown(desktopVoiceSelect);
        // Preserve flex:1 layout after container is injected
        const voiceContainer = desktopVoiceSelect.previousSibling;
        if (voiceContainer?.className === 'custom-dropdown-container') {
            voiceContainer.style.flex = '1';
        }

        // Update audio service
        import('../services/AudioService.js').then(module => {
            module.audioService.setProvider(desktopProviderSelect.value);
            module.audioService.setVoice(voiceToUse);
            if (savedAutoRead) {
                module.audioService.setAutoRead(true);
            }
        });
    }

    // Initialize voice options
    updateDesktopVoiceOptions();

    // Event listeners
    desktopProviderSelect.addEventListener('change', () => {
        localStorage.setItem('desktop_tts_provider', desktopProviderSelect.value);
        updateDesktopVoiceOptions();
    });

    desktopVoiceSelect.addEventListener('change', () => {
        localStorage.setItem('desktop_tts_voice', desktopVoiceSelect.value);
        import('../services/AudioService.js').then(module => {
            module.audioService.setVoice(desktopVoiceSelect.value);
        });
    });

    // Test Voice Message Logic
    const testVoiceModal = document.getElementById('test-voice-modal');
    const testVoiceInput = document.getElementById('test-voice-input');
    const saveTestVoiceBtn = document.getElementById('save-test-voice-btn');
    const cancelTestVoiceBtn = document.getElementById('cancel-test-voice-btn');

    // Load saved test message or default
    let testMessage = localStorage.getItem('desktop_test_voice_message') || "This is a test of the audio system.";

    desktopTestBtn.addEventListener('click', () => {
        import('../services/AudioService.js').then(module => {
            module.audioService.unlock();
            module.audioService.speak(testMessage);
        }).catch(err => {
            console.error('Failed to load AudioService:', err);
        });
    });

    if (testVoiceModal && saveTestVoiceBtn && cancelTestVoiceBtn) {
        const closeTestModal = () => {
            testVoiceModal.classList.add('hidden');
        };

        cancelTestVoiceBtn.addEventListener('click', closeTestModal);

        saveTestVoiceBtn.addEventListener('click', () => {
            const newValue = testVoiceInput.value.trim();
            if (newValue) {
                testMessage = newValue;
                localStorage.setItem('desktop_test_voice_message', testMessage);
            }
            closeTestModal();
        });
        
        // Close on outside click
        testVoiceModal.addEventListener('click', (e) => {
            if (e.target === testVoiceModal) {
                closeTestModal();
            }
        });
    }

    desktopAutoReadToggle.addEventListener('change', () => {
        localStorage.setItem('desktop_auto_read', desktopAutoReadToggle.checked);
        import('../services/AudioService.js').then(module => {
            module.audioService.setAutoRead(desktopAutoReadToggle.checked);
        });
    });
}

// Initialize desktop TTS when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopTTS);
} else {
    initDesktopTTS();
}

/**
 * Switch the application layout between 'chat', 'image', and 'video' mode.
 */
export function toggleAppMode() {
    // Reset all mode-specific elements first
    const modeSpecificElements = document.querySelectorAll('.mode-image-only, .mode-video-only');
    modeSpecificElements.forEach(el => el.style.display = ''); // Use empty string to let CSS take over
    document.body.classList.remove('mode-image', 'mode-video');

    // Sidebar Content Elements
    const leftHeader = document.getElementById('sidebar-header');
    const leftTabs = document.querySelector('.sidebar-left .sidebar-tabs');
    const leftContent = document.getElementById('sidebar-content');
    const leftFooter = document.getElementById('sidebar-footer');

    const rightHeader = document.getElementById('right-sidebar-header');
    const rightTabs = document.querySelector('.sidebar-right .sidebar-tabs');
    const rightContent = document.getElementById('right-sidebar-content');

    // Default: Show chat elements (will be overridden if not in chat mode)
    const showChatElements = (show) => {
        const display = show ? '' : 'none';
        if (leftHeader) leftHeader.style.display = display;
        if (leftTabs) leftTabs.style.display = display;
        if (leftContent) leftContent.style.display = display;
        if (leftFooter) leftFooter.style.display = display;

        // Hide right header by default
        if (rightHeader) rightHeader.style.display = display;

        if (rightTabs) rightTabs.style.display = display;
        if (rightContent) rightContent.style.display = display;
    };

    switch (state.mode) {
        case 'image':
            showChatElements(false);
            document.body.classList.add('mode-image');
            if (rightHeader) rightHeader.style.display = '';
            {
                const eb = document.getElementById('export-btn');
                if (eb) {
                    eb.title = 'Export kept messages';
                    const svg = eb.querySelector('svg');
                    if (svg) svg.outerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                }
            }
            break;

        case 'video':
            showChatElements(false);
            document.body.classList.add('mode-video');
            if (rightHeader) rightHeader.style.display = '';
            {
                const eb = document.getElementById('export-btn');
                if (eb) {
                    eb.title = 'WebM Tools';
                    eb.disabled = false;
                    const svg = eb.querySelector('svg');
                    if (svg) svg.outerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>';
                }
            }
            break;

        case 'chat':
        default:
            showChatElements(true);
            {
                const eb = document.getElementById('export-btn');
                if (eb) {
                    eb.title = 'Export kept messages';
                    const svg = eb.querySelector('svg');
                    if (svg) svg.outerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                }
            }
            break;
    }

    // Update model dropdown since valid models change per mode
    import('../core/InstalledModels.js').then(models => {
        const modelSelect = document.getElementById('model');
        if (modelSelect) {
            models.populateSelect(modelSelect);
            uiManager.updateCustomDropdown(modelSelect);
            
            // Ensure the model button text reflects the current mode's model
            import('../components/ChatManager.js').then(cm => {
                if (cm.chatManager) cm.chatManager.updateModelButtonText();
            });

            if (state.mode === 'video') {
                if (state.videoProvider === 'together') {
                    togetherVideoModeManager.refreshParameterPanel();
                } else {
                    videoModeManager.refreshParameterPanel();
                }
            }
        }
    });

    if (imageModeManager) imageModeManager.syncContextFileBtn();
    console.log(`[Lagoon] Mode switched to: ${state.mode}`);
}