import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { updateOrderStatus, refreshOrderDisplays } from './order-status.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';
import { domain } from '../platform/domain.js';

let depositUpdatePending = false;
let depositEditorVersion = 0;

function depositAmountError() {
  const input = document.getElementById('depositAmountInput');
  const value = parseFloat(input.value) || 0;
  if (input.validity.badInput || !Number.isFinite(value)) return '請輸入有效的訂金金額。';
  if (value < 0) return '訂金不可小於 0。';
  if (value > state.currentDepositTotalAmount)
    return `訂金不能超過訂單總額 NT$ ${Number(state.currentDepositTotalAmount).toLocaleString('zh-TW')}。`;
  return '';
}

function setDepositFieldError(message) {
  const input = document.getElementById('depositAmountInput');
  const error = document.getElementById('depositAmountError');
  if (error.textContent !== message) error.textContent = message;
  error.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  input.setAttribute('aria-describedby', 'depositAmountHint' + (message ? ' depositAmountError' : ''));
}

function setDepositFieldsDisabled(disabled) {
  document.getElementById('depositAmountInput').disabled = disabled;
  document.getElementById('paymentNotesInput').disabled = disabled;
}

// 統一的滑動確認元件：滑到底放開即執行 onConfirm（Pointer Events 同時支援滑鼠與觸控）
export function initConfirmSlider(thumbId, progressId, onConfirm) {
  const thumb = document.getElementById(thumbId);
  const progressBar = document.getElementById(progressId);
  if (!thumb) return null;
  const track = thumb.parentElement;
  let dragging = false;
  let confirmed = false;
  let startX = 0;
  thumb.tabIndex = 0;
  thumb.setAttribute('role', 'button');
  thumb.setAttribute(
    'aria-label',
    thumbId.startsWith('delete') ? '確認刪除訂單，按 Enter 或空白鍵' : '確認變更訂單狀態，按 Enter 或空白鍵',
  );
  thumb.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || confirmed || event.repeat) return;
    event.preventDefault();
    confirmed = true;
    thumb.classList.add('completed');
    thumb.setAttribute('aria-disabled', 'true');
    onConfirm?.();
  });
  function maxX() {
    return track.offsetWidth - thumb.offsetWidth - 4;
  }
  function setPosition(x) {
    thumb.style.left = x + 'px';
    if (progressBar) {
      progressBar.style.width = (x <= 2 ? 0 : Math.min(track.offsetWidth, x + thumb.offsetWidth)) + 'px';
    }
  }
  function setSnapping(enabled) {
    thumb.classList.toggle('snapping', enabled);
    if (progressBar) progressBar.classList.toggle('snapping', enabled);
  }
  thumb.addEventListener('pointerdown', function (e) {
    if (confirmed) return;
    dragging = true;
    startX = e.clientX - thumb.offsetLeft;
    setSnapping(false);
    try {
      thumb.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 合成事件無作用中的 pointer，略過 */
    }
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', function (e) {
    if (!dragging || confirmed) return;
    setPosition(Math.max(2, Math.min(maxX(), e.clientX - startX)));
  });
  thumb.addEventListener('pointerup', function () {
    if (!dragging || confirmed) return;
    dragging = false;
    setSnapping(true);
    if (thumb.offsetLeft >= maxX() * 0.8) {
      // 放開時已滑過八成即視為確認：吸附到底並執行
      confirmed = true;
      setPosition(maxX());
      thumb.classList.add('completed');
      thumb.innerHTML = '<i class="fas fa-check"></i>';
      if (onConfirm) onConfirm();
    } else {
      // 未達門檻：動畫回彈
      setPosition(2);
    }
  });
  thumb.addEventListener('pointercancel', function () {
    if (!dragging || confirmed) return;
    dragging = false;
    setSnapping(true);
    setPosition(2);
  });
  return {
    reset: function () {
      dragging = false;
      confirmed = false;
      thumb.removeAttribute('aria-disabled');
      setSnapping(false);
      thumb.classList.remove('completed');
      thumb.innerHTML = '<i class="fas fa-chevron-right"></i>';
      setPosition(2);
    },
  };
}

