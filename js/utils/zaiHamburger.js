/**
 * Shared factory for the z.ai options hamburger button (≡).
 *
 * Used in three places that render model optgroups:
 *   - UIManager.initCustomDropdown()  → custom dropdown component
 *   - UIManager.updateCustomDropdown() → refresh of same
 *   - main.js showModelSelector()      → context-menu popup
 *
 * All three need the same button with the same click behavior.
 * Extracting here prevents drift when the button needs changes.
 */

export function createZaiHamburger() {
    const btn = document.createElement('button');
    btn.className = 'zai-header-btn';
    btn.type = 'button';
    btn.title = 'Z.AI Options';
    btn.innerHTML = '&#9776;';
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { zaiOptionsManager } = await import('../components/ZaiOptionsManager.js');
        zaiOptionsManager.init();
        zaiOptionsManager.openModal();
    });
    return btn;
}
