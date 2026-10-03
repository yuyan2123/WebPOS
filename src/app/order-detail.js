import { escapeHandlerArgument } from '../platform/markup.js';
import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { setButtonLoading, handleError, showAlert } from './feedback.js';
import { escapeHtml } from './customers.js';
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
  const orderId = details.orderId || details.id;
  const handlerId = escapeHandlerArgument(orderId);
  const money = (value) => `NT$ ${Math.round(Number(value) || 0).toLocaleString('zh-TW')}`;
  const remainingAmount = details.remainingAmount ?? details.totalAmount;
  const items = details.items || [];
  const isLine = details.customerContactType === 'line' || Boolean(details.customerLineId);
  const contact = details.customerContactValue || details.customerLineId || details.customerPhone;
  const canEditOrders = document.body.dataset.shopRole !== 'viewer';
  const canUpdate = canEditOrders && details.status !== '完成';
  const detailModal = document.createElement('div');
  detailModal.className = 'modal active order-detail-modal';
  detailModal.setAttribute('role', 'dialog');
  detailModal.setAttribute('aria-modal', 'true');
  detailModal.setAttribute('aria-label', `訂單詳情 ${orderId}`);
  // 設定 no-op onclick：避免點背景誤關，也讓 initializeModalCloseHandlers 不套用預設關閉行為
  detailModal.onclick = function () {};
  const itemsHtml = items
    .map((item) => {
      let giftContents = '';
      if (item.isGiftBox && item.giftBoxDetails) {
        const products = Object.entries(item.giftBoxDetails.products || {});
        giftContents = `<details class="order-detail-gift">
        <summary>禮盒內容 · ${products.length} 種商品</summary>
        <ul>${products
          .map(([productId, qty]) => {
            const product = state.allProducts.find((p) => p.productId === productId);
            const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
            return `<li><span>${escapeHtml(product?.productName || `商品ID: ${productId}`)}</span><span>共 ${totalQty} 個</span></li>`;
          })
          .join('')}</ul>
        ${item.giftBoxDetails.notes ? `<p class="order-detail-note">禮盒備註：${escapeHtml(item.giftBoxDetails.notes)}</p>` : ''}
      </details>`;
      }
      const specialPrice = item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice;
      const price = specialPrice
        ? `<span class="original-price">${money(item.originalPrice)}</span><span class="special-price-text">特價 ${money(item.unitPrice)}</span>`
        : money(item.unitPrice);
      return `<tr role="row">
      <td role="cell" class="order-detail-product"><strong>${escapeHtml(item.productName)}</strong>${giftContents}</td>
      <td role="cell"><span class="order-detail-mobile-label" aria-hidden="true">數量</span>${escapeHtml(item.quantity)}</td>
      <td role="cell"><span class="order-detail-mobile-label" aria-hidden="true">單價</span>${price}</td>
      <td role="cell"><span class="order-detail-mobile-label" aria-hidden="true">小計</span><strong>${money(item.subtotal)}</strong></td>
    </tr>`;
    })
    .join('');
  detailModal.innerHTML = `<div class="modal-content gj-pos-dialog order-detail-dialog" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <div class="order-detail-heading">
                      <h2>訂單詳情</h2>
                      <span class="order-detail-id">訂單編號 ${escapeHtml(orderId)}</span>
                    </div>
                    <span class="status-pill ${getStatusPillClass(details.status)}">${escapeHtml(details.status || '未設定')}</span>
                    <button type="button" class="close-btn" aria-label="關閉訂單詳情" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <dl class="order-detail-overview" aria-label="交貨與收款摘要">
                      <div><dt>交貨日期</dt><dd>${escapeHtml(formatDisplayDate(details.deliveryDate))}</dd></div>
                      <div><dt>配送方式</dt><dd>${escapeHtml(details.deliveryType || '外送')}</dd></div>
                      <div><dt>${remainingAmount > 0 ? '待收金額' : '剩餘金額'}</dt><dd class="order-detail-balance ${remainingAmount > 0 ? 'is-outstanding' : 'is-paid'}">${money(remainingAmount)}</dd></div>
                    </dl>
                    <div class="order-detail-layout">
                      <section class="order-detail-items" aria-label="訂單明細">
                        <div class="order-detail-section-heading"><h3>訂單明細</h3><span>${items.length} 項</span></div>
                        <div class="table-responsive">
                          <table class="table gj-table order-detail-table" role="table" aria-label="訂購商品">
                            <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">商品</th><th role="columnheader" scope="col">數量</th><th role="columnheader" scope="col">單價</th><th role="columnheader" scope="col">小計</th></tr></thead>
                            <tbody role="rowgroup">${itemsHtml || '<tr role="row" class="order-detail-empty"><td role="cell" colspan="4">此訂單沒有商品明細</td></tr>'}</tbody>
                          </table>
                        </div>
                      </section>
                      <div class="order-detail-sidebar">
                        <section aria-label="客戶與配送">
                          <div class="order-detail-section-heading"><h3>客戶與配送</h3></div>
                          <dl class="order-detail-facts">
                            <div><dt>客戶</dt><dd>${escapeHtml(details.customerName || '未提供')}${details.isCompanyCustomer ? '<span class="order-detail-company">企業客戶</span>' : ''}</dd></div>
                            <div><dt>${isLine ? 'LINE ID' : '聯絡電話'}</dt><dd>${escapeHtml(contact || '未提供')}</dd></div>
                            ${(details.recipientName || details.recipientPhone) && details.deliveryType !== '自取' ? `<div><dt>收件人</dt><dd>${escapeHtml(details.recipientName || '未提供')}${details.recipientPhone ? `<br>${escapeHtml(details.recipientPhone)}` : ''}</dd></div>` : ''}
                            ${details.customerAddress || details.deliveryType !== '自取' ? `<div><dt>${details.deliveryType === '自取' ? '客戶地址' : '配送地址'}</dt><dd>${escapeHtml(details.customerAddress || '未提供')}</dd></div>` : ''}
                          </dl>
                          ${details.shippingNotes ? `<div class="order-detail-note"><span>配送備註</span><p>${escapeHtml(details.shippingNotes)}</p></div>` : ''}
                        </section>
                        <section class="order-detail-payment" aria-label="付款資訊">
                          <div class="order-detail-section-heading"><h3>付款資訊</h3></div>
                          <dl class="order-detail-facts order-detail-payment-facts">
                            <div><dt>總金額</dt><dd>${money(details.totalAmount)}</dd></div>
                            <div><dt>已付訂金</dt><dd>${money(details.depositAmount)}</dd></div>
                            ${details.shippingFee > 0 || details.shippingNotes ? `<div><dt>運費（已含於總金額）</dt><dd>${details.shippingFee > 0 ? money(details.shippingFee) : '免運'}</dd></div>` : ''}
                            <div class="order-detail-payment-balance"><dt>剩餘金額</dt><dd class="order-detail-balance ${remainingAmount > 0 ? 'is-outstanding' : 'is-paid'}">${money(remainingAmount)}</dd></div>
                          </dl>
                          ${canUpdate ? `<button type="button" class="gj-btn order-detail-deposit" onclick="showDepositModal('${handlerId}', ${escapeHandlerArgument(details.totalAmount)}, ${escapeHandlerArgument(details.depositAmount || 0)}); this.closest('.modal').remove();"><i class="fas fa-coins" aria-hidden="true"></i> 設定訂金</button>` : ''}
                        </section>
                      </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <div class="order-detail-secondary-actions">
                      ${canEditOrders ? `<button type="button" class="gj-btn requires-editor" onclick="editOrder('${handlerId}'); this.closest('.modal').remove();"><i class="fas fa-edit" aria-hidden="true"></i> 編輯訂單</button>` : ''}
                    </div>
                    <div class="order-detail-primary-actions gj-actions">
                      <button type="button" class="gj-btn gj-btn--quiet" data-action="dismiss" onclick="this.closest('.modal').remove()">關閉</button>
                      ${canUpdate ? `<button type="button" class="gj-btn gj-btn--primary" data-action="primary" onclick="showStatusConfirm('${handlerId}', '完成'); this.closest('.modal').remove();">標記完成</button>` : ''}
                    </div>
                </div>
            </div>`;
  document.body.appendChild(detailModal);
  const actions = detailModal.querySelector('.order-detail-secondary-actions');
  addOrderPrintButton(actions, orderId);
  const printButton = actions.querySelector('[data-printer-order]');
  if (printButton) printButton.className = 'gj-btn';
  // 確保動態創建的modal有正確的關閉處理器
  setTimeout(() => initializeModalCloseHandlers(), 50);
}
