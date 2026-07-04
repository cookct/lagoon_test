/**
 * Z.AI Options Manager
 * Controls the Z.AI Options modal and persists user preferences to localStorage.
 * Preferences are injected into the chat config when a z.ai model is selected.
 */

const STORAGE_KEY = 'zai_options';

const DEFAULTS = {
    reasoning_effort: 'max',
    enable_thinking: true,
    do_sample: true,
    max_tokens: 65536,
    use_top_p: false,
    stream: true,
};

export const zaiOptionsManager = {
    _initialized: false,

    init() {
        if (this._initialized) return;
        this.bindEvents();
        this._initialized = true;
        console.log('[ZaiOptionsManager] Initialized');
    },

    bindEvents() {
        const modal = document.getElementById('zai-options-modal');
        if (!modal) {
            console.warn('[ZaiOptionsManager] Modal element not found');
            return;
        }

        // Close — header Close button, Cancel button, backdrop click, Escape key
        document.getElementById('zai-options-close-btn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('zai-options-cancel-btn')?.addEventListener('click', () => this.closeModal());
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) this.closeModal();
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });

        // Save button
        document.getElementById('zai-options-save-btn')?.addEventListener('click', () => this.saveConfig());
    },

    openModal() {
        const modal = document.getElementById('zai-options-modal');
        if (!modal) return;

        // Populate fields from stored config
        const cfg = this.getConfig();
        const effortEl = document.getElementById('zai-reasoning-effort');
        const thinkingEl = document.getElementById('zai-enable-thinking');
        const doSampleEl = document.getElementById('zai-do-sample');
        const maxTokensEl = document.getElementById('zai-max-tokens');
        const useTopPEl = document.getElementById('zai-use-top-p');

        const streamEl = document.getElementById('zai-stream');

        if (effortEl) effortEl.value = cfg.reasoning_effort;
        if (thinkingEl) thinkingEl.checked = cfg.enable_thinking;
        if (doSampleEl) doSampleEl.checked = cfg.do_sample;
        if (maxTokensEl) maxTokensEl.value = cfg.max_tokens;
        if (useTopPEl) useTopPEl.checked = cfg.use_top_p;
        if (streamEl) streamEl.checked = cfg.stream;

        modal.classList.remove('hidden');
    },

    closeModal() {
        const modal = document.getElementById('zai-options-modal');
        if (modal) modal.classList.add('hidden');
    },

    saveConfig() {
        const effortEl = document.getElementById('zai-reasoning-effort');
        const thinkingEl = document.getElementById('zai-enable-thinking');
        const doSampleEl = document.getElementById('zai-do-sample');
        const maxTokensEl = document.getElementById('zai-max-tokens');
        const useTopPEl = document.getElementById('zai-use-top-p');
        const streamEl = document.getElementById('zai-stream');

        const cfg = {
            reasoning_effort: effortEl?.value || DEFAULTS.reasoning_effort,
            enable_thinking: thinkingEl?.checked ?? DEFAULTS.enable_thinking,
            do_sample: doSampleEl?.checked ?? DEFAULTS.do_sample,
            max_tokens: parseInt(maxTokensEl?.value, 10) || DEFAULTS.max_tokens,
            use_top_p: useTopPEl?.checked ?? DEFAULTS.use_top_p,
            stream: streamEl?.checked ?? DEFAULTS.stream,
        };

        // Clamp max_tokens to valid range
        if (cfg.max_tokens < 1024) cfg.max_tokens = 1024;
        if (cfg.max_tokens > 131072) cfg.max_tokens = 131072;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        } catch (e) {
            console.error('[ZaiOptionsManager] Failed to save config:', e);
        }

        this.closeModal();
        console.log('[ZaiOptionsManager] Saved config:', cfg);
    },

    /**
     * Returns the stored z.ai options, merged with defaults.
     * Called by the chat-send code to inject z.ai params into the request.
     */
    getConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { ...DEFAULTS };
            const parsed = JSON.parse(raw);
            return { ...DEFAULTS, ...parsed };
        } catch (e) {
            console.error('[ZaiOptionsManager] Failed to parse stored config:', e);
            return { ...DEFAULTS };
        }
    },
};