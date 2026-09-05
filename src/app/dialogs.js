import { state } from './state.js';

// ==========================================
//        確認Modal適配器
// ==========================================
export function showConfirmModal(message, callback) {
  document.getElementById('confirmModalMessage').textContent = message;
  state.confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('active');
}

export function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
  state.confirmCallback = null;
}

export function executeConfirmCallback() {
  if (state.confirmCallback) {
    state.confirmCallback();
  }
}