export function showStatusConfirm(orderId, newStatus) {
  state.currentStatusOrderId = orderId;
  state.currentStatusValue = newStatus;
  const completing = newStatus === '完成';
  document.getElementById('statusConfirmTitle').textContent = completing
    ? '完成這筆訂單？'
    : '更新訂單狀態？';
  document.getElementById('statusConfirmDescription').textContent = completing
    ? '請確認訂單已處理完畢，再將狀態標記為完成。'
    : '請確認下方訂單資訊，再更新訂單狀態。';
  document.querySelector('#statusConfirmModal .slider-track').dataset.confirmLabel = completing
    ? '滑動完成'
    : '滑動更新';
  // 更新顯示資訊
  document.getElementById('statusOrderId').textContent = `訂單編號：${orderId}`;
  document.getElementById('statusUpdateInfo').textContent = `將更新為：${newStatus}`;
  document.getElementById('statusUpdateStatus').textContent = '';
  document.getElementById('statusUpdateStatus').className = 'status-update-status';
  // 滑到底放開才執行更新。
  if (!state.statusSliderCtrl) {
    state.statusSliderCtrl = initConfirmSlider('statusSliderThumb', 'statusSliderProgress', function () {
      const statusEl = document.getElementById('statusUpdateStatus');
      statusEl.textContent = '已確認，正在更新...';
      statusEl.classList.add('success');
      setTimeout(executeStatusUpdate, 350);
    });
  }
  state.statusSliderCtrl.reset();
  document.getElementById('statusConfirmModal').classList.add('active');
}

export function executeStatusUpdate() {
  if (!state.currentStatusOrderId || !state.currentStatusValue) return;
  updateOrderStatus(state.currentStatusOrderId, state.currentStatusValue);
  closeStatusConfirmModal();
}

export function closeStatusConfirmModal() {
  document.getElementById('statusConfirmModal').classList.remove('active');
  state.currentStatusOrderId = null;
  state.currentStatusValue = null;
}

export function showDeleteConfirm(orderId, customerName) {
  state.deleteOrderId = orderId;
  // 更新顯示資訊
  document.getElementById('deleteOrderId').textContent = `訂單編號：${orderId}`;
  document.getElementById('deleteCustomerName').textContent = `客戶：${customerName}`;
  const status = document.getElementById('deleteStatus');
  status.textContent = '';
  status.classList.remove('show', 'success');
  // 滑到底放開才執行刪除。
  if (!state.deleteSliderCtrl) {
    state.deleteSliderCtrl = initConfirmSlider('deleteSliderThumb', 'deleteSliderProgress', function () {
      executeDelete();
    });
  }
  state.deleteSliderCtrl.reset();
  document.getElementById('deleteConfirmModal').classList.add('active');
}

export function closeDeleteConfirmModal() {
  document.getElementById('deleteConfirmModal').classList.remove('active');
  state.deleteOrderId = null;
}

// ==========================================
//        訂金Modal適配器
// ==========================================
export function showDepositModal(orderId, totalAmount, depositAmount) {
  depositEditorVersion++;
  setDepositFieldsDisabled(false);
  document.getElementById('depositSaveError').hidden = true;
  state.currentDepositOrderId = orderId;
  state.currentDepositTotalAmount = totalAmount;
  state.currentDepositAmount = depositAmount;
  document.getElementById('depositOrderInfo').textContent =
    `訂單編號：${orderId}\n總金額：NT$ ${Number(totalAmount).toLocaleString('zh-TW')}`;
  document.getElementById('depositAmountInput').value = depositAmount || '';
  document.getElementById('paymentNotesInput').value = '';
  document.getElementById('depositAmountHint').textContent =
    `訂金不可超過 NT$ ${Number(totalAmount).toLocaleString('zh-TW')}；留空或 0 表示未付訂金。`;
  updateDepositCalculation();
  document.getElementById('depositModal').classList.add('active');
}

export function closeDepositModal() {
  depositEditorVersion++;
  document.getElementById('depositModal').classList.remove('active');
  state.currentDepositOrderId = null;
  state.currentDepositTotalAmount = 0;
  state.currentDepositAmount = 0;
}

