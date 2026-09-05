import { state } from './state.js';
import {
  getSelectedTitle,
  selectContactMethod,
  selectCustomerType,
  selectDeliveryType,
  selectShippingFee,
} from './customers.js';
import { renderProductCards } from './products.js';
import { displayOrderTable } from './search.js';
import { updateCartDisplay } from './cart.js';
import { generateUniqueId } from './pricing.js';
import { renderCalendar } from './calendar.js';
import { showAlert } from './feedback.js';

export function openPosLocalDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (state.posLocalDbPromise) return state.posLocalDbPromise;
  state.posLocalDbPromise = new Promise(function (resolve, reject) {
    const request = indexedDB.open('ginJiaPosLocal', 1);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
      if (!db.objectStoreNames.contains('catalogs')) db.createObjectStore('catalogs');
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  }).catch(function (error) {
    console.warn('無法開啟本機草稿資料庫', error);
    return null;
  });
  return state.posLocalDbPromise;
}

export async function localDbOperation(storeName, mode, operation) {
  const db = await openPosLocalDb();
  if (!db) return null;
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    tx.oncomplete = function () {
      resolve(request.result);
    };
    tx.onabort = function () {
      reject(tx.error || new Error('本機資料儲存中斷'));
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

export function localDbGet(store, key) {
  return localDbOperation(store, 'readonly', function (s) {
    return s.get(key);
  });
}

export function localDbPut(store, key, value) {
  return localDbOperation(store, 'readwrite', function (s) {
    return s.put(value, key);
  });
}

export function localDbDelete(store, key) {
  return localDbOperation(store, 'readwrite', function (s) {
    return s.delete(key);
  });
}

export function currentLocalScope() {
  const uid = document.body.dataset.userId;
  const shopId = document.body.dataset.shopId;
  return uid && shopId ? `${uid}:${shopId}` : '';
}

export function draftStorageKey() {
  const scope = currentLocalScope();
  return scope ? `order:${scope}` : '';
}

export function catalogStorageKey() {
  const scope = currentLocalScope();
  return scope ? `products:${scope}` : '';
}

export function captureOrderDraft() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentCustomer: state.currentCustomer,
    currentContactMethod: state.currentContactMethod,
    currentDeliveryDate: state.currentDeliveryDate,
    giftCart: state.giftCart,
    cakeCart: state.cakeCart,
    giftboxCart: state.giftboxCart,
    isCompanyCustomer: state.isCompanyCustomer,
    isEditingOrder: state.isEditingOrder,
    editingOrderId: state.editingOrderId,
    currentOrderRequestId: state.currentOrderRequestId,
    fields: {
      customerName: document.getElementById('customerName')?.value || '',
      customerPhone: document.getElementById('customerPhone')?.value || '',
      customerAddress: document.getElementById('customerAddress')?.value || '',
      recipientName: document.getElementById('recipientName')?.value || '',
      recipientPhone: document.getElementById('recipientPhone')?.value || '',
      deliveryType: document.getElementById('deliveryTypeValue')?.value || '外送',
      shippingOption: document.getElementById('shippingOption')?.value || 'free',
      shippingFee: document.getElementById('shippingFee')?.value || '',
      selectedTitle: getSelectedTitle(),
    },
  };
}

export function hasMeaningfulDraft(draft) {
  return Boolean(
    draft?.currentCustomer?.name ||
    draft?.currentCustomer?.contactValue ||
    draft?.currentCustomer?.phone ||
    draft?.fields?.customerName ||
    draft?.fields?.customerPhone ||
    draft?.currentDeliveryDate ||
    draft?.giftCart?.length ||
    draft?.cakeCart?.length ||
    draft?.giftboxCart?.length ||
    draft?.isEditingOrder,
  );
}

export function scheduleDraftSave() {
  document.dispatchEvent(new Event('pos:draft-changed'));
  if (state.suppressDraftSave) return;
  clearTimeout(state.draftSaveTimer);
  state.draftSaveTimer = setTimeout(async function () {
    const key = draftStorageKey();
    if (!key) return;
    const draft = captureOrderDraft();
    try {
      if (hasMeaningfulDraft(draft)) {
        await localDbPut('drafts', key, draft);
        document.body.dataset.draftDirty = 'true';
      } else {
        await localDbDelete('drafts', key);
        document.body.dataset.draftDirty = 'false';
      }
    } catch (error) {
      console.warn('訂單草稿保存失敗', error);
    }
  }, 250);
}

export async function clearOrderDraft() {
  clearTimeout(state.draftSaveTimer);
  const key = draftStorageKey();
  document.body.dataset.draftDirty = 'false';
  if (key)
    await localDbDelete('drafts', key).catch(function (error) {
      console.warn('草稿清除失敗', error);
    });
}

