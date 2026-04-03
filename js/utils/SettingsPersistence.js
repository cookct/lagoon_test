/**
 * Settings Persistence Module
 * Saves and restores all desktop settings to localStorage
 */

const SETTINGS_KEY = 'lagoon_desktop_settings';

const DEFAULT_SETTINGS = {
    temperature: 0.7,
    top_p: 1.0,
    repetition_penalty: 1.0,
    max_tokens: 4096,
    enable_web_search: false,
    include_venice_system_prompt: true,
    uncensored_mode: false,
    strip_thinking: false,
    desktop_auto_read: false,
    desktop_tts_provider: 'venice',
    desktop_tts_voice: 'af_sky'
};

export class SettingsPersistence {
    constructor() {
        this.settings = this.loadSettings();
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch (err) {
            console.error('[SettingsPersistence] Error loading settings:', err);
        }
        return { ...DEFAULT_SETTINGS };
    }

    /**
     * Save settings to localStorage
     */
    saveSettings(settings) {
        try {
            this.settings = { ...this.settings, ...settings };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
            console.log('[SettingsPersistence] Settings saved:', this.settings);
        } catch (err) {
            console.error('[SettingsPersistence] Error saving settings:', err);
        }
    }

    /**
     * Get a specific setting value
     */
    getSetting(key) {
        return this.settings[key] ?? DEFAULT_SETTINGS[key];
    }

    /**
     * Set a specific setting value
     */
    setSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings({ [key]: value });
    }

    /**
     * Restore settings to form elements
     */
    restoreToForm() {
        console.log('[SettingsPersistence] Restoring settings to form...');

        // Sliders
        const temperature = document.getElementById('temperature');
        const topP = document.getElementById('top_p');
        const repetitionPenalty = document.getElementById('repetition_penalty');
        const maxTokens = document.getElementById('max_tokens');

        if (temperature) {
            temperature.value = this.getSetting('temperature');
            const tempValue = document.getElementById('temp-value');
            if (tempValue) tempValue.textContent = parseFloat(temperature.value).toFixed(2);
        }

        if (topP) {
            topP.value = this.getSetting('top_p');
            const topPValue = document.getElementById('top-p-value');
            if (topPValue) topPValue.textContent = parseFloat(topP.value).toFixed(2);
        }

        if (repetitionPenalty) {
            repetitionPenalty.value = this.getSetting('repetition_penalty');
            const repPenValue = document.getElementById('rep-pen-value');
            if (repPenValue) repPenValue.textContent = parseFloat(repetitionPenalty.value).toFixed(2);
        }

        if (maxTokens) {
            maxTokens.value = this.getSetting('max_tokens');
        }

        // Checkboxes
        const checkboxes = [
            'enable_web_search',
            'include_venice_system_prompt',
            'uncensored_mode',
            'strip_thinking',
            'desktop_auto_read'
        ];

        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = this.getSetting(id);
            }
        });

        console.log('[SettingsPersistence] Settings restored');
    }

    /**
     * Attach change listeners to form elements
     */
    attachListeners() {
        console.log('[SettingsPersistence] Attaching change listeners...');

        // Sliders
        const sliders = [
            { id: 'temperature', key: 'temperature' },
            { id: 'top_p', key: 'top_p' },
            { id: 'repetition_penalty', key: 'repetition_penalty' }
        ];

        sliders.forEach(({ id, key }) => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', () => {
                    this.setSetting(key, parseFloat(slider.value));
                });
            }
        });

        // Max tokens
        const maxTokens = document.getElementById('max_tokens');
        if (maxTokens) {
            maxTokens.addEventListener('change', () => {
                this.setSetting('max_tokens', parseInt(maxTokens.value));
            });
        }

        // Checkboxes
        const checkboxes = [
            'enable_web_search',
            'include_venice_system_prompt',
            'uncensored_mode',
            'strip_thinking',
            'desktop_auto_read'
        ];

        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    this.setSetting(id, checkbox.checked);
                });
            }
        });

        console.log('[SettingsPersistence] Listeners attached');
    }

    /**
     * Initialize persistence system
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.restoreToForm();
                this.attachListeners();
            });
        } else {
            this.restoreToForm();
            this.attachListeners();
        }
    }
}

// Export singleton instance
export const settingsPersistence = new SettingsPersistence();
