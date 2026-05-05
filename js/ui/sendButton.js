/**
 * Send button state management
 */
export function toggleSendButtonState() {
    const input = document.getElementById('message-input');
    const btn = document.getElementById('send-btn');
    if (!btn) return;

    // Upscaler doesn't require a prompt
    const imageModel = document.getElementById('image-generate-model');
    if (imageModel?.value === 'upscaler') {
        btn.disabled = false;
        return;
    }

    btn.disabled = !input?.value?.trim();
}
