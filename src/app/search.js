import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading, handleError } from './feedback.js';
import { escapeHtml, escapeAttr, selectSearchContactMethod } from './customers.js';
import { escapeHandlerArgument } from '../platform/markup.js';
import { getStatusPillClass } from './order-status.js';

export function searchOrders() {
  const searchBtn = document.querySelector('.btn-search');
  const rawContact =
    state.currentSearchContactMethod === 'line'
      ? 'LINE'
      : document.getElementById('searchPhone').value.trim();
  const criteria = {
    contact: rawContact,
    contactType: state.currentSearchContactMethod,
    name: document.getElementById('searchName').value.trim(),
    date: document.getElementById('searchDate').value,
    status: document.getElementById('searchStatus')?.value || '',
    pageSize: 30,
    cursor: null,
    paginated: true,
  };
  if (!criteria.contact && !criteria.name && !criteria.date && !criteria.status) {
    showAlert('請至少提供一個搜尋條件', 'error');
    return;
  }
  state.lastSearchCriteria = criteria;
  state.searchNextCursor = null;
  setButtonLoading(searchBtn, true, '搜尋中...');
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        setButtonLoading(searchBtn, false);
        const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
        state.searchNextCursor = page?.pagination?.nextCursor || null;
        handleSearchResults(page?.orders || []);
      })
      .withFailureHandler(function (error) {
        setButtonLoading(searchBtn, false);
        renderSearchError(error);
      })
      .searchOrders(criteria);
  } else {
    setButtonLoading(searchBtn, false);
    renderSearchError(new Error('尚未連接 Firebase'));
  }
}

export function renderSearchError(error) {
  document.getElementById('searchResults').innerHTML =
    `<div class="search-error" role="alert"><i class="fas fa-wifi"></i><strong>無法取得訂單</strong><span>${escapeHtml(error?.message || '請檢查連線後重試')}</span><button type="button" onclick="searchOrders()">重新搜尋</button></div>`;
}

export function loadMoreOrders() {
  if (!state.lastSearchCriteria || !state.searchNextCursor || state.isLoadingMoreOrders) return;
  state.isLoadingMoreOrders = true;
  const button = document.getElementById('searchLoadMore');
  if (button) setButtonLoading(button, true, '載入中...');
  rpc
    .withSuccessHandler(function (result) {
      state.isLoadingMoreOrders = false;
      const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
      state.searchNextCursor = page?.pagination?.nextCursor || null;
      state.currentSearchOrders = state.currentSearchOrders.concat(page?.orders || []);
      displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
    })
    .withFailureHandler(function (error) {
      state.isLoadingMoreOrders = false;
      if (button) setButtonLoading(button, false);
      showAlert(error?.message || '載入下一頁失敗', 'error');
    })
    .searchOrders({ ...state.lastSearchCriteria, cursor: state.searchNextCursor });
}

export function handleSearchResults(orders) {
  displayOrderTable(orders, 'searchResults', 'search');
}

