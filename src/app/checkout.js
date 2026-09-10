import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';
import { updateOrderTotal, closeCartModal, updateCartDisplay } from './cart.js';
import { showSectionById } from './platform.js';
import { clearCustomerForm, escapeHtml } from './customers.js';
import { renderCalendar } from './calendar.js';
import { generateUniqueId } from './pricing.js';
import { clearOrderDraft } from './drafts.js';
import { invalidateCapacityCache } from './capacity.js';

export function submitOrder() {
  const checkoutBtn = document.getElementById('checkoutBtn');
  // 防止重複送出（後端處理需時，使用者可能連按多次）
  if (state.isSubmittingOrder) {
    showAlert('訂單處理中，請勿重複送出', 'warning');
    return;
  }
  if (
    checkoutBtn.classList.contains('checkout-not-ready') ||
    !navigator.onLine ||
    document.body.dataset.shopRole === 'viewer'
  ) {
    if (
      !state.currentCustomer.name &&
      (!state.currentCustomer.contactValue && !state.currentCustomer.phone)
    ) {
      showAlert('請先儲存客戶資訊', 'error');
    } else if (!navigator.onLine) {
      showAlert('目前離線，草稿已保存；恢復連線後才能送出訂單', 'error');
    } else if (document.body.dataset.shopRole === 'viewer') {
      showAlert('僅檢視成員不能建立或修改訂單', 'error');
    } else if (!state.currentDeliveryDate) {
      showAlert('請先設定交貨日期', 'error');
    } else {
      showAlert('購物車是空的', 'error');
    }
    return;
  }
  beginOrderSubmit();
  // 計算總金額包含運費（讀取 hidden input，配合新版 grove 按鈕）
  const orderTotals = updateOrderTotal();
  const isPickupOrder = document.getElementById('deliveryTypeValue').value === '自取';
  const shippingNotes = isPickupOrder
    ? ''
    : document.getElementById('shippingOption').value === 'free'
      ? '免運'
      : orderTotals.shippingFee > 0
        ? `運費 NT$ ${orderTotals.shippingFee}`
        : '';
  // 收集收件人資訊
  const recipientName = document.getElementById('recipientName').value.trim();
  const recipientPhone = document.getElementById('recipientPhone').value.trim();
  // 將收件人資訊加入客戶資料
  const customerData = {
    ...state.currentCustomer,
    recipientName: recipientName,
    recipientPhone: recipientPhone,
  };
  const orderData = {
    clientRequestId: state.currentOrderRequestId,
    customer: customerData,
    deliveryDate: state.currentDeliveryDate,
    items: [...state.giftCart, ...state.cakeCart, ...state.giftboxCart],
    totalAmount: orderTotals.totalAmount,
    shippingFee: orderTotals.shippingFee,
    shippingNotes: shippingNotes,
    isCompanyCustomer: state.isCompanyCustomer,
  };
  // 先檢查產能再送出
  checkCapacityAndSubmit(orderData);
}

export function handleOrderUpdated(result) {
  let alertMessage = `訂單 ${result.orderId} 更新成功!`;
  // 如果有付款變更資訊，顯示詳細信息
  if (result.paymentChange) {
    const pc = result.paymentChange;
    alertMessage += `\n\n付款狀態變更：`;
    alertMessage += `\n原金額：NT$ ${pc.originalTotal} → 新金額：NT$ ${pc.newTotal}`;
    alertMessage += `\n原狀態：${pc.originalStatus} → 新狀態：${pc.newStatus}`;
    if (pc.remainingAmount > 0) {
      alertMessage += `\n剩餘金額：NT$ ${pc.remainingAmount}`;
    } else if (pc.paymentNotes && pc.paymentNotes.includes('退款')) {
      alertMessage += `\n${pc.paymentNotes.split(';').pop().trim()}`;
    }
  }
  showAlert(alertMessage, 'success');
  closeCartModal();
  resetOrderForm();
  showSectionById('search');
}

