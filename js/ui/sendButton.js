/**
 * Send button state management
 */
export function toggleSendButtonState() {
    const input = document.getElementById('message-input');
    const btn = document.getElementById('send-btn');
    if (btn) btn.disabled = !input?.value?.trim();
}
