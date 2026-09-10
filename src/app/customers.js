import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { scheduleDraftSave } from './drafts.js';
import { showAlert, setButtonLoading } from './feedback.js';
import { updateCartDisplay, updateOrderTotal } from './cart.js';
import { showSectionById } from './platform.js';
import { updateProductDisplays } from './catalog.js';
import { getEffectivePrice } from './pricing.js';

export function toggleNameTitle(btn) {
  if (btn.classList.contains('active')) {
    btn.classList.remove('active');
    return;
  }
  document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  scheduleDraftSave();
}

export function selectContactMethod(method, clearValue = true) {
  state.currentContactMethod = method === 'line' ? 'line' : 'phone';
  const input = document.getElementById('customerPhone');
  const label = document.getElementById('customerContactLabel');
  document
    .getElementById('contactMethodPhone')
    ?.classList.toggle('active', state.currentContactMethod === 'phone');
  document
    .getElementById('contactMethodLine')
    ?.classList.toggle('active', state.currentContactMethod === 'line');
  if (input) {
    input.type = state.currentContactMethod === 'phone' ? 'tel' : 'text';
    input.inputMode = state.currentContactMethod === 'phone' ? 'tel' : 'none';
    input.placeholder = state.currentContactMethod === 'phone' ? '09xx-xxx-xxx' : '';
    input.readOnly = state.currentContactMethod === 'line';
    input.setAttribute('aria-label', state.currentContactMethod === 'phone' ? '客戶電話' : '聯絡方式 LINE');
    if (state.currentContactMethod === 'line') input.value = 'LINE';
    else if (clearValue) input.value = '';
  }
  if (label) label.textContent = '聯絡電話';
  closeAllAcLists();
  scheduleDraftSave();
}

export function initContactMethodToggle() {
  const phoneButton = document.getElementById('contactMethodPhone');
  const lineButton = document.getElementById('contactMethodLine');
  phoneButton?.addEventListener('click', function (event) {
    event.preventDefault();
    selectContactMethod('phone');
  });
  lineButton?.addEventListener('click', function (event) {
    event.preventDefault();
    selectContactMethod('line');
  });
}

export function selectSearchContactMethod(method, clearValue = true) {
  state.currentSearchContactMethod = method === 'line' ? 'line' : 'phone';
  const input = document.getElementById('searchPhone');
  document
    .getElementById('searchContactPhone')
    ?.classList.toggle('active', state.currentSearchContactMethod === 'phone');
  document
    .getElementById('searchContactLine')
    ?.classList.toggle('active', state.currentSearchContactMethod === 'line');
  if (!input) return;
  input.type = state.currentSearchContactMethod === 'phone' ? 'tel' : 'text';
  input.inputMode = state.currentSearchContactMethod === 'phone' ? 'tel' : 'none';
  input.placeholder = state.currentSearchContactMethod === 'phone' ? '輸入電話號碼' : '';
  input.readOnly = state.currentSearchContactMethod === 'line';
  input.setAttribute(
    'aria-label',
    state.currentSearchContactMethod === 'phone' ? '搜尋客戶電話' : '搜尋 LINE 訂單',
  );
  if (state.currentSearchContactMethod === 'line') input.value = 'LINE';
  else if (clearValue) input.value = '';
}

export function initSearchContactMethodToggle() {
  document.getElementById('searchContactPhone')?.addEventListener('click', function (event) {
    event.preventDefault();
    selectSearchContactMethod('phone');
  });
  document.getElementById('searchContactLine')?.addEventListener('click', function (event) {
    event.preventDefault();
    selectSearchContactMethod('line');
  });
}

export function initCustomerAutocomplete() {
  const nameInput = document.getElementById('customerName');
  const phoneInput = document.getElementById('customerPhone');
  nameInput.addEventListener('input', function () {
    debounceAcSearch(this.value.trim(), 'customerAcList', 'name');
  });
  phoneInput.addEventListener('input', function () {
    debounceAcSearch(this.value.trim(), 'customerAcListPhone', 'contact');
  });
  // 點擊外部關閉
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.customer-ac-wrap')) {
      closeAllAcLists();
    }
  });
  // 鍵盤導航
  nameInput.addEventListener('keydown', function (e) {
    acKeyNav(e, 'customerAcList');
  });
  phoneInput.addEventListener('keydown', function (e) {
    acKeyNav(e, 'customerAcListPhone');
  });
}

