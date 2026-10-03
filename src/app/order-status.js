import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { setButtonLoading, showAlert, handleError } from './feedback.js';

export function updateOrderStatus(orderId, newStatus) {
  // 由按鈕觸發時顯示按鈕載入狀態；由滑動元件觸發時 event.target 不是按鈕
  const updateBtn = window.event?.currentTarget?.tagName === 'BUTTON' ? window.event.currentTarget : null;
  if (updateBtn) setButtonLoading(updateBtn, true, '更新中...');
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        if (updateBtn) setButtonLoading(updateBtn, false);
        showAlert(`訂單狀態已更新為: ${newStatus}`, 'success');
        // 即時更新頁面上的訂單狀態顯示
        refreshOrderDisplays(orderId, newStatus);
      })
      .withFailureHandler(function (error) {
        if (updateBtn) setButtonLoading(updateBtn, false);
        handleError(error);
      })
      .updateOrderStatus(orderId, newStatus);
  } else {
    if (updateBtn) setButtonLoading(updateBtn, false);
    showAlert('尚未連接 Firebase，無法更新訂單', 'error');
  }
}

// 新增函數：即時更新頁面上的訂單狀態顯示
export function refreshOrderDisplays(orderId, newStatus) {
  const cachedOrder = state.currentSearchOrders.find((order) => (order.id || order.orderId) === orderId);
  if (cachedOrder) cachedOrder.status = newStatus;
  // 更新搜尋結果表格中的狀態標籤
  const searchResults = document.getElementById('searchResults');
  if (searchResults) {
    searchResults.querySelectorAll('tbody tr').forEach((row) => {
      const detailBtn = row.querySelector(`button[data-oid="${orderId}"]`);
      if (detailBtn) {
        const pill = row.querySelector('.status-pill');
        if (pill) {
          pill.textContent = newStatus;
          pill.className = 'status-pill ' + getStatusPillClass(newStatus);
        }
      }
    });
  }
  // 如果有打開的訂單詳情modal，也要更新
  const orderDetailModals = document.querySelectorAll('.modal.active');
  orderDetailModals.forEach((modal) => {
    const modalContent = modal.textContent;
    if (modalContent.includes(orderId)) {
      // 更新modal中的狀態標籤
      modal.querySelectorAll('.order-info-item').forEach((item) => {
        const label = item.querySelector('.order-info-label');
        const pill = item.querySelector('.status-pill');
        if (label && pill && label.textContent.includes('訂單狀態')) {
          pill.textContent = newStatus;
          pill.className = 'status-pill ' + getStatusPillClass(newStatus);
        }
      });
      // 更新modal中的按鈕狀態
      const modalFooter = modal.querySelector('.modal-footer');
      if (modalFooter) {
        updateModalButtons(modalFooter, orderId, newStatus);
      }
    }
  });
}

// 根據狀態返回對應的圓角標籤樣式 class
export function getStatusPillClass(status) {
  switch (status) {
    case '已確認':
      return 'pill-blue';
    case '已付訂金':
      return 'pill-amber';
    case '已付清':
      return 'pill-green';
    case '已付款':
      return 'pill-green'; // 向下相容
    case '完成':
      return 'pill-deep-green';
    case '取消':
      return 'pill-red';
    default:
      return 'pill-gray';
  }
}

// Keep the current detail footer's close-left / complete-right action group.
export function updateModalButtons(modalFooter, orderId, newStatus) {
  const actions = modalFooter.querySelector('.order-detail-primary-actions');
  if (!actions) return;
  const existing = actions.querySelector('[data-action="primary"]');
  if (newStatus === '完成') {
    const focused = existing?.contains(document.activeElement);
    existing?.remove();
    if (focused) actions.querySelector('[data-action="dismiss"]')?.focus({ preventScroll: true });
    return;
  }
  const editBtn = modalFooter.querySelector('button[onclick*="editOrder"]');
  if (existing || !editBtn || document.body.dataset.shopRole === 'viewer') return;
  const completeBtn = document.createElement('button');
  completeBtn.type = 'button';
  completeBtn.className = 'gj-btn gj-btn--primary';
  completeBtn.dataset.action = 'primary';
  completeBtn.textContent = '標記完成';
  completeBtn.onclick = function () {
    window.showStatusConfirm(orderId, '完成');
    this.closest('.modal').remove();
  };
  actions.append(completeBtn);
}
