/**
 * Installed Models — Single Source of Truth
 * All model dropdowns in the app populate from this module.
 */

let _models = [];

export async function initInstalledModels() {
    try {
        const r = await fetch('/api/installed_models');
        _models = (await r.json()).models || [];
    } catch (e) {
        console.error('[InstalledModels] Failed to load:', e);
        _models = [];
    }
}

export function getInstalledModels() {
    return _models;
}

export function getDisplayName(id) {
    return _models.find(m => m.id === id)?.name ?? id;
}

export function getDefaultModel() {
    return _models.find(m => m.default)?.id ?? _models[0]?.id ?? '';
}

/**
 * Populate a <select> element from installed models.
 * Preserves current selection if still valid; falls back to default.
 * @param {HTMLSelectElement} selectEl
 * @param {object} opts
 * @param {boolean} [opts.includeBlank=false]  prepend empty option
 * @param {string}  [opts.blankLabel='']
 */
export function populateSelect(selectEl, { includeBlank = false, blankLabel = '' } = {}) {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = '';
    if (_models.length === 0) {
        const opt = new Option('No models — use + to add', '');
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
    _models.forEach(m => {
        const p = m.provider || 'other';
        if (!groups[p]) groups[p] = [];
        groups[p].push(m);
    });

    const providerLabels = { venice: 'venice.ai', together: 'together.ai', zai: 'z.ai', ollama: 'Ollama', custom: 'Custom' };
    Object.entries(groups).forEach(([provider, models]) => {
        const group = document.createElement('optgroup');
        group.label = providerLabels[provider] || provider;
        models.forEach(m => {
            const opt = new Option(m.name, m.id);
            opt.dataset.provider = provider;
            group.appendChild(opt);
        });
        selectEl.appendChild(group);
    });

    // Restore previous selection if still in list
    if (_models.find(m => m.id === current)) {
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
