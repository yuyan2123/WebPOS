import { state } from './state.js';
import { updateCartModalDisplay } from './cart-detail.js';
import { setButtonLoading, showAlert } from './feedback.js';
import { getEffectivePrice } from './pricing.js';
import { updateProductSpecialPrice, closeProductModal } from './product-detail.js';
import { initializeModalCloseHandlers } from './platform.js';
import { scheduleDraftSave } from './drafts.js';
import { escapeHtml } from './customers.js';

// 計算商品總金額
export function updateOrderTotal() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const itemsTotal = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // 計算運費（讀取 hidden input，配合新版 grove 按鈕）
  let shippingFee = 0;
  const isPickup = document.getElementById('deliveryTypeValue').value === '自取';
  const isChargeShipping = document.getElementById('shippingOption').value === 'charge';
  if (!isPickup && isChargeShipping) {
    const shippingFeeInput = document.getElementById('shippingFee');
    shippingFee = parseFloat(shippingFeeInput.value) || 0;
  }
  // 總金額 = 商品總金額 + 運費
  const totalAmount = itemsTotal + shippingFee;
  // 更新購物車顯示的總金額
  const cartTotalEl = document.getElementById('cartTotalAmount');
  if (cartTotalEl) {
    cartTotalEl.textContent = totalAmount;
  }
  return {
    itemsTotal: itemsTotal,
    shippingFee: shippingFee,
    totalAmount: totalAmount,
  };
}

export function addToCartFromModal() {
  if (!state.currentModalProduct) return;
  const addBtn = window.event?.currentTarget || window.event?.target;
  setButtonLoading(addBtn, true, '加入中...');
  const quantity = parseInt(document.getElementById('modalQuantity').value);
  const useSpecialPrice = document.getElementById('useSpecialPrice').checked;
  const specialPrice = parseFloat(document.getElementById('specialPriceInput').value) || 0;
  // 決定使用的價格
  let finalPrice = getEffectivePrice(state.currentModalProduct);
  let isSpecialPrice = false;
  if (useSpecialPrice && specialPrice > 0) {
    finalPrice = specialPrice;
    isSpecialPrice = true;
  }
  const cart = state.giftCart;
  const existing = cart.find((i) => i.productId === state.currentModalProduct.productId);
  const cartItem = {
    ...state.currentModalProduct,
    price: finalPrice,
    originalPrice: state.currentModalProduct.price,
    isSpecialPrice: isSpecialPrice,
    isCompanyPrice: !isSpecialPrice && state.isCompanyCustomer,
    quantity: existing ? existing.quantity + quantity : quantity,
  };
  if (existing) {
    // 更新現有項目
    existing.quantity += quantity;
    existing.price = finalPrice;
    existing.originalPrice = state.currentModalProduct.price;
    existing.isSpecialPrice = isSpecialPrice;
  } else {
    cart.push(cartItem);
  }
  updateCartDisplay();
  const priceText = isSpecialPrice ? `特價 NT$ ${finalPrice}` : `NT$ ${finalPrice}`;
  showAlert(
    `已將 ${quantity} 個 ${state.currentModalProduct.productName} (${priceText}) 加入購物車`,
    'success',
  );
  // 如果使用特價，更新特價到資料庫
  if (useSpecialPrice && specialPrice > 0) {
    updateProductSpecialPrice(state.currentModalProduct.productId, specialPrice);
  }
  setButtonLoading(addBtn, false);
  closeProductModal();
}

export function toggleCartModal() {
  const cartModal = document.getElementById('cartModal');
  const cartOverlay = document.getElementById('cartOverlay');
  cartModal.classList.toggle('active');
  cartOverlay.classList.toggle('active');
  document.body.classList.toggle('cart-open', cartModal.classList.contains('active'));
  if (cartModal.classList.contains('active')) {
    updateCartModalDisplay();
    setTimeout(() => initializeModalCloseHandlers(), 50);
  }
}

export function closeCartModal() {
  document.getElementById('cartModal').classList.remove('active');
  document.getElementById('cartOverlay').classList.remove('active');
  document.body.classList.remove('cart-open');
}

export function updateCartDisplay() {
  const allItems = [...state.giftCart, ...state.cakeCart, ...state.giftboxCart];
  const totalCount = allItems.reduce((sum, item) => sum + item.quantity, 0);
  // 使用新的計算邏輯，包含運費
  const orderTotals = updateOrderTotal();
  const cartCountEl = document.getElementById('cartCount');
  cartCountEl.textContent = totalCount;
  cartCountEl.style.display = totalCount > 0 ? 'flex' : 'none';
  // 動態調整字體大小：兩位數時使用較小字體
  if (totalCount >= 10) {
    cartCountEl.classList.add('two-digits');
  } else {
    cartCountEl.classList.remove('two-digits');
  }
  // 顯示總金額（包含運費）
  document.getElementById('cartTotalAmount').textContent = orderTotals.totalAmount;
  // 更新建立訂單按鈕：不使用 disabled（disabled 不會觸發 click，無法提示缺少什麼），
  // 改用樣式 class 標記，點擊時由 submitOrder 顯示具體原因
  const checkoutBtn = document.getElementById('checkoutBtn');
  const notReady =
    totalCount === 0 ||
    !state.currentCustomer.name ||
    (!state.currentCustomer.contactValue && !state.currentCustomer.phone) ||
    !state.currentDeliveryDate ||
    !navigator.onLine ||
    document.body.dataset.shopRole === 'viewer';
  checkoutBtn.classList.toggle('checkout-not-ready', notReady);
  // 根據是否為編輯模式更新按鈕文字
  if (state.isEditingOrder) {
    checkoutBtn.textContent = '更新訂單';
  } else {
    checkoutBtn.textContent = '建立訂單';
  }
  updateCartModalDisplay();
  scheduleDraftSave();
}

// 生成禮盒細項顯示的輔助函數
export function generateGiftboxDetailsHtml(giftboxItem) {
  if (!giftboxItem.products || Object.keys(giftboxItem.products).length === 0) {
    return '';
  }
  const detailItems = [];
  for (const [productId, quantity] of Object.entries(giftboxItem.products)) {
    const product = state.allProducts.find((p) => p.productId === productId);
    if (product && quantity > 0) {
      detailItems.push(`${escapeHtml(product.productName)} × ${quantity}`);
    }
  }
  if (detailItems.length === 0) {
    return '';
  }
  return `
                <div class="giftbox-details">
                    <div class="giftbox-details-content">
                        ${detailItems.join(' | ')}
                    </div>
                </div>
            `;
}
