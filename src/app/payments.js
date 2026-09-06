import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { updateOrderStatus, refreshOrderDisplays } from './order-status.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';
import { domain } from '../platform/domain.js';

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
    ? '向右滑動，確認完成'
    : '向右滑動，確認更新';
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
  state.currentDepositOrderId = orderId;
  state.currentDepositTotalAmount = totalAmount;
  state.currentDepositAmount = depositAmount;
  document.getElementById('depositOrderInfo').textContent =
    `訂單編號：${orderId} - 總金額：NT$ ${totalAmount}`;
  document.getElementById('depositAmountInput').value = depositAmount || '';
  document.getElementById('paymentNotesInput').value = '';
  updateDepositCalculation();
  document.getElementById('depositModal').classList.add('active');
}

export function closeDepositModal() {
  document.getElementById('depositModal').classList.remove('active');
  state.currentDepositOrderId = null;
  state.currentDepositTotalAmount = 0;
  state.currentDepositAmount = 0;
}

export function updateDepositCalculation() {
  const depositInput = document.getElementById('depositAmountInput');
  const newDepositAmount = parseFloat(depositInput.value) || 0;
  const calculationResult = document.getElementById('depositCalculationResult');
  if (newDepositAmount < 0 || newDepositAmount > state.currentDepositTotalAmount) {
    depositInput.style.borderColor = '#e74c3c';
    calculationResult.style.display = 'none';
    return;
  } else {
    depositInput.style.borderColor = '#e5e7eb';
  }
  if (newDepositAmount > 0) {
    calculationResult.style.display = 'block';
    const { remainingAmount, newStatus } = domain('payment', {
      total: state.currentDepositTotalAmount,
      paid: newDepositAmount,
    });
    const statusColor = newStatus === '已付訂金' ? '#99621a' : '#226b4e';
    document.getElementById('currentDepositText').textContent = `NT$ ${newDepositAmount}`;
    document.getElementById('remainingAmountText').textContent = `NT$ ${remainingAmount}`;
    document.getElementById('remainingAmountText').style.color = remainingAmount > 0 ? '#e74c3c' : '#27ae60';
    const statusText = document.getElementById('newStatusText');
    statusText.textContent = newStatus;
    statusText.style.backgroundColor = statusColor;
    statusText.style.color = 'white';
  } else {
    calculationResult.style.display = 'none';
  }
}

export function confirmDepositUpdate() {
  const depositAmount = parseFloat(document.getElementById('depositAmountInput').value) || 0;
  const paymentNotes = document.getElementById('paymentNotesInput').value.trim();
  if (!state.currentDepositOrderId) {
    showAlert('訂單資訊錯誤', 'error');
    return;
  }
  if (depositAmount > state.currentDepositTotalAmount) {
    showAlert('訂金不能超過總金額', 'error');
    return;
  }
  const confirmBtn = document.getElementById('confirmDepositBtn');
  setButtonLoading(confirmBtn, true, '設定中...');
  rpc
    .withSuccessHandler(function (result) {
      setButtonLoading(confirmBtn, false);
      const cachedOrder = state.currentSearchOrders.find(
        (order) => (order.id || order.orderId) === result.orderId,
      );
      if (cachedOrder) {
        cachedOrder.depositAmount = result.depositAmount;
        cachedOrder.remainingAmount = result.remainingAmount;
      }
      showAlert(`訂金已設定：NT$ ${result.depositAmount}，狀態更新為：${result.newStatus}`, 'success');
      closeDepositModal();
      // 刷新頁面顯示
      refreshOrderDisplays(result.orderId, result.newStatus);
    })
    .withFailureHandler(function (error) {
      setButtonLoading(confirmBtn, false);
      handleError(error);
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
