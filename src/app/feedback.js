import { state } from './state.js';

export function handleError(error) {
  showAlert('發生錯誤: ' + error.message, 'error');
  console.error('Error:', error);
}

// --- Alert System ---
export function showAlert(message, type = 'success', duration = 0) {
  const alertContainer = document.getElementById('alertContainer');
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const iconMap = {
    success: 'fa-check',
    error: 'fa-exclamation',
    warning: 'fa-exclamation',
    info: 'fa-info',
  };
  const icon = document.createElement('div');
  icon.className = 'alert-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i>`;
  const content = document.createElement('div');
  content.className = 'alert-content';
  const title = document.createElement('div');
  title.className = 'alert-title';
  title.textContent =
    { success: '操作成功', error: '操作未完成', warning: '請留意', info: '通知' }[type] || '通知';
  const text = document.createElement('div');
  text.className = 'alert-message';
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', '關閉通知');
  close.className = 'alert-close';
  close.innerHTML = '<i class="fas fa-times"></i>';
  content.append(title, text);
  alertDiv.appendChild(icon);
  alertDiv.appendChild(content);
  alertDiv.appendChild(close);
  alertContainer.prepend(alertDiv);
  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    alertDiv.style.opacity = '0';
    alertDiv.style.transform = 'translateX(30%)';
    setTimeout(() => alertDiv.remove(), 300);
  }
  // 點擊即關閉
  alertDiv.addEventListener('click', dismiss);
  // 錯誤與多行重要訊息停留較久；呼叫端可用 duration 指定
  const holdTime = duration > 0 ? duration : type === 'error' || message.includes('\n') ? 6000 : 3000;
  setTimeout(dismiss, holdTime);
}

// --- Button Loading State Management ---
export function setButtonLoading(button, isLoading = true, loadingText = '') {
  if (typeof button === 'string') {
    button = document.getElementById(button);
  }
  if (!button) return;
  button.setAttribute('aria-busy', String(isLoading));
  // 檢查是否為禮盒規格按鈕（不需要隱藏內容）
  const isGiftboxSizeBtn = button.closest('#giftboxStep1') !== null;
  if (isLoading) {
    // 保存原始內容
    if (!button.dataset.originalContent) {
      button.dataset.originalContent = button.innerHTML;
    }
    // 設置載入狀態
    button.disabled = true;
    button.classList.add('loading');
    if (loadingText) {
      button.dataset.loadingText = loadingText;
      // 禮盒規格按鈕保持內容可見，只顯示 spinner overlay
      if (!isGiftboxSizeBtn) {
        button.innerHTML = `<span class="btn-text btn-text-hidden">${button.dataset.originalContent}</span>`;
      }
    }
  } else {
    // 恢復原始狀態
    button.disabled = false;
    button.classList.remove('loading');
    if (button.dataset.originalContent) {
      button.innerHTML = button.dataset.originalContent;
      delete button.dataset.originalContent;
    }
    if (button.dataset.loadingText) {
      delete button.dataset.loadingText;
    }
  }
}

export function preventDoubleClick(buttonId, func, delay = 1000) {
  return function (...args) {
    if (state.buttonClickStates.has(buttonId)) {
      return; // 如果正在處理，直接返回
    }
    state.buttonClickStates.add(buttonId);
    try {
      const result = func.apply(this, args);
      // 如果是Promise，等待完成後清除狀態
      if (result && typeof result.then === 'function') {
        result.finally(() => {
          setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
        });
      } else {
        // 同步函數，延遲清除狀態
        setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
      }
      return result;
    } catch (error) {
      setTimeout(() => state.buttonClickStates.delete(buttonId), delay);
      throw error;
    }
  };
}
