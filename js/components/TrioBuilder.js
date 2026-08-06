/**
 * TrioBuilder - GUI for creating and launching trio chat sessions.
 *
 * Lets the user pick two existing character configs, define their
 * relationship dynamics, set emotional states, toggle session options,
 * and save as a launchable trio config that appears in the sidebar.
 */
import { state } from '../state.js';
import { fetchConfigs, fetchConfig, saveConfigApi } from '../api.js';
import { lagoonAlert } from '../ui/dialog.js';
import { refreshSidebar } from '../ui/sidebar.js';
import { getInstalledModels, populateSelect } from '../core/InstalledModels.js';
import { uiManager } from '../core/UIManager.js';

class TrioBuilder {
    constructor() {
        this._dom = {};
        this._editingFilename = null;
    }

    init() {
        this._dom = {
            modal: document.getElementById('trio-builder-modal'),
            form: document.getElementById('trio-builder-form'),
            sessionName: document.getElementById('trio-session-name'),
            charA: document.getElementById('trio-char-a'),
            charB: document.getElementById('trio-char-b'),
            model: document.getElementById('trio-model'),
            temperature: document.getElementById('trio-temperature'),
            tempValue: document.getElementById('trio-temp-value'),
            maxTokens: document.getElementById('trio-max-tokens'),
            dynamicAB: document.getElementById('trio-dynamic-ab'),
            dynamicBA: document.getElementById('trio-dynamic-ba'),
            history: document.getElementById('trio-history'),
            moodA: document.getElementById('trio-mood-a'),
            moodB: document.getElementById('trio-mood-b'),
            interrupts: document.getElementById('trio-interrupts'),
            passive: document.getElementById('trio-passive'),
            emotional: document.getElementById('trio-emotional'),
            ambient: document.getElementById('trio-ambient'),
            stripThinking: document.getElementById('trio-strip-thinking'),
            maxConsecutive: document.getElementById('trio-max-consecutive'),
            lttRounds: document.getElementById('trio-ltt-rounds'),
            patienceA: document.getElementById('trio-patience-a'),
            patienceB: document.getElementById('trio-patience-b'),
            cancelBtn: document.getElementById('trio-cancel-btn'),
            saveBtn: document.getElementById('trio-save-btn'),
        };

        this._dom.cancelBtn?.addEventListener('click', () => this._close());
        this._dom.saveBtn?.addEventListener('click', () => this._handleSave());
        this._dom.temperature?.addEventListener('input', () => {
            this._dom.tempValue.textContent = parseFloat(this._dom.temperature.value).toFixed(2);
        });

        console.log('[TrioBuilder] Initialized');
    }

    /**
     * Open the builder. If configFilename is provided, load that trio config
     * for editing. Otherwise, start fresh.
     */
    async open(configFilename = null) {
        this._editingFilename = configFilename;
        await this._populateDropdowns();

        if (configFilename) {
            await this._loadConfigToForm(configFilename);
        } else {
            this._resetForm();
        }

        this._dom.modal.classList.remove('hidden');
    }

    _close() {
        this._dom.modal.classList.add('hidden');
    }

    _resetForm() {
        this._dom.sessionName.value = '';
        this._dom.charA.value = '';
        this._dom.charB.value = '';
        this._dom.temperature.value = 0.8;
        this._dom.tempValue.textContent = '0.80';
        this._dom.maxTokens.value = 2048;
        this._dom.dynamicAB.value = '';
        this._dom.dynamicBA.value = '';
        this._dom.history.value = '';
        this._dom.moodA.value = 'neutral';
        this._dom.moodB.value = 'neutral';
        this._dom.interrupts.checked = true;
        this._dom.passive.checked = true;
        this._dom.emotional.checked = true;
        this._dom.ambient.checked = false;
        this._dom.stripThinking.checked = true;
        this._dom.maxConsecutive.value = 2;
        this._dom.lttRounds.value = 2;
        this._dom.patienceA.value = 400;
        this._dom.patienceB.value = 400;

        // Default to current model if available
        if (state.currentConfig?.model) {
            this._dom.model.value = state.currentConfig.model;
        }
    }

    async _populateDropdowns() {
        // Populate character dropdowns
        const configs = await fetchConfigs();
        const charOptions = ['<option value="">— Select —</option>'];
        for (const configFile of configs) {
            // Skip non-character configs
            if (configFile === 'dual-model') continue;
            const configData = await fetchConfig(configFile);
            if (!configData) continue;
            // Skip trio configs from the character list
            if (configData.mode === 'trio') continue;
            const name = configData.character_name || configFile.replace('.json', '');
            charOptions.push(`<option value="${configFile}">${name}</option>`);
        }
        this._dom.charA.innerHTML = charOptions.join('');
        this._dom.charB.innerHTML = charOptions.join('');

        // Populate model dropdown using SSOT system (groups by provider)
        populateSelect(this._dom.model);

        // Initialize custom dropdowns for all selects
        uiManager.initCustomDropdown(this._dom.charA);
        uiManager.initCustomDropdown(this._dom.charB);
        uiManager.initCustomDropdown(this._dom.model);
    }