export function displayOrderTable(orders, containerId, type = 'search') {
  const container = document.getElementById(containerId);
  state.currentOrderTableType = type;
  if (type === 'search') {
    state.currentSearchOrders = orders || [];
    const stillExists = state.currentSearchOrders.some(
      (order) => (order.id || order.orderId) === state.expandedSearchOrderId,
    );
    if (!stillExists) state.expandedSearchOrderId = null;
    const collapsingStillExists = state.currentSearchOrders.some(
      (order) => (order.id || order.orderId) === state.collapsingSearchOrderId,
    );
    if (!collapsingStillExists) state.collapsingSearchOrderId = null;
  }
  if (!orders || orders.length === 0) {
    const message =
      type === 'overdue'
        ? '<div class="result-banner success"><i class="fas fa-check-circle"></i><span>目前沒有過期未完成的訂單</span></div>'
        : '<div class="result-banner neutral"><i class="fas fa-inbox"></i><span>未找到符合條件的訂單</span></div>';
    container.innerHTML = message;
    return;
  }
  // 根據類型設定標題和警告
  let headerContent = '';
  if (type === 'overdue') {
    headerContent = `
                    <div class="result-banner danger"><i class="fas fa-exclamation-triangle"></i><span>發現 ${orders.length} 筆過期未完成的訂單</span></div>
                    <h3 class="result-title">過期未完成訂單 (${orders.length} 筆)</h3>`;
  } else {
    headerContent = `<h3 class="result-title">搜尋結果 (${orders.length} 筆)</h3>`;
  }
  // 動態生成表頭
  let tableHeaders = '<th>姓名</th><th>聯絡方式</th><th>交貨日</th>';
  if (type === 'overdue') {
    tableHeaders += '<th>逾期天數</th>';
  }
  tableHeaders += '<th>運費</th><th>總金額</th><th>已付訂金</th><th>剩餘金額</th><th>狀態</th><th>操作</th>';
  // 生成表格內容
  const tableRows = orders
    .map((order) => {
      const isOverdue = type === 'overdue';
      let overdueDays = 0;
      const rowClasses = [];
      if (isOverdue) {
        const deliveryDate = new Date(order.deliveryDate);
        const today = new Date();
        overdueDays = Math.floor((today - deliveryDate) / (1000 * 60 * 60 * 24));
        rowClasses.push(overdueDays > 7 ? 'row-overdue-severe' : 'row-overdue-mild');
      }
      const contactType = order.customerContactType || (order.customerLineId ? 'line' : 'phone');
      const contactValue = order.customerContactValue || order.customerLineId || order.customerPhone || '-';
      const contactDisplay = contactType === 'line' ? 'LINE' : contactValue;
      let cells = `
                    <td data-label="姓名">${escapeHtml(order.customerName)}</td>
                    <td data-label="聯絡方式">${escapeHtml(contactDisplay)}</td>
                    <td data-label="交貨日">${formatDisplayDate(order.deliveryDate)}</td>`;
      if (isOverdue) {
        cells += `
                        <td data-label="逾期天數" style="text-align: center;">
                            <span class="overdue-badge ${overdueDays > 7 ? 'severe' : 'mild'}">${overdueDays} 天</span>
                        </td>`;
      }
      const orderId = order.id || order.orderId;
      const depositAmount = order.depositAmount || 0;
      const remainingAmount = order.remainingAmount || order.totalAmount;
      const canExpandItems = type === 'search' && Array.isArray(order.items);
      const isExpanded = canExpandItems && state.expandedSearchOrderId === orderId;
      const isCollapsing = canExpandItems && state.collapsingSearchOrderId === orderId;
      if (canExpandItems) rowClasses.push('order-summary-row');
      if (isExpanded) rowClasses.push('is-expanded');
      // 運費顯示
      const hasFee = order.shippingFee > 0;
      const shippingFeeDisplay = hasFee
        ? `NT$ ${order.shippingFee}`
        : order.shippingNotes === '免運' || order.deliveryType === '自取'
          ? '免運'
          : '-';
      cells += `
                    <td data-label="運費" class="td-fee${hasFee ? ' has-fee' : ''}">${shippingFeeDisplay}</td>
                    <td data-label="總金額" class="td-amount">NT$ ${order.totalAmount}</td>
                    <td data-label="已付訂金" class="td-deposit${depositAmount > 0 ? ' paid' : ''}">NT$ ${depositAmount}</td>
                    <td data-label="剩餘金額" class="td-remaining ${remainingAmount > 0 ? 'due' : 'clear'}">NT$ ${remainingAmount}</td>
                    <td data-label="狀態"><span class="status-pill ${getStatusPillClass(order.status)}">${escapeHtml(order.status)}</span></td>
                    <td data-label="操作">
                      <div class="order-actions">
                        <button class="btn-table btn-table-view" data-oid="${escapeAttr(orderId)}" onclick="event.stopPropagation(); viewOrderDetails(this.dataset.oid)">詳情</button>
                        ${document.body.dataset.shopRole === 'viewer' ? '' : `<button class="btn-table btn-table-delete requires-editor" data-oid="${escapeAttr(orderId)}" data-cname="${escapeAttr(order.customerName)}" onclick="event.stopPropagation(); showDeleteConfirm(this.dataset.oid, this.dataset.cname)">刪除</button>`}
                      </div>
                    </td>`;
      const rowClassAttr = rowClasses.length ? ` class="${rowClasses.join(' ')}"` : '';
      const rowClickAttr = canExpandItems
        ? ` onclick="toggleOrderItems('${escapeHandlerArgument(orderId)}')"`
        : '';
      const expandedItemsRow =
        isExpanded || isCollapsing
          ? renderExpandedOrderItems(order.items, tableHeaders.split('</th>').length - 1, isCollapsing)
          : '';
      return `<tr${rowClassAttr}${rowClickAttr}>${cells}</tr>${expandedItemsRow}`;
    })
    .join('');
  container.innerHTML = `
                ${headerContent}
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${type === 'search' && state.searchNextCursor ? '<div class="search-pagination"><button id="searchLoadMore" type="button" onclick="loadMoreOrders()">載入更多訂單</button></div>' : ''}`;
}

