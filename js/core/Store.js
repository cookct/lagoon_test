/**
 * Lagoon V1.3 Core Store
 * Centralized State Management with Event Bus
 */

class Store {
    constructor() {
        this.state = {
            currentChatId: null,
            messages: [],
            currentConfig: {},
            currentParentConfig: null,
            isStreaming: false,
            keptMessages: new Set(),
            // ... more state as needed during migration
        };
        this.listeners = new Map();
    }

    /**
     * Subscribe to state changes
     * @param {string} event Name of the event or state property
     * @param {Function} callback Function to call when state changes
     */
    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        };
    }

    /**
     * Update state and notify subscribers
     * @param {string} key State property name
     * @param {any} value New value
     * @param {boolean} silent If true, don't trigger listeners
     */
    set(key, value, silent = false) {
        if (this.state[key] === value) return;
        
        this.state[key] = value;
        
        if (!silent) {
            this.emit(key, value);
            this.emit('state_changed', { key, value, state: this.state });
        }
    }

    /**
     * Notify subscribers
     * @param {string} event Event name
     * @param {any} data Payload
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    /**
     * Batch update multiple state properties
     * @param {Object} updates Key-value pairs
     */
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value, true);
        });
        this.emit('state_changed', { updates, state: this.state });
    }
}

export const store = new Store();
window.lagoonStore = store; // For debugging