export function clearEditingState() {
  state.isEditingOrder = false;
  state.editingOrderId = null;
  clearCustomerForm();
  state.currentDeliveryDate = '';
  state.giftCart = [];
  state.cakeCart = [];
  state.giftboxCart = [];
  updateCartDisplay();
}

export function handleOrderSubmitted(result) {
  const orderId = result && result.orderId ? result.orderId : '';
  // 先關購物車並清空所有暫存資料，避免使用者以為沒送出而重複建立
  closeCartModal();
  resetOrderForm();
  // 回到客戶資訊頁，可直接建立下一筆
  showSectionById('customer');
  showAlert(`訂單 ${orderId} 建立成功!`, 'success', 5000);
}

/**
 * 送單成功後的完整重置：客戶、收件人、配送、運費、交貨日期、日曆、購物車
 */
export function resetOrderForm() {
  try {
    clearEditingState();
    // 交貨日期（隱藏原生 input + 自訂日曆）
    state.currentDeliveryDate = '';
    const deliveryDateInput = document.getElementById('deliveryDate');
    if (deliveryDateInput) deliveryDateInput.value = '';
    state.calendarState.selectedDateStr = null;
    state.calendarState.currYear = new Date().getFullYear();
    state.calendarState.currMonth = new Date().getMonth();
    if (typeof renderCalendar === 'function') renderCalendar();
    const dateDisplay = document.getElementById('selected-date-display');
    if (dateDisplay) dateDisplay.textContent = '目前尚未選擇日期';
    const confirmDateBtn = document.getElementById('btn-confirm-date');
    if (confirmDateBtn) {
      confirmDateBtn.disabled = true;
      confirmDateBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'shadow-lg');
      confirmDateBtn.classList.add('bg-gray-300', 'cursor-not-allowed');
      confirmDateBtn.innerHTML = '請先選擇日期';
    }
    // 禮盒暫存狀態
    state.currentGiftboxSize = 0;
    state.giftboxSelection = {};
    state.currentGiftboxCombo = null;
    state.editingGiftboxIndex = -1;
    state.currentOrderRequestId =
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : generateUniqueId('REQ');
    updateCartDisplay();
    clearOrderDraft();
  } catch (e) {
    console.error('重置訂單表單失敗:', e);
    showAlert('訂單已建立，但表單重置失敗，請重新整理頁面', 'warning');
  }
}

/**
 * 開始送單：上鎖 + 按鈕載入 + 全螢幕處理中遮罩 + 逾時保護
 */
export function beginOrderSubmit() {
  state.isSubmittingOrder = true;
  const text = state.isEditingOrder ? '訂單更新中...' : '訂單建立中...';
  setButtonLoading(
    document.getElementById('checkoutBtn'),
    true,
    state.isEditingOrder ? '更新中...' : '建立中...',
  );
  showOrderSubmitOverlay(text);
  // 逾時保護：避免後端無回應時畫面永久卡在處理中
  clearTimeout(state.orderSubmitWatchdog);
  state.orderSubmitWatchdog = setTimeout(function () {
    if (state.isSubmittingOrder) {
      finishOrderSubmit();
      showAlert('訂單送出逾時，請到訂單查詢確認是否已建立，避免重複送單', 'error');
    }
  }, 60000);
}

export function showOrderSubmitOverlay(text) {
  const overlay = document.getElementById('orderSubmitOverlay');
  if (!overlay) return;
  document.getElementById('orderSubmitOverlayText').textContent = text || '訂單處理中...';
  overlay.classList.add('active');
}

export function hideOrderSubmitOverlay() {
  const overlay = document.getElementById('orderSubmitOverlay');
  if (overlay) overlay.classList.remove('active');
}

// 結束送單狀態：解鎖、關閉遮罩、還原按鈕
export function finishOrderSubmit() {
  state.isSubmittingOrder = false;
  clearTimeout(state.orderSubmitWatchdog);
  state.orderSubmitWatchdog = null;
  hideOrderSubmitOverlay();
  setButtonLoading(document.getElementById('checkoutBtn'), false);
}

