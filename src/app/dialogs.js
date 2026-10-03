import { state } from './state.js';

let cancelCallback = null;

// All decisions use the same dismiss-left / action-right dialog, including
// callers in the Firebase bridge that previously used window.confirm().
export function showConfirmModal(message, callback, options = {}) {
  // Safari does not focus buttons on a pointer click. Record an explicit opener
  // before the accessibility observer captures the return position.
  if (options.opener?.isConnected) options.opener.focus({ preventScroll: true });
  closeConfirmModal();
  document.getElementById('confirmModalTitle').textContent = options.title || '確認操作';
  document.getElementById('confirmModalMessage').textContent = message;
  document.getElementById('confirmCancelBtn').textContent = options.cancelLabel || '取消';
  const button = document.getElementById('confirmBtn');
  button.textContent = options.confirmLabel || '確認';
  button.className = `gj-btn gj-btn--${options.danger ? 'danger' : 'primary'}`;
  state.confirmCallback = callback;
  cancelCallback = options.onCancel || null;
  const dialog = document.getElementById('confirmModal');
  dialog.classList.add('active');
  // Also cover a second request replacing an already open confirmation.
  // The accessibility observer owns normal opening and focus restoration.
  if (!dialog.inert) document.getElementById('confirmCancelBtn').focus({ preventScroll: true });
}

export function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
  state.confirmCallback = null;
  const cancel = cancelCallback;
  cancelCallback = null;
  cancel?.();
}

export function executeConfirmCallback() {
  const callback = state.confirmCallback;
  if (!callback) return;
  // Consume and close before running the action so double clicks cannot repeat it.
  cancelCallback = null;
  closeConfirmModal();
  callback();
}

export function requestConfirmation(message, options = {}) {
  return new Promise((resolve) => {
    showConfirmModal(message, () => resolve(true), { ...options, onCancel: () => resolve(false) });
  });
}
