import { escapeHandlerArgument } from '../platform/markup.js';
import { call, rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { showAlert, setButtonLoading } from './feedback.js';
import { updateCartDisplay } from './cart.js';
import { showSectionById } from './platform.js';
import { catalogStorageKey, localDbPut, localDbGet, restoreOrderDraftOnce } from './drafts.js';
import { formatDisplayDate } from './search.js';
import { escapeHtml } from './customers.js';
import { renderCalendar } from './calendar.js';
import { renderProductCards } from './products.js';
import { getEffectivePrice } from './pricing.js';

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
  const cakeContainer = document.getElementById('cakeProducts');
  giftContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入商品中...</p>';
  cakeContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入商品中...</p>';
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
    document.querySelectorAll('#giftProducts, #cakeProducts').forEach(function (container) {
      container.insertAdjacentHTML(
        'afterbegin',
        `<div class="product-stale-banner col-span-full"><i class="fas fa-cloud-slash"></i> 無法連線，顯示 ${formatDisplayDate(cached.updatedAt)} 的商品資料 <button type="button" onclick="loadProducts()">重試</button></div>`,
      );
    });
    return;
  }
  const message = `<div class="product-load-error col-span-full" role="alert"><i class="fas fa-wifi"></i><strong>商品載入失敗</strong><span>${escapeHtml(error?.message || '請檢查網路連線')}</span><button type="button" onclick="loadProducts()">重新載入</button></div>`;
  document.getElementById('giftProducts').innerHTML = message;
  document.getElementById('cakeProducts').innerHTML = message;
}

export async function loadInitialShopData() {
  const now = new Date();
  const result = await call('getShopBootstrap', now.getFullYear(), now.getMonth() + 1);
  if (!Array.isArray(result?.products) || !result?.capacityMonth?.key) {
    throw new Error('初始化資料不完整，請重新載入');
  }
  state.monthCapacityCache[result.capacityMonth.key] = result.capacityMonth.data || {};
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
  const hasGift = activeProducts.some((p) => p.category === '伴手禮');
  const hasCake = activeProducts.some((p) => p.category === '喜餅');
  const hasGiftbox = activeProducts.some((p) => p.giftBoxEnabled === '是');
  document.getElementById('nav-gift').style.display = hasGift ? '' : 'none';
  document.getElementById('nav-cake').style.display = hasCake ? '' : 'none';
  document.getElementById('nav-giftbox').style.display = hasGiftbox ? '' : 'none';
}

export function updateProductDisplays() {
  loadProductsByCategory('伴手禮', 'gift');
  loadProductsByCategory('喜餅', 'cake');
}