export function checkCapacityAndSubmit(orderData) {
  if (isConnected()) {
    submitOrderRequest(orderData, false);
  } else {
    finishOrderSubmit();
    showAlert('尚未連接 Firebase，訂單草稿已保留但不會送出', 'error');
  }
}

export function showCapacityWarningModal(capacityStatus, orderData) {
  state.pendingOrderData = orderData;
  // 產能警告需使用者決定，先收起處理中遮罩（送單鎖維持到使用者確認或取消）
  hideOrderSubmitOverlay();
  setButtonLoading(document.getElementById('checkoutBtn'), false);
  closeCartModal();
  const body = document.getElementById('capacityWarningBody');
  const cs = capacityStatus;
  body.innerHTML =
    '<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin-bottom: 16px;">' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
    '<div style="display: flex; flex-direction: column;">' +
    '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">交貨日期</span>' +
    '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' +
    escapeHtml(cs.date) +
    '</span>' +
    '</div>' +
    '<div style="display: flex; flex-direction: column;">' +
    '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">每日上限</span>' +
    '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' +
    cs.limit +
    ' 件</span>' +
    '</div>' +
    '<div style="display: flex; flex-direction: column;">' +
    '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">目前已排定</span>' +
    '<span style="font-size: 1rem; font-weight: 700; color: #1f2937;">' +
    cs.currentQuantity +
    ' 件</span>' +
    '</div>' +
    '<div style="display: flex; flex-direction: column;">' +
    '<span style="font-size: 0.75rem; color: #92400e; font-weight: 600;">本次訂單</span>' +
    '<span style="font-size: 1rem; font-weight: 700; color: #1f6f5f;">' +
    cs.newOrderQuantity +
    ' 件</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; display: flex; align-items: flex-start; gap: 12px;">' +
    '<i class="fas fa-exclamation-circle" style="color: #dc2626; margin-top: 2px; flex-shrink: 0;"></i>' +
    '<div>' +
    '<div style="font-weight: 700; color: #991b1b; margin-bottom: 4px;">送出後預計總量: ' +
    cs.projectedQuantity +
    ' 件，超出上限 ' +
    cs.exceededQuantity +
    ' 件</div>' +
    '<div style="font-size: 0.85rem; color: #7f1d1d;">此警告不會阻擋訂單建立，請確認是否繼續送出，或返回修改交貨日期。</div>' +
    '</div>' +
    '</div>';
  document.getElementById('capacityWarningModal').classList.add('active');
}

export function closeCapacityWarningModal() {
  document.getElementById('capacityWarningModal').classList.remove('active');
  state.pendingOrderData = null;
  finishOrderSubmit();
}

export function confirmCapacityOverride() {
  if (!state.pendingOrderData) return;
  const orderData = state.pendingOrderData;
  state.pendingOrderData = null;
  document.getElementById('capacityWarningModal').classList.remove('active');
  orderData.capacityOverrideConfirmed = true;
  if (isConnected()) submitOrderRequest(orderData, true);
  else doSubmitOrder(orderData);
}

export function submitOrderRequest(orderData, confirmed) {
  beginOrderSubmit();
  rpc
    .withSuccessHandler(function (result) {
      if (result.needConfirm) {
        showCapacityWarningModal(result.capacityStatus, orderData);
        return;
      }
      finishOrderSubmit();
      invalidateCapacityCache();
      if (state.isEditingOrder) handleOrderUpdated(result);
      else handleOrderSubmitted(result);
    })
    .withFailureHandler(function (error) {
      finishOrderSubmit();
      handleError(error);
    })
    .submitOrder(orderData, {
      orderId: state.isEditingOrder ? state.editingOrderId : null,
      confirmed: confirmed,
    });
}

export function doSubmitOrder(orderData) {
  finishOrderSubmit();
  showAlert('尚未連接 Firebase，訂單草稿已保留但不會送出', 'error');
}
