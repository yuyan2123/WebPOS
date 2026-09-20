import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { setButtonLoading, handleError, showAlert } from './feedback.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { formatDisplayDate } from './search.js';
import { getStatusPillClass } from './order-status.js';
import { initializeModalCloseHandlers } from './platform.js';
import { addOrderPrintButton } from './printer.js';

export function viewOrderDetails(orderId) {
  const cachedDetails =
    state.currentOrderTableType === 'search'
      ? state.currentSearchOrders.find((order) => (order.id || order.orderId) === orderId)
      : null;
  if (cachedDetails && Array.isArray(cachedDetails.items)) {
    handleOrderDetails(cachedDetails);
    return;
  }
  const detailBtn = window.event?.currentTarget || window.event?.target;
  setButtonLoading(detailBtn, true, '載入中...');
  // 檢查是否在 Google Apps Script 環境中
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (details) {
        setButtonLoading(detailBtn, false);
        handleOrderDetails(details);
      })
      .withFailureHandler(function (error) {
        setButtonLoading(detailBtn, false);
        handleError(error);
      })
      .getOrderDetails(orderId);
  } else {
    setButtonLoading(detailBtn, false);
    showAlert('尚未連接 Firebase，無法讀取訂單明細', 'error');
  }
}

export function handleOrderDetails(details) {
  const detailModal = document.createElement('div');
  detailModal.className = 'modal active';
  detailModal.setAttribute('role', 'dialog');
  detailModal.setAttribute('aria-modal', 'true');
  // 設定 no-op onclick：避免點背景誤關，也讓 initializeModalCloseHandlers 不套用預設關閉行為
  detailModal.onclick = function () {};
  let itemsHtml = '';
  details.items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      // 禮盒項目顯示
      itemsHtml += `
                        <tr style="background-color: #f0f8ff;">
                            <td colspan="4"><strong>${escapeHtml(item.productName)} x ${item.quantity}</strong></td>
                        </tr>`;
      // 顯示禮盒內容物
      for (const [productId, qty] of Object.entries(item.giftBoxDetails.products || {})) {
        const product = state.allProducts.find((p) => p.productId === productId);
        const productName = product ? product.productName : `商品ID: ${productId}`;
        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
        itemsHtml += `
                            <tr style="padding-left: 20px; color: #666; font-size: 0.9em;">
                                <td style="padding-left: 30px;">└ ${escapeHtml(productName)}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
      }
      // 禮盒備註
      if (item.giftBoxDetails.notes) {
        itemsHtml += `
                            <tr style="color: #888; font-style: italic;">
                                <td colspan="4" style="padding-left: 30px;">備註: ${escapeHtml(item.giftBoxDetails.notes)}</td>
                            </tr>`;
      }
      // 禮盒小計
      let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr style="background-color: #f0f8ff; font-weight: bold;">
                            <td style="padding-left: 30px;">禮盒小計</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    } else {
      // 一般商品項目
      let priceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        priceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span> <span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr>
                            <td>${escapeHtml(item.productName)}</td>
                            <td>${item.quantity}</td>
                            <td>${priceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    }
  });
  // 建立狀態按鈕的邏輯
  let statusButtons = '';
  // 只有在未完成的情況下才顯示完成按鈕
  // 支援所有付款狀態：已確認、已付訂金、已付清、已付款（舊版）
  const canEditOrders = document.body.dataset.shopRole !== 'viewer';
  if (canEditOrders && details.status !== '完成') {
    statusButtons += `<button class="btn btn-success" data-arg0="${escapeAttr(details.orderId)}" onclick="showStatusConfirm(this.dataset.arg0, '完成'); this.closest('.modal').remove();">完成</button>`;
  }
  detailModal.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>訂單詳情 - ${details.orderId}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="order-info-grid">
                        <div class="order-info-item">
                            <span class="order-info-label">客戶</span>
                            <span class="order-info-value">${escapeHtml(details.customerName)} (${escapeHtml(details.customerContactType === 'line' || details.customerLineId ? 'LINE' : details.customerContactValue || details.customerPhone || '-')})</span>
                        </div>
                        ${
                          (details.recipientName || details.recipientPhone) && details.deliveryType !== '自取'
                            ? `
                        <div class="order-info-item">
                            <span class="order-info-label">收件人</span>
                            <span class="order-info-value">${escapeHtml(details.recipientName || '-')} ${details.recipientPhone ? `(${escapeHtml(details.recipientPhone)})` : ''}</span>
                        </div>`
                            : ''
                        }
                        <div class="order-info-item">
                            <span class="order-info-label">地址</span>
                            <span class="order-info-value">${escapeHtml(details.customerAddress || '未提供')}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">配送方式</span>
                            <span class="order-info-value delivery-badge">${escapeHtml(details.deliveryType || '外送')}</span>
                        </div>
                        ${
                          details.isCompanyCustomer
                            ? `<div class="order-info-item">
                            <span class="order-info-label">客戶類型</span>
                            <span class="order-info-value" style="color: #4f46e5; font-weight: 600;">企業客戶</span>
                        </div>`
                            : ''
                        }
                        <div class="order-info-item">
                            <span class="order-info-label">交貨日期</span>
                            <span class="order-info-value">${formatDisplayDate(details.deliveryDate)}</span>
                        </div>
                        <div class="order-info-item">
                            <span class="order-info-label">訂單狀態</span>
                            <span class="status-pill ${getStatusPillClass(details.status)}">${escapeHtml(details.status)}</span>
                        </div>
                    </div>

                    <h4>訂單明細</h4>
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>

                    <div class="payment-status-box">
                        <h4>付款狀態</h4>
                        <div class="payment-grid">
                            <div class="payment-item">
                                <span class="payment-label">總金額</span>
                                <span class="payment-value primary">NT$ ${Math.round(details.totalAmount).toLocaleString()}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">已付訂金</span>
                                <span class="payment-value ${details.depositAmount > 0 ? 'success' : ''}">NT$ ${details.depositAmount || 0}</span>
                            </div>
                            <div class="payment-item">
                                <span class="payment-label">剩餘金額</span>
                                <span class="payment-value ${details.remainingAmount > 0 ? 'danger' : 'success'}">NT$ ${details.remainingAmount ?? details.totalAmount}</span>
                            </div>
                            ${
                              details.shippingFee > 0 || details.shippingNotes
                                ? `
                            <div class="payment-item">
                                <span class="payment-label">運費</span>
                                <span class="payment-value info">${details.shippingFee > 0 ? `NT$ ${details.shippingFee}` : '免運'}</span>
                            </div>`
                                : ''
                            }
                        </div>
                        ${
                          canEditOrders && details.status !== '完成'
                            ? `
                        <div class="deposit-action">
                            <button class="btn btn-deposit" data-arg0="${escapeAttr(details.orderId)}" data-arg1="${escapeAttr(details.totalAmount)}" data-arg2="${escapeAttr(details.depositAmount || 0)}" onclick="showDepositModal(this.dataset.arg0, Number(this.dataset.arg1), Number(this.dataset.arg2)); this.closest('.modal').remove();">
                                <i class="fas fa-coins"></i> 設定訂金
                            </button>
                        </div>`
                            : ''
                        }
                    </div>

                    <div class="order-total">
                        <span>總計</span>
                        <span class="total-amount">NT$ ${details.totalAmount}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    ${canEditOrders ? `<button class="btn btn-edit requires-editor" data-arg0="${escapeAttr(details.orderId)}" onclick="editOrder(this.dataset.arg0); this.closest('.modal').remove();"><i class="fas fa-edit"></i> 編輯</button>` : ''}
                    ${statusButtons}
                    <button class="btn btn-close-modal" onclick="this.closest('.modal').remove()">關閉</button>
                </div>
            </div>`;
  document.body.appendChild(detailModal);
  addOrderPrintButton(detailModal.querySelector('.modal-footer'), details.orderId || details.id);
  // 確保動態創建的modal有正確的關閉處理器
  setTimeout(() => initializeModalCloseHandlers(), 50);
}