export function updateDepositCalculation() {
  const depositInput = document.getElementById('depositAmountInput');
  const newDepositAmount = parseFloat(depositInput.value) || 0;
  const calculationResult = document.getElementById('depositCalculationResult');
  const error = depositAmountError();
  setDepositFieldError(error);
  if (error) {
    calculationResult.style.display = 'none';
    return;
  }
  if (newDepositAmount > 0) {
    calculationResult.style.display = 'block';
    const { remainingAmount, newStatus } = domain('payment', {
      total: state.currentDepositTotalAmount,
      paid: newDepositAmount,
    });
    const statusColor = newStatus === '已付訂金' ? 'var(--gj-warning-soft)' : 'var(--gj-success-soft)';
    document.getElementById('currentDepositText').textContent =
      `NT$ ${newDepositAmount.toLocaleString('zh-TW')}`;
    document.getElementById('remainingAmountText').textContent =
      `NT$ ${remainingAmount.toLocaleString('zh-TW')}`;
    document.getElementById('remainingAmountText').style.color =
      remainingAmount > 0 ? 'var(--gj-danger)' : 'var(--gj-success)';
    const statusText = document.getElementById('newStatusText');
    statusText.textContent = newStatus;
    statusText.style.backgroundColor = statusColor;
    statusText.style.color = newStatus === '已付訂金' ? 'var(--gj-warning)' : 'var(--gj-success)';
  } else {
    calculationResult.style.display = 'none';
  }
}

export function confirmDepositUpdate() {
  if (depositUpdatePending) return;
  const depositAmount = parseFloat(document.getElementById('depositAmountInput').value) || 0;
  const paymentNotes = document.getElementById('paymentNotesInput').value.trim();
  if (!state.currentDepositOrderId) {
    showAlert('訂單資訊錯誤', 'error');
    return;
  }
  const error = depositAmountError();
  setDepositFieldError(error);
  if (error) return;
  const confirmBtn = document.getElementById('confirmDepositBtn');
  const editorVersion = depositEditorVersion;
  depositUpdatePending = true;
  document.getElementById('depositSaveError').hidden = true;
  setDepositFieldsDisabled(true);
  setButtonLoading(confirmBtn, true, '設定中...');
  rpc
    .withSuccessHandler(function (result) {
      depositUpdatePending = false;
      setDepositFieldsDisabled(false);
      setButtonLoading(confirmBtn, false);
      const cachedOrder = state.currentSearchOrders.find(
        (order) => (order.id || order.orderId) === result.orderId,
      );
      if (cachedOrder) {
        cachedOrder.depositAmount = result.depositAmount;
        cachedOrder.remainingAmount = result.remainingAmount;
      }
      showAlert(`訂金已設定：NT$ ${result.depositAmount}，狀態更新為：${result.newStatus}`, 'success');
      if (editorVersion === depositEditorVersion) closeDepositModal();
      // 刷新頁面顯示
      refreshOrderDisplays(result.orderId, result.newStatus);
    })
    .withFailureHandler(function (error) {
      depositUpdatePending = false;
      setDepositFieldsDisabled(false);
      setButtonLoading(confirmBtn, false);
      if (editorVersion === depositEditorVersion) {
        document.getElementById('depositSaveErrorMessage').textContent = error?.message || '無法連線';
        const feedback = document.getElementById('depositSaveError');
        feedback.hidden = false;
        feedback.focus();
      } else handleError(error);
    })
    .updateOrderDeposit(state.currentDepositOrderId, depositAmount, paymentNotes);
}

export function executeDelete() {
  if (!state.deleteOrderId) return;
  const orderId = state.deleteOrderId;
  const status = document.getElementById('deleteStatus');
  status.textContent = '正在刪除訂單...';
  status.classList.add('show');
  status.classList.remove('success');
  const onDeleteSuccess = function () {
    // 只移除該筆訂單列，保留其餘搜尋結果
    const rowsToRemove = new Set();
    document.querySelectorAll(`#searchResults button[data-oid="${orderId}"]`).forEach(function (btn) {
      const tr = btn.closest('tr');
      if (tr) rowsToRemove.add(tr);
    });
    rowsToRemove.forEach(function (tr) {
      const expandedRow = tr.nextElementSibling;
      if (expandedRow && expandedRow.classList.contains('order-items-row')) expandedRow.remove();
      tr.remove();
    });
    state.currentSearchOrders = state.currentSearchOrders.filter(
      (order) => (order.id || order.orderId) !== orderId,
    );
    if (state.expandedSearchOrderId === orderId) state.expandedSearchOrderId = null;
    closeDeleteConfirmModal();
    showAlert('訂單已刪除', 'success');
  };
  const onDeleteFailure = function (error) {
    // 失敗時重置滑動元件，讓使用者可重試
    status.textContent = '';
    status.classList.remove('show');
    if (state.deleteSliderCtrl) state.deleteSliderCtrl.reset();
    handleError(error);
  };
  if (isConnected()) {
    rpc.withSuccessHandler(onDeleteSuccess).withFailureHandler(onDeleteFailure).deleteOrder(orderId);
  } else {
    onDeleteFailure(new Error('尚未連接 Firebase'));
  }
}
