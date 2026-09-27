import { escapeHandlerArgument } from '../platform/markup.js';
import { call, rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading } from './feedback.js';
import { updateCartDisplay } from './cart.js';
import { showSectionById } from './platform.js';
import { catalogStorageKey, localDbPut, localDbGet, restoreOrderDraftOnce } from './drafts.js';
import { formatDisplayDate } from './search.js';
import { escapeHtml, escapeAttr } from './customers.js';
import { renderCalendar } from './calendar.js';
import { renderProductCards } from './products.js';
import { getEffectivePrice } from './pricing.js';
import { renderCapacitySettingsUI } from './capacity.js';

export function setDeliveryDate() {
  const dateBtn = window.event?.currentTarget || window.event?.target;
  const date = document.getElementById('deliveryDate').value;
  if (!date) {
    showAlert('請選擇交貨日期', 'error');
    return;
  }
  state.currentDeliveryDate = date;
  updateCartDisplay();
  showAlert(`交貨日期已設定: ${date}`, 'success');
  if (dateBtn) setButtonLoading(dateBtn, false);
  showSectionById('gift');
}

// Public builds never bundle catalog, customer, or order data.
export function loadProducts() {
  // 顯示載入狀態
  const giftContainer = document.getElementById('giftProducts');
  giftContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入商品中...</p>';
  // 檢查是否在 Google Apps Script 環境中
  if (isConnected()) {
    rpc
      .withSuccessHandler(handleProductsLoaded)
      .withFailureHandler(function (error) {
        showProductLoadFailure(error);
      })
      .getProducts();
  } else {
    showProductLoadFailure(new Error('尚未連接 Firebase'));
  }
}

export async function cacheProducts(products) {
  const key = catalogStorageKey();
  if (!key) return;
  await localDbPut('catalogs', key, { products, updatedAt: new Date().toISOString() }).catch(function () {});
}

export async function showProductLoadFailure(error) {
  console.warn('商品資料載入失敗', error);
  const key = catalogStorageKey();
  const cached = key
    ? await localDbGet('catalogs', key).catch(function () {
        return null;
      })
    : null;
  if (cached?.products?.length) {
    handleProductsLoaded(cached.products, { skipCache: true });
    document.querySelectorAll('#giftProducts').forEach(function (container) {
      container.insertAdjacentHTML(
        'afterbegin',
        `<div class="product-stale-banner col-span-full"><i class="fas fa-cloud-slash"></i> 無法連線，顯示 ${formatDisplayDate(cached.updatedAt)} 的商品資料 <button type="button" onclick="loadProducts()">重試</button></div>`,
      );
    });
    return;
  }
  const message = `<div class="product-load-error col-span-full" role="alert"><i class="fas fa-wifi"></i><strong>商品載入失敗</strong><span>${escapeHtml(error?.message || '請檢查網路連線')}</span><button type="button" onclick="loadProducts()">重新載入</button></div>`;
  document.getElementById('giftProducts').innerHTML = message;
}

export async function loadInitialShopData() {
  const now = new Date();
  const result = await call('getShopBootstrap', now.getFullYear(), now.getMonth() + 1);
  if (!Array.isArray(result?.products) || !result?.capacityMonth?.key) {
    throw new Error('初始化資料不完整，請重新載入');
  }
  state.monthCapacityCache[result.capacityMonth.key] = result.capacityMonth.data || {};
  if (result.capacitySettings?.weekday && Array.isArray(result.capacitySettings.dateOverrides)) {
    state.capacitySettings = result.capacitySettings;
    state.capacitySettingsLoaded = true;
    renderCapacitySettingsUI();
  }
  handleProductsLoaded(result.products, { skipDraft: true });
  renderCalendar(true);
}

export function handleProductsLoaded(products, options = {}) {
  state.allProducts = Array.isArray(products) ? products : [];
  if (!options.skipCache) cacheProducts(state.allProducts);
  renderProductCards();
  updateProductDisplays();
  updateNavVisibility();
  if (!options.skipDraft) return restoreOrderDraftOnce();
}