export function toggleOrderItems(orderId) {
  if (state.orderItemsTransitionTimer) return;
  const nextOrderId = state.expandedSearchOrderId === orderId ? null : orderId;
  if (!state.expandedSearchOrderId) {
    state.expandedSearchOrderId = nextOrderId;
    displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
    return;
  }
  state.collapsingSearchOrderId = state.expandedSearchOrderId;
  state.expandedSearchOrderId = null;
  displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
  state.orderItemsTransitionTimer = setTimeout(function () {
    state.collapsingSearchOrderId = null;
    state.expandedSearchOrderId = nextOrderId;
    state.orderItemsTransitionTimer = null;
    displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
  }, 500);
}

export function renderExpandedOrderItems(items, columnCount, isCollapsing = false) {
  const collapsingClass = isCollapsing ? ' is-collapsing' : '';
  if (!items || items.length === 0) {
    return `<tr class="order-items-row${collapsingClass}"><td colspan="${columnCount}"><div class="order-items-expand"><div class="order-items-empty">此訂單沒有商品明細</div></div></td></tr>`;
  }
  let itemsHtml = '';
  items.forEach((item) => {
    if (item.isGiftBox && item.giftBoxDetails) {
      itemsHtml += `
                        <tr class="giftbox-row">
                            <td colspan="4"><strong>${escapeHtml(item.productName)} x ${item.quantity}</strong></td>
                        </tr>`;
      Object.entries(item.giftBoxDetails.products || {}).forEach(([productId, qty]) => {
        const product = state.allProducts.find((p) => p.productId === productId);
        const productName = product ? product.productName : `商品ID: ${productId}`;
        const totalQty = (parseInt(qty) || 0) * (parseInt(item.quantity) || 1);
        itemsHtml += `
                            <tr class="giftbox-subitem-row">
                                <td>└ ${escapeHtml(productName)}</td>
                                <td>${totalQty}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>`;
      });
      if (item.giftBoxDetails.notes) {
        itemsHtml += `
                            <tr class="giftbox-note-row">
                                <td colspan="4">備註: ${escapeHtml(item.giftBoxDetails.notes)}</td>
                            </tr>`;
      }
      let giftboxPriceDisplay = `NT$ ${item.unitPrice}`;
      if (item.isSpecialPrice && item.originalPrice && item.originalPrice !== item.unitPrice) {
        giftboxPriceDisplay = `<span class="original-price">NT$ ${item.originalPrice}</span><br><span class="special-price-text">特價 NT$ ${item.unitPrice}</span>`;
      }
      itemsHtml += `
                        <tr class="giftbox-subtotal-row">
                            <td>禮盒小計</td>
                            <td>-</td>
                            <td>${giftboxPriceDisplay}</td>
                            <td>NT$ ${item.subtotal}</td>
                        </tr>`;
    } else {
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
  return `
                <tr class="order-items-row${collapsingClass}">
                    <td colspan="${columnCount}">
                        <div class="order-items-expand">
                            <div class="order-items-scroll">
                                <table class="order-items-table">
                                    <thead><tr><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
                                    <tbody>${itemsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>`;
}

// 新增函數：格式化顯示日期
export function formatDisplayDate(dateValue) {
  try {
    if (!dateValue) return '未設定';
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return dateValue; // 如果無法解析，返回原始值
      }
    } else {
      return dateValue.toString();
    }
    // 格式化為 YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.log('日期格式化錯誤:', error);
    return dateValue.toString();
  }
}

export function clearSearch() {
  document.getElementById('searchPhone').value = '';
  document.getElementById('searchName').value = '';
  if (state.searchDatepickerInstance) {
    state.searchDatepickerInstance.clear();
  } else {
    document.getElementById('searchDate').value = '';
  }
  document.getElementById('searchResults').innerHTML = '';
  const status = document.getElementById('searchStatus');
  if (status) status.value = '';
  selectSearchContactMethod('phone', false);
  state.searchNextCursor = null;
  state.lastSearchCriteria = null;
}

export function searchOverdueOrders() {
  const searchBtn = window.event?.currentTarget || document.querySelector('.btn-overdue');
  setButtonLoading(searchBtn, true, '檢索中...');
  // 檢查是否在 Google Apps Script 環境中
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (orders) {
        setButtonLoading(searchBtn, false);
        try {
          handleOverdueResults(orders);
        } catch (clientError) {
          console.error('處理過期訂單結果時發生錯誤:', clientError);
          showAlert('處理過期訂單結果時發生錯誤: ' + clientError.message, 'error');
        }
      })
      .withFailureHandler(function (error) {
        setButtonLoading(searchBtn, false);
        handleError(error);
      })
      .searchOverdueOrders();
  } else {
    setButtonLoading(searchBtn, false);
    renderSearchError(new Error('尚未連接 Firebase'));
  }
}

export function handleOverdueResults(orders) {
  // 清空搜尋結果，在同一個表格中顯示過期訂單
  document.getElementById('searchResults').innerHTML = '';
  displayOrderTable(orders, 'searchResults', 'overdue');
}
