/**
 * Lagoon Design Mode
 * Visual CSS editor — lives on the design_mode branch only, never merges to main.
 */

import { Draggable } from './utils/Draggable.js';

// Elements/selectors to never intercept
const IGNORE_SELECTORS = [
    '#design-editor-modal', '#design-mode-indicator',
    '.context-menu', '.settings-menu', '.modal-overlay'
];

// Classes that are state/utility — stripped from generated selectors
const SKIP_CLASSES = new Set([
    'active', 'hidden', 'selected', 'disabled', 'open', 'closed',
    'visible', 'invisible', 'loading', 'error', 'success'
]);

// Properties the sliders control
const SLIDER_PROPS = [
    { prop: 'font-size',      label: 'Font Size',    min: 0,  max: 72,  step: 1,    unit: 'px' },
    { prop: 'border-radius',  label: 'Bdr Radius',   min: 0,  max: 50,  step: 1,    unit: 'px' },
    { prop: 'border-width',   label: 'Bdr Width',    min: 0,  max: 20,  step: 1,    unit: 'px' },
    { prop: 'opacity',        label: 'Opacity',      min: 0,  max: 1,   step: 0.01, unit: ''   },
];

const DIMENSION_PROPS = [
    { prop: 'width',       label: 'Width',      min: 0, max: 1000, step: 1, unit: 'px', units: ['px', '%', 'auto'] },
    { prop: 'height',      label: 'Height',     min: 0, max: 1000, step: 1, unit: 'px', units: ['px', '%', 'auto'] },
    { prop: 'flex-grow',   label: 'Flex Grow',  min: 0, max: 10,   step: 1, unit: '' },
    { prop: 'flex-shrink', label: 'Flex Shrink',min: 0, max: 10,   step: 1, unit: '' },
    { prop: 'flex-basis',  label: 'Flex Basis', min: 0, max: 1000, step: 1, unit: 'px', units: ['px', '%', 'auto'] },
];

const DISPLAY_OPTS = ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline', 'none'];
const BOX_SIZING_OPTS = ['border-box', 'content-box'];

const SIDE_PROPS = [
    { prefix: 'margin',  label: 'Margin',  min: -100, max: 100, step: 1, unit: 'px' },
    { prefix: 'padding', label: 'Padding', min: 0,    max: 100, step: 1, unit: 'px' },
];

const COLOR_PROPS = [
    { prop: 'color',            label: 'Text' },
    { prop: 'background-color', label: 'Background' },
    { prop: 'border-color',     label: 'Border' },
];

// --- Helpers ---

function parsePixels(val, fallback = 0) {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb.startsWith('rgba(0, 0, 0, 0)')) return '#000000';
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function isTransparent(rgb) {
    if (!rgb || rgb === 'transparent') return true;
    const m = rgb.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
    return m ? parseFloat(m[1]) === 0 : false;
}

function extractAlpha(rgb) {
    if (!rgb || rgb === 'transparent') return 0;
    const m = rgb.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
    return m ? parseFloat(m[1]) : 1;
}

