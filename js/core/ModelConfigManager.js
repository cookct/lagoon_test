/**
 * ModelConfigManager - Frontend model configuration management
 */
import { modelConfigs } from './modelConfigs.js';

class ModelConfigManager {
    constructor() {
        this.models = {};
        this.providers = {};
        this.loaded = false;
        this.loadPromise = this.fetchInstalledModels();
    }

    async fetchInstalledModels() {
        try {
            const response = await fetch('/api/installed_models');
            const data = await response.json();
            
            // Transform list to object for easy lookup
            const modelsObj = {};
            if (data.models) {
                data.models.forEach(m => {
                    modelsObj[m.id] = {
                        display_name: m.name,
                        provider: m.provider,
                        category: 'chat', // Default for installed models
                        pricing: m.pricing
                    };
                });
            }
            this.models = modelsObj;
            this.loaded = true;
            console.log(`[ModelConfig] ${Object.keys(this.models).length} installed models loaded`);
            return this.models;
        } catch (error) {
            console.error('[ModelConfig] Failed to fetch installed models:', error);
            return {};
        }
    }

    async load() {
        if (this.loaded) return this.models;
        return this.loadPromise;
    }

    // Refresh if list changes
    async refresh() {
        this.loadPromise = this.fetchInstalledModels();
        return this.loadPromise;
    }

    getModel(modelId) {
        return this.models[modelId] || null;
    }

    getUIControls(modelId) {
        const model = this.getModel(modelId);
        if (!model) return [];
        return model.ui_controls || [];
    }

    getDisplayName(modelId) {
        const model = this.getModel(modelId);
        return model?.display_name || modelId;
    }

    getPrice(modelId) {
        const model = this.getModel(modelId);
        return model?.price_per_image || null;
    }

    getModelsByCategory(category) {
        return Object.entries(this.models)
            .filter(([_, config]) => config.category === category)
            .map(([id, config]) => ({
                id,
                display_name: config.display_name || id,
                price: config.price_per_image,
                provider: config.provider
            }));
    }

    getDefaults(modelId) {
        const model = this.getModel(modelId);
        if (!model || !model.params) return {};
        const defaults = {};
        for (const [param, config] of Object.entries(model.params)) {
            if (config.default !== undefined) defaults[param] = config.default;
        }
        return defaults;
    }

    validateParam(modelId, paramName, value) {
        const model = this.getModel(modelId);
        if (!model || !model.params || !model.params[paramName]) return { valid: true };

        const config = model.params[paramName];
        if (config.type === 'int' || config.type === 'float') {
            const num = Number(value);
            if (isNaN(num)) return { valid: false, error: `${paramName} must be a number` };
            if (config.min !== undefined && num < config.min) return { valid: false, error: `${paramName} must be >= ${config.min}` };
            if (config.max !== undefined && num > config.max) return { valid: false, error: `${paramName} must be <= ${config.max}` };
        }
        if (config.type === 'enum' && config.options) {
            if (!config.options.includes(value)) return { valid: false, error: `${paramName} must be one of: ${config.options.join(', ')}` };
        }
        return { valid: true };
    }
}

export const modelConfigManager = new ModelConfigManager();
window.modelConfigManager = modelConfigManager;