export function loadProductsByCategory(category, containerId) {
  const query =
    document
      .getElementById(containerId + 'ProductSearch')
      ?.value.trim()
      .toLocaleLowerCase() || '';
  const products = state.allProducts.filter(
    (p) =>
      p.category === category &&
      p.status === '啟用' &&
      (!query || `${p.productName} ${p.description || ''}`.toLocaleLowerCase().includes(query)),
  );
  const container = document.getElementById(containerId + 'Products');
  container.classList.remove('loading');
  if (products.length === 0) {
    container.innerHTML = `<div class="col-span-full workspace-empty" role="status"><h3>${query ? '找不到符合的商品' : '目前沒有啟用的商品'}</h3><p>${query ? '試試其他名稱，或清除搜尋條件。' : '可在「管理」的「商品管理」新增或啟用商品。'}</p></div>`;
    return;
  }
  // 企業客戶模式提示 banner
  const companyBanner = state.isCompanyCustomer
    ? '<div class="company-mode-banner col-span-full"><i class="fas fa-building"></i>目前為企業客戶模式，商品已套用企業價格</div>'
    : '';
  const iconClass = category === '伴手禮' ? 'fa-cookie-bite' : 'fa-birthday-cake';
  const bgClass = category === '伴手禮' ? 'bg-orange-50 text-orange-300' : 'bg-pink-50 text-pink-300';
  const hoverBorderClass = category === '伴手禮' ? 'hover:border-orange-300' : 'hover:border-pink-300';
  container.innerHTML =
    companyBanner +
    products
      .map((p) => {
        const effectivePrice = getEffectivePrice(p);
        const isCompanyPriceActive =
          state.isCompanyCustomer &&
          p.companyPrice &&
          parseFloat(p.companyPrice) > 0 &&
          parseFloat(p.companyPrice) !== parseFloat(p.price);
        return `
                <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border ${hoverBorderClass} transition group relative h-full">
                    <!-- 上半部：點擊查看詳情/特價 -->
                    <div class="cursor-pointer flex-1 flex flex-col" onclick="showProductDetail('${escapeHandlerArgument(p.productId)}')">
                        <div class="h-32 ${bgClass} flex items-center justify-center relative overflow-hidden">
                            <i class="fas ${iconClass} text-5xl transform group-hover:scale-110 transition-transform duration-300"></i>
                            ${isCompanyPriceActive ? '<div class="absolute top-2 left-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">企業價</div>' : ''}
                        </div>
                        <div class="p-4 pb-2 flex-1">
                            <h3 class="font-bold text-lg mb-1 text-gray-800 line-clamp-2 h-14">${escapeHtml(p.productName)}</h3>
                            <p class="text-red-500 font-bold text-xl">${isCompanyPriceActive ? '<span class="company-original-price">NT$ ' + p.price + '</span>' : ''}NT$ ${effectivePrice}${isCompanyPriceActive ? '<span class="company-price-tag">企業價</span>' : ''}</p>
                        </div>
                    </div>

                    <!-- 下半部：操作按鈕 -->
                    <div class="p-4 pt-0 mt-auto">
                        <div class="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <button onclick="showProductDetail('${escapeHandlerArgument(p.productId)}')" class="flex-1 py-2 px-2 text-gray-600 text-sm font-medium hover:text-blue-600 transition flex items-center justify-center gap-1">
                                <i class="fas fa-edit"></i> 詳情
                            </button>
                            <div class="w-px h-6 bg-gray-300"></div>
                            <button onclick="addToCartDirectly('${escapeHandlerArgument(p.productId)}', '${escapeHandlerArgument(category)}')" class="w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
      })
      .join('');
}

export function addToCartDirectly(productId, category) {
  // 防止事件冒泡觸發卡片點擊
  event.stopPropagation();
  const btn = window.event?.currentTarget || window.event?.target;
  // 防止快速重複點擊導致狀態錯亂
  if (btn.dataset.animating === 'true') {
    // 仍然加入購物車，但不重複動畫
    const product = state.allProducts.find((p) => p.productId === productId);
    if (!product) return;
    const cart = category === '伴手禮' ? state.giftCart : state.cakeCart;
    const existingItem = cart.find(
      (item) =>
        item.productId === productId &&
        !item.isSpecialPrice &&
        !item.isCompanyPrice === !state.isCompanyCustomer &&
        (!item.notes || item.notes === ''),
    );
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        productId: product.productId,
        productName: product.productName,
        price: getEffectivePrice(product),
        quantity: 1,
        category: category,
        isSpecialPrice: false,
        isCompanyPrice: state.isCompanyCustomer,
        notes: '',
      });
    }
    updateCartDisplay();
    return;
  }
  const product = state.allProducts.find((p) => p.productId === productId);
  if (!product) return;
  const cart = category === '伴手禮' ? state.giftCart : state.cakeCart;
  // 尋找購物車中是否已有該商品（且非特價、無備註的標準品項）
  const existingItem = cart.find(
    (item) =>
      item.productId === productId &&
      !item.isSpecialPrice &&
      !item.isCompanyPrice === !state.isCompanyCustomer &&
      (!item.notes || item.notes === ''),
  );
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      productId: product.productId,
      productName: product.productName,
      price: getEffectivePrice(product),
      quantity: 1,
      category: category,
      isSpecialPrice: false,
      isCompanyPrice: state.isCompanyCustomer,
      notes: '',
    });
  }
  updateCartDisplay();
  // 按鈕回饋動畫 - 使用 data 屬性保存原始狀態
  const originalContent = '<i class="fas fa-plus"></i>';
  const originalClasses =
    'w-10 h-10 bg-white border border-blue-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white shadow-sm active:scale-95 transition add-to-cart-btn';
  btn.dataset.animating = 'true';
  btn.innerHTML = '<i class="fas fa-check"></i>';
  btn.className =
    'w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center shadow-md transition add-to-cart-btn';
  setTimeout(() => {
    btn.innerHTML = originalContent;
    btn.className = originalClasses;
    btn.dataset.animating = 'false';
  }, 600);
}
