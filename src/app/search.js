import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading } from './feedback.js';
import { escapeHtml, escapeAttr, selectSearchContactMethod } from './customers.js';
import { escapeHandlerArgument } from '../platform/markup.js';
import { getStatusPillClass } from './order-status.js';
import { captureOrderItemsFrame, animateOrderItemsFrame } from '../ui/order-items-motion.js';

let searchRevision = 0;
let searchMode = 'search';
const money = (value) => Number(value ?? 0).toLocaleString('zh-TW');

function resetSearchRequest() {
  searchRevision++;
  state.isLoadingMoreOrders = false;
  state.searchNextCursor = null;
  state.currentSearchOrders = [];
  state.orderItemsTransition?.cancel();
  state.orderItemsTransition = null;
  state.collapsingSearchOrderId = null;
  state.expandedSearchOrderId = null;
  for (const selector of ['.btn-search', '.btn-overdue'])
    setButtonLoading(document.querySelector(selector), false);
  document.getElementById('searchResults').removeAttribute('aria-busy');
  return searchRevision;
}

function beginSearch(mode, button) {
  const results = document.getElementById('searchResults');
  if (results.contains(document.activeElement)) results.focus({ preventScroll: true });
  const revision = resetSearchRequest();
  searchMode = mode;
  state.lastSearchCriteria = null;
  setButtonLoading(button, true, '搜尋中…');
  document.getElementById('searchResults').setAttribute('aria-busy', 'true');
  document.getElementById('searchResults').innerHTML =
    '<div class="result-banner neutral"><i class="fas fa-search" aria-hidden="true"></i><span>正在查詢訂單，請稍候…</span></div>';
  document.getElementById('searchAnnouncement').textContent = '正在查詢訂單';
  return revision;
}

function finishSearch(button) {
  setButtonLoading(button, false);
  document.getElementById('searchResults').removeAttribute('aria-busy');
}

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
    pageSize: 30,
    cursor: null,
    paginated: true,
  };
  if (!criteria.contact && !criteria.name && !criteria.date) {
    showAlert('請至少提供一個搜尋條件', 'error');
    return;
  }
  const revision = beginSearch('search', searchBtn);
  state.lastSearchCriteria = criteria;
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (result) {
        if (revision !== searchRevision) return;
        finishSearch(searchBtn);
        const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
        state.searchNextCursor = page?.pagination?.nextCursor || null;
        handleSearchResults(page?.orders || []);
      })
      .withFailureHandler(function (error) {
        if (revision !== searchRevision) return;
        finishSearch(searchBtn);
        renderSearchError(error);
      })
      .searchOrders(criteria);
  } else {
    finishSearch(searchBtn);
    renderSearchError(new Error('尚未連接 Firebase'));
  }
}

export function renderSearchError(error) {
  document.getElementById('searchAnnouncement').textContent = '';
  document.getElementById('searchResults').innerHTML =
    `<div class="search-error" role="alert"><i class="fas fa-wifi" aria-hidden="true"></i><strong>無法取得訂單</strong><span>${escapeHtml(error?.message || '請檢查連線後重試')}</span><button type="button" onclick="${searchMode === 'overdue' ? 'searchOverdueOrders' : 'searchOrders'}()">重新搜尋</button></div>`;
}

