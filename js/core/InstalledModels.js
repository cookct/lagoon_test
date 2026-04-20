/**
 * Installed Models — Single Source of Truth
 * All model dropdowns in the app populate from this module.
 */

import { state } from '../state.js';
import { modelConfigs } from './modelConfigs.js';

let _models = [];

function getVideoModels() {
    return Object.entries(modelConfigs.models)
        .filter(([, cfg]) => cfg.category === 'image-to-video' || cfg.category === 'text-to-video')
        .map(([id, cfg]) => ({
            id,
            name: cfg.display_name || id,
            provider: cfg.provider || 'venice',
            category: cfg.category,
        }));
}

export async function initInstalledModels() {
    try {
        const r = await fetch('/api/installed_models');
        const data = await r.json();
        _models = data.models || [];
    } catch (e) {
        console.error('[InstalledModels] Failed to load:', e);
        _models = [];
    }
}

/**
 * Filter models based on the current application mode.
 * @returns {Array} List of models for the current mode.
 */
export function filterModels() {
    if (state.mode === 'video') {
        return getVideoModels();
    }
    return _models;
}

export function getInstalledModels() {
    return filterModels();
}

export function getDisplayName(id) {
    const models = filterModels();
    return models.find(m => m.id === id)?.name ?? id;
}

export function getDefaultModel() {
    const models = filterModels();
    return models.find(m => m.default)?.id ?? models[0]?.id ?? '';
}

/**
 * Populate a <select> element from installed models based on current mode.
...
 */
export function populateSelect(selectEl, { includeBlank = false, blankLabel = '' } = {}) {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = '';
    
    const models = filterModels();
    
    if (models.length === 0) {
        const opt = new Option(state.mode === 'video' ? 'No video models yet' : 'No models — use + to add', '');
        opt.disabled = true;
        selectEl.appendChild(opt);
        return;
    }
    if (includeBlank) {
        const blank = new Option(blankLabel, '');
        selectEl.appendChild(blank);
    }

    // Group by provider
    const groups = {};
    models.forEach(m => {
        const p = m.provider || 'other';
        if (!groups[p]) groups[p] = [];
        groups[p].push(m);
    });

    const providerLabels = { venice: 'venice.ai', together: 'together.ai', zai: 'z.ai', ollama: 'Ollama', custom: 'Custom' };
    Object.entries(groups).forEach(([provider, groupModels]) => {
        const group = document.createElement('optgroup');
        group.label = providerLabels[provider] || provider;
        groupModels.forEach(m => {
            const opt = new Option(m.name, m.id);
            opt.dataset.provider = provider;
            group.appendChild(opt);
        });
        selectEl.appendChild(group);
    });

    // Restore previous selection if still in list
    if (models.find(m => m.id === current)) {
        selectEl.value = current;
    } else {
        selectEl.value = getDefaultModel();
    }
}


export async function addModel(modelObj) {
    const r = await fetch('/api/installed_models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelObj)
    });
    const data = await r.json();
    if (data.models) _models = data.models;
    return data;
}

export async function removeModel(id) {
    const r = await fetch(`/api/installed_models/${id}`, { method: 'DELETE' });
    const data = await r.json();
    if (data.models) _models = data.models;
    return data;
}