export function debounceAcSearch(keyword, listId, mode) {
  clearTimeout(state.acDebounceTimer);
  if (!keyword || keyword.length < 2) {
    document.getElementById(listId).classList.remove('show');
    return;
  }
  const cacheKey = `${mode}:${state.currentContactMethod}:${keyword.toLocaleLowerCase()}`;
  if (state.customerSearchCache.has(cacheKey)) {
    renderAcList(state.customerSearchCache.get(cacheKey), listId);
    return;
  }
  // 只查前綴並快取結果，避免下載整個客戶集合。
  state.acDebounceTimer = setTimeout(function () {
    if (isConnected()) {
      rpc
        .withSuccessHandler(function (results) {
          state.customerSearchCache.set(cacheKey, results || []);
          renderAcList(results, listId);
        })
        .searchCustomers({ keyword, mode, contactType: state.currentContactMethod });
    }
  }, 300);
}

export function renderAcList(results, listId) {
  const list = document.getElementById(listId);
  if (!results || results.length === 0) {
    list.classList.remove('show');
    list.innerHTML = '';
    return;
  }
  state.acResultsCache = results;
  list.innerHTML = results
    .map(function (c, i) {
      return (
        '<button type="button" class="customer-ac-item" role="option" data-index="' +
        i +
        '">' +
        '<div class="customer-ac-icon"><i class="fas fa-user"></i></div>' +
        '<div class="customer-ac-info">' +
        '<div class="customer-ac-name">' +
        escapeHtml(c.name) +
        '</div>' +
        '<div class="customer-ac-phone">' +
        escapeHtml(c.contactType === 'line' ? 'LINE' : c.contactValue || c.phone || '') +
        (c.address ? ' / ' + escapeHtml(c.address) : '') +
        '</div>' +
        '</div></button>'
      );
    })
    .join('');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '符合的客戶');
  list.querySelectorAll('.customer-ac-item').forEach((button) => {
    button.addEventListener('click', () => selectAcCustomer(Number(button.dataset.index)));
  });
  list.classList.add('show');
}

export function selectAcCustomer(index) {
  const c = state.acResultsCache[index];
  if (!c) return;
  let name = c.name || '';
  // 拆分稱謂
  document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(function (b) {
    b.classList.remove('active');
  });
  if (name.endsWith('先生') || name.endsWith('小姐')) {
    const title = name.slice(-2);
    name = name.slice(0, -2);
    const btn = document.querySelector('#nameTitleGroup .name-title-btn[data-title="' + title + '"]');
    if (btn) btn.classList.add('active');
  }
  document.getElementById('customerName').value = name;
  selectContactMethod(c.contactType === 'line' ? 'line' : 'phone', false);
  document.getElementById('customerPhone').value =
    c.contactType === 'line' ? 'LINE' : c.contactValue || c.phone || '';
  if (c.address) {
    document.getElementById('customerAddress').value = c.address;
  }
  closeAllAcLists();
}

export function closeAllAcLists() {
  document.querySelectorAll('.customer-ac-list').forEach(function (el) {
    el.classList.remove('show');
  });
}

export function acKeyNav(e, listId) {
  const list = document.getElementById(listId);
  if (!list.classList.contains('show')) return;
  const items = list.querySelectorAll('.customer-ac-item');
  if (items.length === 0) return;
  let idx = -1;
  items.forEach(function (item, i) {
    if (item.classList.contains('highlight')) idx = i;
  });
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = idx <= 0 ? items.length - 1 : idx - 1;
  } else if (e.key === 'Enter' && idx >= 0) {
    e.preventDefault();
    items[idx].dispatchEvent(new Event('mousedown'));
    return;
  } else if (e.key === 'Escape') {
    closeAllAcLists();
    return;
  } else {
    return;
  }
  items.forEach(function (item) {
    item.classList.remove('highlight');
  });
  items[idx].classList.add('highlight');
  items[idx].scrollIntoView({ block: 'nearest' });
}

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// HTML 屬性值專用跳脫（escapeHtml 不會處理引號）
export function escapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getSelectedTitle() {
  const active = document.querySelector('#nameTitleGroup .name-title-btn.active');
  return active ? active.dataset.title : '';
}

export function saveCustomer() {
  const saveBtn = window.event?.currentTarget || window.event?.target;
  const rawName = document.getElementById('customerName').value.trim();
  const title = getSelectedTitle();
  const name = rawName ? rawName + title : '';
  const contactValue =
    state.currentContactMethod === 'line' ? 'LINE' : document.getElementById('customerPhone').value.trim();
  const address = document.getElementById('customerAddress').value.trim();
  const recipientName = document.getElementById('recipientName').value.trim();
  const recipientPhone = document.getElementById('recipientPhone').value.trim();
  const deliveryType = document.getElementById('deliveryTypeValue').value;
  if (!name && !contactValue) {
    showAlert('客戶姓名或聯絡方式請至少填寫一項', 'error');
    return;
  }
  state.currentCustomer = {
    name,
    contactType: state.currentContactMethod,
    contactValue,
    phone: state.currentContactMethod === 'phone' ? contactValue : '',
    lineId: state.currentContactMethod === 'line' ? contactValue : '',
    address,
    recipientName,
    recipientPhone,
    deliveryType,
    isCompanyCustomer: state.isCompanyCustomer,
  };
  updateCartDisplay();
  showAlert('客戶資訊已儲存', 'success');
  if (saveBtn) setButtonLoading(saveBtn, false);
  showSectionById('date');
}

