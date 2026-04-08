/**
 * Utility Functions
 */

let md;

export function initMarkdown() {
    if (typeof markdownit !== 'undefined') {
        md = new markdownit({
            html: false,
            linkify: true,
            typographer: false,
            breaks: true
        });
    } else {
        console.warn('Markdown-it library not loaded. Falling back to plain text.');
        md = {
            render: (text) => text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
        };
    }
}

export function parseMarkdown(text, searchResults = []) {
    if (!md) initMarkdown();
    
    // Strip OOC nudges in double brackets ((like this)) from the UI
    let cleanedText = text.replace(/\(\([\s\S]*?\)\)/g, '').trim();
    
    // Strip various citation formats before rendering:
    // 1. "word.13 " or "word.56\n" - decimal citation style
    cleanedText = cleanedText.replace(/([^0-9])\.(\d{1,3})(?=\s|$|[A-Z])/g, '$1.');

    // 2. [1], [2,3], [1-5] - bracket citation style
    cleanedText = cleanedText.replace(/\[(\d+(?:[,\-]\d+)*)\]/g, '');

    // 3. [^1], [^2,3] - markdown footnote style
    cleanedText = cleanedText.replace(/\[\^(\d+(?:[,\-]\d+)*)\]/g, '');

    // 4. Superscript unicode numbers (¹²³⁴⁵⁶⁷⁸⁹⁰)
    cleanedText = cleanedText.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '');

    // Handle <think> tags - wrap in collapsible details
    // Use a unique but markdown-safe placeholder
    const thinks = [];
    cleanedText = cleanedText.replace(/<think>([\s\S]*?)(?:<\/think>|$)/g, (match, content) => {
        const placeholder = `THINKPLACEHOLDER${thinks.length}ENDTHINK`;
        thinks.push(content);
        return placeholder;
    });

    let html = md.render(cleanedText);

    // Restore thinks as collapsible blocks
    thinks.forEach((content, i) => {
        const placeholder = `THINKPLACEHOLDER${i}ENDTHINK`;
        const renderedContent = md.render(content.trim());
        const collapsible = `<details class="think-container"><summary>Thinking...</summary><div class="think-content">${renderedContent}</div></details>`;
        html = html.replace(placeholder, collapsible);
    });

    // Remove citation markers entirely (e.g., ^1,2^)
    html = html.replace(/\^([\d,]+)\^/g, '');

    // Remove any remaining bracket citations that got through
    html = html.replace(/\[(\d+(?:[,\-]\d+)*)\]/g, '');

    return html;
}

/**
 * Strips <think> tags and their content from text for clean export.
 */
export function cleanThinking(text) {
    if (!text) return '';
    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
}

/**
 * Strips basic markdown markers (*, **, _, __) for clean text export.
 */
export function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
        .replace(/(\*|_)(.*?)\1/g, '$2')   // Italics
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
        .replace(/^#+\s+/gm, '')           // Headers
        .trim();
}

export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

export function sanitizeFilename(filename) {
    return "".concat(...filename.split('').filter(c => 
        /[a-zA-Z0-9 _-]/.test(c)
    )).trim();
}

export function formatDate(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
}

export function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Generate a geometric SVG avatar from a string (name/id)
 * Returns a data URL that can be used as img src
 */
export function generateGeometricAvatar(seed, size = 128) {
    // Simple hash function for deterministic randomness
    const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    };

    // Seeded random number generator
    const seedHash = hash(seed || 'default');
    let state = seedHash;
    const random = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };

    // Color palette - modern, pleasing colors
    const palettes = [
        ['#667eea', '#764ba2', '#f093fb'], // Purple gradient
        ['#4facfe', '#00f2fe', '#43e97b'], // Blue-green
        ['#fa709a', '#fee140', '#fa709a'], // Pink-yellow
        ['#a8edea', '#fed6e3', '#d299c2'], // Soft pastels
        ['#ff9a9e', '#fecfef', '#fecfef'], // Warm pink
        ['#667eea', '#764ba2', '#6B8DD6'], // Deep purple
        ['#f5576c', '#f093fb', '#4facfe'], // Vibrant mix
        ['#0ba360', '#3cba92', '#30dd8a'], // Green
        ['#eb3349', '#f45c43', '#ff6b6b'], // Red-orange
        ['#ee0979', '#ff6a00', '#ffb347'], // Sunset
    ];

    const palette = palettes[seedHash % palettes.length];

    // Generate background gradient angle
    const gradientAngle = Math.floor(random() * 360);

    // Shape generators
    const shapes = [];
    const numShapes = 3 + Math.floor(random() * 4); // 3-6 shapes

    for (let i = 0; i < numShapes; i++) {
        const shapeType = Math.floor(random() * 4);
        const x = random() * size;
        const y = random() * size;
        const baseSize = size * (0.2 + random() * 0.5);
        const color = palette[Math.floor(random() * palette.length)];
        const opacity = 0.4 + random() * 0.5;
        const rotation = random() * 360;

        switch (shapeType) {
            case 0: // Circle
                shapes.push(`<circle cx="${x}" cy="${y}" r="${baseSize / 2}" fill="${color}" opacity="${opacity}"/>`);
                break;
            case 1: // Rectangle
                shapes.push(`<rect x="${x - baseSize/2}" y="${y - baseSize/2}" width="${baseSize}" height="${baseSize * (0.5 + random() * 0.5)}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})"/>`);
                break;
            case 2: // Triangle
                const h = baseSize * 0.866;
                shapes.push(`<polygon points="${x},${y - h/2} ${x - baseSize/2},${y + h/2} ${x + baseSize/2},${y + h/2}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})"/>`);
                break;
            case 3: // Hexagon
                const hexPoints = [];
                for (let j = 0; j < 6; j++) {
                    const angle = (j * 60 - 30) * Math.PI / 180;
                    hexPoints.push(`${x + baseSize/2 * Math.cos(angle)},${y + baseSize/2 * Math.sin(angle)}`);
                }
                shapes.push(`<polygon points="${hexPoints.join(' ')}" fill="${color}" opacity="${opacity}"/>`);
                break;
        }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
            <linearGradient id="bg" gradientTransform="rotate(${gradientAngle})">
                <stop offset="0%" stop-color="${palette[0]}"/>
                <stop offset="100%" stop-color="${palette[1]}"/>
            </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" fill="url(#bg)"/>
        ${shapes.join('\n        ')}
    </svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Code file extensions for syntax highlighting hints
export const CODE_EXTENSIONS = {
    'py': 'python', 'js': 'javascript', 'css': 'css', 'html': 'html',
    'json': 'json', 'md': 'markdown', 'sh': 'bash', 'yaml': 'yaml',
    'yml': 'yaml', 'toml': 'toml', 'xml': 'xml', 'sql': 'sql',
    'c': 'c', 'cpp': 'cpp', 'h': 'c', 'java': 'java', 'go': 'go',
    'rs': 'rust', 'ts': 'typescript', 'tsx': 'tsx', 'jsx': 'jsx',
    'vue': 'vue', 'svelte': 'svelte', 'rb': 'ruby', 'php': 'php',
    'swift': 'swift', 'kt': 'kotlin', 'scala': 'scala', 'r': 'r',
    'lua': 'lua', 'pl': 'perl', 'ex': 'elixir', 'exs': 'elixir',
    'hs': 'haskell', 'clj': 'clojure', 'lisp': 'lisp', 'el': 'elisp',
    'vim': 'vim', 'conf': 'conf', 'ini': 'ini', 'env': 'env',
    'log': 'log', 'csv': 'csv'
};