export function updateNavVisibility() {
  const activeProducts = state.allProducts.filter((p) => p.status === '啟用');
  const hasGiftbox = activeProducts.some((p) => p.giftBoxEnabled === '是');
  document.getElementById('nav-giftbox').style.display = hasGiftbox ? '' : 'none';
}

export function updateProductDisplays() {
  const tabs = document.getElementById('catalogFilterTabs');
  const previous = tabs.dataset.category || '';
  const activeProducts = state.allProducts.filter((p) => p.status === '啟用');
  const categories = [...new Set(activeProducts.map((p) => p.category).filter(Boolean))];
  const selected = categories.includes(previous) ? previous : '';
  tabs.dataset.category = selected;
  tabs.replaceChildren(
    ...['', ...categories].map((category) => {
      const button = document.createElement('button');
      const count = category
        ? activeProducts.filter((p) => p.category === category).length
        : activeProducts.length;
      button.type = 'button';
      button.classList.toggle('active', category === selected);
      button.setAttribute('aria-pressed', String(category === selected));
      button.textContent = `${category || '全部類別'} (${count})`;
      button.onclick = () => {
        tabs.dataset.category = category;
        for (const tab of tabs.children) {
          tab.classList.toggle('active', tab === button);
          tab.setAttribute('aria-pressed', String(tab === button));
        }
        loadProductsByCategory(category, 'gift');
      };
      return button;
    }),
  );
  loadProductsByCategory(selected, 'gift');
}

