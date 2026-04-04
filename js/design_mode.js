/**
 * Lagoon Design Mode
 * Visual CSS editor — lives on the design_mode branch only, never merges to main.
 *
 * Phase 1: Toggle, hover highlight, click interception, selector generation.
 * Phase 2: Design Editor Panel, live preview via <style> tag, sliders + color pickers.
 * Phase 3: Backend save/reset API.
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

// Properties the sliders control — also used for backend validation in Phase 3
const SLIDER_PROPS = [
    { prop: 'font-size',      label: 'Font Size',    min: 0,  max: 72,  step: 1,    unit: 'px' },
    { prop: 'border-radius',  label: 'Bdr Radius',   min: 0,  max: 50,  step: 1,    unit: 'px' },
    { prop: 'border-width',   label: 'Bdr Width',    min: 0,  max: 20,  step: 1,    unit: 'px' },
    { prop: 'opacity',        label: 'Opacity',      min: 0,  max: 1,   step: 0.01, unit: ''   },
];

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
    if (!rgb || rgb === 'transparent') return '#000000';
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

// ── Debounce ──────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── WCAG Contrast ─────────────────────────────────────────────────────────────

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
    _currentStyles: {},   // only user-touched props → value string
    _history: [],         // undo stack [{prop, oldVal, newVal}]
    _redoStack: [],
    _controlMap: {},      // prop → {type:'slider'|'color', el, valDisplay}
    _contrastBadgeEl: null,
    _selectorInput: null,
    _scopeThemeRadio: null,
    _boundMouseover: null,
    _boundMouseout: null,
    _boundClick: null,
    _boundKeydown: null,

    // ── Enable / Disable ──────────────────────────────────────────────────────

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

        document.addEventListener('mouseover', this._boundMouseover, true);
        document.addEventListener('mouseout',  this._boundMouseout,  true);
        document.addEventListener('click',     this._boundClick,     true);
        document.addEventListener('keydown',   this._boundKeydown);

        this._showIndicator();
        console.log('[DesignMode] Enabled');
    },

    disable() {
        if (!this.active) return;
        this.active = false;
        localStorage.removeItem('lagoon_design_mode');

        this._previewStyleEl?.remove();
        this._previewStyleEl = null;

        this._clearHover();
        this._closePanel();

        document.removeEventListener('mouseover', this._boundMouseover, true);
        document.removeEventListener('mouseout',  this._boundMouseout,  true);
        document.removeEventListener('click',     this._boundClick,     true);
        document.removeEventListener('keydown',   this._boundKeydown);

        this._hideIndicator();
        console.log('[DesignMode] Disabled');
    },

    // ── Listeners ─────────────────────────────────────────────────────────────

    _shouldIgnore(el) {
        return IGNORE_SELECTORS.some(sel => el.closest(sel));
    },

    _onMouseover(e) {
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
        if (this._shouldIgnore(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        this._clearHover();
        const el = e.target;
        const selector = this._generateSelector(el);
        this.openModal(el, selector);
    },

    _onKeydown(e) {
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

    // ── Selector Generation ───────────────────────────────────────────────────

    _generateSelector(el) {
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

    // ── Modal ─────────────────────────────────────────────────────────────────

    openModal(el, selector) {
        this._closePanel();
        this._targetEl      = el;
        this._targetSelector = selector;
        this._currentStyles  = {};
        this._buildPanel();
    },

    _closePanel() {
        if (this._panelEl) {
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
    },

    _getThemeClass() {
        return [...document.body.classList].find(c => c.startsWith('theme-')) || '';
    },

    _buildPanel() {
        const cs = window.getComputedStyle(this._targetEl);
        const themeClass = this._getThemeClass();
        const panel = document.createElement('div');
        panel.id = 'design-editor-modal';

        // ── Header ──
        const header = document.createElement('div');
        header.className = 'dm-header';
        const title = document.createElement('span');
        title.className = 'dm-title';
        title.textContent = 'Design Editor';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'dm-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close (Esc)';
        closeBtn.onclick = () => this._closePanel();
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // ── Selector ──
        const selArea = document.createElement('div');
        selArea.className = 'dm-selector-area';
        const selLabel = document.createElement('div');
        selLabel.className = 'dm-selector-label';
        selLabel.textContent = 'Selector';
        const selInput = document.createElement('input');
        selInput.className = 'dm-selector-input';
        selInput.type = 'text';
        selInput.value = this._targetSelector;
        selInput.spellcheck = false;
        selInput.addEventListener('input', () => this._updatePreview());
        selInput.addEventListener('click', e => e.stopPropagation());
        this._selectorInput = selInput;
        selArea.appendChild(selLabel);
        selArea.appendChild(selInput);
        panel.appendChild(selArea);

        // ── Scope ──
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
        themeRadio.disabled = !themeClass;
        themeRadio.addEventListener('change', () => this._updatePreview());
        this._scopeThemeRadio = themeRadio;
        themeLabel.appendChild(themeRadio);
        themeLabel.append(` Theme${themeClass ? ` (.${themeClass})` : ' (none)'}`);
        scopeArea.appendChild(themeLabel);

        const globalLabel = document.createElement('label');
        const globalRadio = document.createElement('input');
        globalRadio.type = 'radio';
        globalRadio.name = 'dm-scope';
        globalRadio.value = 'global';
        if (!themeClass) { globalRadio.checked = true; this._scopeThemeRadio = null; }
        globalRadio.addEventListener('change', () => this._updatePreview());
        globalLabel.appendChild(globalRadio);
        globalLabel.append(' Global');
        scopeArea.appendChild(globalLabel);

        scopeArea.onclick = e => e.stopPropagation();
        panel.appendChild(scopeArea);

        // ── Body ──
        const body = document.createElement('div');
        body.className = 'dm-body';

        // SPACING section
        const spacingHeader = document.createElement('div');
        spacingHeader.className = 'dm-section-header';
        spacingHeader.textContent = 'Spacing';
        body.appendChild(spacingHeader);

        // Single-prop sliders
        for (const { prop, label, min, max, step, unit } of SLIDER_PROPS) {
            const initVal = parsePixels(cs.getPropertyValue(prop), prop === 'opacity' ? 1 : 0);
            body.appendChild(this._makeSliderRow(prop, label, min, max, step, unit, initVal));
        }

        // Margin / Padding with per-side controls
        for (const { prefix, label, min, max, step, unit } of SIDE_PROPS) {
            const header2 = document.createElement('div');
            header2.className = 'dm-section-header';
            header2.textContent = label;
            body.appendChild(header2);

            const sides = ['top', 'right', 'bottom', 'left'];
            const initVals = sides.map(s => parsePixels(cs.getPropertyValue(`${prefix}-${s}`)));
            body.appendChild(this._makeSideSliders(prefix, sides, min, max, step, unit, initVals));
        }

        // COLORS section
        const colorHeader = document.createElement('div');
        colorHeader.className = 'dm-section-header';
        colorHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
        const colorTitle = document.createElement('span');
        colorTitle.textContent = 'Colors';
        const contrastBadge = document.createElement('span');
        contrastBadge.style.cssText = 'font-size:10px;padding:1px 7px;border-radius:10px;font-weight:600;';
        colorHeader.appendChild(colorTitle);
        colorHeader.appendChild(contrastBadge);
        this._contrastBadgeEl = contrastBadge;
        body.appendChild(colorHeader);

        for (const { prop, label } of COLOR_PROPS) {
            const rawVal = cs.getPropertyValue(prop);
            const initHex = isTransparent(rawVal) ? null : rgbToHex(rawVal);
            body.appendChild(this._makeColorRow(prop, label, initHex));
        }

        panel.appendChild(body);

        // ── Footer ──
        const footer = document.createElement('div');
        footer.className = 'dm-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dm-btn dm-btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => this._closePanel();

        const resetBtn = document.createElement('button');
        resetBtn.className = 'dm-btn dm-btn-reset';
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Remove saved rule from user-overrides.css';
        resetBtn.onclick = () => this._resetRule(resetBtn);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'dm-btn dm-btn-save';
        saveBtn.textContent = 'Save';
        saveBtn.title = 'Write rule to user-overrides.css';
        saveBtn.onclick = () => this._saveRule(saveBtn);

        footer.appendChild(cancelBtn);
        footer.appendChild(resetBtn);
        footer.appendChild(saveBtn);
        panel.appendChild(footer);

        // Block click-through on the panel itself
        panel.addEventListener('click', e => e.stopPropagation());

        document.body.appendChild(panel);
        this._panelEl = panel;

        // Make draggable via header
        new Draggable(panel, header);
    },

    _makeSliderRow(prop, label, min, max, step, unit, initVal) {
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
        const _fmt = v => step < 1 ? parseFloat(v).toFixed(2) : v + unit;
        valDisplay.textContent = _fmt(slider.value);

        this._controlMap[prop] = { type: 'slider', el: slider, valDisplay, unit, step };

        let preVal = null;
        slider.addEventListener('mousedown', () => { preVal = slider.value; });
        slider.addEventListener('input', () => {
            const v = slider.value;
            valDisplay.textContent = _fmt(v);
            this._currentStyles[prop] = unit ? `${v}${unit}` : v;
            this._updatePreview();
        });
        slider.addEventListener('change', () => {
            if (preVal !== null && preVal !== slider.value) {
                this._pushHistory(prop,
                    unit ? `${preVal}${unit}` : preVal,
                    unit ? `${slider.value}${unit}` : slider.value);
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
            sideLabel.textContent = side[0].toUpperCase(); // T/R/B/L

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'dm-side-slider';
            slider.min = min;
            slider.max = max;
            slider.step = step;
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
        if (!initHex) picker.title = 'transparent — pick to override';

        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'dm-color-hex';
        hexDisplay.textContent = initHex || 'transparent';

        this._controlMap[prop] = { type: 'color', el: picker, hexDisplay };

        let preColor = picker.value;
        picker.addEventListener('input', () => {
            hexDisplay.textContent = picker.value;
            this._currentStyles[prop] = picker.value;
            this._updatePreview();
            if (prop === 'color' || prop === 'background-color') this._updateContrastBadge();
        });
        picker.addEventListener('change', () => {
            if (preColor !== picker.value)
                this._pushHistory(prop, preColor, picker.value);
            preColor = picker.value;
        });

        row.appendChild(lbl);
        row.appendChild(picker);
        row.appendChild(hexDisplay);

        const dropperBtn = document.createElement('button');
        dropperBtn.className = 'dm-dropper-btn';
        dropperBtn.title = 'Pick colour from screen';
        dropperBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l4 4-9.5 9.5a2 2 0 0 0-.5 1v2h2a2 2 0 0 0 1-.5L19 8l-7-6z"/><line x1="3" y1="21" x2="7" y2="17"/></svg>';
        dropperBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!('EyeDropper' in window)) {
                dropperBtn.title = 'EyeDropper not supported in this browser';
                return;
            }
            try {
                const result = await new EyeDropper().open();
                const hex = result.sRGBHex;
                picker.value = hex;
                hexDisplay.textContent = hex;
                this._pushHistory(prop, preColor, hex);
                preColor = hex;
                this._currentStyles[prop] = hex;
                this._updatePreview();
                if (prop === 'color' || prop === 'background-color') this._updateContrastBadge();
            } catch { /* user cancelled */ }
        };
        row.appendChild(dropperBtn);

        return row;
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
        const scopeTheme = this._scopeThemeRadio?.checked;
        const themeClass = this._getThemeClass();
        return scopeTheme && themeClass ? `.${themeClass} ${sel}` : sel;
    },

    _updatePreview() {
        if (!this._previewStyleEl) return;
        const rule = this._buildRule();
        this._previewStyleEl.textContent = rule || '';
        _debouncedPersist(this._fullSelector(), this._currentStyles);
    },

    // ── Undo / Redo ───────────────────────────────────────────────────────────

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
            ctrl.valDisplay.textContent = ctrl.step < 1
                ? num.toFixed(2)
                : num + ctrl.unit;
        } else if (ctrl.type === 'color') {
            const hex = valStr || '#000000';
            ctrl.el.value = hex;
            ctrl.hexDisplay.textContent = hex;
            if (prop === 'color' || prop === 'background-color') this._updateContrastBadge();
        }
    },

    // ── Contrast badge ────────────────────────────────────────────────────────

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

    // ── API calls ─────────────────────────────────────────────────────────────

    _apiPayload() {
        return {
            selector:    (this._selectorInput?.value || this._targetSelector).trim(),
            scope:       this._scopeThemeRadio?.checked ? 'theme' : 'global',
            theme_class: this._getThemeClass(),
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
            // Clear preview and local state
            this._currentStyles = {};
            this._updatePreview();
        } catch (err) {
            console.error('[DesignMode] Reset failed:', err);
            btn.textContent = 'Error ✗';
        }
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Reset'; }, 2000);
    },

    // ── Indicator ─────────────────────────────────────────────────────────────

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
    _injectPersistedPreviews();   // re-apply any unsaved preview styles from last session
    if (localStorage.getItem('lagoon_design_mode') === 'true') {
        designMode.enable();
    }
}
