import { closeCartModal } from '../app/cart.js';
import { closeCapacityWarningModal } from '../app/checkout.js';
import { closeDeleteConfirmModal, closeStatusConfirmModal, closeDepositModal } from '../app/payments.js';
import { closeConfirmModal } from '../app/dialogs.js';

const selector = '.modal, .cart-sidebar, #firebaseAuthOverlay, #firebaseShopOverlay';
const focusable =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
const close = {
  cartModal: closeCartModal,
  capacityWarningModal: closeCapacityWarningModal,
  deleteConfirmModal: closeDeleteConfirmModal,
  statusConfirmModal: closeStatusConfirmModal,
  depositModal: closeDepositModal,
  confirmModal: closeConfirmModal,
};
const visible = (element) => element.getClientRects().length > 0 && !element.closest('[inert]');

export function initializeAccessibility() {
  let active = null;
  const returns = new WeakMap();
  function enhance() {
    document
      .querySelectorAll('i.fas,i.far,i.fab')
      .forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
    document.querySelectorAll('label:not([for])').forEach((label) => {
      const control =
        label.querySelector('input[id],select[id],textarea[id]') ||
        label.parentElement?.querySelector('input[id],select[id],textarea[id]');
      if (control) label.htmlFor = control.id;
    });
    document.querySelectorAll('input,select,textarea').forEach((control) => {
      if (!control.labels?.length && !control.hasAttribute('aria-label'))
        control.setAttribute('aria-label', control.placeholder || control.id || '輸入欄位');
    });
    document.querySelectorAll('button').forEach((button) => {
      if (!button.hasAttribute('type')) button.type = 'button';
      if (button.hasAttribute('aria-label')) return;
      const text = button.textContent.trim();
      if (text === '×') button.setAttribute('aria-label', '關閉');
      if (!text) {
        const icon = button.querySelector('i');
        const label = icon?.className.includes('minus')
          ? '減少數量'
          : icon?.className.includes('plus')
            ? '增加數量'
            : icon?.className.includes('trash')
              ? '刪除'
              : '關閉';
        button.setAttribute('aria-label', label);
      }
    });
    document.querySelectorAll('.grove-btn-group button,.name-title-group button').forEach((button) => {
      const value = String(button.classList.contains('active'));
      if (button.getAttribute('aria-pressed') !== value) button.setAttribute('aria-pressed', value);
    });
    const dialogs = [...document.querySelectorAll(selector)].filter(
      (element) => element.classList.contains('active') && element.getClientRects().length,
    );
    const top =
      dialogs
        .sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0))
        .at(-1) || null;
    document.querySelectorAll(selector).forEach((dialog) => {
      dialog.inert = dialog !== top;
    });
    if (top !== active) {
      const previous = active;
      active = top;
      document.querySelector('main').inert = Boolean(top);
      document.querySelector('header').inert = Boolean(top);
      document.querySelector('.fab-cart').inert = Boolean(top);
      if (top) {
        returns.set(top, document.activeElement);
        top.setAttribute('role', 'dialog');
        top.setAttribute('aria-modal', 'true');
        if (!top.hasAttribute('aria-label') && !top.hasAttribute('aria-labelledby')) {
          const heading = top.querySelector('h2,h3');
          if (heading) {
            heading.id ||= 'dialog-title-' + (top.id || Math.random().toString(36).slice(2));
            top.setAttribute('aria-labelledby', heading.id);
          } else top.setAttribute('aria-label', '操作視窗');
        }
        const first = [...top.querySelectorAll(focusable)].find(visible);
        top.tabIndex = -1;
        (first || top).focus({ preventScroll: true });
      } else if (previous) {
        const target = returns.get(previous);
        if (target?.isConnected && visible(target)) target.focus({ preventScroll: true });
      }
    }
  }
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      enhance();
    });
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (!active) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (close[active.id]) close[active.id]();
        else if (!['firebaseAuthOverlay', 'firebaseShopOverlay'].includes(active.id))
          active.classList.remove('active');
      }
      if (event.key === 'Tab') {
        const controls = [...active.querySelectorAll(focusable)].filter(visible);
        const first = controls[0] || active,
          last = controls.at(-1) || active;
        if (
          event.shiftKey &&
          (document.activeElement === first || !active.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !active.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    true,
  );
  document.addEventListener('focusin', (event) => {
    if (active && !active.contains(event.target))
      ([...active.querySelectorAll(focusable)].find(visible) || active).focus();
  });
  enhance();
}
