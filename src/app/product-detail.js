import { rpc, isConnected } from '../platform/rpc.js';
import { state } from './state.js';
import { getEffectivePrice } from './pricing.js';
import { initializeModalCloseHandlers } from './platform.js';
import { showAlert } from './feedback.js';

function renderModalProductPrice() {
  if (!state.currentModalProduct) return;
  const product = state.currentModalProduct;
  const effectivePrice = getEffectivePrice(product);
  const money = (value) => `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
  document.getElementById('modalProductPrice').innerHTML =
    state.isCompanyCustomer && effectivePrice !== parseFloat(product.price)
      ? `${money(effectivePrice)}<span class="company-price-tag">企業價</span><span class="company-original-price">原價 ${money(product.price)}</span>`
      : money(effectivePrice);
}

function updateProductTotal() {
  if (!state.currentModalProduct) return;
  const specialPrice = parseFloat(document.getElementById('specialPriceInput').value) || 0;
  const price =
    document.getElementById('useSpecialPrice').checked && specialPrice > 0
      ? specialPrice
      : getEffectivePrice(state.currentModalProduct);
  const quantity = Math.max(1, parseInt(document.getElementById('modalQuantity').value) || 1);
  document.getElementById('modalProductTotal').textContent =
    `合計 NT$ ${(price * quantity).toLocaleString('zh-TW')}`;
}

export function showProductDetail(productId) {
  const product = state.allProducts.find((p) => p.productId === productId);
  if (!product) return;
  state.currentModalProduct = product;
  document.getElementById('modalProductName').textContent = product.productName;
  const description = document.getElementById('modalProductDescription');
  description.textContent = product.description || '';
  description.hidden = !product.description;
  document.getElementById('modalQuantity').value = 1;
  // 載入特價信息
  const specialPriceInput = document.getElementById('specialPriceInput');
  const useSpecialPriceCheckbox = document.getElementById('useSpecialPrice');
  if (product.specialPrice && product.specialPrice !== '') {
    specialPriceInput.value = product.specialPrice;
    // 如果有預設特價，可以選擇是否自動開啟，這裡選擇不自動開啟
    useSpecialPriceCheckbox.checked = false;
  } else {
    specialPriceInput.value = '';
    useSpecialPriceCheckbox.checked = false;
  }
  // 應用 UI 狀態
  toggleSpecialPrice();
  document.getElementById('productModal').classList.add('active');
  // 確保modal有正確的關閉處理器
  setTimeout(() => initializeModalCloseHandlers(), 50);
}

export function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
  state.currentModalProduct = null;
}

export function toggleSpecialPrice() {
  const checkbox = document.getElementById('useSpecialPrice');
  const priceComparison = document.getElementById('priceComparison');
  const section = document.getElementById('specialPriceSection');
  section.hidden = !checkbox.checked;
  if (checkbox.checked) {
    priceComparison.style.display = 'flex';
    updateModalPrice();
  } else {
    priceComparison.style.display = 'none';
    // 重置為原價顯示
    renderModalProductPrice();
    updateProductTotal();
  }
}

export function activateSpecialPrice() {
  const checkbox = document.getElementById('useSpecialPrice');
  if (!checkbox.checked) {
    checkbox.checked = true;
    toggleSpecialPrice();
  }
}

export function updateModalPrice() {
  if (!state.currentModalProduct) return;
  const checkbox = document.getElementById('useSpecialPrice');
  const specialPriceInput = document.getElementById('specialPriceInput');
  const specialPrice = parseFloat(specialPriceInput.value) || 0;
  if (checkbox.checked && specialPrice > 0) {
    // 顯示特價
    document.getElementById('modalProductPrice').textContent =
      `特價 NT$ ${specialPrice.toLocaleString('zh-TW')}`;
    document.getElementById('originalPriceText').textContent = state.currentModalProduct.price;
    document.getElementById('specialPriceText').textContent = specialPrice;
    document.getElementById('priceComparison').style.display = 'flex';
    // 不再立即更新資料庫，改為加入購物車時才更新
  } else {
    // 顯示原價
    renderModalProductPrice();
    document.getElementById('priceComparison').style.display = 'none';
  }
  updateProductTotal();
}

export function updateProductSpecialPrice(productId, specialPrice) {
  // 透過已驗證的 Firebase RPC 更新商品特價。
  if (isConnected()) {
    rpc
      .withFailureHandler(function (error) {
        console.log('更新特價失敗:', error);
      })
      .updateProductSpecialPrice(productId, specialPrice);
  } else {
    showAlert('尚未連接 Firebase，特價未儲存', 'error');
  }
}

export function changeModalQuantity(change) {
  const qtyInput = document.getElementById('modalQuantity');
  let val = parseInt(qtyInput.value) + change;
  if (val < 1) val = 1;
  qtyInput.value = val;
  updateProductTotal();
}

export function validateModalQuantity(newQuantity) {
  const qty = parseInt(newQuantity) || 1;
  const qtyInput = document.getElementById('modalQuantity');
  if (qty < 1) {
    qtyInput.value = 1;
  } else {
    qtyInput.value = qty;
  }
  updateProductTotal();
}