export function applyRoleCapabilities() {
  const viewer = document.body.dataset.shopRole === 'viewer';
  document.querySelectorAll('.requires-editor').forEach(function (element) {
    element.hidden = viewer;
    element.setAttribute('aria-hidden', String(viewer));
  });
  if (viewer) document.body.dataset.permissionNotice = 'readonly';
  else delete document.body.dataset.permissionNotice;
  document.querySelectorAll('#settingsCapacity input, #settingsCapacity button').forEach(function (element) {
    element.disabled = viewer;
    element.setAttribute('aria-disabled', String(viewer));
  });
  if (state.allProducts.length) renderProductCards();
  if (state.currentSearchOrders.length)
    displayOrderTable(state.currentSearchOrders, 'searchResults', 'search');
  updateCartDisplay();
}

export function applyDraft(draft) {
  if (draft.fields?.recipientName || draft.fields?.recipientPhone)
    document.getElementById('recipientDetails').open = true;
  const fields = draft.fields || {};
  state.suppressDraftSave = true;
  state.currentContactMethod = draft.currentContactMethod === 'line' ? 'line' : 'phone';
  selectContactMethod(state.currentContactMethod, false);
  [
    'customerName',
    'customerPhone',
    'customerAddress',
    'recipientName',
    'recipientPhone',
    'shippingFee',
  ].forEach(function (id) {
    const element = document.getElementById(id);
    if (element) element.value = fields[id] || '';
  });
  if (state.currentContactMethod === 'line') document.getElementById('customerPhone').value = 'LINE';
  document.querySelectorAll('#nameTitleGroup .name-title-btn').forEach(function (button) {
    button.classList.toggle('active', button.dataset.title === fields.selectedTitle);
  });
  state.currentCustomer = draft.currentCustomer || {};
  state.currentDeliveryDate = draft.currentDeliveryDate || '';
  state.giftCart = Array.isArray(draft.giftCart) ? draft.giftCart : [];
  state.cakeCart = Array.isArray(draft.cakeCart) ? draft.cakeCart : [];
  state.giftboxCart = Array.isArray(draft.giftboxCart) ? draft.giftboxCart : [];
  state.isCompanyCustomer = Boolean(draft.isCompanyCustomer);
  state.isEditingOrder = Boolean(draft.isEditingOrder);
  state.editingOrderId = draft.editingOrderId || null;
  state.currentOrderRequestId =
    draft.currentOrderRequestId ||
    (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : generateUniqueId('REQ'));
  selectCustomerType(
    document.getElementById(state.isCompanyCustomer ? 'customerCompany' : 'customerNormal'),
    state.isCompanyCustomer,
  );
  selectDeliveryType(
    document.getElementById(
      { 寄貨: 'deliveryShipping', 自取: 'deliveryPickup' }[fields.deliveryType] || 'deliveryHome',
    ),
    fields.deliveryType || '外送',
  );
  selectShippingFee(
    document.getElementById(fields.shippingOption === 'charge' ? 'chargeShipping' : 'freeShipping'),
    fields.shippingOption || 'free',
  );
  if (state.currentDeliveryDate) {
    document.getElementById('deliveryDate').value = state.currentDeliveryDate;
    state.calendarState.selectedDateStr = state.currentDeliveryDate;
  }
  updateCartDisplay();
  renderCalendar();
  state.suppressDraftSave = false;
  document.body.dataset.draftDirty = 'true';
  showAlert('已恢復上次未完成的訂單草稿', 'success');
}

export async function restoreOrderDraftOnce() {
  const key = draftStorageKey();
  if (!key || state.restoredDraftKey === key) return;
  state.restoredDraftKey = key;
  const draft = await localDbGet('drafts', key).catch(function () {
    return null;
  });
  if (!hasMeaningfulDraft(draft)) return;
  const age = Date.now() - new Date(draft.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age > 30 * 24 * 60 * 60 * 1000) {
    await localDbDelete('drafts', key);
    return;
  }
  if (confirm('找到上次未完成的訂單草稿，是否繼續？')) applyDraft(draft);
  else await clearOrderDraft();
}

export function initOrderDraftPersistence() {
  const form = document.getElementById('customer');
  form?.addEventListener('input', scheduleDraftSave);
  form?.addEventListener('change', scheduleDraftSave);
  window.addEventListener('pos:shop-changed', function () {
    state.restoredDraftKey = null;
    restoreOrderDraftOnce();
    applyRoleCapabilities();
  });
}