export function clearCustomerForm() {
  document.getElementById('customerName').value = '';
  document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('customerPhone').value = '';
  selectContactMethod('phone', false);
  document.getElementById('customerAddress').value = '';
  // 清空收件人資訊
  document.getElementById('recipientName').value = '';
  document.getElementById('recipientPhone').value = '';
  document.getElementById('shippingFee').value = '';
  // 重置配送方式為外送、運費設定為免運（同步 grove 按鈕與 hidden input，並還原欄位顯示）
  selectDeliveryType(document.getElementById('deliveryHome'), '外送');
  selectShippingFee(document.getElementById('freeShipping'), 'free');
  // 重置客戶類型為一般客戶
  state.isCompanyCustomer = false;
  document.getElementById('customerNormal').classList.add('active');
  document.getElementById('customerCompany').classList.remove('active');
  updateProductDisplays();
  state.currentCustomer = {};
  // 如果正在編輯訂單，清除編輯狀態
  if (state.isEditingOrder) {
    state.isEditingOrder = false;
    state.editingOrderId = null;
    state.giftCart = [];
    state.cakeCart = [];
    state.giftboxCart = [];
    state.currentDeliveryDate = '';
    document.getElementById('deliveryDate').value = '';
    showAlert('已取消訂單編輯', 'success');
  }
  updateCartDisplay(); // 更新購物車按鈕狀態
}

// ==========================================
//        新 UI 適配層
// ==========================================
// Grove Button 選擇器 - 配送方式
export function selectDeliveryType(button, value) {
  const parent = button.parentElement;
  parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('deliveryTypeValue').value = value;
  toggleShippingField();
}

// Grove Button 選擇器 - 運費設定
export function selectShippingFee(button, value) {
  const parent = button.parentElement;
  parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('shippingOption').value = value;
  toggleShippingFeeInput();
}

// Grove Button 選擇器 - 客戶類型
export function selectCustomerType(button, isCompany) {
  const parent = button.parentElement;
  parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  state.isCompanyCustomer = isCompany;
  updateProductDisplays();
  recalcCartPricesForCustomerType();
}

// 重新計算購物車中非特價品項的價格
export function recalcCartPricesForCustomerType() {
  let hasChanges = false;
  [state.giftCart, state.cakeCart].forEach((cart) => {
    cart.forEach((item) => {
      if (item.type !== 'giftbox' && !item.isSpecialPrice) {
        const product = state.allProducts.find((p) => p.productId === item.productId);
        if (product) {
          const newPrice = getEffectivePrice(product);
          if (item.price !== newPrice) {
            item.price = newPrice;
            item.isCompanyPrice = state.isCompanyCustomer;
            hasChanges = true;
          }
        }
      }
    });
  });
  if (hasChanges) {
    updateCartDisplay();
    const modeText = state.isCompanyCustomer ? '企業' : '一般';
    showAlert('已切換為' + modeText + '價格', 'success');
  }
}

// 適配舊版的 radio button 邏輯
export function toggleShippingField() {
  const deliveryType = document.getElementById('deliveryTypeValue').value;
  const isPickup = deliveryType === '自取';
  const addressGroup =
    document.getElementById('customerAddress').closest('.mb-8') ||
    document.getElementById('customerAddress').parentElement;
  const shippingFeeGroup = document.getElementById('shippingFeeGroup');
  const recipientInfoGroup = document.getElementById('recipientInfoGroup');
  if (isPickup) {
    addressGroup.style.display = 'none';
    shippingFeeGroup.style.display = 'none';
    recipientInfoGroup.style.display = 'none';
    document.getElementById('customerAddress').value = '';
    document.getElementById('shippingFee').value = '';
    document.getElementById('recipientName').value = '';
    document.getElementById('recipientPhone').value = '';
  } else {
    addressGroup.style.display = 'block';
    recipientInfoGroup.style.display = 'grid';
    shippingFeeGroup.style.display = 'grid';
  }
  updateOrderTotal();
}

export function toggleShippingFeeInput() {
  const shippingOption = document.getElementById('shippingOption').value;
  const isCharge = shippingOption === 'charge';
  const shippingFeeInput = document.getElementById('shippingFeeInput');
  if (isCharge) {
    shippingFeeInput.style.display = 'block';
  } else {
    shippingFeeInput.style.display = 'none';
    document.getElementById('shippingFee').value = '';
  }
  updateOrderTotal();
}