function hexToRgba(hex, alpha = 1) {
    const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return hex;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function _toLinear(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function _luminance(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return 0.2126*_toLinear(r) + 0.7152*_toLinear(g) + 0.0722*_toLinear(b);
}
function contrastRatio(hex1, hex2) {
    if (!hex1 || !hex2) return null;
    const l1 = _luminance(hex1), l2 = _luminance(hex2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── localStorage preview persistence ──────────────────────────────────────────

const PREVIEW_KEY = 'lagoon_design_preview';

function _loadPreviewStorage() {
    try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}'); } catch { return {}; }
}
function _savePreviewStorage(fullSel, styles) {
    const saved = _loadPreviewStorage();
    if (Object.keys(styles).length) saved[fullSel] = styles;
    else delete saved[fullSel];
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(saved));
    _injectPersistedPreviews();
}
function _clearPreviewStorage(fullSel) {
    const saved = _loadPreviewStorage();
    delete saved[fullSel];
    Object.keys(saved).length
        ? localStorage.setItem(PREVIEW_KEY, JSON.stringify(saved))
        : localStorage.removeItem(PREVIEW_KEY);
    _injectPersistedPreviews();
}

function _injectPersistedPreviews() {
    const saved = _loadPreviewStorage();
    let el = document.getElementById('lagoon-design-persist');
    if (!el) {
        el = document.createElement('style');
        el.id = 'lagoon-design-persist';
        document.head.appendChild(el);
    }
    el.textContent = Object.entries(saved)
        .map(([sel, props]) => `${sel} {\n${Object.entries(props).map(([p,v]) => `  ${p}: ${v};`).join('\n')}\n}`)
        .join('\n\n');
    
    // Also re-apply data-dm-id to elements if they exist in selectors
    Object.keys(saved).forEach(sel => {
        const m = sel.match(/\[data-dm-id="([^"]+)"\]/);
        if (m) {
            // This is complex as the element might not be in DOM yet. 
            // We rely on the fact that designMode.init() or periodic checks might be needed.
            // For now, we try once.
        }
    });
}

const _debouncedPersist = debounce((fullSel, styles) => {
    _savePreviewStorage(fullSel, { ...styles });
}, 300);

// ---

export const designMode = {
    active: false,
    _hovered: null,
    _prevOutline: null,
    _prevCursor: null,
    _previewStyleEl: null,
    _indicatorEl: null,
    _panelEl: null,
    _targetEl: null,
    _targetSelector: '',
    _currentState: '', // '', ':hover', ':focus', ':active'
    _currentStyles: {},
    _history: [],
    _redoStack: [],
    _controlMap: {},
    _contrastBadgeEl: null,
    _selectorInput: null,
    _scopeThemeRadio: null,
    _boundMouseover: null,
    _boundMouseout: null,
    _boundClick: null,
    _boundKeydown: null,
    _boundKeyup: null,
    _panelPosition: null, // Preserve drag position between selections
    _lastClickX: 0,
    _lastClickY: 0,
    _elementStack: [],
    _elementStackIndex: 0,
    _paused: false, // Temporarily disable crosshairs (hold Alt)

    enable() {
        if (this.active) return;
        this.active = true;
        localStorage.setItem('lagoon_design_mode', 'true');

        this._previewStyleEl = document.createElement('style');
        this._previewStyleEl.id = 'design-mode-preview';
        document.head.appendChild(this._previewStyleEl);

        this._boundMouseover = this._onMouseover.bind(this);
        this._boundMouseout  = this._onMouseout.bind(this);
        this._boundClick     = this._onClick.bind(this);
        this._boundKeydown   = this._onKeydown.bind(this);
        this._boundKeyup     = this._onKeyup.bind(this);

        document.addEventListener('mouseover', this._boundMouseover, true);
        document.addEventListener('mouseout',  this._boundMouseout,  true);
        document.addEventListener('click',     this._boundClick,     true);
        document.addEventListener('keydown',   this._boundKeydown);
        document.addEventListener('keyup',     this._boundKeyup);

        this._showIndicator();
        this._applyDataIdsFromRules();
        console.log('[DesignMode] Enabled');
    },

    disable() {
        if (!this.active) return;
        this.active = false;
        this._paused = false;
        localStorage.removeItem('lagoon_design_mode');

        this._previewStyleEl?.remove();
        this._previewStyleEl = null;

        this._clearHover();
        this._closePanel();

        document.removeEventListener('mouseover', this._boundMouseover, true);
        document.removeEventListener('mouseout',  this._boundMouseout,  true);
        document.removeEventListener('click',     this._boundClick,     true);
        document.removeEventListener('keydown',   this._boundKeydown);
        document.removeEventListener('keyup',     this._boundKeyup);

        this._hideIndicator();
        console.log('[DesignMode] Disabled');
    },

    _shouldIgnore(el) {
        return IGNORE_SELECTORS.some(sel => el.closest(sel));
    },

    _onMouseover(e) {
        if (this._paused) return;
        const el = e.target;
        if (el === this._hovered || this._shouldIgnore(el)) return;
        this._clearHover();
        this._hovered = el;
        this._prevOutline = el.style.outline;
        this._prevCursor  = el.style.cursor;
        el.style.outline = '2px solid var(--accent)';
        el.style.cursor  = 'crosshair';
    },

    _onMouseout(e) {
        if (this._paused) return;
        if (e.target === this._hovered) this._clearHover();
    },

    _clearHover() {
        if (this._hovered) {
            this._hovered.style.outline = this._prevOutline ?? '';
            this._hovered.style.cursor  = this._prevCursor  ?? '';
            this._hovered = null;
            this._prevOutline = null;
            this._prevCursor  = null;
        }
    },

    _onClick(e) {
        if (this._paused) return; // Let clicks through when paused
        if (this._shouldIgnore(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        this._clearHover();
        
        // Store click position and build element stack for peek-through
        this._lastClickX = e.clientX;
        this._lastClickY = e.clientY;
        this._elementStack = document.elementsFromPoint(e.clientX, e.clientY)
            .filter(el => el && el.closest && !this._shouldIgnore(el) && el !== document.documentElement && el !== document.body);
        this._elementStackIndex = 0;
        
        const el = this._elementStack[0] || e.target;
        const selector = this._generateSelector(el);
        this.openModal(el, selector);
    },

    _onKeydown(e) {
        // Alt key toggles pause for crosshairs
        if (e.key === 'Alt' && !this._paused) {
            this._paused = true;
            this._clearHover();
            this._updateIndicatorPaused();
            return;
        }
        
        if (e.key === 'Escape') {
            if (this._panelEl) {
                this._closePanel();
            } else {
                this.disable();
                const toggle = document.getElementById('design-mode-toggle');
                if (toggle) { toggle.checked = false; _syncToggleVisual(toggle); }
            }
            return;
        }
        if (this._panelEl && (e.ctrlKey || e.metaKey)) {
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); this._undo(); return; }
            if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); this._redo(); return; }
        }
    },

    _onKeyup(e) {
        if (e.key === 'Alt' && this._paused) {
            this._paused = false;
            this._updateIndicatorPaused();
        }
    },

    _updateIndicatorPaused() {
        const indicator = document.getElementById('design-mode-indicator');
        if (indicator) {
            indicator.textContent = this._paused ? '🎨 Design Mode (Paused - Alt)' : '🎨 Design Mode';
        }
    },

    _generateSelector(el, forceUnique = false) {
        if (forceUnique || el.hasAttribute('data-dm-id')) {
            if (!el.hasAttribute('data-dm-id')) {
                el.setAttribute('data-dm-id', 'dm-' + Math.random().toString(36).substr(2, 9));
            }
            return `[data-dm-id="${el.getAttribute('data-dm-id')}"]`;
        }

        const parts = [];
        let node = el;

        while (node && node.tagName && node !== document.documentElement) {
            if (node.id) {
                parts.unshift('#' + CSS.escape(node.id));
                break;
            }

            const dataAttr = ['data-role', 'data-type', 'data-component', 'data-tab']
                .find(a => node.hasAttribute(a));

            if (dataAttr) {
                parts.unshift(`${node.tagName.toLowerCase()}[${dataAttr}="${CSS.escape(node.getAttribute(dataAttr))}"]`);
                try {
                    if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
                } catch (_) {}
            } else {
                const classes = [...node.classList].filter(c => !SKIP_CLASSES.has(c));
                parts.unshift(classes.length
                    ? '.' + classes.map(c => CSS.escape(c)).join('.')
                    : node.tagName.toLowerCase());
            }

            if (parts.length > 1) {
                try {
                    if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
                } catch (_) {}
            }

            node = node.parentElement;
        }

        return parts.join(' > ');
    },

    openModal(el, selector) {
        this._closePanel();
        this._targetEl      = el;
        this._targetSelector = selector;
        this._currentStyles  = {};
        this._currentState   = '';
        this._buildPanel();
    },

    _closePanel() {
        if (this._panelEl) {
            // Save position before destroying
            const rect = this._panelEl.getBoundingClientRect();
            this._panelPosition = { top: rect.top, left: rect.left };
            this._panelEl.remove();
            this._panelEl = null;
        }
        if (this._previewStyleEl) this._previewStyleEl.textContent = '';
        _clearPreviewStorage(this._fullSelector());
        this._currentStyles   = {};
        this._history         = [];
        this._redoStack       = [];
        this._controlMap      = {};
        this._contrastBadgeEl = null;
        this._selectorInput   = null;
        this._scopeThemeRadio = null;
        this._currentState    = '';
    },

    _getThemeClass() {
        return [...document.body.classList].find(c => c.startsWith('theme-')) || '';
    },

_buildPanel() {
        // Get styles from stylesheets first (avoids hover-tainted computed styles)
        // Fall back to computed styles only when no stylesheet rule exists
        const sheetStyles = this._getStylesFromStylesheets(this._targetSelector, '') || {};
        const cs = window.getComputedStyle(this._targetEl);
        
        // Helper to get style value: stylesheet > computed
        const getInitVal = (prop, fallback = '') => {
            if (prop in sheetStyles) return sheetStyles[prop];
            return cs.getPropertyValue(prop) || fallback;
        };
        
        const themeClass = this._getThemeClass();
        const panel = document.createElement('div');
        panel.id = 'design-editor-modal';

        const header = document.createElement('div');
        header.className = 'dm-header';
        const title = document.createElement('span');
        title.className = 'dm-title';
        title.textContent = 'Design Editor';
        
        // Peek Through button - cycles through stacked elements
        const peekBtn = document.createElement('button');
        peekBtn.className = 'dm-peek-btn';
        peekBtn.textContent = '↻ Peek';
        peekBtn.title = 'Cycle through elements at this position (for reaching elements under overlays)';
        
        // Hover effect - highlight the next element in stack
        peekBtn.onmouseenter = () => {
            if (!this._elementStack || this._elementStack.length <= 1) return;
            const nextIdx = (this._elementStackIndex + 1) % this._elementStack.length;
            const el = this._elementStack[nextIdx];
            if (el && el.style) {
                el.style.outline = '2px dashed var(--accent)';
                el.style.outlineOffset = '2px';
            }
        };
        peekBtn.onmouseleave = () => {
            if (!this._elementStack) return;
            this._elementStack.forEach(el => {
                if (el && el.style) {
                    el.style.outline = '';
                    el.style.outlineOffset = '';
                }
            });
        };
        
        peekBtn.onclick = (e) => {
            e.stopPropagation();
            // Clear hover highlights
            if (this._elementStack) {
                this._elementStack.forEach(el => {
                    if (el && el.style) {
                        el.style.outline = '';
                        el.style.outlineOffset = '';
                    }
                });
            }
            if (!this._elementStack || this._elementStack.length <= 1) return;
            this._elementStackIndex = (this._elementStackIndex + 1) % this._elementStack.length;
            const el = this._elementStack[this._elementStackIndex];
            this._targetEl = el;
            this._targetSelector = this._generateSelector(el);
            this._selectorInput.value = this._targetSelector;
            this._updatePreview();
            peekBtn.textContent = `↻ Peek (${this._elementStackIndex + 1}/${this._elementStack.length})`;
        };
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'dm-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => this._closePanel();
        header.appendChild(title);
        header.appendChild(peekBtn);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const selArea = document.createElement('div');
        selArea.className = 'dm-selector-area';
        const selTopRow = document.createElement('div');
        selTopRow.style.display = 'flex';
        selTopRow.style.justifyContent = 'space-between';
        selTopRow.style.alignItems = 'center';
        selTopRow.style.marginBottom = '4px';

        const selLabel = document.createElement('div');
        selLabel.className = 'dm-selector-label';
        selLabel.textContent = 'Selector';
        
        const detachBtn = document.createElement('button');
        detachBtn.className = 'dm-detach-btn';
        detachBtn.textContent = this._targetEl.hasAttribute('data-dm-id') ? 'Detached ✓' : 'Detach Element';
        detachBtn.onclick = () => {
            this._targetSelector = this._generateSelector(this._targetEl, true);
            this._selectorInput.value = this._targetSelector;
            detachBtn.textContent = 'Detached ✓';
            this._updatePreview();
        };

        selTopRow.appendChild(selLabel);
        selTopRow.appendChild(detachBtn);
        selArea.appendChild(selTopRow);

        const selInput = document.createElement('input');
        selInput.className = 'dm-selector-input';
        selInput.type = 'text';
        selInput.value = this._targetSelector;
        selInput.spellcheck = false;
        selInput.addEventListener('input', () => this._updatePreview());
        this._selectorInput = selInput;
        selArea.appendChild(selInput);
        panel.appendChild(selArea);

        const scopeArea = document.createElement('div');
        scopeArea.className = 'dm-scope-area';
        const scopeLabel = document.createElement('span');
        scopeLabel.className = 'dm-scope-label';
        scopeLabel.textContent = 'Scope:';
        scopeArea.appendChild(scopeLabel);

        const themeLabel = document.createElement('label');
        const themeRadio = document.createElement('input');
        themeRadio.type = 'radio';
        themeRadio.name = 'dm-scope';
        themeRadio.value = 'theme';
        themeRadio.checked = true;
        themeRadio.disabled = !themeClass || this._targetSelector.includes('[data-dm-id');
        themeRadio.addEventListener('change', () => this._updatePreview());
        this._scopeThemeRadio = themeRadio;
        themeLabel.appendChild(themeRadio);
        themeLabel.append(' Theme');
        scopeArea.appendChild(themeLabel);

        const globalLabel = document.createElement('label');
        const globalRadio = document.createElement('input');
        globalRadio.type = 'radio';
        globalRadio.name = 'dm-scope';
        globalRadio.value = 'global';
        if (!themeClass || this._targetSelector.includes('[data-dm-id')) globalRadio.checked = true;
        globalRadio.addEventListener('change', () => this._updatePreview());
        globalLabel.appendChild(globalRadio);
        globalLabel.append(' Global');
        scopeArea.appendChild(globalLabel);
        panel.appendChild(scopeArea);

        // --- STATE SELECTOR (Normal/Hover/Focus/Active) ---
        const stateArea = document.createElement('div');
        stateArea.className = 'dm-state-area';
        const stateLabel = document.createElement('span');
        stateLabel.className = 'dm-state-label';
        stateLabel.textContent = 'State:';
        stateArea.appendChild(stateLabel);

        const stateBtns = document.createElement('div');
        stateBtns.className = 'dm-state-btns';

        const states = [
            { value: '', label: 'Normal' },
            { value: ':hover', label: 'Hover' },
            { value: ':focus', label: 'Focus' },
            { value: ':active', label: 'Active' }
        ];

        this._currentState = '';

        states.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'dm-state-btn' + (s.value === '' ? ' active' : '');
            btn.textContent = s.label;
            btn.dataset.state = s.value;
            btn.onclick = () => {
                stateBtns.querySelectorAll('.dm-state-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._currentState = s.value;
                this._loadStateStyles();
            };
            stateBtns.appendChild(btn);
        });

        stateArea.appendChild(stateBtns);
        panel.appendChild(stateArea);

        const body = document.createElement('div');
        body.className = 'dm-body';

        // --- DIMENSIONS ---
body.appendChild(this._makeSectionHeader('Dimensions'));
        
        // Display dropdown
        body.appendChild(this._makeSelectRow('display', 'Display', DISPLAY_OPTS, getInitVal('display', cs.display)));
        // Box-Sizing dropdown
        body.appendChild(this._makeSelectRow('box-sizing', 'Box Sizing', BOX_SIZING_OPTS, getInitVal('box-sizing', cs.boxSizing)));

        for (const p of DIMENSION_PROPS) {
            const val = getInitVal(p.prop, cs.getPropertyValue(p.prop));
            const initVal = parsePixels(val, 0);
            body.appendChild(this._makeSliderRow(p.prop, p.label, p.min, p.max, p.step, p.unit, initVal, p.units));
        }

        // --- SPACING ---
        body.appendChild(this._makeSectionHeader('Spacing'));
        for (const p of SLIDER_PROPS) {
            const val = getInitVal(p.prop, cs.getPropertyValue(p.prop));
            const initVal = parsePixels(val, p.prop === 'opacity' ? 1 : 0);
            body.appendChild(this._makeSliderRow(p.prop, p.label, p.min, p.max, p.step, p.unit, initVal));
        }

        for (const { prefix, label, min, max, step, unit } of SIDE_PROPS) {
            body.appendChild(this._makeSectionHeader(label));
            const sides = ['top', 'right', 'bottom', 'left'];
            const initVals = sides.map(s => parsePixels(getInitVal(`${prefix}-${s}`, cs.getPropertyValue(`${prefix}-${s}`))));
            body.appendChild(this._makeSideSliders(prefix, sides, min, max, step, unit, initVals));
        }

        // --- COLORS ---
        const colorHeader = this._makeSectionHeader('Colors');
        colorHeader.style.cssText += 'display:flex;align-items:center;justify-content:space-between;';
        const contrastBadge = document.createElement('span');
        contrastBadge.style.cssText = 'font-size:10px;padding:1px 7px;border-radius:10px;font-weight:600;';
        colorHeader.appendChild(contrastBadge);
        this._contrastBadgeEl = contrastBadge;
        body.appendChild(colorHeader);

        for (const { prop, label } of COLOR_PROPS) {
            const rawVal = getInitVal(prop, cs.getPropertyValue(prop));
            const initHex = isTransparent(rawVal) ? null : rgbToHex(rawVal);
            body.appendChild(this._makeColorRow(prop, label, initHex));
        }
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dm-btn dm-btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => this._closePanel();

        const resetBtn = document.createElement('button');
        resetBtn.className = 'dm-btn dm-btn-reset';
        resetBtn.textContent = 'Reset';
        resetBtn.onclick = () => this._resetRule(resetBtn);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'dm-btn dm-btn-save';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => this._saveRule(saveBtn);

        footer.appendChild(cancelBtn);
        footer.appendChild(resetBtn);
        footer.appendChild(saveBtn);
        panel.appendChild(footer);

        panel.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(panel);
        this._panelEl = panel;
        new Draggable(panel, header);
        
        // Restore saved position if it exists
        if (this._panelPosition) {
            panel.style.top = this._panelPosition.top + 'px';
            panel.style.left = this._panelPosition.left + 'px';
            panel.style.right = 'auto'; // Override CSS default
        }
        
        this._updateContrastBadge();
    },

    _makeSectionHeader(text) {
        const h = document.createElement('div');
        h.className = 'dm-section-header';
        h.textContent = text;
        return h;
    },

    _makeSelectRow(prop, label, options, current) {
        const row = document.createElement('div');
        row.className = 'dm-row';
        const lbl = document.createElement('span');
        lbl.className = 'dm-row-label';
        lbl.textContent = label;
        
        const sel = document.createElement('select');
        sel.className = 'dm-select';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === current) o.selected = true;
            sel.appendChild(o);
        });

        this._controlMap[prop] = { type: 'select', el: sel };

        sel.onchange = () => {
            const oldVal = this._currentStyles[prop] || current;
            this._currentStyles[prop] = sel.value;
            this._pushHistory(prop, oldVal, sel.value);
            this._updatePreview();
        };

        row.appendChild(lbl);
        row.appendChild(sel);
        return row;
    },

    _makeSliderRow(prop, label, min, max, step, unit, initVal, units = null) {
        const row = document.createElement('div');
        row.className = 'dm-row';

        const lbl = document.createElement('span');
        lbl.className = 'dm-row-label';
        lbl.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'dm-slider';
        slider.min = min; slider.max = max; slider.step = step;
        slider.value = Math.min(Math.max(initVal, min), max);

        const valDisplay = document.createElement('span');
        valDisplay.className = 'dm-value';

        let currentUnit = unit;
        const _fmt = () => {
            if (currentUnit === 'auto') {
                valDisplay.textContent = 'auto';
                slider.disabled = true;
                slider.style.opacity = '0.3';
            } else {
                slider.disabled = false;
                slider.style.opacity = '1';
                valDisplay.textContent = step < 1 ? parseFloat(slider.value).toFixed(2) + currentUnit : slider.value + currentUnit;
            }
        };

        // Click to cycle units, Shift+Click to enter value manually
        valDisplay.style.cursor = 'pointer';
        valDisplay.title = 'Click to cycle units, Shift+Click to enter value';
        valDisplay.onclick = (e) => {
            if (e.shiftKey) {
                // Create inline input for manual entry
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'dm-value-input';
                input.value = currentUnit === 'auto' ? 'auto' : (step < 1 ? parseFloat(slider.value).toFixed(2) : slider.value);
                input.style.cssText = 'width:50px;font-size:11px;background:var(--bg-darker);border:1px solid var(--accent);color:var(--text-main);padding:1px 3px;border-radius:2px;';
                
                valDisplay.replaceWith(input);
                input.focus();
                input.select();

                const finish = () => {
                    const val = input.value.trim();
                    // Parse value (could be "auto", "50px", "100%", "1.5em", etc.)
                    if (val === 'auto' && units && units.includes('auto')) {
                        currentUnit = 'auto';
                        this._currentStyles[prop] = 'auto';
                    } else {
                        const match = val.match(/^(-?\d+\.?\d*)(px|%|em|rem|vh|vw)?$/);
                        if (match) {
                            const num = parseFloat(match[1]);
                            const u = match[2] || currentUnit || 'px';
                            currentUnit = u;
                            slider.value = Math.min(Math.max(num, min), max);
                            this._currentStyles[prop] = `${num}${u}`;
                        } else {
                            // Invalid input, restore previous
                        }
                    }
                    input.replaceWith(valDisplay);
                    _fmt();
                    this._updatePreview();
                };

                input.onblur = finish;
                input.onkeydown = (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); finish(); }
                    if (ke.key === 'Escape') { input.replaceWith(valDisplay); _fmt(); }
                };
            } else if (units) {
                // Cycle units
                const idx = units.indexOf(currentUnit);
                currentUnit = units[(idx + 1) % units.length];
                this._currentStyles[prop] = currentUnit === 'auto' ? 'auto' : `${slider.value}${currentUnit}`;
                _fmt();
                this._updatePreview();
            }
        };

        _fmt();

        this._controlMap[prop] = { type: 'slider', el: slider, valDisplay, unit: currentUnit, step, units };

        let preVal = null;
        slider.addEventListener('mousedown', () => { preVal = slider.value; });
        slider.addEventListener('input', () => {
            _fmt();
            this._currentStyles[prop] = currentUnit === '' ? slider.value : `${slider.value}${currentUnit}`;
            this._updatePreview();
        });
        slider.addEventListener('change', () => {
            if (preVal !== null && preVal !== slider.value) {
                this._pushHistory(prop, 
                    currentUnit === '' ? preVal : `${preVal}${currentUnit}`, 
                    this._currentStyles[prop]);
            }
            preVal = null;
        });

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valDisplay);
        return row;
    },

    _makeSideSliders(prefix, sides, min, max, step, unit, initVals) {
        const grid = document.createElement('div');
        grid.className = 'dm-side-grid';

        sides.forEach((side, i) => {
            const prop = `${prefix}-${side}`;
            const wrapper = document.createElement('div');
            wrapper.className = 'dm-side-row';
            const sideLabel = document.createElement('span');
            sideLabel.className = 'dm-side-label';
            sideLabel.textContent = side[0].toUpperCase();

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'dm-side-slider';
            slider.min = min; slider.max = max; slider.step = step;
            slider.value = Math.min(Math.max(initVals[i], min), max);

            const valDisplay = document.createElement('span');
            valDisplay.className = 'dm-side-value';
            valDisplay.textContent = slider.value + unit;

            this._controlMap[prop] = { type: 'slider', el: slider, valDisplay, unit, step };

            let preVal = null;
            slider.addEventListener('mousedown', () => { preVal = slider.value; });
            slider.addEventListener('input', () => {
                valDisplay.textContent = slider.value + unit;
                this._currentStyles[prop] = `${slider.value}${unit}`;
                this._updatePreview();
            });
            slider.addEventListener('change', () => {
                if (preVal !== null && preVal !== slider.value)
                    this._pushHistory(prop, `${preVal}${unit}`, `${slider.value}${unit}`);
                preVal = null;
            });

            wrapper.appendChild(sideLabel);
            wrapper.appendChild(slider);
            wrapper.appendChild(valDisplay);
            grid.appendChild(wrapper);
        });
        return grid;
    },

    _makeColorRow(prop, label, initHex) {
        const row = document.createElement('div');
        row.className = 'dm-color-row';
        const lbl = document.createElement('span');
        lbl.className = 'dm-color-label';
        lbl.textContent = label;

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'dm-color-input';
        picker.value = initHex || '#000000';

        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'dm-color-hex';
        hexDisplay.textContent = initHex || 'transparent';

        // Alpha slider for background-color
        let alphaSlider = null;
        let alphaDisplay = null;
        let alphaRow = null;
        let currentAlpha = 1;

        if (prop === 'background-color') {
            // Extract initial alpha from computed style
            const rawVal = window.getComputedStyle(this._targetEl).getPropertyValue(prop);
            currentAlpha = extractAlpha(rawVal);

            alphaRow = document.createElement('div');
            alphaRow.className = 'dm-alpha-row';
            alphaRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';

            const alphaLbl = document.createElement('span');
            alphaLbl.className = 'dm-color-label';
            alphaLbl.textContent = 'Alpha';
            alphaLbl.style.cssText = 'width:50px;';

            alphaSlider = document.createElement('input');
            alphaSlider.type = 'range';
            alphaSlider.min = '0';
            alphaSlider.max = '1';
            alphaSlider.step = '0.01';
            alphaSlider.value = currentAlpha;
            alphaSlider.className = 'dm-slider';
            alphaSlider.style.cssText = 'flex:1;';

            alphaDisplay = document.createElement('span');
            alphaDisplay.className = 'dm-color-hex';
            alphaDisplay.textContent = currentAlpha.toFixed(2);
            alphaDisplay.style.cssText = 'width:36px;text-align:right;';

            alphaSlider.addEventListener('input', () => {
                currentAlpha = parseFloat(alphaSlider.value);
                alphaDisplay.textContent = currentAlpha.toFixed(2);
                const rgba = hexToRgba(picker.value, currentAlpha);
                hexDisplay.textContent = rgba;
                this._currentStyles[prop] = rgba;
                this._updatePreview();
                if (prop === 'background-color') this._updateContrastBadge();
            });

            alphaRow.appendChild(alphaLbl);
            alphaRow.appendChild(alphaSlider);
            alphaRow.appendChild(alphaDisplay);
        }

        this._controlMap[prop] = { type: 'color', el: picker, hexDisplay, alphaSlider };

        let preColor = picker.value;
        picker.addEventListener('input', () => {
            const displayVal = alphaSlider ? hexToRgba(picker.value, currentAlpha) : picker.value;
            hexDisplay.textContent = displayVal;
            this._currentStyles[prop] = displayVal;
            // Robust background handling: if background-color is set, clear background-image
            if (prop === 'background-color') {
                this._currentStyles['background'] = displayVal; // Shorthand clobbers image
            }
            this._updatePreview();
            if (prop === 'color' || prop === 'background-color') this._updateContrastBadge();
        });
        picker.addEventListener('change', () => {
            if (preColor !== picker.value) this._pushHistory(prop, preColor, picker.value);
            preColor = picker.value;
        });

        row.appendChild(lbl);
        row.appendChild(picker);
        row.appendChild(hexDisplay);

        // Return row directly if no alpha slider, otherwise wrap in container
        if (!alphaRow) {
            return row;
        }

        const container = document.createElement('div');
        container.className = 'dm-color-container';
        container.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
        container.appendChild(row);
        container.appendChild(alphaRow);
        return container;
    },

    _buildRule() {
        if (!Object.keys(this._currentStyles).length) return null;
        const selector = this._fullSelector();
        const decls = Object.entries(this._currentStyles)
            .map(([p, v]) => `  ${p}: ${v};`)
            .join('\n');
        return `${selector} {\n${decls}\n}`;
    },

    _fullSelector() {
        const sel = (this._selectorInput?.value || this._targetSelector).trim();
        const isUnique = sel.includes('[data-dm-id');
        const scopeTheme = !isUnique && this._scopeThemeRadio?.checked;
        const themeClass = this._getThemeClass();
        const baseSelector = scopeTheme && themeClass ? `.${themeClass} ${sel}` : sel;
        return baseSelector + this._currentState;
    },

    _loadStateStyles() {
        // Reload computed styles for the current state
        const pseudoClass = this._currentState;
        
        // Reset current styles
        this._currentStyles = {};
        
        // Update preview with empty styles for new state
        this._updatePreview();
        
        // Update all controls to reflect current state
        this._syncControlsToState();
    },