    async _loadConfigToForm(configFilename) {
        const configData = await fetchConfig(configFilename);
        if (!configData) {
            await lagoonAlert('Failed to load trio config');
            return;
        }

        this._dom.sessionName.value = configFilename.replace('.json', '');
        this._dom.temperature.value = configData.temperature || 0.8;
        this._dom.tempValue.textContent = parseFloat(this._dom.temperature.value).toFixed(2);
        this._dom.maxTokens.value = configData.max_tokens || 2048;
        this._dom.dynamicAB.value = configData.dynamic?.a_to_b || '';
        this._dom.dynamicBA.value = configData.dynamic?.b_to_a || '';
        this._dom.history.value = configData.dynamic?.history_summary || '';
        this._dom.moodA.value = configData.emotional_state?.a?.current || 'neutral';
        this._dom.moodB.value = configData.emotional_state?.b?.current || 'neutral';
        this._dom.interrupts.checked = configData.interruptions_enabled ?? true;
        this._dom.passive.checked = configData.passive_presence_enabled ?? true;
        this._dom.emotional.checked = configData.emotional_tracking_enabled ?? true;
        this._dom.ambient.checked = configData.ambient_responses ?? false;
        this._dom.stripThinking.checked = configData.strip_thinking ?? true;
        this._dom.maxConsecutive.value = configData.max_consecutive_turns || 2;
        this._dom.lttRounds.value = configData.let_them_talk_rounds || 2;

        // Set character selects
        const participants = configData.participants || [];
        if (participants[0]) {
            const cfgA = typeof participants[0] === 'string' ? participants[0] : participants[0].config_name + '.json';
            this._dom.charA.value = cfgA;
        }
        if (participants[1]) {
            const cfgB = typeof participants[1] === 'string' ? participants[1] : participants[1].config_name + '.json';
            this._dom.charB.value = cfgB;
        }

        // Set model
        if (configData.model) {
            this._dom.model.value = configData.model;
        }

        // Patience thresholds from participant overrides
        if (participants[0]?.patience_threshold) this._dom.patienceA.value = participants[0].patience_threshold;
        if (participants[1]?.patience_threshold) this._dom.patienceB.value = participants[1].patience_threshold;
    }

    async _handleSave() {
        const sessionName = this._dom.sessionName.value.trim();
        if (!sessionName) {
            await lagoonAlert('Session name is required');
            return;
        }
        const charAFile = this._dom.charA.value;
        const charBFile = this._dom.charB.value;
        if (!charAFile || !charBFile) {
            await lagoonAlert('Please select both characters');
            return;
        }
        if (charAFile === charBFile) {
            await lagoonAlert('Please select two different characters');
            return;
        }

        // Load both character configs to get their labels, colors, etc.
        const [cfgA, cfgB] = await Promise.all([
            fetchConfig(charAFile),
            fetchConfig(charBFile),
        ]);
        if (!cfgA || !cfgB) {
            await lagoonAlert('Failed to load one or both character configs');
            return;
        }

        const labelA = cfgA.trio_label || this._deriveLabel(cfgA.character_name || charAFile);
        const labelB = cfgB.trio_label || this._deriveLabel(cfgB.character_name || charBFile);

        const configData = {
            mode: 'trio',
            character_name: sessionName,
            model: this._dom.model.value,
            temperature: parseFloat(this._dom.temperature.value),
            max_tokens: parseInt(this._dom.maxTokens.value, 10) || 2048,
            participants: [
                {
                    config_name: charAFile.replace('.json', ''),
                    label: labelA,
                    display_name: cfgA.character_name || charAFile.replace('.json', ''),
                    trio_color: cfgA.trio_color || '#e85d4a',
                    avatar_url: cfgA.avatar_url || '',
                    patience_threshold: parseInt(this._dom.patienceA.value, 10) || 400,
                },
                {
                    config_name: charBFile.replace('.json', ''),
                    label: labelB,
                    display_name: cfgB.character_name || charBFile.replace('.json', ''),
                    trio_color: cfgB.trio_color || '#4a9eff',
                    avatar_url: cfgB.avatar_url || '',
                    patience_threshold: parseInt(this._dom.patienceB.value, 10) || 400,
                },
            ],
            dynamic: {
                a_to_b: this._dom.dynamicAB.value.trim(),
                b_to_a: this._dom.dynamicBA.value.trim(),
                history_summary: this._dom.history.value.trim(),
            },
            emotional_state: {
                a: { current: this._dom.moodA.value, energy: 'medium', toward_other: 'neutral', toward_user: 'neutral' },
                b: { current: this._dom.moodB.value, energy: 'medium', toward_other: 'neutral', toward_user: 'neutral' },
            },
            interruptions_enabled: this._dom.interrupts.checked,
            passive_presence_enabled: this._dom.passive.checked,
            emotional_tracking_enabled: this._dom.emotional.checked,
            ambient_responses: this._dom.ambient.checked,
            strip_thinking: this._dom.stripThinking.checked,
            max_consecutive_turns: parseInt(this._dom.maxConsecutive.value, 10) || 2,
            let_them_talk_rounds: parseInt(this._dom.lttRounds.value, 10) || 2,
        };

        try {
            await saveConfigApi(sessionName, configData);
            this._close();
            await refreshSidebar();
            // Launch the trio session immediately
            const { chatManager } = await import('./ChatManager.js');
            chatManager.startNewChatSession(configData, `${sessionName}.json`);
        } catch (error) {
            await lagoonAlert(`Error saving trio config: ${error.message}`);
        }
    }

    _deriveLabel(name) {
        return name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';
    }
}

export const trioBuilder = new TrioBuilder();
