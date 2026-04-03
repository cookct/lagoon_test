/**
 * Custom Dialog System
 * Replaces native alert/confirm/prompt with styled dialogs
 */

let dialogResolve = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let dialogOverlay, dialogBox, dialogHeader, dialogMessage, dialogInput, dialogOk, dialogCancel;

export function initDialog() {
    dialogOverlay = document.getElementById('dialog-overlay');
    dialogBox = document.getElementById('dialog-box');
    dialogHeader = document.getElementById('dialog-header');
    dialogMessage = document.getElementById('dialog-message');
    dialogInput = document.getElementById('dialog-input');
    dialogOk = document.getElementById('dialog-ok');
    dialogCancel = document.getElementById('dialog-cancel');

    if (!dialogOverlay) return;

    // Make dialog draggable
    dialogHeader.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = dialogBox.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        dialogBox.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;
        dialogBox.style.left = `${x}px`;
        dialogBox.style.top = `${y}px`;
        dialogBox.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    dialogOk.addEventListener('click', () => {
        dialogOverlay.classList.add('hidden');
        const inputVal = dialogInput.value;
        if (dialogResolve) {
            if (!dialogInput.classList.contains('hidden')) {
                dialogResolve(inputVal);
            } else if (!dialogCancel.classList.contains('hidden')) {
                dialogResolve(true);
            } else {
                dialogResolve();
            }
        }
    });

    dialogCancel.addEventListener('click', () => {
        dialogOverlay.classList.add('hidden');
        if (dialogResolve) {
            if (!dialogInput.classList.contains('hidden')) {
                dialogResolve(null);
            } else {
                dialogResolve(false);
            }
        }
    });

    // Handle Enter/Escape keys
    dialogOverlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialogOk.click();
        } else if (e.key === 'Escape') {
            if (!dialogCancel.classList.contains('hidden')) {
                dialogCancel.click();
            } else {
                dialogOk.click();
            }
        }
    });
}

function resetDialogPosition() {
    dialogBox.style.left = '50%';
    dialogBox.style.top = '50%';
    dialogBox.style.transform = 'translate(-50%, -50%)';
    dialogBox.style.transition = '';
}

function showDialog(message, type = 'alert', defaultValue = '') {
    if (!dialogOverlay) initDialog();
    return new Promise((resolve) => {
        dialogResolve = resolve;
        dialogMessage.textContent = message;
        resetDialogPosition();

        if (type === 'prompt') {
            dialogInput.classList.remove('hidden');
            dialogInput.value = defaultValue;
            dialogCancel.classList.remove('hidden');
            setTimeout(() => dialogInput.focus(), 50);
        } else if (type === 'confirm') {
            dialogInput.classList.add('hidden');
            dialogCancel.classList.remove('hidden');
        } else {
            dialogInput.classList.add('hidden');
            dialogCancel.classList.add('hidden');
        }

        dialogOverlay.classList.remove('hidden');
        if (type !== 'prompt') {
            setTimeout(() => dialogOk.focus(), 50);
        }
    });
}

export const lagoonAlert = (msg) => showDialog(msg, 'alert');
export const lagoonConfirm = (msg) => showDialog(msg, 'confirm');
export const lagoonPrompt = (msg, defaultVal = '') => showDialog(msg, 'prompt', defaultVal);