export function loadProductsByCategory(category, containerId) {
  const products = state.allProducts.filter(
    (p) => (!category || p.category === category) && p.status === '啟用',
  );
  const container = document.getElementById(containerId + 'Products');
  container.classList.remove('loading');
  if (products.length === 0) {
    container.innerHTML =
      '<div class="col-span-full workspace-empty" role="status"><h3>目前沒有啟用的商品</h3><p>可在「管理」的「商品管理」新增或啟用商品。</p></div>';
    return;
  }
  // 企業客戶模式提示 banner
  const companyBanner = state.isCompanyCustomer
    ? '<div class="company-mode-banner col-span-full">企業價已啟用；未設定的品項採一般售價。</div>'
    : '';
  container.innerHTML =
    companyBanner +
    products
      .map((p) => {
        const effectivePrice = getEffectivePrice(p);
        const quantity = getCatalogQuantity(p.productId);
        const isCompanyPriceActive =
          state.isCompanyCustomer &&
          p.companyPrice &&
          parseFloat(p.companyPrice) > 0 &&
          parseFloat(p.companyPrice) !== parseFloat(p.price);
        return `
                <div class="giftbox-product-card gj-pos-card catalog-product-card ${quantity > 0 ? 'has-quantity' : ''}" data-catalog-product="${escapeAttr(p.productId)}">
                    <div class="giftbox-product-meta">
                        <span class="giftbox-product-category">${escapeHtml(p.category || '未分類')}</span>
                        <span class="giftbox-product-selection"><i class="fas fa-check" aria-hidden="true"></i> 已加入 <span class="giftbox-selected-quantity">${quantity}</span> 件</span>
                    </div>
                    <div class="giftbox-product-info">
                        <h3>${escapeHtml(p.productName)}</h3>
                        <div class="giftbox-product-pricing"><span class="price">NT$ ${effectivePrice.toLocaleString('zh-TW')}</span><span class="giftbox-price-unit">／件</span>${isCompanyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</div>
                        ${isCompanyPriceActive ? `<span class="company-original-price">原價 NT$ ${Number(p.price).toLocaleString('zh-TW')}</span>` : ''}
                    </div>
                    <div class="giftbox-product-quantity">
                        <button type="button" aria-label="${escapeAttr(p.productName)} 商品詳情" onclick="showProductDetail('${escapeHandlerArgument(p.productId)}')" class="catalog-details-btn gj-btn gj-btn--quiet">詳情</button>
                        <div class="giftbox-quantity-control catalog-quantity-control">
                            <button type="button" class="giftbox-qty-btn catalog-remove-btn" aria-label="減少 ${escapeAttr(p.productName)} 數量" ${quantity === 0 ? 'disabled' : ''} onclick="adjustCatalogQuantity('${escapeHandlerArgument(p.productId)}', -1)"><i class="fas fa-minus" aria-hidden="true"></i></button>
                            <input type="number" inputmode="numeric" min="0" step="1" class="giftbox-qty-display gj-input catalog-quantity" aria-label="${escapeAttr(p.productName)} 購物車數量" value="${quantity}" onfocus="this.select()" onchange="setCatalogQuantity('${escapeHandlerArgument(p.productId)}', this.value)">
                            <button type="button" aria-label="加入 ${escapeAttr(p.productName)} 到購物車" onclick="addToCartDirectly('${escapeHandlerArgument(p.productId)}')" class="giftbox-qty-btn catalog-add-btn">
                                <i class="fas fa-plus" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
      })
      .join('');
}

function getCatalogQuantity(productId) {
  return state.giftCart
    .filter((item) => item.productId === productId)
    .reduce((total, item) => total + Number(item.quantity || 0), 0);
}

export function updateCatalogQuantities() {
  document.querySelectorAll('[data-catalog-product]').forEach((card) => {
    const quantity = getCatalogQuantity(card.dataset.catalogProduct);
    card.querySelector('.catalog-quantity').value = quantity;
    card.querySelector('.giftbox-selected-quantity').textContent = quantity;
    card.querySelector('.catalog-remove-btn').disabled = quantity === 0;
    card.classList.toggle('has-quantity', quantity > 0);
  });
}

export function adjustCatalogQuantity(productId, change) {
  setCatalogQuantity(productId, getCatalogQuantity(productId) + change);
}

export function setCatalogQuantity(productId, rawQuantity) {
  const product = state.allProducts.find((p) => p.productId === productId);
  if (!product) return;
  const quantity = Math.max(0, parseInt(rawQuantity, 10) || 0);
  const currentQuantity = getCatalogQuantity(productId);
  const cart = state.giftCart;
  if (quantity < currentQuantity) {
    // Reduce the most recently added lines first while preserving their prices and notes.
    let remaining = currentQuantity - quantity;
    for (let index = cart.length - 1; index >= 0 && remaining > 0; index--) {
      const item = cart[index];
      if (item.productId !== productId) continue;
      const removed = Math.min(remaining, item.quantity);
      item.quantity -= removed;
      remaining -= removed;
      if (item.quantity === 0) cart.splice(index, 1);
    }
    updateCartDisplay();
    return;
  }
  const additionalQuantity = quantity - currentQuantity;
  if (additionalQuantity === 0) {
    updateCatalogQuantities();
    return;
  }
  // 尋找購物車中是否已有該商品（且非特價、無備註的標準品項）
  const existingItem = cart.find(
    (item) =>
      item.productId === productId &&
      !item.isSpecialPrice &&
      !item.isCompanyPrice === !state.isCompanyCustomer &&
      (!item.notes || item.notes === ''),
  );
  if (existingItem) {
    existingItem.quantity += additionalQuantity;
  } else {
    cart.push({
      productId: product.productId,
      productName: product.productName,
      price: getEffectivePrice(product),
      quantity: additionalQuantity,
      category: product.category,
      isSpecialPrice: false,
      isCompanyPrice: state.isCompanyCustomer,
      notes: '',
    });
  }
  updateCartDisplay();
}

export function addToCartDirectly(productId) {
  window.event?.stopPropagation();
  const btn = window.event?.currentTarget || window.event?.target?.closest('button');
  adjustCatalogQuantity(productId, 1);
  // Count every click, including clicks while the icon is showing feedback.
  if (!btn || btn.dataset.animating === 'true') return;
  // Only change the decorative icon; keep the label and current button layout.
  const icon = btn.querySelector('i');
  const originalIconClasses = icon?.className;
  btn.dataset.animating = 'true';
  icon?.classList.replace('fa-plus', 'fa-check');
  setTimeout(() => {
    if (icon) icon.className = originalIconClasses;
    btn.dataset.animating = 'false';
  }, 600);
}