/**
     * Parse a CSS selector list into individual selectors.
     * Handles comma-separated selectors like ".btn, .btn:hover"
     */
    _parseSelectorList(selectorText) {
        if (!selectorText) return [];
        const selectors = [];
        let current = '';
        let parenDepth = 0;
        for (let i = 0; i < selectorText.length; i++) {
            const ch = selectorText[i];
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
            else if (ch === ',' && parenDepth === 0) {
                const trimmed = current.trim();
                if (trimmed) selectors.push(trimmed);
                current = '';
                continue;
            }
            current += ch;
        }
        const trimmed = current.trim();
        if (trimmed) selectors.push(trimmed);
        return selectors;
    },

    /**
     * Check if a selector from a stylesheet matches our target selector.
     * Exact match on the base selector, with optional pseudo-class suffix.
     */
    _selectorMatchesTarget(sheetSelector, targetSelector, targetPseudo) {
        const sheetSelectors = this._parseSelectorList(sheetSelector);
        const targetBase = targetSelector.trim();
        const targetWithPseudo = targetPseudo ? targetBase + targetPseudo : targetBase;

        for (const sel of sheetSelectors) {
            const selTrimmed = sel.trim();
            if (selTrimmed === targetWithPseudo) return true;
            if (!targetPseudo && selTrimmed === targetBase) return true;
        }
        return false;
    },

    /**
     * Get all CSS properties for a selector from stylesheets.
     * Respects cascade order (last rule wins for equal specificity).
     * Returns a map of {prop: value} or null if not found.
     */
    _getStylesFromStylesheets(targetSelector, targetPseudo = '') {
        const result = {};
        let foundAny = false;

        // Check preview style element first (highest priority)
        const previewEl = document.getElementById('design-mode-preview');
        if (previewEl && previewEl.textContent) {
            const fullSelector = targetPseudo ? targetSelector + targetPseudo : targetSelector;
            const ruleMatch = previewEl.textContent.match(
                new RegExp(`${this._escapeRegex(fullSelector)}\\s*\\{([^}]*)\\}`, 'i')
            );
            if (ruleMatch) {
                const decls = ruleMatch[1];
                const propMatches = decls.matchAll(/([a-z-]+)\s*:\s*([^;]+);?/gi);
                for (const m of propMatches) {
                    result[m[1].toLowerCase()] = m[2].trim();
                    foundAny = true;
                }
            }
        }

        // Check persisted preview styles
        const saved = _loadPreviewStorage();
        const fullSelector = targetPseudo ? targetSelector + targetPseudo : targetSelector;
        if (saved[fullSelector]) {
            Object.assign(result, saved[fullSelector]);
            foundAny = true;
        }

        // Search through document stylesheets (reverse order for cascade: last rule wins)
        const sheets = [...document.styleSheets];
        for (let i = sheets.length - 1; i >= 0; i--) {
            const sheet = sheets[i];
            try {
                const rules = sheet.cssRules || [];
                for (let j = rules.length - 1; j >= 0; j--) {
                    const rule = rules[j];
                    if (!rule.selectorText) continue;

                    if (this._selectorMatchesTarget(rule.selectorText, targetSelector, targetPseudo)) {
                        const style = rule.style;
                        for (let k = 0; k < style.length; k++) {
                            const prop = style[k];
                            if (!(prop in result)) {
                                result[prop] = style.getPropertyValue(prop);
                                foundAny = true;
                            }
                        }
                    }
                }
            } catch (e) {
                // Cross-origin stylesheet, skip
            }
        }

        return foundAny ? result : null;
    },

    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    _syncControlsToState() {
        // Sync sliders and color pickers to current state values
        // Read from stylesheets for ALL states to avoid hover-tainted computed styles
        const pseudoClass = this._currentState;
        const targetSelector = this._selectorInput?.value || this._targetSelector;

        // Get all styles for this state from stylesheets
        const sheetStyles = this._getStylesFromStylesheets(targetSelector, pseudoClass) || {};

        // Helper to get style value - prefer stylesheet, fall back to computed for normal state only
        const getStyleValue = (prop) => {
            if (prop in sheetStyles) {
                return sheetStyles[prop];
            }
            // For normal state, try computed style as last resort
            if (!pseudoClass && this._targetEl) {
                return window.getComputedStyle(this._targetEl).getPropertyValue(prop);
            }
            return null;
        };

        // Sync dimension sliders
        for (const p of DIMENSION_PROPS) {
            const ctrl = this._controlMap[p.prop];
            if (ctrl && ctrl.type === 'slider') {
                const rawVal = getStyleValue(p.prop);
                const val = rawVal ? parsePixels(rawVal, 0) : 0;
                ctrl.slider.value = val;
                ctrl.valDisplay.textContent = val + (ctrl.currentUnit || p.unit);
            }
        }

        // Sync spacing sliders
        for (const p of SLIDER_PROPS) {
            const ctrl = this._controlMap[p.prop];
            if (ctrl && ctrl.type === 'slider') {
                const rawVal = getStyleValue(p.prop);
                const val = rawVal ? (p.prop === 'opacity' ? parseFloat(rawVal) : parsePixels(rawVal, 0)) : (p.prop === 'opacity' ? 1 : 0);
                ctrl.slider.value = val;
                ctrl.valDisplay.textContent = p.prop === 'opacity' ? val.toFixed(2) : val;
            }
        }

        // Sync color pickers
        for (const { prop } of COLOR_PROPS) {
            const ctrl = this._controlMap[prop];
            if (ctrl && ctrl.type === 'color') {
                const rawVal = getStyleValue(prop);
                const hex = rawVal && !isTransparent(rawVal) ? rgbToHex(rawVal) : null;
                ctrl.el.value = hex || '#000000';
                ctrl.hexDisplay.textContent = hex || 'transparent';
            }
        }
    },
    _pushHistory(prop, oldVal, newVal) {
        this._history.push({ prop, oldVal, newVal });
        this._redoStack = [];
    },

    _undo() {
        const entry = this._history.pop();
        if (!entry) return;
        this._redoStack.push(entry);
        if (entry.oldVal == null) delete this._currentStyles[entry.prop];
        else this._currentStyles[entry.prop] = entry.oldVal;
        this._updateControlForProp(entry.prop, entry.oldVal);
        this._updatePreview();
    },

    _redo() {
        const entry = this._redoStack.pop();
        if (!entry) return;
        this._history.push(entry);
        this._currentStyles[entry.prop] = entry.newVal;
        this._updateControlForProp(entry.prop, entry.newVal);
        this._updatePreview();
    },

    _updateControlForProp(prop, valStr) {
        const ctrl = this._controlMap[prop];
        if (!ctrl) return;
        if (ctrl.type === 'slider') {
            const num = parseFloat(valStr) || 0;
            ctrl.el.value = num;
            ctrl.valDisplay.textContent = ctrl.step < 1 ? num.toFixed(2) : num + ctrl.unit;
        } else if (ctrl.type === 'color') {
            const hex = valStr || '#000000';
            ctrl.el.value = hex;
            ctrl.hexDisplay.textContent = hex;
            if (prop === 'color' || prop === 'background-color') this._updateContrastBadge();
        } else if (ctrl.type === 'select') {
            ctrl.el.value = valStr;
        }
    },

    _updateContrastBadge() {
        if (!this._contrastBadgeEl) return;
        const textCtrl = this._controlMap['color'];
        const bgCtrl   = this._controlMap['background-color'];
        if (!textCtrl || !bgCtrl) return;
        const ratio = contrastRatio(textCtrl.el.value, bgCtrl.el.value);
        if (!ratio) { this._contrastBadgeEl.textContent = ''; return; }
        let label, bg, color;
        if (ratio >= 7)   { label = `AAA ✓ ${ratio.toFixed(1)}:1`; bg = '#1a5c1a'; color = '#6fcf6f'; }
        else if (ratio >= 4.5) { label = `AA ✓ ${ratio.toFixed(1)}:1`;  bg = '#1a3a5c'; color = '#6fafcf'; }
        else if (ratio >= 3)   { label = `AA Lg ${ratio.toFixed(1)}:1`; bg = '#5c4a00'; color = '#d4b84a'; }
        else                   { label = `Fail ${ratio.toFixed(1)}:1`;   bg = '#5c1a1a'; color = '#cf6f6f'; }
        this._contrastBadgeEl.textContent = label;
        this._contrastBadgeEl.style.background = bg;
        this._contrastBadgeEl.style.color = color;
    },

    _apiPayload() {
        return {
            selector:    (this._selectorInput?.value || this._targetSelector).trim(),
            scope:       this._scopeThemeRadio?.checked ? 'theme' : 'global',
            theme_class: this._getThemeClass(),
            state:       this._currentState,  // '', ':hover', ':focus', ':active'
        };
    },

    async _saveRule(btn) {
        if (!Object.keys(this._currentStyles).length) {
            btn.textContent = 'Nothing changed';
            setTimeout(() => { btn.textContent = 'Save'; }, 1500);
            return;
        }
        btn.textContent = 'Saving…';
        btn.disabled = true;
        try {
            const res = await fetch('/api/design/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...this._apiPayload(), styles: this._currentStyles }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || res.statusText);
            btn.textContent = 'Saved ✓';
            _clearPreviewStorage(this._fullSelector());
            this._currentStyles = {};
            this._history = [];
            this._redoStack = [];
        } catch (err) {
            console.error('[DesignMode] Save failed:', err);
            btn.textContent = 'Error ✗';
        }
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Save'; }, 2000);
    },

    async _resetRule(btn) {
        btn.textContent = 'Resetting…';
        btn.disabled = true;
        try {
            const res = await fetch('/api/design/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this._apiPayload()),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || res.statusText);
            btn.textContent = 'Reset ✓';
            this._currentStyles = {};
            this._updatePreview();
        } catch (err) {
            console.error('[DesignMode] Reset failed:', err);
            btn.textContent = 'Error ✗';
        }
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Reset'; }, 2000);
    },

    _showIndicator() {
        if (this._indicatorEl) return;
        const el = document.createElement('div');
        el.id = 'design-mode-indicator';
        el.textContent = 'Design Mode  [Esc to close panel / exit]';
        el.style.cssText = [
            'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:99999', 'background:var(--accent)', 'color:#fff',
            'font-size:12px', 'font-family:Inter,sans-serif', 'font-weight:500',
            'padding:6px 14px', 'border-radius:20px',
            'box-shadow:0 2px 12px rgba(0,0,0,0.5)',
            'pointer-events:none', 'letter-spacing:0.02em'
        ].join(';');
        document.body.appendChild(el);
        this._indicatorEl = el;
    },

    _hideIndicator() {
        this._indicatorEl?.remove();
        this._indicatorEl = null;
    },

    _applyDataIdsFromRules() {
        // Find all rules in persisted storage or user-overrides.css that use data-dm-id
        // and try to find matching elements in DOM. This is a helper for persistence.
        const saved = _loadPreviewStorage();
        Object.keys(saved).forEach(sel => {
            const m = sel.match(/\[data-dm-id="([^"]+)"\]/);
            if (m) {
                // We can't easily find the original element if it's dynamic.
                // Robustness improvement would require baking these into templates.
            }
        });
    }
};

function _syncToggleVisual(checkbox) {
    const label = checkbox.parentElement;
    const slider = label?.querySelector('span');
    const knob   = slider?.querySelector('span');
    if (!slider || !knob) return;
    slider.style.background = checkbox.checked ? 'var(--accent)' : '#444';
    knob.style.left = checkbox.checked ? '16px' : '2px';
}

export function initDesignMode() {
    _injectPersistedPreviews();
    if (localStorage.getItem('lagoon_design_mode') === 'true') {
        designMode.enable();
    }
}