export function loadMoreOrders() {
  if (!state.lastSearchCriteria || !state.searchNextCursor || state.isLoadingMoreOrders) return;
  state.isLoadingMoreOrders = true;
  const revision = searchRevision;
  const button = document.getElementById('searchLoadMore');
  const restoreFocus = document.activeElement === button;
  if (button) setButtonLoading(button, true, '載入中...');
  rpc
    .withSuccessHandler(function (result) {
      if (revision !== searchRevision) return;
      state.isLoadingMoreOrders = false;
      const page = Array.isArray(result) ? { orders: result, pagination: {} } : result;
      state.searchNextCursor = page?.pagination?.nextCursor || null;
      state.currentSearchOrders = state.currentSearchOrders.concat(page?.orders || []);
      displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
      if (restoreFocus && (document.activeElement === document.body || document.activeElement === button)) {
        const target =
          document.getElementById('searchLoadMore') || document.querySelector('#searchResults .result-title');
        target?.focus({ preventScroll: true });
      }
    })
    .withFailureHandler(function (error) {
      if (revision !== searchRevision) return;
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
  const focusedToggle = container.contains(document.activeElement)
    ? document.activeElement.closest('.order-items-toggle')?.dataset.oid
    : undefined;
  if (containerId === 'searchResults') {
    const announcement = document.getElementById('searchAnnouncement');
    const message =
      type === 'overdue'
        ? `待處理逾期訂單，共 ${orders?.length || 0} 筆`
        : `搜尋結果，共 ${orders?.length || 0} 筆`;
    if (announcement.textContent !== message) announcement.textContent = message;
  }
  if (containerId === 'searchResults' && state.orderItemsTransition) {
    state.orderItemsTransition.cancel();
    state.orderItemsTransition = null;
    state.collapsingSearchOrderId = null;
  }
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
        : '<div class="result-banner neutral"><i class="fas fa-inbox" aria-hidden="true"></i><span>未找到符合條件的訂單。請確認姓名、電話或交貨日期，或減少搜尋條件後再試。</span></div>';
    container.innerHTML = message;
    return;
  }
  // 根據類型設定標題和警告
  let headerContent = '';
  if (type === 'overdue') {
    headerContent = `
                    <div class="result-banner danger"><i class="fas fa-exclamation-triangle"></i><span>發現 ${orders.length} 筆過期未完成的訂單</span></div>
                    <h2 class="result-title" tabindex="-1">過期未完成訂單 (${orders.length} 筆)</h2>`;
  } else {
    headerContent = `<h2 class="result-title" tabindex="-1">搜尋結果 (${orders.length} 筆)</h2>`;
  }
  // 動態生成表頭
  let tableHeaders = '<th>姓名</th><th>聯絡方式</th><th>交貨日</th>';
  if (type === 'overdue') {
    tableHeaders += '<th>逾期天數</th>';
  }
  tableHeaders += '<th>運費</th><th>總金額</th><th>已付訂金</th><th>剩餘金額</th><th>狀態</th><th>操作</th>';
  // 生成表格內容
  const tableRows = orders
    .map((order, index) => {
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
      const orderId = order.id || order.orderId;
      const canExpandItems = type === 'search' && Array.isArray(order.items);
      const isExpanded = canExpandItems && state.expandedSearchOrderId === orderId;
      const isCollapsing = canExpandItems && state.collapsingSearchOrderId === orderId;
      const detailId = `${containerId}-items-${index}`;
      const customerName = escapeHtml(order.customerName || '未填姓名');
      const nameCell = canExpandItems
        ? `<button type="button" class="order-items-toggle" data-oid="${escapeAttr(orderId)}" aria-expanded="${isExpanded}" ${isExpanded || isCollapsing ? `aria-controls="${detailId}"` : ''} aria-label="${isExpanded ? '收合' : '展開'} ${escapeAttr(order.customerName || '未填姓名')} 的商品明細，訂單 ${escapeAttr(orderId)}" onclick="event.stopPropagation(); toggleOrderItems(this.dataset.oid)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg><span>${customerName}</span></button>`
        : customerName;
      let cells = `
                    <td data-label="姓名">${nameCell}</td>
                    <td data-label="聯絡方式">${escapeHtml(contactDisplay)}</td>
                    <td data-label="交貨日">${formatDisplayDate(order.deliveryDate)}</td>`;
      if (isOverdue) {
        cells += `
                        <td data-label="逾期天數" style="text-align: center;">
                            <span class="overdue-badge ${overdueDays > 7 ? 'severe' : 'mild'}">${overdueDays} 天</span>
                        </td>`;
      }
      const depositAmount = order.depositAmount || 0;
      const remainingAmount = order.remainingAmount ?? order.totalAmount;
      if (canExpandItems) rowClasses.push('order-summary-row');
      if (isExpanded) rowClasses.push('is-expanded');
      // 運費顯示
      const hasFee = order.shippingFee > 0;
      const shippingFeeDisplay = hasFee
        ? `NT$ ${money(order.shippingFee)}`
        : order.shippingNotes === '免運' || order.deliveryType === '自取'
          ? '免運'
          : '-';
      cells += `
                    <td data-label="運費" class="td-fee${hasFee ? ' has-fee' : ''}">${shippingFeeDisplay}</td>
                    <td data-label="總金額" class="td-amount">NT$ ${money(order.totalAmount)}</td>
                    <td data-label="已付訂金" class="td-deposit${depositAmount > 0 ? ' paid' : ''}">NT$ ${money(depositAmount)}</td>
                    <td data-label="剩餘金額" class="td-remaining ${remainingAmount > 0 ? 'due' : 'clear'}">NT$ ${money(remainingAmount)}</td>
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
          ? renderExpandedOrderItems(
              order.items,
              tableHeaders.split('</th>').length - 1,
              isCollapsing,
              detailId,
            )
          : '';
      return `<tr${rowClassAttr}${rowClickAttr}>${cells}</tr>${expandedItemsRow}`;
    })
    .join('');
  container.innerHTML = `
                ${headerContent}
                <div class="table-responsive">
                    <table class="table gj-table">
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${type === 'search' && state.searchNextCursor ? '<div class="search-pagination"><button id="searchLoadMore" type="button" onclick="loadMoreOrders()">載入更多訂單</button></div>' : ''}`;
  if (focusedToggle !== undefined) {
    [...container.querySelectorAll('.order-items-toggle')]
      .find((button) => button.dataset.oid === focusedToggle)
      ?.focus({ preventScroll: true });
  }
}

export function toggleOrderItems(orderId) {
  if (state.currentOrderTableType !== 'search') return;
  const container = document.getElementById('searchResults');
  const toggles = [...container.querySelectorAll('.order-items-toggle')];
  const button = toggles.find((toggle) => toggle.dataset.oid === orderId);
  const orderIndex = state.currentSearchOrders.findIndex((order) => (order.id || order.orderId) === orderId);
  const order = state.currentSearchOrders[orderIndex];
  if (!button || !Array.isArray(order?.items)) return;

  const frame = captureOrderItemsFrame(container);
  state.orderItemsTransition?.cancel();
  state.collapsingSearchOrderId = null;
  const nextOrderId = state.expandedSearchOrderId === orderId ? null : orderId;
  const previousButton = toggles.find((toggle) => toggle.dataset.oid === state.expandedSearchOrderId);
  if (previousButton) {
    const summary = previousButton.closest('.order-summary-row');
    const detail = summary.nextElementSibling;
    summary.classList.remove('is-expanded');
    previousButton.setAttribute('aria-expanded', 'false');
    previousButton.setAttribute(
      'aria-label',
      previousButton.getAttribute('aria-label').replace(/^收合/, '展開'),
    );
    if (detail?.classList.contains('order-items-row')) {
      const panel = detail.querySelector('.order-items-expand');
      detail.style.setProperty('--order-items-content-height', `${frame.panels.get(panel).height}px`);
      detail.classList.add('is-collapsing');
      if (detail.contains(document.activeElement)) previousButton.focus({ preventScroll: true });
      detail.inert = true;
      state.collapsingSearchOrderId = state.expandedSearchOrderId;
    }
  }
  state.expandedSearchOrderId = nextOrderId;
  let openingRow = null;
  if (nextOrderId) {
    const summary = button.closest('.order-summary-row');
    const detailId = `searchResults-items-${orderIndex}`;
    let detail = summary.nextElementSibling;
    if (detail?.id !== detailId) {
      summary.insertAdjacentHTML('afterend', renderExpandedOrderItems(order.items, summary.cells.length, false, detailId));
      detail = summary.nextElementSibling;
    }
    detail.classList.remove('is-collapsing');
    detail.inert = false;
    openingRow = detail;
    summary.classList.add('is-expanded');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', detailId);
    button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^展開/, '收合'));
  }
  const transition = animateOrderItemsFrame(container, frame, openingRow);
  state.orderItemsTransition = transition;
  transition.finished.then((finished) => {
    requestAnimationFrame(() => {
      if (!finished || state.orderItemsTransition !== transition) return;
      container.querySelectorAll('.order-items-row.is-collapsing').forEach((row) => {
        toggles.find((toggle) => toggle.getAttribute('aria-controls') === row.id)?.removeAttribute('aria-controls');
        row.remove();
      });
      transition.cancel();
      state.orderItemsTransition = null;
      state.collapsingSearchOrderId = null;
    });
  });
}

export function renderExpandedOrderItems(items, columnCount, isCollapsing = false, detailId = '') {
  const collapsingClass = isCollapsing ? ' is-collapsing' : '';
  const idAttribute = detailId ? ` id="${escapeAttr(detailId)}"` : '';
  if (!items || items.length === 0) {
    return `<tr${idAttribute} class="order-items-row${collapsingClass}"><td colspan="${columnCount}"><div class="order-items-expand"><div class="order-items-scroll"><div class="order-items-empty">此訂單沒有商品明細</div></div></div></td></tr>`;
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
                <tr${idAttribute} class="order-items-row${collapsingClass}">
                    <td colspan="${columnCount}">
                        <div class="order-items-expand">
                            <div class="order-items-scroll">
                              <div class="order-items-content">
                                <table class="order-items-table gj-table">
                                    <thead><tr><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
                                    <tbody>${itemsHtml}</tbody>
                                </table>
                              </div>
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
  resetSearchRequest();
  document.getElementById('searchPhone').value = '';
  document.getElementById('searchName').value = '';
  if (state.searchDatepickerInstance) {
    state.searchDatepickerInstance.clear();
  } else {
    document.getElementById('searchDate').value = '';
  }
  document.getElementById('searchResults').innerHTML =
    '<div class="result-banner neutral"><i class="fas fa-search" aria-hidden="true"></i><span>輸入姓名、聯絡方式或交貨日期，開始查詢訂單。</span></div>';
  document.getElementById('searchAnnouncement').textContent = '已清空搜尋條件與結果';
  const status = document.getElementById('searchStatus');
  if (status) status.value = '';
  selectSearchContactMethod('phone', false);
  state.searchNextCursor = null;
  state.lastSearchCriteria = null;
}

export function searchOverdueOrders() {
  const searchBtn = document.querySelector('.btn-overdue');
  const revision = beginSearch('overdue', searchBtn);
  // 檢查是否在 Google Apps Script 環境中
  if (isConnected()) {
    rpc
      .withSuccessHandler(function (orders) {
        if (revision !== searchRevision) return;
        finishSearch(searchBtn);
        try {
          handleOverdueResults(orders);
        } catch (clientError) {
          console.error('處理過期訂單結果時發生錯誤:', clientError);
          showAlert('處理過期訂單結果時發生錯誤: ' + clientError.message, 'error');
        }
      })
      .withFailureHandler(function (error) {
        if (revision !== searchRevision) return;
        finishSearch(searchBtn);
        renderSearchError(error);
      })
      .searchOverdueOrders();
  } else {
    finishSearch(searchBtn);
    renderSearchError(new Error('尚未連接 Firebase'));
  }
}

export function handleOverdueResults(orders) {
  // 清空搜尋結果，在同一個表格中顯示過期訂單
  document.getElementById('searchResults').innerHTML = '';
  displayOrderTable(orders, 'searchResults', 'overdue');
}
