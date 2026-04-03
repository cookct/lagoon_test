/**
 * Scroll Management
 */

import { state, dom } from '../state.js';

export function isNearBottom() {
    if (!dom.chatMessages) return true;
    const threshold = 150;
    const scrollEl = dom.chatMessages;
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
}

function smoothScrollStep() {
    if (!dom.chatMessages) return;

    const scrollEl = dom.chatMessages;
    const currentScroll = scrollEl.scrollTop;
    const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
    state.targetScrollTop = maxScroll;

    const distance = state.targetScrollTop - currentScroll;

    if (Math.abs(distance) < 1) {
        scrollEl.scrollTop = state.targetScrollTop;
        state.scrollAnimationId = null;
        return;
    }

    const step = distance * 0.15;
    scrollEl.scrollTop = currentScroll + step;
    state.scrollAnimationId = requestAnimationFrame(smoothScrollStep);
}

export function autoScroll(force = false) {
    if (!dom.chatMessages) return;

    if (state.userScrolledAway && !force) return;

    if (force || isNearBottom()) {
        if (force) {
            dom.chatMessages.scrollTo({
                top: dom.chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            if (!state.scrollAnimationId) {
                state.scrollAnimationId = requestAnimationFrame(smoothScrollStep);
            }
        }
    }
}

export function setupScrollDetection() {
    if (!dom.chatMessages) return;

    dom.chatMessages.addEventListener('wheel', (e) => {
        if (e.deltaY < 0) {
            state.userScrolledAway = true;
            if (state.scrollAnimationId) {
                cancelAnimationFrame(state.scrollAnimationId);
                state.scrollAnimationId = null;
            }
        }
        if (e.deltaY > 0 && isNearBottom()) {
            state.userScrolledAway = false;
        }
    }, { passive: true });

    let touchStartY = 0;
    dom.chatMessages.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    dom.chatMessages.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        if (touchY > touchStartY) {
            state.userScrolledAway = true;
            if (state.scrollAnimationId) {
                cancelAnimationFrame(state.scrollAnimationId);
                state.scrollAnimationId = null;
            }
        }
        if (touchY < touchStartY && isNearBottom()) {
            state.userScrolledAway = false;
        }
    }, { passive: true });
}

export function handleScrollVisibility() {
    if (!dom.chatMessages) return;
    const threshold = 100;
    const scrollEl = dom.chatMessages;

    // Bottom button logic - show when NOT near bottom
    if (dom.scrollBottomBtn) {
        const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
        if (nearBottom) {
            dom.scrollBottomBtn.classList.add('hidden');
        } else {
            dom.scrollBottomBtn.classList.remove('hidden');
        }
    }

    // Top button logic - show when NOT near top
    if (dom.scrollTopBtn) {
        const nearTop = scrollEl.scrollTop < threshold;
        if (nearTop) {
            dom.scrollTopBtn.classList.add('hidden');
        } else {
            dom.scrollTopBtn.classList.remove('hidden');
        }
    }
}

export function scrollToBottom() {
    if (dom.chatMessages) {
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }
}